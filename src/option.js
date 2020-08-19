'use strict';

const { DEFAULT_OPTIONS } = require('./consts');
const _ = require('lodash');

function getOptions (hexo) {
    const opts = _.defaults({}, hexo.config.publist, DEFAULT_OPTIONS);

    return opts;
}

module.exports.getOptions = getOptions;
