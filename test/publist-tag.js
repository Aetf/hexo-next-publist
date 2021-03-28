'use strict';

const test = require('ava');

const { getHexo, getData } = require('./helpers');

const { PublistTag } = require('../src/publist-tag');

function setHexoLocals(hexo, name, items) {
    hexo.locals.set('data', {
        [name]: {
            items
        }
    });
}

test.beforeEach('Init hexo', async t => {
    t.context.hexo = await getHexo();
    t.context.opts = {
        strict: true,
    };
});

test.todo('New badge month');

test.todo('Conference confkey literal match');
test.todo('Conference confkey regex match');
test.todo('Conference url in parent');
test.todo('Date resolving');
test.todo('Link resolving');

test.todo('Entries are sorted by date in desc order');
test('Unpublished entries are hidden by default', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        { confkey: "abc'1", title: 'Title', links: [], badges: [], bib: { fields: { } } },
    ]);

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurances:
        - key: abc'1
          name: The First ABC
          date: ${new Date().getFullYear()+1}-01-01
    `;

    const publistTag = new PublistTag(hexo, opts);
    const output = await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    t.notRegex(output, /Title/);
});

test('Unpublished entries are shown if requested', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        { confkey: "abc'1", title: 'Title', links: [], badges: [], bib: { fields: { } } },
    ]);

    const instOpts = `
    version: 2
    show_unpublished: true
    venues:
      Abc:
        category: Conferences
        occurances:
        - key: abc'1
          name: The First ABC
          date: ${new Date().getFullYear()+1}-01-01
    `;

    const publistTag = new PublistTag(hexo, opts);
    const output = await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    t.regex(output, /Title/);
});

test.todo('Filtering spec generation');

test.todo('Tag renderering');
test.todo('Tag renderering with coauthor');

test.todo('Strict reject entry without date');
test.todo('Strict reject entry without confkey');
