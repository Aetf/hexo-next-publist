import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import _ from 'lodash';
import webpack, { type Compiler, type Configuration, type Stats } from 'webpack';
import chalk from 'chalk';
import type Hexo from 'hexo';

import { pDebounce } from './pDebounce.js';

/** webpack's output filesystem interface, satisfied by memfs. */
type OutputFileSystem = Compiler['outputFileSystem'];

export class MemFsPlugin {
    constructor(private readonly fs: OutputFileSystem) {}

    apply(compiler: Compiler): void {
        const { fs } = this;
        compiler.hooks.environment.tap(
            'MemFsPlugin',
            () => {
                compiler.outputFileSystem = fs;
            },
        );
    }
}

export interface WidgetProcessorOptions {
    prefixUrl: string;
    webpackConfig?: Configuration;
    webpackConfigPath: string;
    debug?: Configuration | undefined;
}

export class WebpackProcessor {
    private running = false;

    /**
     * Include everything in the widget folder: we want to get notified for
     * every file so we can call webpack again.
     */
    readonly pattern = {
        test: () => true,
        match: () => true,
    };

    constructor(
        private readonly ctx: Hexo,
        private readonly initialWebpackConfig: Configuration,
        private readonly opts: WidgetProcessorOptions,
    ) {}

    _genWebpackConfig = async (): Promise<Configuration> => {
        const { debug, webpackConfigPath } = this.opts;

        // try load config from the widget folder first
        let loadedConfig: Configuration = {};
        try {
            loadedConfig = (await import(pathToFileURL(webpackConfigPath).href) as { default: Configuration }).default;
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') {
                throw e;
            }
        }
        // if debug
        const debugConfig = debug == null ? {} : _.merge({
            mode: 'development',
        } satisfies Configuration, debug);

        return _.mergeWith(
            {},
            this.initialWebpackConfig,
            debugConfig,
            loadedConfig,
            this.opts.webpackConfig ?? {},
            // concat array instead of recursive merge
            (objVal: unknown, srcVal: unknown) => {
                if (_.isArray(objVal)) {
                    return objVal.concat(srcVal);
                }
                return undefined;
            },
        );
    };

    _compile = async (): Promise<Stats | undefined> => {
        const { ctx } = this;

        if (this.running) {
            return undefined;
        }
        this.running = true;

        const config = await this._genWebpackConfig();
        ctx.log.debug(`Widget ${chalk.magenta(config.name)}: webpacking`);

        const compiler = webpack(config);
        try {
            const stats = await promisify(compiler.run).apply(compiler);
            if (stats == null) {
                return undefined;
            }
            const info = stats.toJson();
            if (stats.hasErrors() || stats.hasWarnings()) {
                info.errors?.forEach(e => ctx.log.error(e));
                info.warnings?.forEach(w => ctx.log.warn(w));
            }
            await promisify(compiler.close).apply(compiler);

            if (!stats.hasErrors()) {
                const assets = info.assets ?? [];
                ctx.log.info(`${assets.length} files webpacked for ${config.name} in ${chalk.cyan(info.time, 'ms')}`);
                for (const asset of assets) {
                    ctx.log.debug(`Webpacked: ${config.name}::${asset.name} ${asset.size} bytes`);
                }
            }

            return stats;
        } catch (err) {
            const anyErr = err as Error & { details?: string };
            ctx.log.error(anyErr.stack ?? anyErr);
            if (anyErr.details != null) {
                ctx.log.error(anyErr.details);
            }
            throw err;
        } finally {
            this.running = false;
        }
    };

    // first pDebounce.promise makes sure if webpack is running, the existing Promise is returned
    // second pDebounce actually groups calls waiting for 100ms
    _compileDebounce = pDebounce(pDebounce.promise(this._compile), 100);

    process = async (): Promise<void> => {
        // The file may be deleted, changed or created.
        // No matter what, we just rerun webpack
        await this._compileDebounce();
    };
}
