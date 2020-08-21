'use strict';

const pathFn = require('path');

module.exports.TEMPLATE_DIR = pathFn.resolve(__dirname, '../templates');
module.exports.WIDGET_DIR = pathFn.resolve(__dirname, '../widget');

module.exports.DEFAULT_OPTIONS = {
    assets_prefix: 'assets/publist/',
};
