'use strict';

const _ = require('lodash');
const moment = require('moment');
const stripIndent = require('strip-indent');
const bibtex = require('@retorquere/bibtex-parser');

module.exports = (ctx, opts) => {
    ctx.extend.renderer.register('bib', 'json', function(data, options) {
        return bibRenderer(ctx, {...opts, ...options}, data);
    });
};

async function bibRenderer(ctx, opts, { text }) {
    // parse content as bibtex
    const entries = await parseBibEntries(ctx, opts, text);
    // construct list of items
    const items = await Promise.all(entries.map(entry => itemFromEntry(ctx, opts, entry)));
    return items;
}

async function parseBibEntries(ctx, opts, input) {
    // chunk into pieces for easier association of raw data and parsed data
    let chunks = await bibtex.chunker(input, { async: true });

    const publistPtn = /^publist_/;
    const bibOptions = {
        async: true,
        verbatimFields: [publistPtn],
    }
    let res = chunks.filter(chunk => chunk.entry).map(async chunk => {
        if (chunk.error) {
            ctx.log.error('Ignoring bibtex chunk due to error: ' + chunk.error);
            return { error: true };
        }
        const text = chunk.text;
        // normal info
        const bib = await bibtex.parse(text, bibOptions);
        if (bib.errors.length !== 0) {
            ctx.log.error('Ignoring bibtex chunk due to error: ' + bib.errors.join(' '));
            return { error: true };
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

        // reconstruct original text after striping fields
        const fields = entryAst.fields.filter(field => !publistPtn.test(field.name));
        let bibStr = `@${entryAst.type}{${entryAst.id},\n`;
        bibStr += fields.map(field => '    ' + field.source.trim()).join('\n');
        bibStr += '\n}\n';

        // get abstract
        let abstract = '';
        const absField = entryAst.fields.find(field => field.name === 'publist_abstract');
        if (absField) {
            const concat_source = (node) => {
                if (Array.isArray(node)) {
                    return node.map(concat_source).join('');
                }

                return node.source || concat_source(node.value);
            }
            abstract = concat_source(absField.value).replace(/^{/, '').replace(/}$/, '');
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

        return { entry, bibStr, abstract, error: false };
    });
    res = await Promise.all(res);
    return res
        .filter(elem => !elem.error)
        .map(elem => _.pick(elem, ['entry', 'bibStr', 'abstract']));
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

    return {
        citekey,
        title,
        authors: entry.creators.author.map(({lastName, firstName}) => `${firstName} ${lastName}`),
        badges: _.get(entry.fields, 'publist_badge', []),
        confkey,
        abstract,
        links,
        bibStr,
        bib: entry,
    };
}
