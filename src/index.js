'use strict';

/* global hexo */

const { getOptions } = require('./option');
const AssetsGenerator = require('./generator/assets');
const Injector = require('./injector/injector');
const TagPlugin = require('./tag/publist');

function register(hexo) {
    var opts = getOptions(hexo);

    new AssetsGenerator(hexo, opts).register();
    new Injector(hexo, opts).register();
    new TagPlugin(hexo, opts).register();
}

register(hexo);
