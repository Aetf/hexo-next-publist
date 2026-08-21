// Compare two generated copies of the fixture site (base vs head) and fail
// on any meaningful rendering difference. Run from ci/site so playwright &
// pixelmatch resolve from its node_modules:
//
//   node render-check.mjs <base-public-dir> <head-public-dir> [artifact-dir]
//
// Two comparisons:
// 1. All html files, after normalizing the per-build random publist instance
//    ids, must match exactly. The fixture keeps css out of the html
//    (embed_css: false) so this only sees markup changes.
// 2. A full-page chromium screenshot of the research page must match
//    pixel-wise. Both screenshots come from the same run on the same
//    machine, so this is deterministic; it is what covers css (and any
//    style-affecting js) changes.
//
// On difference, artifacts (html diffs, screenshots, pixel diff image) are
// written to the artifact dir for human review.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import pathFn from 'node:path';

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const [baseDir, headDir, artifactDir = '/tmp/render-diff'] = process.argv.slice(2);
if (!baseDir || !headDir) {
    console.error('usage: node render-check.mjs <base-public-dir> <head-public-dir> [artifact-dir]');
    process.exit(2);
}

const failures = [];
mkdirSync(artifactDir, { recursive: true });

const normalize = html => html.replace(/publist-[0-9a-f]{8}/g, 'publist-X');

function listFiles(dir, prefix = '') {
    return readdirSync(pathFn.join(dir, prefix), { withFileTypes: true }).flatMap(e => {
        const rel = pathFn.join(prefix, e.name);
        return e.isDirectory() ? listFiles(dir, rel) : [rel];
    });
}

// 1. file inventory must match
const baseFiles = new Set(listFiles(baseDir));
const headFiles = new Set(listFiles(headDir));
for (const f of baseFiles) {
    if (!headFiles.has(f)) failures.push(`file disappeared: ${f}`);
}
for (const f of headFiles) {
    if (!baseFiles.has(f)) failures.push(`new file appeared: ${f}`);
}

// 2. html content must match modulo the random publist instance id
for (const f of [...baseFiles].filter(f => f.endsWith('.html') && headFiles.has(f))) {
    const a = normalize(readFileSync(pathFn.join(baseDir, f), 'utf-8'));
    const b = normalize(readFileSync(pathFn.join(headDir, f), 'utf-8'));
    if (a !== b) {
        failures.push(`html differs: ${f}`);
        const slug = f.replaceAll('/', '_');
        writeFileSync(pathFn.join(artifactDir, `${slug}.base`), a);
        writeFileSync(pathFn.join(artifactDir, `${slug}.head`), b);
    }
}

// 3. pixel-compare the research page
function serve(dir, port) {
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.map': 'application/json' };
    const server = createServer((req, res) => {
        let p = pathFn.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (existsSync(p) && statSync(p).isDirectory()) p = pathFn.join(p, 'index.html');
        if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': types[pathFn.extname(p)] || 'application/octet-stream' });
        res.end(readFileSync(p));
    });
    return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function shoot(port, out) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}/research/`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: out, fullPage: true });
    await browser.close();
}

const servers = [await serve(baseDir, 8901), await serve(headDir, 8902)];
const basePng = pathFn.join(artifactDir, 'research-base.png');
const headPng = pathFn.join(artifactDir, 'research-head.png');
await shoot(8901, basePng);
await shoot(8902, headPng);
servers.forEach(s => s.close());

const imgA = PNG.sync.read(readFileSync(basePng));
const imgB = PNG.sync.read(readFileSync(headPng));
if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    failures.push(`screenshot size differs: ${imgA.width}x${imgA.height} -> ${imgB.width}x${imgB.height}`);
} else {
    const diff = new PNG({ width: imgA.width, height: imgA.height });
    const differing = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, { threshold: 0.1 });
    // tolerate a sliver of anti-aliasing noise, nothing more
    const budget = Math.ceil(imgA.width * imgA.height * 0.0002);
    if (differing > budget) {
        failures.push(`screenshot differs: ${differing} pixels (budget ${budget})`);
        writeFileSync(pathFn.join(artifactDir, 'research-pixeldiff.png'), PNG.sync.write(diff));
    }
}

if (failures.length > 0) {
    console.error('Rendering differs from the merge base:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`Artifacts in ${artifactDir}`);
    process.exit(1);
}
console.log('Rendering is identical to the merge base.');
