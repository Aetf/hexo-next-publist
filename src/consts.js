'use strict';

const pathFn = require('path');

module.exports.SELF = pathFn.resolve(__dirname, '..');
module.exports.TEMPLATE_DIR = pathFn.resolve(__dirname, '../templates');
module.exports.WIDGET_DIR = pathFn.resolve(__dirname, '../widget');

module.exports.DEFAULT_OPTIONS = {
    assets_prefix: '/assets/publist/',
    new_months: 3,
    strict: false,
    embed_css: true,
};

module.exports.DEFAULT_INSTOPTS = {
    version: 2,
    pub_dir: 'assets',
    show_unpublished: false,
    highlight_authors: [],
    extra_filters: [],
    venues: {},
}

class PublistStrictAbort extends Error {
    constructor(file) {
        super(`'${file}': aborting because there were errors and the strict mode is enabled`);
        this.name = 'PublistStrictAbort';
        Error.captureStackTrace(this, PublistStrictAbort);
    }
}
module.exports.PublistStrictAbort = PublistStrictAbort;
