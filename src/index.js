import _ from 'lodash';

import { DEFAULT_OPTIONS } from './consts.js';
import { register as registerBibRenderer } from './bib-renderer.js';
import { PublistWidget } from './publist-widget.js';
import { PublistTag } from './publist-tag.js';
import { SSRFilter } from './filter.js';

function processOptions (hexo) {
    let opts = _.defaults({}, hexo.config.publist, DEFAULT_OPTIONS);

    if (!opts.assets_prefix.endsWith('/')) {
        opts.assets_prefix = opts.assets_prefix + '/';
    }

    hexo.config.publist = opts;

    return opts;
}

export default function register(hexo) {
    const opts = processOptions(hexo);

    // register renderer bib in _data, which is inside the source box
    registerBibRenderer(hexo, opts);

    // a widget box containing js/css files for publist
    new PublistWidget(hexo, opts).register();

    // the actual tag
    new PublistTag(hexo, opts).register();

    // after generate filter to optionally do server-side rendering
    new SSRFilter(hexo, opts).register();
}
