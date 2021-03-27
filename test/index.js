'use strict';

const test = require('ava');

const path = require('path');
const fs = require('fs');
const bibtex = require('@retorquere/bibtex-parser');
const stripIndent = require('strip-indent');
const { loadInstanceOpts, PubsResolver } = require('../src/publist-tag');
const { bibRenderer } = require('../src/bib-renderer');

function normalize(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const BIBSOURCE =
`% publist specific settings starts with publist_, they will not show up in the end result
@inproceedings{yu20mlsys,
    title = {{Salus}: Find-grained {GPU} Sharing primitives for Deep Learning Applications},
    author = {Yu, Peifeng and Chowdhury, Mosharaf and Efd, Eff},
    booktitle = {Proceedings of the 3rd Conference on Machine Learning and Systems},
    year = {2020},

    publist_confkey = {MLSys'20},
    publist_link = {paper || yu20mlsys/yu20mlsys.pdf},
    publist_link = {talk || yu20mlsys/yu20mlsys-talk.pptx},
    publist_link = {poster || yu20mlsys/yu20mlsys-poster.pdf},
    publist_badge = {Artifacts Available},
    publist_badge = {Artifacts Evaluated Functional},
    publist_badge = {Artifacts Replicated},
    publist_abstract = {
        Unlike traditional resources such as CPU or the network, modern GPUs do not natively support
        fine-grained sharing primitives.
        Consequently, implementing common policies such as time sharing and preemption are expensive. Worse,
        when a deep learning (DL) application cannot completely use a GPU's resources, the GPU cannot be efficiently shared
        between multiple applications, leading to GPU underutilization.

        We present Salus to enable two GPU sharing primitives: __fast job
        switching__ and __memory sharing__, to achieve fine-grained GPU sharing
        among multiple DL applications. Salus is an efficient, consolidated
        execution service that exposes the GPU to different DL applications, and it
        enforces fine-grained sharing by performing iteration scheduling and
        addressing associated memory management issues. We show that these primitives
        can then be used to implement flexible sharing policies. Our integration of
        Salus with TensorFlow and evaluation on popular DL jobs shows that Salus
        can improve the average completion time of DL training jobs by 3.19x, GPU utilization for hyper-parameter tuning by 2.38x, and GPU
        utilization of DL inference applications by 42x over not sharing
        the GPU and 7x over NVIDIA MPS with small overhead.
    }
}
`;

const BIBCOPY =
`@inproceedings{yu20mlsys,
    title = {{Salus}: Find-grained {GPU} Sharing primitives for Deep Learning Applications},
    author = {Yu, Peifeng and Chowdhury, Mosharaf and Efd, Eff},
    booktitle = {Proceedings of the 3rd Conference on Machine Learning and Systems},
    year = {2020},
}
`;

const ABSTRACT = 
`Unlike traditional resources such as CPU or the network, modern GPUs do not natively support
fine-grained sharing primitives.
Consequently, implementing common policies such as time sharing and preemption are expensive. Worse,
when a deep learning (DL) application cannot completely use a GPU's resources, the GPU cannot be efficiently shared
between multiple applications, leading to GPU underutilization.

We present Salus to enable two GPU sharing primitives: __fast job
switching__ and __memory sharing__, to achieve fine-grained GPU sharing
among multiple DL applications. Salus is an efficient, consolidated
execution service that exposes the GPU to different DL applications, and it
enforces fine-grained sharing by performing iteration scheduling and
addressing associated memory management issues. We show that these primitives
can then be used to implement flexible sharing policies. Our integration of
Salus with TensorFlow and evaluation on popular DL jobs shows that Salus
can improve the average completion time of DL training jobs by 3.19x, GPU utilization for hyper-parameter tuning by 2.38x, and GPU
utilization of DL inference applications by 42x over not sharing
the GPU and 7x over NVIDIA MPS with small overhead.`;

test('bibtex parsing', t => {
    const opts = {
        verbatimFields: [/^publist_/],
    }
    const chunks = bibtex.chunker(BIBSOURCE, opts);
    t.is(chunks.length, 1);

    const chunk = chunks[0].text;
    // normal info
    const bib = bibtex.parse(chunk, opts).entries[0];
    // get ast to strip fields
    const ast = bibtex.ast(chunk, opts);
    const entryAst = ast[0].children[0];

    const fields = entryAst.fields.filter(field => !field.name.startsWith('publist_'));
    let gen = `@${entryAst.type}{${entryAst.id},\n`;
    gen += fields.map(field => '    ' + field.source.trim()).join('\n');
    gen += '\n}\n';

    t.is(gen, BIBCOPY);

    // get abstract
    const absField = entryAst.fields.filter(field => field.name === 'publist_abstract')[0];

    const concat_source = (node) => {
        if (Array.isArray(node)) {
            return node.map(concat_source).join('');
        }

        return node.source || concat_source(node.value);
    }
    // strip surrounding braces
    let abs = concat_source(absField.value).replace(/^{/, '').replace(/}$/, '');
    abs = stripIndent(abs).trim();

    t.is(abs, ABSTRACT);
});

test('MCPub parsing', async t => {
    const mockCtx = {
        log: {
            w: console.log,
        },
        render: {
            render: async ({ text }) => text
        }
    };
    const content = await fs.readFileSync(path.join(__dirname, 'data/MCPubs.bib'), 'utf-8');
    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/MCPubs.json')));

    const { items: rawPubs } = await bibRenderer(mockCtx, {}, { text: content });
    t.deepEqual(rawPubs, expected);
});

test('Tag Options V1', t => {
    const content = fs.readFileSync(path.join(__dirname, 'data/config.yml'));
    const instOpts = normalize(loadInstanceOpts(content));

    t.like(instOpts, {
        version: 1,
        pub_dir: 'publications/files',
        confs: {
            "ATC'20": {
                venue: 'ATC',
                name: 'The 2020 USENIX Annual Technical Conference',
                date: '2020-07-15T00:00:00.000Z',
                url: 'https://www.usenix.org/conference/atc20',
                acceptance: '18.68%',
                cat: 'Conferences'
            },
            arXiv: {
                venue: 'arXiv',
                name: 'arXiv',
                url: 'https://arxiv.org',
                acceptance: '',
                cat: 'Technical Reports'
            },
            'USENIX ;login:': {
                venue: 'USENIX ;login:',
                name: 'USENIX ;login: Winter 2017, VOL. 42, NO. 4',
                date: '2017-12-30T00:00:00.000Z',
                url: 'https://www.usenix.org/publications/login',
                acceptance: '',
                cat: 'Journals'
            }
        },
        extra_filters: [
            { id: 'topic', name: 'Topic', path: 'meta.topic' },
            { id: 'tag', name: 'Tag', path: 'meta.tag' },
            { id: 'badge', name: 'Badge', path: 'badges' }
        ],
    });
});

test('Tag Options V2', t => {
    const content = fs.readFileSync(path.join(__dirname, 'data/config.v2.yml'));
    const instOpts = normalize(loadInstanceOpts(content));

    t.is(instOpts.confs_fuzzy.length, 1);
    t.like(instOpts, {
        version: 2,
        pub_dir: 'publications/files',
        highlight_authors: {},
        confs: {
            "NSDI'20": {
                key: "NSDI'20",
                venue: 'NSDI',
                name: 'The 17th USENIX Symposium on Networked Systems Design and Implementation',
                date: '2020-02-25T00:00:00.000Z',
                url: 'https://www.usenix.org/conference/nsdi20',
                acceptance: '18.36%',
                cat: 'Conferences'
            },
            "NSDI'17": {
                key: "NSDI'17",
                venue: 'NSDI',
                name: 'The 14th USENIX Symposium on Networked Systems Design and Implementation',
                date: '2017-03-27T00:00:00.000Z',
                url: 'https://www.usenix.org/conference/nsdi17',
                acceptance: '18.04%',
                cat: 'Conferences'
            },
            'arXiv-all': {
                key: 'arXiv-all',
                venue: 'arXiv',
                name: 'arXiv:$1',
                matches: '^arXiv:(.*)$',
                url: 'https://arxiv.org/abs/$1',
                cat: 'Technical Reports',
                date: undefined,
            },
            'arXiv': {
                date: undefined,
            },
            'USENIX ;login: Winter 2017': {
                key: "USENIX ;login: Winter 2017",
                venue: 'USENIX ;login:',
                name: 'USENIX ;login: Winter 2017, VOL. 42, NO. 4',
                date: '2017-12-30T00:00:00.000Z',
                url: 'https://www.usenix.org/publications/login',
                cat: 'Journals'
            }
        },
        extra_filters: [
            { id: 'topic', name: 'Topic', path: 'meta.topic' },
            { id: 'tag', name: 'Tag', path: 'meta.tag' },
            { id: 'badge', name: 'Badge', path: 'badges' }
        ],
    });
});

test('MCBib resolving', t => {
    const content = fs.readFileSync(path.join(__dirname, 'data/config.v2.yml'));
    const instOpts = loadInstanceOpts(content);
    const parsedPubs = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/MCPubs.json')));

    const resolver = new PubsResolver(instOpts);
    const pubs = resolver.processPubs(parsedPubs);
    const fspecs = resolver.processFspecs(pubs);

    // fs.writeFileSync(path.join(__dirname, 'data/MCPubs.resolved.json'), JSON.stringify(pubs));
    // fs.writeFileSync(path.join(__dirname, 'data/MCPubs.fspecs.json'), JSON.stringify(fspecs));

    t.is(pubs.length, 32);
    t.deepEqual(normalize(pubs), JSON.parse(fs.readFileSync(path.join(__dirname, 'data/MCPubs.resolved.json'))))
    t.deepEqual(normalize(fspecs), JSON.parse(fs.readFileSync(path.join(__dirname, 'data/MCPubs.fspecs.json'))))
});
