'use strict'

const pathFn = require('path');
const prequire = require('parent-require');
const { Volume, createFsFromVolume } = require('memfs');
const { WebpackProcessor, MemFsPlugin } = require('./webpack');
const _ = require('lodash');
const { PublistWebpackError } = require('../consts');

const Box = prequire('hexo/lib/box');


class Widget extends Box {
    /**
     * @param {*} ctx The hexo instance
     * @param {string} name Base path of the box
     * @param {string} baseDir Base path of the box
     * @param {*} options Must contains a prefixUrl key, which will be the baseUrl to serve files
     */
    constructor(ctx, name, baseDir, opts) {
        // setup parent Box to watch files under basedir
        super(ctx, baseDir);

        // normalize opts
        opts = _.defaults(opts, {
            webpackConfigPath: 'webpack.config.js'
        });
        opts.webpackConfigPath = pathFn.resolve(baseDir, opts.webpackConfigPath);

        // create initial config
        const { prefixUrl } = opts;

        this.volume = new Volume();
        const memfsPlugin = new MemFsPlugin(createFsFromVolume(this.volume));
        const initialWebpackConfig = {
            mode: "production",
            // resolve paths for webpack itself like loaders and entrys
            context: baseDir,
            output: {
                path: '/dist',
                publicPath: prefixUrl.replace(/\/?$/, '/'),
            },
            name,
            resolve: {
                // resolve paths for modules inside code
                modules: ['node_modules', pathFn.join(ctx.base_dir, 'node_modules')]
            },
            resolveLoader: {
                modules: ['node_modules', pathFn.join(ctx.base_dir, 'node_modules')]
            },
            cache: {
                type: 'filesystem',
                // write cache to parent project's cache
                cacheDirectory: pathFn.join(ctx.base_dir, 'node_modules', '.cache', 'webpack'),
            },
            // set compiler's output to memfs
            plugins: [ memfsPlugin ],
        };

        // processor does the webpack processing
        this.processors = [
            new WebpackProcessor(ctx, initialWebpackConfig, opts),
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
    register = () => {
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
        const self = this;
        context.unwatch = function() {
            if (this._watchBox != null) {
                self.removeListener('processAfter', this._watchBox);
            }
            self.unwatch(this._watchBox);
            oldUnwatch.apply(this);
        };
    }
}

/**
 * Generate route object {path, data} from a memfs volume. with a prefix url
 * @param {Volume} vol 
 */
function generateFromVolume(vol, basedir, prefixUrl) {
    const entries = vol.readdirSync(basedir, { encoding: 'utf-8', withFileTypes: true });
    // current level files to routes
    const fileRoutes = entries.filter(e => e.isFile()).map(e => ({
        path: pathFn.join(prefixUrl, e.name),
        data: {
            modified: true,
            data: () => vol.createReadStream(pathFn.join(basedir, e.name))
        }
    }));
    // routes coming from subdirs
    const subRoutes = entries.filter(e => e.isDirectory())
        .flatMap(e => generateFromVolume(vol, pathFn.join(basedir, e.name), pathFn.join(prefixUrl, e.name)))
    return fileRoutes.concat(subRoutes);
}

module.exports.Widget = Widget;
