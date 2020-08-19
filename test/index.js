'use strict';

const test = require('ava');

const Hexo = require('hexo');
const path = require('path');
const { sync } = require('resolve');
 
const {createSandbox, process, contentFor, hasRoute} = require('hexo-test-utils');
const sandbox = createSandbox(Hexo, {
    fixture_folder: path.join(__dirname, 'fixtures'),
    plugins: [
        path.join(__dirname, '..', 'src', 'index.js'),
        sync('hexo-renderer-nunjucks'),
        sync('hexo-renderer-marked'),
    ]
});

test('bundled assets are served', async t => {
    let hexo = await sandbox('one-page');
    await process(hexo);

    t.true(await hasRoute(hexo, 'assets/publist/publist.css'));
    t.true(await hasRoute(hexo, 'assets/publist/publist.js'));
});

test('publist tag produces correct list', async t => {
    let hexo = await sandbox('one-page');
    await process(hexo);

    t.true(await hasRoute(hexo, 'pubs.html'));

    const content = await contentFor(hexo, 'pubs.html');
    console.log(JSON.stringify(content))
    console.log(content.toString());
});
