'use strict';

const pathFn = require('path');
const fs = require('hexo-fs');
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment');
const bibtexParser = require('@retorquere/bibtex-parser');
const { TEMPLATE_DIR } = require('../consts');

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
        let confs = Object.entries(opts.venues);
        confs = confs.flatMap(([cat, val]) => {
            return Object.entries(val)
                .map(([confKey, confVal]) => [confKey, {...defConf, ...confVal, cat}])
                .map(([confKey, confVal]) => [confKey, {...confVal, date: moment(confVal.date)}]);
        });
        this.conferences = new Map(confs);

        // venues grouped by cat
        this.venues = new Map(Object.entries(_.mapValues(
            opts.venues,
            (confs) => [...new Set(Object.values(confs).map(conf => conf.venue))].sort()
        )));
    }

    _itemFromEntry = async (entry) => {
        const { hexo, conferences } = this;

        // cross reference to conference to get the year
        const confkey = _.get(entry.fields, 'publist_confkey[0]', '');
        const date = conferences.has(confkey) ? conferences.get(confkey).date : moment();

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

        // content is read from the first args
        const bibstring = await fs.readFile(pathFn.join(hexo.source_dir, '_data', args[0]));
        // parse content as bibtex
        const bib = bibtexParser.parse(bibstring, {
            raw: true,
            unnestMode: 'preserve',
        });
        if (bib.errors.length > 0) {
            this.hexo.log.error(bib.errors);
        }
        // construct list of items
        const items = await Promise.all(bib.entries.map(this._itemFromEntry));
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

    register = () => {
        this.hexo.extend.tag.register('publist', this._tag, { ends: true, async: true });
    };
}

module.exports = PublistTag;
