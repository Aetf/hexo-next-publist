'use strict';

/* global hexo */

const _ = require('lodash');
const pathFn = require('path');

const { DEFAULT_OPTIONS } = require('./consts');

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

    // render bib in _data
    require('./bib-renderer')(hexo, opts);

    // widget_dir must be from the hexo.base_dir/node_modules
    // which may be a symlink. So we can not directly use WIDGET_DIR
    const widget_dir = pathFn.join(hexo.base_dir, 'node_modules', 'hexo-next-publist', 'widget');
    require('./widget')(hexo, 'publist', widget_dir, {
        baseUrl: opts.assets_prefix,
    });

    // inject static served from the widget into necessary pages
    require('./injector')(hexo);

    // the actual tag
    require('./publist-tag')(hexo, opts);
}

register(hexo);
