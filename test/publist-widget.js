'use strict';

const test = require('ava');

const { getHexo } = require('./helpers');
const { PublistWidget } = require('../src/publist-widget');

test.beforeEach('Init hexo', async t => {
    t.context.hexo = await getHexo();
    t.context.opts = {
        strict: true,
        assets_prefix: 'test',
    };
});

test('Routes are added to hexo', async t => {
    const { hexo, opts } = t.context;
    const publistWidget = new PublistWidget(hexo, opts);
    publistWidget.register();

    // load
    await hexo.load();

    const routes = hexo.route.list().sort();

    t.deepEqual(routes, ['test/main.css', 'test/main.js']);

    // webpack works
    await t.notThrowsAsync(async () => {
        await hexo.route.get('test/main.css');
    });
    await t.notThrowsAsync(async () => {
        await hexo.route.get('test/main.js');
    });
});
