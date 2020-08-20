'use strict';

const pathFn = require('path');

module.exports.TEMPLATE_DIR = pathFn.resolve(__dirname, '../templates');
module.exports.WIDGET_DIR = pathFn.resolve(__dirname, '../widget');

module.exports.DEFAULT_OPTIONS = {
    pub_dir: 'assets/pub/',
    assets_prefix: 'assets/publist/',
    venues: {},
};
