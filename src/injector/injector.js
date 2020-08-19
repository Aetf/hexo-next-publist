'use strict';

const pathFn = require('path');
const { TEMPLATE_DIR } = require('../consts');

function Injector(hexo, opts) {
    this.hexo = hexo;
    this.opts = opts;
}

Injector.prototype._inject = function (injects) {
    injects.headEnd.file('publist-headend', pathFn.join(TEMPLATE_DIR, 'headend.njk'), {}, {cache: true});
    injects.bodyEnd.file('publist-bodyend', pathFn.join(TEMPLATE_DIR, 'bodyend.njk'), {}, {cache: true});
};

Injector.prototype.register = function () {
    var { hexo, opts, _inject } = this;

    hexo.extend.filter.register('theme_inject', _inject.bind(this));
};

module.exports = Injector;
