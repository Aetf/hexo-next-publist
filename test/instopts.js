'use strict';

const test = require('ava');

const path = require('path');
const fs = require('fs');

const { PubsResolver } = require('../src/publist-tag');
const { getHexo } = require('./helpers');

function normalize(obj) {
    return JSON.parse(JSON.stringify(obj));
}

test('Tag Options V1', async t => {
    const hexo = await getHexo();

    const content = fs.readFileSync(path.join(__dirname, 'data/config.yml'));
    const resolver = new PubsResolver(hexo, {}, content, { source: 'test.md' });
    const instOpts = normalize(resolver.instOpts);

    t.snapshot(instOpts);
});

test('Tag Options V2', async t => {
    const hexo = await getHexo();

    const content = fs.readFileSync(path.join(__dirname, 'data/config.v2.yml'));
    const resolver = new PubsResolver(hexo, {}, content, { source: 'test.md' });
    const instOpts = normalize(resolver.instOpts);

    t.is(instOpts.confs_fuzzy.length, 1);
    t.snapshot(instOpts);
});
