'use strict';

const test = require('ava');

const _ = require('lodash');
const moment = require('moment');

const { getHexo, getData } = require('./helpers');

const { PublistTag, PubsResolver } = require('../src/publist-tag');
const { PublistStrictAbort } = require('../src/consts');

function setHexoLocals(hexo, name, items) {
    hexo.locals.set('data', {
        [name]: {
            items
        }
    });
}

function createEntry(entry) {
    return _.merge(
        {
            links: [],
            badges: [],
            meta: {},
            bib: { fields: { } },
         },
        entry
    );
}

test.beforeEach('Init hexo', async t => {
    t.context.hexo = await getHexo();
    t.context.opts = {
        strict: true,
    };
});

test('Registration with hexo', async t => {
    const { hexo, opts } = t.context;
    const publistTag = new PublistTag(hexo, opts);

    setHexoLocals(hexo, 'test', [ ]);
    publistTag.register();

    const text = `
    {% publist test %}
    version: 2
    {% endpublist %}
    `;
    const output = await hexo.extend.tag.render(
        text,
        { source: 'test.md' }
    );
    t.snapshot(output);
});

test('New badge', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({ confkey: "abc'1", title: 'Title' }),
    ]);

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurances:
        - key: abc'1
          name: The First ABC
          date: ${moment().subtract(1, 'month').format('YYYY-MM-DD')}
    `;

    const publistTag = new PublistTag(hexo, { ...opts, new_month: 3 });
    const output = await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    t.regex(output, /New/);
});

test('confkey literal and regex match', async t => {
    const { hexo, opts } = t.context;
    const rawPubs = [
        createEntry({ confkey: "abcworkshop", title: 'Title1', }),
        createEntry({ confkey: "abc'1", title: 'Title1', }),
    ];

    const instOpts = `
    version: 2
    pub_dir: assets/
    venues:
      Abc:
        category: Conferences
        url: https://abc.com
        occurances:
        - key: abcworkshop
          name: The ABC Workshop
          date: 2021-01-01
        - key: abc-all
          matches: ^abc'(.*)$
          name: The $1 ABC
          url: https://abc.com/$1
          date: 2021-01-01
    `;

    const resolver = new PubsResolver(hexo, opts, instOpts, { source: 'test.bib' });
    const pubs = resolver.processPubs(rawPubs);

    t.is(pubs.length, 2);
    t.is(pubs[0].conf.key, 'abcworkshop');
    t.is(pubs[0].conf.name, 'The ABC Workshop');
    t.is(pubs[0].conf.url, 'https://abc.com');
    t.is(pubs[1].conf.key, 'abc-all');
    t.is(pubs[1].conf.name, 'The 1 ABC');
    t.is(pubs[1].conf.url, 'https://abc.com/1');
});

test('Conference url in parent', async t => {
    const { hexo, opts } = t.context;
    const rawPubs = [
        createEntry({ confkey: "abc'1", title: 'Title1', }),
    ];

    const instOpts = `
    version: 2
    pub_dir: assets/
    venues:
      Abc:
        category: Conferences
        url: https://abc.com
        occurances:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const resolver = new PubsResolver(hexo, opts, instOpts, { source: 'test.bib' });
    const pubs = resolver.processPubs(rawPubs);

    t.is(pubs.length, 1);
    t.is(pubs[0].conf.url, 'https://abc.com');
});

test('Date resolving', async t => {
    const { hexo, opts } = t.context;
    const rawPubs = [
        createEntry({
            confkey: "abc'1",
            title: 'Title1',
            bib: {
                fields: {
                    year: ['2020'],
                    month: ['01']
                }
            }
        }),
        createEntry({
            confkey: "abc'2",
            title: 'Title2',
            bib: {
                fields: {
                    year: ['2020'],
                    month: ['01']
                }
            }
        }),
    ];

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurances:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
        - key: abc'2
          name: The First ABC
    `;

    const resolver = new PubsResolver(hexo, opts, instOpts, { source: 'test.bib' });
    const pubs = resolver.processPubs(rawPubs);

    t.is(pubs.length, 2);
    t.is(pubs[0].date.toISOString(), '2021-01-01T00:00:00.000Z');
    t.is(pubs[1].date.toISOString(), '2020-01-01T00:00:00.000Z');
});

test('Link resolving', async t => {
    const { hexo, opts } = t.context;
    const rawPubs = [
        createEntry({
            citekey: "title1abc1",
            confkey: "abc'1",
            title: 'Title1',
            links: [
                { name: 'relative', href: 'abc.pdf' },
                { name: 'root-relative', href: '/another/abc.pdf' },
                { name: 'protocal-relative', href: '//example2.org/abc.pdf' },
                { name: 'absolute', href: 'https://example.com/abc.pdf' },
            ]
        }),
    ];

    const instOpts = `
    version: 2
    pub_dir: assets/
    venues:
      Abc:
        category: Conferences
        occurances:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const resolver = new PubsResolver(hexo, opts, instOpts, { source: 'test.bib' });
    const pubs = resolver.processPubs(rawPubs);

    t.is(pubs.length, 1);
    t.snapshot(pubs[0].links);
});

test('Entries are sorted by date in desc order', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({ confkey: "abc'1", title: 'Title1' }),
        createEntry({ confkey: "abc'2", title: 'Title2' }),
    ]);

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurances:
        - key: abc'1
          name: The First ABC
          date: 2020-01-01
        - key: abc'2
          name: The Second ABC
          date: 2021-01-01
    `;

    const publistTag = new PublistTag(hexo, opts);
    const output = await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    t.regex(output, /Title2[\s\S]+Title1/m);
});

test('Unpublished entries are hidden by default', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({ confkey: "abc'1", title: 'Title' }),
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
        createEntry({ confkey: "abc'1", title: 'Title' }),
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

test('Filtering spec generation', async t => {
    const { hexo, opts } = t.context;
    const pubs = [
        createEntry({
            confkey: "abc'1", title: 'Title',
            badges: ['Badge1'],
            meta: {
                topic: ['Topic1', 'Topic2'],
            }
        }),
        createEntry({
            confkey: "abc'1", title: 'Title2',
            badges: ['Badge2'],
            meta: {
                topic: ['Topic2', 'Topic3'],
            }
        }),
    ];

    const instOpts = `
    version: 2
    extra_filters:
    - name: Topic
      path: meta.topic
    - name: Badges
      path: badges
    venues:
      Abc:
        category: Conferences
        occurances:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const resolver = new PubsResolver(hexo, opts, instOpts, { source: 'test.bib' });
    const fspecs = resolver.processFspecs(resolver.processPubs(pubs));
    t.snapshot(fspecs);
});

test('Strict reject entry without date', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({ confkey: "abc'1", title: 'Title' }),
    ]);

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurances:
        - key: abc'1
          name: THe First ABC
    `;

    const publistTag = new PublistTag(hexo, opts);
    await t.throwsAsync(async () => {
        await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    }, { instanceOf: PublistStrictAbort });
});

test('Strict reject entry without confkey', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({
            title: 'Title',
            bib: {
                fields: {
                    year: ['2020'],
                    month: ['01'],
                }
            }
        }),
    ]);

    const instOpts = `
    version: 2
    `;

    const publistTag = new PublistTag(hexo, opts);
    await t.throwsAsync(async () => {
        await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    }, { instanceOf: PublistStrictAbort });
});

test.todo('Entry renderering with coauthor');
