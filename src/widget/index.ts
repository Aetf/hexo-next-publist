import pathFn from 'node:path';
import { createRequire } from 'node:module';

import { Volume, createFsFromVolume } from 'memfs';
import type Hexo from 'hexo';
import type { Configuration } from 'webpack';

type BoxClass = typeof import('hexo/dist/box/index.js').default;

import { WebpackProcessor, MemFsPlugin, type WidgetProcessorOptions } from './webpack.js';
import { PublistWebpackError } from '../consts.js';

// hexo is a peer dependency, resolve it from where this package is installed
// (Node walks up from here into the consuming site's node_modules)
const require = createRequire(import.meta.url);

// Hexo >= 7 ships compiled sources under dist/ and exports Box as a default
// export; Hexo <= 6 had lib/box with a plain module.exports.
const Box: BoxClass = (() => {
    for (const modPath of ['hexo/dist/box', 'hexo/lib/box']) {
        try {
            const mod = require(modPath) as { default?: BoxClass } | BoxClass;
            return (mod as { default?: BoxClass }).default ?? (mod as BoxClass);
        } catch (err) {
            // only swallow "this hexo version doesn't have that path", so a genuine
            // failure inside the module itself still surfaces
            if (!(err instanceof Error) || !/Cannot find module/.test(err.message)) throw err;
        }
    }
    throw new Error('hexo-next-publist: cannot locate hexo\'s Box class');
})();

export interface WidgetOptions extends Omit<WidgetProcessorOptions, 'webpackConfigPath'> {
    webpackConfigPath?: string;
}

export class Widget extends Box {
    private readonly volume: InstanceType<typeof Volume>;

    /**
     * @param ctx The hexo instance
     * @param name Name of the widget, used for the generator and webpack config
     * @param baseDir Base path of the box
     * @param opts Must contain a prefixUrl key, which will be the baseUrl to serve files
     */
    constructor(ctx: Hexo, name: string, baseDir: string, opts: WidgetOptions) {
        // setup parent Box to watch files under basedir
        super(ctx, baseDir);

        // normalize opts
        const fullOpts: WidgetProcessorOptions = {
            ...opts,
            webpackConfigPath: pathFn.resolve(baseDir, opts.webpackConfigPath ?? 'webpack.config.js'),
        };

        // create initial config
        const { prefixUrl } = fullOpts;

        this.volume = new Volume();
        const memfsPlugin = new MemFsPlugin(createFsFromVolume(this.volume) as never);
        const initialWebpackConfig: Configuration = {
            mode: 'production',
            // resolve paths for webpack itself like loaders and entrys
            context: baseDir,
            output: {
                path: '/dist',
                publicPath: prefixUrl.replace(/\/?$/, '/'),
            },
            name,
            resolve: {
                // resolve paths for modules inside code
                modules: ['node_modules', pathFn.join(baseDir, 'node_modules')],
            },
            resolveLoader: {
                modules: ['node_modules', pathFn.join(baseDir, 'node_modules')],
            },
            cache: {
                type: 'filesystem',
                // write cache to parent project's cache
                cacheDirectory: pathFn.join(ctx.base_dir, 'node_modules', '.cache', 'webpack'),
            },
            // set compiler's output to memfs
            plugins: [memfsPlugin],
        };

        // processor does the webpack processing
        this.processors = [
            new WebpackProcessor(ctx, initialWebpackConfig, fullOpts),
        ];

        // Register a generator to generate routes from the memfs volume.
        // The generator gets called after box process and produces a { path, data }
        // for each file in the volume.
        // hexo will then call routerReflesh on each generatorResult to add it to actual routes.
        ctx.extend.generator.register(`${name}-widget`, () => {
            try {
                return generateFromVolume(this.volume, '/dist', prefixUrl);
            } catch (err) {
                ctx.log.error(err);
                throw new PublistWebpackError();
            }
        });
    }

    /**
     * register the widget box
     */
    register = (): void => {
        // create the widget box once
        const { context } = this;

        // The boxes to process are hard-coded during load and watch, this is a hack to
        // integrate our box into hexo.load and hexo.watch
        context.extend.filter.register('before_generate', async () => {
            const watching = context._watchBox != null;
            if (!watching) {
                await this.process();
            } else {
                if (!this.isWatching()) {
                    await this.watch();
                    this.on('processAfter', context._watchBox);
                }
            }
        });
        // monkey patch unwatch
        const oldUnwatch = context.unwatch;
        const detach = (watchBox: (() => void) | null): void => {
            if (watchBox != null) {
                this.removeListener('processAfter', watchBox);
            }
            this.unwatch();
        };
        context.unwatch = function (this: Hexo) {
            detach(this._watchBox);
            oldUnwatch.apply(this);
        };
    };
}

interface RouteEntry {
    path: string;
    data: {
        modified: boolean;
        data: () => NodeJS.ReadableStream;
    };
}

/**
 * Generate route objects {path, data} from a memfs volume, with a prefix url.
 */
interface VolumeDirent {
    name: string | Buffer;
    isFile(): boolean;
    isDirectory(): boolean;
}

function generateFromVolume(vol: InstanceType<typeof Volume>, basedir: string, prefixUrl: string): RouteEntry[] {
    const entries = vol.readdirSync(basedir, { encoding: 'utf-8', withFileTypes: true }) as unknown as VolumeDirent[];
    // current level files to routes
    const fileRoutes: RouteEntry[] = entries
        .filter(e => e.isFile())
        .map(e => ({
            path: pathFn.join(prefixUrl, String(e.name)),
            data: {
                modified: true,
                data: () => vol.createReadStream(pathFn.join(basedir, String(e.name))) as unknown as NodeJS.ReadableStream,
            },
        }));
    // routes coming from subdirs
    const subRoutes = entries
        .filter(e => e.isDirectory())
        .flatMap(e => generateFromVolume(vol, pathFn.join(basedir, String(e.name)), pathFn.join(prefixUrl, String(e.name))));
    return fileRoutes.concat(subRoutes);
}
