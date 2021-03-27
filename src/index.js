'use strict';

/* global hexo */

const _ = require('lodash');
const pathFn = require('path');

const { DEFAULT_OPTIONS, WIDGET_DIR, SELF } = require('./consts');
const { Widget } = require('./widget');

function processOptions (hexo) {
    let opts = _.defaults({}, hexo.config.publist, DEFAULT_OPTIONS);

    if (!opts.assets_prefix.endsWith('/')) {
        opts.assets_prefix = opts.assets_prefix + '/';
    }

    hexo.config.publist = opts;

    return opts;
}

function register(hexo) {
    const opts = processOptions(hexo);

    // register renderer bib in _data, which is inside the source box
    require('./bib-renderer').register(hexo, opts);

    // widget_dir must be from the hexo.base_dir/node_modules
    // which may be a symlink. So we can not directly use WIDGET_DIR
    //const widget_dir = pathFn.join(hexo.base_dir, 'node_modules', 'hexo-next-publist', 'widget');
    console.log('widget dir is ', WIDGET_DIR);
    const debug = pathFn.resolve(hexo.base_dir) === SELF;
    const selfNodeModules = pathFn.join(SELF, 'node_modules');

    new Widget(hexo, 'publist', WIDGET_DIR, {
        prefixUrl: opts.assets_prefix,
        // additional resolve paths for self's node_modules
        webpackConfig: {
            resolve: {
                modules: [selfNodeModules]
            },
            resolveLoader: {
                modules: [selfNodeModules]
            },
        },
        webpackConfigPath: 'webpack.config.js',
        debug: debug ? {
            snapshot: {
                managedPaths: [selfNodeModules]
            }
        } : undefined,
    }).register();

    // the actual tag
    require('./publist-tag').register(hexo, opts);
}

register(hexo);
