'use strict';

const pathFn = require('path');

const chalk = require('chalk');
const _ = require('lodash');
const stripIndent = require('strip-indent');
const bibtex = require('@retorquere/bibtex-parser');

const { PublistStrictAbort } = require('./consts');

function formatLocation(file, line, column) {
    line = line || "?";
    column = column || "?";
    return `${file}:${line}:${column}`
}

function concatSource(node) {
    if (Array.isArray(node)) {
        return node.map(concatSource).join('');
    }

    return node.source || concatSource(node.value);
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
    let hasError = false;
    for (const err of errors) {
        if (err instanceof BibRendererError) {
            hasError = true;
            for (const inner of err.errors) {
                ctx.log.error(inner);
            }
        } else {
            // re-raise anything else, which should be fatal.
            throw err;
        }
    }
    return hasError;
}

class BibtexParseError extends Error {
    constructor(file, line, column, message, caller) {
        super(`${formatLocation(file, line, column)}: ${message}`);
        this.name = 'BibtexParseError';
        this.data = { file, line, column };
        Error.captureStackTrace(this, caller || BibtexParseError);
    }

    static fromChunk(file, chunk) {
        const line = _.get(chunk, 'offset.line');
        const column = _.get(chunk, 'offset.pos');
        return new BibtexParseError(file, line, column, chunk.error, BibtexParseError.fromChunk);
    }

    static fromParseError(file, err) {
        return new BibtexParseError(file, err.line, err.column, err.message, BibtexParseError.fromParseError);
    }
}

class BibRendererError extends Error {
    constructor(errors, caller) {
        super('')
        this.name = 'BibRendererError';
        this.errors = errors;
        Error.captureStackTrace(this, caller || BibRendererError);
    }

    static fromParseErrors(file, errors) {
        return new BibRendererError(
            errors.map(err => BibtexParseError.fromParseError(file, err)),
            BibRendererError.fromParseErrors,
        );
    }

    static fromChunk(file, chunk) {
        return new BibRendererError(
            [BibtexParseError.fromChunk(file, chunk)],
            BibRendererError.fromChunk,
        );
    }
}

async function bibRenderer(ctx, opts, { path, text }) {
    let hasError = false;
    path = pathFn.relative(ctx.source_dir, path);

    // parse content as bibtex
    const [ entries, errors ] = await parseBibEntries(ctx, opts, { path, text });
    hasError |= reportErrors(ctx, errors);

    // construct list of items
    const [items, itemErrors] = await allSettled(entries.map(entry => itemFromEntry(ctx, opts, entry)));
    hasError |= reportErrors(ctx, itemErrors);

    if (hasError) {
        if (opts.strict) {
            throw new PublistStrictAbort(path);
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
    // chunk into pieces for easier association of raw data and parsed data
    let chunks = await bibtex.chunker(input, { async: true });

    const publistPtn = /^publist_/;
    const bibOptions = {
        async: true,
        verbatimFields: [publistPtn],
    }
    let res = chunks.filter(chunk => chunk.entry || chunk.error).map(async chunk => {
        if (chunk.error) {
            throw BibRendererError.fromChunk(path, chunk);
        }
        const text = chunk.text;
        // normal info
        const bib = await bibtex.parse(text, bibOptions);
        if (bib.errors.length !== 0) {
            throw BibRendererError.fromParseErrors(path, bib.errors);
        }
        if (bib.entries.length !== 1) {
            throw new TypeError('Expected chunk to have only one entry');
        }
        const entry = bib.entries[0];
        // get ast
        const ast = await bibtex.ast(text, bibOptions);
        if (ast.length !== 1
            || ast[0].kind !== 'Bibliography'
            || ast[0].children.length !== 1
            || ast[0].children[0].kind !== 'Entry'
            ) {
            throw new TypeError('Expected only one entry chunk in the ast');
        }
        const entryAst = ast[0].children[0];

        // reconstruct original text after striping fields starting with publist_
        const fields = entryAst.fields.filter(field => !publistPtn.test(field.name));
        let bibStr = `@${entryAst.type}{${entryAst.id},\n`;
        bibStr += fields.map(field => '    ' + field.source.trim()).join('\n');
        bibStr += '\n}\n';

        // get abstract
        let abstract = '';
        const absField = entryAst.fields.find(field => field.name === 'publist_abstract');
        if (absField) {
            abstract = concatSource(absField.value).replace(/^{/, '').replace(/}$/, '');
            // strip surrounding braces
            abstract = stripIndent(abstract).trim();
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

        return { entry, bibStr, abstract };
    });
    return await allSettled(res);
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
        if (['confkey', 'link', 'badge', 'abstract'].indexOf(name) !== -1) {
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

module.exports.bibRenderer = bibRenderer;
module.exports.register = (ctx, opts) => {
    ctx.extend.renderer.register('bib', 'json', function(data, options) {
        return bibRenderer(ctx, {...opts, ...options}, data);
    });
};
