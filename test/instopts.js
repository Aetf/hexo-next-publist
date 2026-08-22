import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import test from 'ava';

import { resolvePublist } from '../dist/publist-tag.js';
import { getHexo } from './helpers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Tag Options V1', async t => {
    const hexo = await getHexo();

    const content = fs.readFileSync(path.join(__dirname, 'data/config.yml'));
    const { instOpts } = resolvePublist(hexo, {}, content, [], { source: 'test.md' });

    t.snapshot(instOpts);
});

test('Tag Options V2', async t => {
    const hexo = await getHexo();

    const content = fs.readFileSync(path.join(__dirname, 'data/config.v2.yml'));
    const { instOpts } = resolvePublist(hexo, {}, content, [], { source: 'test.md' });

    t.snapshot(instOpts);
});
