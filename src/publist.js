'use strict';

const pathFn = require('path');

const _ = require('lodash');
const moment = require('moment');
const prequire = require('parent-require');
const stripIndent = require('strip-indent');
const bibtex = require('@retorquere/bibtex-parser');

const fs = prequire('hexo-fs');

const { TEMPLATE_DIR } = require('./consts');

/**
 * Flatten a multidimensional object
 *
 * For example:
 *   flattenObject({ a: 1, b: { c: 2 } })
 * Returns:
 *   { a: 1, c: 2}
 */
function flattenObject(obj) {
    return Object.assign(
        {}, 
        ...function _flatten(o) { 
            return [].concat(...Object.keys(o)
            .map(k => 
                typeof o[k] === 'object' ?
                _flatten(o[k]) : 
                ({[k]: o[k]})
            )
            );
        }(yourObject)
    );
}

const zip = (arr1, arr2) => arr1.map((k, i) => [k, arr2[i]]);

class PublistTag {
    constructor(hexo) {
        this.hexo = hexo;
        this._loadConfig(hexo.config.publist);
    }

    /**
     * Config is in sources/_data/publist.yml
     */
    _loadConfig = (opts) => {
        const defConf = {
            venue: '',
            name: '',
            date: '2018-01-01',
            url: '',
            acceptance: '',
            cat: '',
        };
        this.pub_dir = opts.pub_dir;

        // flatten the list of conferences to pair of [confKey, confVal];
        let confs = Object.entries(opts.venues);
        confs = confs.flatMap(([cat, val]) => {
            return Object.entries(val)
                .map(([confKey, confVal]) => [confKey, {...defConf, ...confVal, cat}])
                .map(([confKey, confVal]) => [confKey, {...confVal, date: moment(confVal.date)}]);
        });
        this.conferences = _.fromPairs(confs);

        // venues grouped by cat
        this.venues = _.fromPairs(Object.entries(_.mapValues(
            opts.venues,
            (confs) => [...new Set(Object.values(confs).map(conf => conf.venue))].sort()
        )));
    }

    _itemFromEntry = async ({ entry, bibStr, abs }) => {
        const { hexo, conferences } = this;

        // publist_confkey: cross reference to conference to get the year
        const confkey = _.get(entry.fields, 'publist_confkey[0]', '');
        const date = _.get(conferences, confkey + '.date', moment());

        // title: entry title
        const title = _.get(entry.fields, 'title[0]', '');

        // publist_link: links are in the format "link_name || link_ref"
        const links = _.get(entry.fields, 'publist_link', []).map(link => {
            let [name, href] = link.split(' || ');
            if (href == null) {
                this.hexo.log.w(`Publication item ${title} has a link without url: ${name}`);
                href = '';
            }

            if (!/^[a-z][a-z0-9+.-]*:/.test(href)) {
                // append base
                href = '/' + this.pub_dir + '/' + href;
            }

            return { name, href };
        });

        // render abstruct using simple markdown
        const abstract = await hexo.render.render(
            { text: abs, engine: 'markdown' },
            { 
                gfm: false,
                breaks: false,
            }
        );

        return {
            citekey: entry.key,
            title,
            authors: entry.creators.author.map(({lastName, firstName}) => `${firstName} ${lastName}`),
            badges: _.get(entry.fields, 'publist_badge', []),
            confkey,
            date,
            year: date.format('YYYY'),
            abstract,
            links,
            bibtex: bibStr,
        };
    }

    _parseBibEntries = async (input) => {
        // chunk into pieces for easier association of raw data and parsed data
        let chunks = await bibtex.chunker(input, { async: true });

        const publistPtn = /^publist_/;
        const opts = {
            async: true,
            verbatimFields: [publistPtn],
        }
        let res = chunks.filter(chunk => chunk.entry).map(async chunk => {
            if (chunk.error) {
                this.hexo.log.error('Ignoring bibtex chunk due to error: ' + chunk.error);
                return { error: true };
            }
            const text = chunk.text;
            // normal info
            const bib = await bibtex.parse(text, opts);
            if (bib.errors.length !== 0) {
                this.hexo.log.error('Ignoring bibtex chunk due to error: ' + bib.errors.join(' '));
                return { error: true };
            }
            if (bib.entries.length !== 1) {
                throw new TypeError('Expected chunk to have only one entry');
            }
            const entry = bib.entries[0];
            // get ast
            const ast = await bibtex.ast(text, opts);
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
            let abs = '';
            const absField = entryAst.fields.find(field => field.name === 'publist_abstract');
            if (absField) {
                const concat_source = (node) => {
                    if (Array.isArray(node)) {
                        return node.map(concat_source).join('');
                    }

                    return node.source || concat_source(node.value);
                }
                abs = concat_source(absField.value).replace(/^{/, '').replace(/}$/, '');
                // strip surrounding braces
                abs = stripIndent(abs).trim();
            }

            return { entry, bibStr, abs, error: false };
        });
        res = await Promise.all(res);
        return res
            .filter(elem => !elem.error)
            .map(elem => _.pick(elem, ['entry', 'bibStr', 'abs']));
    }

    /**
     * @param {*} args Arguments to the tag. An array of string, they are whitespace splited.
     */
    _tag = async (args) => {
        const { hexo, conferences, venues } = this;

        // content is read from the first args
        const bibstring = await fs.readFile(pathFn.join(hexo.source_dir, '_data', args[0]));
        // parse content as bibtex
        const entries = await this._parseBibEntries(bibstring);
        // construct list of items
        const items = await Promise.all(entries.map(this._itemFromEntry));
        // sort them by conference date and filter
        const publications = items
            .sort((a, b) => a.date.diff(b.date))
            .filter(item => item.date.isBefore(moment()));

        const locals = this._bindHelpers({
            args,
            // directly inject items into the template context
            publications,
            conferences,
            venues,
            // emulate hexo's own local environment in the rendering
            config: hexo.config,
            theme: Object.assign({}, hexo.config, hexo.theme.config, hexo.config.theme_config),
            layout: 'layout',
            cache: false,
            env: hexo.env,
            page: this,
            view_dir: TEMPLATE_DIR
        });

        return await hexo.render.render({
            path: pathFn.join(TEMPLATE_DIR, 'publist.njk')
        }, locals);
    }

    _bindHelpers = (locals) => {
        const helpers = this.hexo.extend.helper.list();
        for (let key of Object.keys(helpers)) {
            locals[key] = helpers[key].bind(locals);
        }

        return locals;
    }
}

module.exports = ctx => {
    const tag = new PublistTag(ctx);
    ctx.extend.tag.register('publist', tag._tag, { async: true });
};
