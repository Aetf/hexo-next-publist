'use strict';

/* global hexo */

const _ = require('lodash');

const { DEFAULT_OPTIONS } = require('./consts');
const { PublistWidget } = require('./publist-widget');
const { PublistTag } = require('./publist-tag');
const { SSRFilter } = require('./filter');

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

    // a widget box containing js/css files for publist
    new PublistWidget(hexo, opts).register();

    // the actual tag
    new PublistTag(hexo, opts).register();

    // after generate filter to optionally do server-side rendering
    new SSRFilter(hexo, opts).register();
}

register(hexo);
