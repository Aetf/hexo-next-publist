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

    t.like(instOpts, {
        version: 1,
        pub_dir: 'publications/files',
        show_unpublished: false,
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

test('Tag Options V2', async t => {
    const hexo = await getHexo();

    const content = fs.readFileSync(path.join(__dirname, 'data/config.v2.yml'));
    const resolver = new PubsResolver(hexo, {}, content, { source: 'test.md' });
    const instOpts = normalize(resolver.instOpts);

    t.is(instOpts.confs_fuzzy.length, 1);
    t.like(instOpts, {
        version: 2,
        pub_dir: 'publications/files',
        show_unpublished: false,
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
