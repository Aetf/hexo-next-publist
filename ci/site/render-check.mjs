// Compare two generated copies of the fixture site (base vs head) and fail
// on any meaningful rendering difference. Run from ci/site so playwright &
// pixelmatch resolve from its node_modules:
//
//   node render-check.mjs <base-public-dir> <head-public-dir> [artifact-dir]
//
// Three comparisons:
// 1. All html files, after normalizing the per-build random publist instance
//    ids, must match exactly. The fixture keeps css out of the html
//    (embed_css: false) so this only sees markup changes.
// 2. A scripted interaction scenario runs identically against both copies in
//    chromium. Each stage makes functional assertions (filtering counts, url
//    fragment sync, abstract fold, bibtex-copy tooltip) and must hold on both
//    sides — this is what covers the widget js behavior.
// 3. After every stage, full-page screenshots of both sides must match
//    pixel-wise. Both come from the same run on the same machine, so this is
//    deterministic; it is what covers css (and style-affecting js) changes.
//
// On difference, artifacts (html diffs, screenshots, pixel diff images) are
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

// 3. scripted interaction scenario + per-stage pixel comparison
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

// snapshot of the state the filter-related assertions care about
const readState = page => page.evaluate(() => ({
    total: document.querySelectorAll('.pub-list li').length,
    visible: document.querySelectorAll('.pub-list li:not(.filter-hide)').length,
    counter: document.querySelector('.publist-filters-header .selected-value').textContent,
    hash: location.hash,
}));

function assertEq(side, stage, what, actual, expected) {
    if (actual !== expected) {
        failures.push(`[${side}] ${stage}: ${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        return false;
    }
    return true;
}

// Each stage acts on the page, then asserts. Stages run in order on the same
// page unless they navigate themselves; every stage ends with a screenshot
// comparison between base and head.
const STAGES = [
    {
        name: 'initial',
        async run(page, side) {
            const s = await readState(page);
            if (s.total <= 0) failures.push(`[${side}] initial: no publication entries rendered`);
            assertEq(side, 'initial', 'visible entries', s.visible, s.total);
            assertEq(side, 'initial', 'panel counter', s.counter, String(s.total));
        },
    },
    {
        name: 'filter-venue',
        async run(page, side) {
            const venueSel = 'details[data-select-for="venue"]';
            await page.click(`${venueSel} summary`);
            const expected = parseInt(await page.locator(`${venueSel} button[data-value="NSDI"] .Counter`).textContent(), 10);
            await page.click(`${venueSel} button[data-value="NSDI"]`);
            const s = await readState(page);
            assertEq(side, 'filter-venue', 'visible entries', s.visible, expected);
            if (!(s.visible < s.total)) failures.push(`[${side}] filter-venue: filter did not hide anything (${s.visible}/${s.total})`);
            assertEq(side, 'filter-venue', 'panel counter', s.counter, String(expected));
            assertEq(side, 'filter-venue', 'url fragment', s.hash, '#/venue:NSDI');
            // close the dropdown for a stable screenshot
            await page.click(`${venueSel} summary`);
        },
    },
    {
        name: 'reset',
        async run(page, side) {
            await page.click('.publist-filters-header footer a');
            const s = await readState(page);
            assertEq(side, 'reset', 'visible entries', s.visible, s.total);
        },
    },
    {
        name: 'deep-link',
        async run(page, side, url) {
            // a fresh load with a filter fragment must come up pre-filtered
            await page.goto(`${url}#/venue:MLSys`, { waitUntil: 'networkidle' });
            const venueSel = 'details[data-select-for="venue"]';
            const expected = parseInt(await page.locator(`${venueSel} button[data-value="MLSys"] .Counter`).textContent(), 10);
            const s = await readState(page);
            assertEq(side, 'deep-link', 'visible entries', s.visible, expected);
            assertEq(side, 'deep-link', 'venue summary', await page.locator(`${venueSel} .summary-value`).textContent(), 'MLSys');
        },
    },
    {
        name: 'abstract-and-copy',
        async run(page, side, url) {
            await page.goto(url, { waitUntil: 'networkidle' });
            // unfold the first abstract, wait for the height transition to land
            await page.click('.pub-block .pub-link-abstract');
            const frame = page.locator('.pub-abstract-frame.shown').first();
            try {
                await frame.waitFor({ timeout: 5000 });
                await page.waitForFunction(() => {
                    const el = document.querySelector('.pub-abstract-frame.shown');
                    return el && el.style.height !== '0px' && getComputedStyle(el).height === el.style.height;
                }, null, { timeout: 5000 });
            } catch {
                failures.push(`[${side}] abstract-and-copy: abstract did not unfold`);
            }
            // the bibtex copy button must acknowledge with a tooltip
            await page.click('.pub-links .pub-link-bibtex');
            try {
                await page.waitForSelector('.pub-link-bibtex.tooltipped', { timeout: 5000 });
            } catch {
                failures.push(`[${side}] abstract-and-copy: no tooltip after clicking [bibtex]`);
            }
            const label = await page.locator('.pub-links .pub-link-bibtex').first().getAttribute('aria-label');
            if (!label) failures.push(`[${side}] abstract-and-copy: bibtex tooltip has no label`);
            // the tooltip is hover-bound and fades in, so park the mouse
            // elsewhere and wait for it to close before the screenshot
            await page.mouse.move(0, 0);
            await page.waitForFunction(() => document.querySelectorAll('.pub-link-bibtex.tooltipped').length === 0, null, { timeout: 5000 });
        },
    },
];

function comparePixels(stage, basePng, headPng) {
    const imgA = PNG.sync.read(readFileSync(basePng));
    const imgB = PNG.sync.read(readFileSync(headPng));
    if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
        failures.push(`${stage}: screenshot size differs: ${imgA.width}x${imgA.height} -> ${imgB.width}x${imgB.height}`);
        return;
    }
    const diff = new PNG({ width: imgA.width, height: imgA.height });
    const differing = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, { threshold: 0.1 });
    // tolerate a sliver of anti-aliasing noise, nothing more
    const budget = Math.ceil(imgA.width * imgA.height * 0.0002);
    if (differing > budget) {
        failures.push(`${stage}: screenshot differs: ${differing} pixels (budget ${budget})`);
        writeFileSync(pathFn.join(artifactDir, `${stage}-pixeldiff.png`), PNG.sync.write(diff));
    }
}

const servers = [await serve(baseDir, 8901), await serve(headDir, 8902)];
const browser = await chromium.launch();
const sides = [
    { side: 'base', url: 'http://127.0.0.1:8901/research/' },
    { side: 'head', url: 'http://127.0.0.1:8902/research/' },
];
for (const s of sides) {
    s.page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await s.page.goto(s.url, { waitUntil: 'networkidle' });
}

for (const stage of STAGES) {
    const shots = [];
    for (const { side, url, page } of sides) {
        await stage.run(page, side, url);
        const shot = pathFn.join(artifactDir, `${stage.name}-${side}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        shots.push(shot);
    }
    comparePixels(stage.name, shots[0], shots[1]);
}

await browser.close();
servers.forEach(s => s.close());

if (failures.length > 0) {
    console.error('Rendering differs from the merge base (or a widget interaction broke):');
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`Artifacts in ${artifactDir}`);
    process.exit(1);
}
console.log('Rendering and widget interactions are identical to the merge base.');
