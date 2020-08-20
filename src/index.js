'use strict';

/* global hexo */

const _ = require('lodash');
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

    require('./injector')(hexo);
    require('./widget')(hexo);
    require('./publist')(hexo);
}

register(hexo);
