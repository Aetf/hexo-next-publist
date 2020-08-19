'use strict';

const pathFn = require('path');

module.exports.TEMPLATE_DIR = pathFn.resolve(__dirname, '../templates');
module.exports.ASSETS_DIR = pathFn.resolve(__dirname, '../assets');

module.exports.DEFAULT_OPTIONS = {
    pub_dir: 'assets/pub',
    assets_prefix: 'assets/publist',
    venues: {},
};
