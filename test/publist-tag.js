import test from 'ava';

import _ from 'lodash';

import { getHexo } from './helpers/index.js';

import { PublistTag, resolvePublist } from '../dist/publist-tag.js';
import { PublistStrictAbort } from '../dist/consts.js';

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
            coauthors: [],
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
    const publistTag = new PublistTag(hexo, opts, 'test-id');

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
        occurrences:
        - key: abc'1
          name: The First ABC
          date: ${new Date(Date.now() - 32 * 24 * 3600 * 1000).toISOString().slice(0, 10)}
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
        occurrences:
        - key: abcworkshop
          name: The ABC Workshop
          date: 2021-01-01
        - key: abc-all
          matches: ^abc'(.*)$
          name: The $1 ABC
          url: https://abc.com/$1
          date: 2021-01-01
    `;

    const { pubs } = resolvePublist(hexo, opts, instOpts, rawPubs, { source: 'test.bib' });

    t.is(pubs.length, 2);
    t.is(pubs[0].conf.key, 'abcworkshop');
    t.is(pubs[0].conf.name, 'The ABC Workshop');
    t.is(pubs[0].conf.url, 'https://abc.com');
    t.is(pubs[1].conf.key, 'abc-all');
    t.is(pubs[1].conf.name, 'The 1 ABC');
    t.is(pubs[1].conf.url, 'https://abc.com/1');
});

test('confkey regex match does not affect each other', async t => {
    const { hexo, opts } = t.context;
    const rawPubs = [
        createEntry({ confkey: "abc'2", title: 'Title2', }),
        createEntry({ confkey: "abc'1", title: 'Title1', }),
    ];

    const instOpts = `
    version: 2
    pub_dir: assets/
    venues:
      Abc:
        category: Conferences
        occurrences:
        - key: abc-all
          matches: ^abc'(.*)$
          name: The $1 ABC
          url: https://abc.com/$1
          date: 2021-01-01
    `;

    const { pubs } = resolvePublist(hexo, opts, instOpts, rawPubs, { source: 'test.bib' });

    t.is(pubs.length, 2);
    t.is(pubs[0].conf.key, 'abc-all');
    t.is(pubs[0].conf.name, 'The 2 ABC');
    t.is(pubs[0].conf.url, 'https://abc.com/2');
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
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const { pubs } = resolvePublist(hexo, opts, instOpts, rawPubs, { source: 'test.bib' });

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
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
        - key: abc'2
          name: The First ABC
    `;

    const { pubs } = resolvePublist(hexo, opts, instOpts, rawPubs, { source: 'test.bib' });

    t.is(pubs.length, 2);
    t.is(pubs[0].date, '2021-01-01T00:00:00.000Z');
    t.is(pubs[1].date, '2020-01-01T00:00:00.000Z');
});

test('Bib date field takes priority over conference date', async t => {
    const { hexo, opts } = t.context;
    const rawPubs = [
        createEntry({
            confkey: "abc'1",
            title: 'Title1',
            bib: {
                fields: {
                    date: ['2022-05-04'],
                    year: ['2020'],
                    month: ['01']
                }
            }
        }),
        createEntry({
            confkey: "abc'1",
            title: 'Title2',
        }),
    ];

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const { pubs } = resolvePublist(hexo, opts, instOpts, rawPubs, { source: 'test.bib' });

    t.is(pubs.length, 2);
    t.is(pubs[0].date, '2022-05-04T00:00:00.000Z');
    t.is(pubs[1].date, '2021-01-01T00:00:00.000Z');
});

test('Bib date field supports ranges and partial dates', async t => {
    const { hexo, opts } = t.context;
    const rawPubs = [
        createEntry({
            confkey: "abc'1",
            title: 'Range',
            bib: { fields: { date: ['2022-05-04/2022-05-06'] } }
        }),
        createEntry({
            confkey: "abc'1",
            title: 'YearMonth',
            bib: { fields: { date: ['2022-03'] } }
        }),
        createEntry({
            confkey: "abc'1",
            title: 'YearOnly',
            bib: { fields: { date: ['2022'] } }
        }),
    ];

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const { pubs } = resolvePublist(hexo, opts, instOpts, rawPubs, { source: 'test.bib' });

    t.is(pubs.length, 3);
    t.is(pubs[0].date, '2022-05-04T00:00:00.000Z');
    t.is(pubs[1].date, '2022-03-01T00:00:00.000Z');
    t.is(pubs[2].date, '2022-01-01T00:00:00.000Z');
});

test('Invalid bib date field falls back to conference date', async t => {
    const { hexo, opts } = t.context;
    const rawPubs = [
        createEntry({
            confkey: "abc'1",
            title: 'Title1',
            bib: { fields: { date: ['May the 4th'] } }
        }),
    ];

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const { pubs } = resolvePublist(hexo, { ...opts, strict: false }, instOpts, rawPubs, { source: 'test.bib' });

    t.is(pubs.length, 1);
    t.is(pubs[0].date, '2021-01-01T00:00:00.000Z');
});

test('Strict reject invalid bib date field', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({
            citekey: 'bad-date-article',
            confkey: "abc'1",
            title: 'Title',
            bib: { fields: { date: ['May the 4th'] } }
        }),
    ]);

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const publistTag = new PublistTag(hexo, opts);
    // any: true because PublistStrictAbort extends legacy verror's VError,
    // which does not pass ava 8's util.types.isNativeError() check
    const err = await t.throwsAsync(async () => {
        await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    }, { any: true });
    t.true(err instanceof PublistStrictAbort);
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
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const { pubs } = resolvePublist(hexo, opts, instOpts, rawPubs, { source: 'test.bib' });

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
        occurrences:
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
        occurrences:
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
        occurrences:
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
            citekey: 'first-article',
            confkey: "abc'1", title: 'Title',
            badges: ['Badge1'],
            meta: {
                topic: ['Topic1', 'Topic2'],
            }
        }),
        createEntry({
            citekey: 'second-article',
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
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const { fspecs } = resolvePublist(hexo, opts, instOpts, pubs, { source: 'test.bib' });
    t.snapshot(fspecs);
});

test('Uncategorized venue', async t => {
    const { hexo, opts } = t.context;
    const pubs = [
        createEntry({
            citekey: 'mythesis', confkey: "phdthesis", title: 'Title',
            bib: {
                fields: {
                    year: ['2021'], month: ['08'],
                }
            }
        }),
    ];

    const instOpts = `
    version: 2
    venues:
      'PhD Dissertation':
        occurrences:
        - key: phdthesis
          name: PhD Dissertation
    `;

    const { fspecs } = resolvePublist(hexo, opts, instOpts, pubs, { source: 'test.bib' });
    t.snapshot(fspecs);
});

test('Strict reject entry without date', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({ citekey: 'strict-article', confkey: "abc'1", title: 'Title' }),
    ]);

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurrences:
        - key: abc'1
          name: THe First ABC
    `;

    const publistTag = new PublistTag(hexo, opts);
    // any: true because PublistStrictAbort extends legacy verror's VError,
    // which does not pass ava 8's util.types.isNativeError() check
    const err = await t.throwsAsync(async () => {
        await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    }, { any: true });
    t.true(err instanceof PublistStrictAbort);
});

test('Strict reject entry without confkey', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({
            citekey: 'no-confkey-article',
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
    // any: true because PublistStrictAbort extends legacy verror's VError,
    // which does not pass ava 8's util.types.isNativeError() check
    const err = await t.throwsAsync(async () => {
        await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    }, { any: true });
    t.true(err instanceof PublistStrictAbort);
});

test('Entry rendering with coauthor', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({
            confkey: "abc'1",
            title: 'Title',
            authors: ['Peifeng Yu', 'Mosharaf Chowdhury', 'Eff Efd'],
            coauthors: ['Peifeng Yu', 'Mosharaf Chowdhury'],
        }),
    ]);

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const publistTag = new PublistTag(hexo, opts, 'test-id');
    const output = await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    // both coauthors carry the mark, the third author does not
    t.regex(output, /Peifeng&nbspYu<sup class="pub-coauthor-mark"/);
    t.regex(output, /Mosharaf&nbspChowdhury<sup class="pub-coauthor-mark"/);
    t.notRegex(output, /Eff&nbspEfd<sup/);
    t.regex(output, /pub-coauthor-note/);
});

test('Entry rendering without coauthor has no equal contribution note', async t => {
    const { hexo, opts } = t.context;
    setHexoLocals(hexo, 'test', [
        createEntry({
            confkey: "abc'1",
            title: 'Title',
            authors: ['Peifeng Yu'],
        }),
    ]);

    const instOpts = `
    version: 2
    venues:
      Abc:
        category: Conferences
        occurrences:
        - key: abc'1
          name: The First ABC
          date: 2021-01-01
    `;

    const publistTag = new PublistTag(hexo, opts, 'test-id');
    const output = await publistTag._tag(['test'], instOpts, { source: 'test.bib' });
    t.notRegex(output, /pub-coauthor/);
});
