'use strict';

const pathFn = require('path');
const { VError, WError } = require('verror');

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

class PublistStrictAbort extends VError {
    constructor(file, cause, info) {
        super({
            name: 'PublistStrictAbort',
            cause,
            info,
            constructorOpt: PublistStrictAbort,
        }, `'${file}': aborting because there were errors and the strict mode is enabled`);
    }
}
module.exports.PublistStrictAbort = PublistStrictAbort;

class PublistWebpackError extends WError {
    constructor(cause, info) {
        super({
            name: 'PublistWebpackError',
            cause,
            info,
            constructorOpt: PublistWebpackError,
        }, `Aborting because there were errors when webpacking`);
    }
}
module.exports.PublistWebpackError = PublistWebpackError;
