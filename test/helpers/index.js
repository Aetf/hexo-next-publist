'use strict';

const Hexo = require('hexo');
const fs = require('fs/promises');
const pathFn = require('path');

async function getHexo(level) {
    const hexo = new Hexo();
    await hexo.init();
    hexo.log.level = level || 70; // FATAL + 10
    return hexo;
}

function getData(name) {
    return fs.readFile(pathFn.join(__dirname, '..', 'data', name), 'utf-8');
}

module.exports.getHexo = getHexo;
module.exports.getData = getData;
