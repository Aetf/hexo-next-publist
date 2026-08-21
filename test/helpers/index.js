import fs from 'node:fs/promises';
import pathFn from 'node:path';
import { fileURLToPath } from 'node:url';

import Hexo from 'hexo';

const __dirname = pathFn.dirname(fileURLToPath(import.meta.url));

export async function getHexo(level) {
    const hexo = new Hexo();
    await hexo.init();
    hexo.log.level = level || 70; // FATAL + 10
    return hexo;
}

export function getData(name) {
    return fs.readFile(pathFn.join(__dirname, '..', 'data', name), 'utf-8');
}
