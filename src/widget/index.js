'use strict'

const pathFn = require('path');
const prequire = require('parent-require');
const { Volume, createFsFromVolume } = require('memfs');
const { WebpackProcessor, MemFsPlugin } = require('./webpack');
const _ = require('lodash');

const Box = prequire('hexo/lib/box');


class Widget extends Box {
    constructor(ctx, name, baseDir, { debug, prefixUrl, webpackConfig, webpackConfigPath = 'webpack.config.js' }) {
        // setup parent Box to watch files under basedir
        super(ctx, baseDir);

        // memfs to save webpack outputs
        this.volume = new Volume();
        const memfsPlugin = new MemFsPlugin(createFsFromVolume(this.volume));

        const genWebpackConfig = () => {
            // try load config from the widget folder first
            let loadedConfig = {};
            try {
                loadedConfig = require(pathFn.join(baseDir, webpackConfigPath));
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') {
                    throw e;
                }
            }
            const debugConfig = _.isUndefined(debug) ? {} : _.merge({
                mode: "development",
            }, debug);
            ctx.log.info(`Webpack for ${name}: using debug config %s`, debugConfig);
            return _.mergeWith(
                {
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
                        modules: [pathFn.join(baseDir, 'node_modules')]
                    },
                    resolveLoader: {
                        modules: [pathFn.join(baseDir, 'node_modules')]
                    },
                    cache: {
                        type: 'filesystem',
                        // write cache to parent project's cache
                        cacheDirectory: pathFn.join(ctx.base_dir, 'node_modules', '.cache', 'webpack'),
                    },
                    // set compiler's output to memfs
                    plugins: [ memfsPlugin ],
                },
                debugConfig,
                loadedConfig,
                webpackConfig,
                // concat array instead of recursive merge
                (objVal, srcVal) => {
                    if (_.isArray(objVal)) {
                        return objVal.concat(srcVal);
                    }
                }
            );
        };
        // processor does the webpack processing
        this.processors = [
            new WebpackProcessor(ctx, genWebpackConfig),
        ];

        // Register a generator to generate routes from the memfs volume.
        // The generator gets called after box process and produces a { path, data }
        // for each file in the volume.
        // hexo will then call routerReflesh on each generatorResult to add it to actual routes.
        ctx.extend.generator.register(`${name}-widget`, () => {
            return generateFromVolume(this.volume, '/dist', prefixUrl);
        });
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
    console.log('generateFromVolume', basedir, fileRoutes, subRoutes);
    return fileRoutes.concat(subRoutes);
}

/**
 * A widget box
 * @param {*} ctx The hexo instance
 * @param {string} baseDir Base path of the box
 * @param {*} options Must contains a prefixUrl key, which will be the baseUrl to serve files
 */
module.exports = (ctx, name, baseDir, opts) => {
    // create the widget box once
    const widget = new Widget(ctx, name, baseDir, opts);

    // The boxes to process are hard-coded during load and watch, this is a hack to
    // integrate our box into hexo.load and hexo.watch
    ctx.extend.filter.register('before_generate', async () => {
        const watching = ctx._watchBox != null;
        if (!watching) {
            await widget.process();
        } else {
            if (!widget.isWatching()) {
                await widget.watch();
                widget.on('processAfter', ctx._watchBox);
            }
        }
    });
    // monkey patch unwatch
    const oldUnwatch = ctx.unwatch;
    ctx.unwatch = function() {
        if (this._watchBox != null) {
            widget.removeListener('processAfter', this._watchBox);
        }
        widget.unwatch(this._watchBox);
        oldUnwatch.apply(this);
    };
}
