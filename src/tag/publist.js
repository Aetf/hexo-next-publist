'use strict';

const pathFn = require('path');
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment');
const yaml = require('js-yaml');
const url = require('url');
const bibtexChunker = require('@retorquere/bibtex-parser/chunker');
const bibtexParser = require('@retorquere/bibtex-parser');
const { TEMPLATE_DIR } = require('../consts');

function bindHelpers(locals) {
    const helpers = hexo.extend.helper.list();
    const keys = Object.keys(helpers);
    let key = '';

    for (let i = 0, len = keys.length; i < len; i++) {
        key = keys[i];
        locals[key] = helpers[key].bind(locals);
    }

    return locals;
}

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

class PublistTag {
    constructor(hexo, opts) {
        this.hexo = hexo;
        this._loadConfig(opts);
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
        let confs = Object.entries(opts.venues).flatMap(([cat, val]) => {
            return Object.entries(val)
                .map(([confKey, confVal]) => [confKey, {...defConf, ...confVal, cat}])
                .map(([confKey, confVal]) => [confKey, {...confVal, date: moment(confVal.date)}]);
        });
        this.conferences = new Map(confs);

        // venues grouped by cat
        this.venues = new Map(_.mapValues(
            opts.venues,
            (confs) => [...new Set(Object.values(confs).map(conf => conf.venue))].sort()
        ).entries());
    }

    _itemFromEntry = async (entry) => {
        const { conferences } = this;

        // cross reference to conference to get the year
        const confkey = _.get(entry.fields, 'publist_confkey[0]', '');
        const date = conferences[confkey].date;

        // links are in the format "link_name || link_ref"
        const links = _.get(entry.fields, 'publist_link', []).map(link => {
            let [name, href] = link.split(' || ');
            if (href == null) {
                this.hexo.log.w(`Publication item ${entry.fields['title'][0]} has a link without url: ${name}`);
                href = '';
            }

            if (!/^[a-z][a-z0-9+.-]*:/.test(href)) {
                // append base
                href = '/' + this.pub_dir + '/' + href;
            }

            return { name, href };
        });

        // reconstruct bibtxt source, this is VERY primitive, and does not handle anything special
        // other than:
        // - concating authors with 'and'
        // - protect everything in title
        const fieldsstring = Object.entries(entry.fields)
            .filter(([name, values]) => {
                if (name.startsWith('publist_')) {
                    return false;
                }
                if (values.length < 1) {
                    return false;
                }
                return true
            })
            .map(([name, values]) => {
                let val = values[0];
                if (name === 'author') {
                    val = values.join(' and ');
                } else if (name === 'title') {
                    val = `{${val}}`;
                }
                return `    ${name} = {${values[0]}}`;
            });
        let bibtex = `@${entry.type}{${entry.key},\n`;
        bibtex += fieldsstring.join(',\n')
        bibtex += '\n}\n';

        // render abstruct using simple markdown
        const abstract = await hexo.render.render({
            text: _.get(entry.fields, 'publist_abstract[0]', ''),
            engine: 'markdown'
        });

        return {
            title: _.get(entry.fields, 'title[0]', ''),
            authors: entry.creators.author.map(({lastName, firstName}) => `${firstName} ${lastName}`),
            citekey: entry.key,
            badges: _.get(entry.fields, 'publist_badge', []),
            confkey,
            date,
            year: date.format('YYYY'),
            abstract,
            links,
            bibtex,
        };
    }

    /**
     *
     * @param {*} args Arguments to the tag. An array of string, they are whitespace splited.
     * @param {*} content The content between the open and end tag.
     */
    _tag = async (args, content) => {
        const { hexo, conferences, venues } = this;

        // parse content as bibtex
        const bib = bibtexParser.parse(content, {
            raw: true,
            unnestMode: 'preserve',
        });
        // construct list of items
        const items = await Promise.all(bib.entries.map(this._itemFromEntry));
        // sort them by conference date and filter
        const publications = items
            .sort((a, b) => a.date.diff(b.date))
            .filter(item => item.date.isBefore(moment()));

        const locals = bindHelpers({
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

    register = () => {
        const { hexo } = this
        hexo.extend.tag.register('publist', this._tag, { ends: true, async: true });
    };
}

module.exports = TagPlugin;
