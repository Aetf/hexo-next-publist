'use strict';

const pathFn = require('path');
const fs = require('hexo-fs');
const { ASSETS_DIR } = require('../consts');

/**
 * Generate routes for assets
 *
 */
function Assets(hexo, opts) {
    this.hexo = hexo;
    this.opts = opts;
}

Assets.prototype._gen = function(locals) {
    const opts = this.opts;

    return [
        {
            path: opts.assets_prefix + '/publist.css',
            data: () => fs.createReadStream(pathFn.join(ASSETS_DIR, 'publist.css')),
        },
        {
            path: opts.assets_prefix + '/publist.js',
            data: () => fs.createReadStream(pathFn.join(ASSETS_DIR, 'publist.js')),
        },
    ];
};

Assets.prototype.register = function() {
    this.hexo.extend.generator.register('publist-assets', this._gen.bind(this));
};

module.exports = Assets;
