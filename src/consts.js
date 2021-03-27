'use strict';

const pathFn = require('path');

module.exports.SELF = pathFn.resolve(__dirname, '..');
module.exports.TEMPLATE_DIR = pathFn.resolve(__dirname, '../templates');
module.exports.WIDGET_DIR = pathFn.resolve(__dirname, '../widget');

module.exports.DEFAULT_OPTIONS = {
    assets_prefix: '/assets/publist/',
    new_months: 3,
    strict: false,
};

module.exports.DEFAULT_INSTOPTS = {
    version: 2,
    pub_dir: 'assets',
    highlight_authors: [],
    extra_filters: [],
    venues: {},
}
