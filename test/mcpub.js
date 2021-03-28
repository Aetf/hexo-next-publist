'use strict';

const test = require('ava');

const { getHexo, getData } = require('./helpers');

const { bibRenderer } = require('../src/bib-renderer');
const { PublistTag } = require('../src/publist-tag');

test('MCBib parsing and resolving', async t => {
    const hexo = await getHexo();

    const opts = {};

    const parsedBib = await bibRenderer(hexo, opts, {
        path: 'MCPubs.bib',
        text: await getData('MCPubs.bib'),
    });
    hexo.locals.set('data', {
        MCPubs: parsedBib,
    });
    
    const publistTag = new PublistTag(hexo, opts);
    const output = await publistTag._tag(['MCPubs'], await getData('config.v2.yml'), { source: 'MCPubs.bib' });

    t.snapshot(output);
});
