'use strict';

const test = require('ava');

const stripIndent = require('strip-indent');

const { getHexo } = require('./helpers');

const { bibRenderer } = require('../src/bib-renderer');
const { PublistStrictAbort } = require('../src/consts');

test.beforeEach('Init hexo', async t => {
    t.context.hexo = await getHexo();
    t.context.opts = {};
});

test('Basic bib parsing', async t => {
    const { hexo, opts } = t.context;

    const content = `@inproceedings{yu20mlsys,
        title = {{Salus}: Find-grained {GPU} Sharing primitives for Deep Learning Applications},
        author = {Yu, Peifeng and Chowdhury, Mosharaf and Efd, Eff},
        booktitle = {Proceedings of the 3rd Conference on Machine Learning and Systems},
        year = {2020},

        publist_confkey = {MLSys'20},
    }`;

    const { items } = await bibRenderer(hexo, opts, { path: 'test.bib', text: content });

    t.is(items.length, 1);
    t.like(items[0], {
        citekey: 'yu20mlsys',
        title: 'Salus: Find-grained GPU sharing primitives for deep learning applications',
        authors: ['Peifeng Yu', 'Mosharaf Chowdhury', 'Eff Efd'],
        badges: [],
        confkey: "MLSys'20",
        abstract: '',
        links: [],
        meta: {},
    });
    t.is(items[0].bibStr, stripIndent(`    @inproceedings{yu20mlsys,
        title = {{Salus}: Find-grained {GPU} Sharing primitives for Deep Learning Applications},
        author = {Yu, Peifeng and Chowdhury, Mosharaf and Efd, Eff},
        booktitle = {Proceedings of the 3rd Conference on Machine Learning and Systems},
        year = {2020},
    }\n`));
});

test.todo('Coauthor field is parsed');

test('Extra fields are stripped', async t => {
    const { hexo, opts } = t.context;

    const content = `@inproceedings{yu20mlsys,
        title = {{Salus}: Find-grained {GPU} Sharing primitives for Deep Learning Applications},

        publist_confkey = {MLSys'20},
        publist_link = {paper || yu20mlsys.pdf},
        publist_tag = {tagB},
        publist_topic = {GPU},
        publist_abc = {def},
        publist_abc = {def2},
    }`;

    const { items } = await bibRenderer(hexo, opts, { path: 'test.bib', text: content });

    t.is(items.length, 1);
    t.notRegex(items[0].bibStr, /publist/);
})

test('Markdown abstract over normal abstract', async t => {
    const { hexo, opts } = t.context;
    await hexo.loadPlugin(require.resolve('hexo-renderer-marked'));

    const content = `@inproceedings{yu20mlsys,
        publist_abstract = {Markdown _in_ **side**},
        abstract = {Normal abstract},
    }`;

    const { items } = await bibRenderer(hexo, opts, { path: 'test.bib', text: content });

    t.is(items.length, 1);
    t.is(items[0].abstract, "<p>Markdown <em>in</em> <strong>side</strong></p>\n");
});

test('Plural fields', async t => {
    const { hexo, opts } = t.context;

    const content = `@inproceedings{yu20mlsys,
        publist_link = {abc || def.pdf},
        publist_link = {abc2 || def2.pdf},
        publist_badge = {Good},
        publist_badge = {Good2},
    }`;

    const { items } = await bibRenderer(hexo, opts, { path: 'test.bib', text: content });

    t.is(items.length, 1);
    t.like(items[0], {
        links: [
            { name: 'abc', href: 'def.pdf'},
            { name: 'abc2', href: 'def2.pdf'},
        ],
        badges: ['Good', 'Good2'],
    })
})

test('Meta fields', async t => {
    const { hexo, opts } = t.context;

    const content = `@inproceedings{yu20mlsys,
        publist_meta1 = {abc},
        publist_meta2 = {abc2},
        publist_meta1 = {abc3},
        publist_xyz = {qqq},
    }`;

    const { items } = await bibRenderer(hexo, opts, { path: 'test.bib', text: content });

    t.is(items.length, 1);
    t.like(items[0], {
        meta: {
            meta1: ['abc', 'abc3'],
            meta2: ['abc2'],
            xyz: ['qqq']
        }
    })
})

test('Strict abort', async t => {
    const { hexo, opts } = t.context;

    const content = `@inproceedings{yu20mlsys
        title = {{Salus}: Find-grained {GPU} Sharing primitives for Deep Learning Applications},
        publist_confkey = {qqq},
    }`;

    await t.notThrowsAsync(async () => {
        await bibRenderer(hexo, { ...opts, strict: false }, { path: 'test.bib', text: content });
    });

    const err = await t.throwsAsync(async () => {
        await bibRenderer(hexo, { ...opts, strict: true }, { path: 'test.bib', text: content });
    }, { instanceOf: PublistStrictAbort});
})
