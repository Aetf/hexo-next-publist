import pathFn from 'node:path';

import chalk from 'chalk';
import stripIndent from 'strip-indent';
import verror from 'verror';
import type Hexo from 'hexo';

import { parse_bib } from '../bib-wasm/pkg/publist_bib_wasm.js';

import { PublistStrictAbort, type PublistOptions } from './consts.js';

const { MultiError } = verror;

function formatLocation(file: string, line?: number, column?: number): string {
    return `${file}:${line ?? '?'}:${column ?? '?'}`;
}

function reportErrors(ctx: Hexo, errors: unknown[]): BibRendererError[] {
    const bibErrors: BibRendererError[] = [];
    for (const err of errors) {
        if (err instanceof BibRendererError) {
            for (const inner of err.errors) {
                ctx.log.error(inner);
            }
            bibErrors.push(err);
        } else {
            // re-raise anything else, which should be fatal.
            throw err;
        }
    }
    return bibErrors;
}

class BibtexParseError extends Error {
    data: { file: string, line?: number, column?: number };

    constructor(file: string, line: number | undefined, column: number | undefined, message: string) {
        super(`${formatLocation(file, line, column)}: ${message}`);
        this.name = 'BibtexParseError';
        this.data = { file, line, column };
        Error.captureStackTrace(this, BibtexParseError);
    }
}

class BibRendererError extends Error {
    errors: BibtexParseError[];

    constructor(errors: BibtexParseError[]) {
        super('');
        this.name = 'BibRendererError';
        this.errors = errors;
        Error.captureStackTrace(this, BibRendererError);
    }
}

/** Output of the wasm bib parser, one entry. */
interface WasmEntry {
    key: string;
    type: string;
    fields: { name: string, values: string[] }[];
    creators: { author: { firstName: string, lastName: string }[] };
    bibStr: string;
    abstractRaw: string | null;
}

interface WasmBibOutput {
    entries: WasmEntry[];
    errors: { line: number, column: number, message: string }[];
}

/** The `@retorquere`-compatible entry shape carried on `item.bib`. */
export interface BibEntry {
    key: string;
    type: string;
    fields: Record<string, string[]>;
    creators: WasmEntry['creators'];
}

export interface BibLink {
    name: string;
    href: string;
}

/** One publication item as exposed through hexo's data model. */
export interface BibItem {
    citekey: string;
    title: string;
    authors: string[];
    coauthors: string[];
    badges: string[];
    confkey: string;
    abstract: string;
    links: BibLink[];
    bibStr: string;
    meta: Record<string, string[]>;
    bib: BibEntry;
}

export async function bibRenderer(
    ctx: Hexo,
    opts: Partial<PublistOptions>,
    { path, text }: { path: string, text: string },
): Promise<{ items: BibItem[] }> {
    const bibErrors: BibRendererError[] = [];
    path = pathFn.relative(ctx.source_dir, path);

    // parse content as bibtex
    const [entries, errors] = await parseBibEntries(ctx, { path, text });
    bibErrors.push(...reportErrors(ctx, errors));

    // construct list of items
    const items = entries.map(entry => itemFromEntry(ctx, entry));

    if (bibErrors.length > 0) {
        if (opts.strict) {
            throw new PublistStrictAbort(path, new MultiError(bibErrors));
        } else {
            ctx.log.warn(`${path}: there were errors while loading, bib entries may be incomplete.`);
        }
    }

    ctx.log.info(`${chalk.magenta(path)}: loaded ${items.length} bib entries`);
    return { items };
}

interface ParsedEntry {
    entry: BibEntry;
    bibStr: string;
    abstract: string;
}

/**
 * Parse the bibtex file, for each entry reconstruct bibStr and render abstract
 */
async function parseBibEntries(
    ctx: Hexo,
    { path, text: input }: { path: string, text: string },
): Promise<[ParsedEntry[], BibRendererError[]]> {
    const parsed = JSON.parse(parse_bib(input)) as WasmBibOutput;

    const errors = parsed.errors.map(err => new BibRendererError([
        new BibtexParseError(path, err.line, err.column, err.message),
    ]));

    const entries = await Promise.all(parsed.entries.map(async wasmEntry => {
        // compatibility shape consumed by itemFromEntry and the tag pipeline
        const entry: BibEntry = {
            key: wasmEntry.key,
            type: wasmEntry.type,
            fields: Object.fromEntries(wasmEntry.fields.map(({ name, values }) => [name, values])),
            creators: wasmEntry.creators,
        };

        // get abstract
        let abstract: string;
        if (wasmEntry.abstractRaw != null) {
            abstract = stripIndent(wasmEntry.abstractRaw).trim();
            // render using simple markdown
            abstract = await ctx.render.render(
                { text: abstract, engine: 'markdown' },
                {
                    gfm: false,
                    breaks: false,
                },
            );
        } else {
            // fallback to normal abstract
            abstract = entry.fields['abstract']?.[0] ?? '';
        }

        return { entry, bibStr: wasmEntry.bibStr, abstract };
    }));

    return [entries, errors];
}

function itemFromEntry(ctx: Hexo, { entry, bibStr, abstract }: ParsedEntry): BibItem {
    const citekey = entry.key;

    // publist_confkey: cross reference to conference to get the year
    const confkey = entry.fields['publist_confkey']?.[0] ?? '';

    // title: entry title
    const title = entry.fields['title']?.[0] ?? '';

    // publist_link: links are in the format "link_name || link_ref"
    const links = (entry.fields['publist_link'] ?? []).map(link => {
        const [name = '', href] = link.split(' || ');
        if (href == null) {
            ctx.log.warn(`Publication item ${title} has a link without url: ${name}`);
        }

        return { name, href: href ?? '' };
    });

    const meta: Record<string, string[]> = {};
    // add other keys starting with "publist_" saved as metadata
    for (const field of Object.keys(entry.fields)) {
        if (!field.startsWith('publist_')) {
            continue;
        }
        // the name after removing publist_ prefix
        const name = field.slice('publist_'.length);
        if (['confkey', 'link', 'badge', 'abstract', 'coauthor'].indexOf(name) !== -1) {
            // already handled
            continue;
        }

        // meta
        meta[name] = entry.fields[field] ?? [];
    }

    return {
        citekey,
        title,
        authors: (entry.creators.author ?? []).map(({ lastName, firstName }) => `${firstName} ${lastName}`),
        // authors marked as contributed equally, must match the "First Last" form above
        coauthors: entry.fields['publist_coauthor'] ?? [],
        badges: entry.fields['publist_badge'] ?? [],
        confkey,
        abstract,
        links,
        bibStr,
        meta,
        bib: entry,
    };
}

export const register = (ctx: Hexo, opts: Partial<PublistOptions>): void => {
    ctx.extend.renderer.register('bib', 'json', function (data, options) {
        return bibRenderer(ctx, { ...opts, ...options }, { path: data.path ?? '', text: data.text ?? '' });
    });
};
