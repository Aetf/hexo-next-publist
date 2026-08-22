import pathFn from 'node:path';

import chalk from 'chalk';
import _ from 'lodash';
import stripIndent from 'strip-indent';
import verror from 'verror';

import { parse_bib } from '../bib-wasm/pkg/publist_bib_wasm.js';

import { PublistStrictAbort } from './consts.js';

const { MultiError } = verror;

function formatLocation(file, line, column) {
    line = line || "?";
    column = column || "?";
    return `${file}:${line}:${column}`
}

async function allSettled(promises) {
    const [resolved, rejected] = _.partition(
        await Promise.allSettled(promises),
        _.matches({status: 'fulfilled'})
    );
    return [
        resolved.map(e => e.value),
        rejected.map(e => e.reason),
    ];
}

function reportErrors(ctx, errors) {
    let bibErrors = [];
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
    constructor(file, line, column, message, caller) {
        super(`${formatLocation(file, line, column)}: ${message}`);
        this.name = 'BibtexParseError';
        this.data = { file, line, column };
        Error.captureStackTrace(this, caller || BibtexParseError);
    }
}

class BibRendererError extends Error {
    constructor(errors, caller) {
        super('')
        this.name = 'BibRendererError';
        this.errors = errors;
        Error.captureStackTrace(this, caller || BibRendererError);
    }
}

export async function bibRenderer(ctx, opts, { path, text }) {
    let bibErrors = [];
    path = pathFn.relative(ctx.source_dir, path);

    // parse content as bibtex
    const [ entries, errors ] = await parseBibEntries(ctx, opts, { path, text });
    bibErrors.push(...reportErrors(ctx, errors));

    // construct list of items
    const [items, itemErrors] = await allSettled(entries.map(entry => itemFromEntry(ctx, opts, entry)));
    bibErrors.push(...reportErrors(ctx, itemErrors));

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

/**
 * Parse the bibtex file, for each entry reconstruct bibStr and render abstract
 * @param {*} ctx hexo
 * @param {*} opts global optionsl
 * @param {*} param2
 * @returns
 */
async function parseBibEntries(ctx, opts, { path, text: input }) {
    const parsed = JSON.parse(parse_bib(input));

    const errors = parsed.errors.map(err => new BibRendererError([
        new BibtexParseError(path, err.line, err.column, err.message),
    ]));

    const entries = await Promise.all(parsed.entries.map(async wasmEntry => {
        // compatibility shape consumed by itemFromEntry and publist-tag
        const entry = {
            key: wasmEntry.key,
            type: wasmEntry.type,
            fields: Object.fromEntries(wasmEntry.fields.map(({ name, values }) => [name, values])),
            creators: wasmEntry.creators,
        };

        // get abstract
        let abstract;
        if (wasmEntry.abstractRaw != null) {
            abstract = stripIndent(wasmEntry.abstractRaw).trim();
            // render using simple markdown
            abstract = await ctx.render.render(
                { text: abstract, engine: 'markdown' },
                {
                    gfm: false,
                    breaks: false,
                }
            );
        } else {
            // fallback to normal abstract
            abstract = _.get(entry.fields, 'abstract[0]', '');
        }

        return { entry, bibStr: wasmEntry.bibStr, abstract };
    }));

    return [entries, errors];
}

async function itemFromEntry(ctx, opts, { entry, bibStr, abstract }) {
    const citekey = entry.key;

    // publist_confkey: cross reference to conference to get the year
    const confkey = _.get(entry.fields, 'publist_confkey[0]', '');

    // title: entry title
    const title = _.get(entry.fields, 'title[0]', '');

    // publist_link: links are in the format "link_name || link_ref"
    const links = _.get(entry.fields, 'publist_link', []).map(link => {
        let [name, href] = link.split(' || ');
        if (href == null) {
            ctx.log.w(`Publication item ${title} has a link without url: ${name}`);
            href = '';
        }

        return { name, href };
    });

    let meta = {};
    // add other keys starting with "publist_" saved as metadata
    for (const field of Object.keys(entry.fields)) {
        if (!field.startsWith('publist_')) {
            continue
        }
        // the name after removing publist_ prefix
        const name = field.slice('publist_'.length)
        if (['confkey', 'link', 'badge', 'abstract', 'coauthor'].indexOf(name) !== -1) {
            // already handled
            continue;
        }

        // meta
        meta[name] = _.get(entry.fields, field, []);
    }

    const item = {
        citekey,
        title,
        authors: _.get(entry.creators, 'author', []).map(({lastName, firstName}) => `${firstName} ${lastName}`),
        // authors marked as contributed equally, must match the "First Last" form above
        coauthors: _.get(entry.fields, 'publist_coauthor', []),
        badges: _.get(entry.fields, 'publist_badge', []),
        confkey,
        abstract,
        links,
        bibStr,
        meta,
        bib: entry,
    };

    return item;
}

export const register = (ctx, opts) => {
    ctx.extend.renderer.register('bib', 'json', function(data, options) {
        return bibRenderer(ctx, {...opts, ...options}, data);
    });
};
