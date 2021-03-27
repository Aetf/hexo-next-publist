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

    // TODO: properly integrate with watch
    // currently hexo.watch only calls watch on source and theme box.

    // Builtin boxes are processed during load, before generate,
    // but that is hard-coded to be only source and theme boxes,
    // and we can't hook into that. We just process in the before_generate hook.
    ctx.extend.filter.register('before_generate', async () => {
        // run widget.process, which calls our widget processor and
        // save discovered files to the named model
        await widget.process();
    });
}
