'use strict';

const pathFn = require('path');

const _ = require('lodash');
const moment = require('moment');
const yaml = require('js-yaml');

const { TEMPLATE_DIR } = require('./consts');

class PublistTag {
    constructor(hexo, opts) {
        this.hexo = hexo;
        this.opts = opts;
    }

    /**
     * The content is expected to be the yaml string representing an object
     * Each key is the category, values are conference name => conference data
     * @param {string} content the yaml string
     */
    _loadInstanceOpts(content) {
        const defConf = {
            venue: '',
            name: '',
            date: '',
            url: '',
            acceptance: '',
            cat: '',
        };

        const obj = {
            pub_dir: '',
            venues: {},
            highlight_authors: [],
            ...yaml.safeLoad(content),
        };

        // flatten the list of conferences
        let confs = Object.entries(obj.venues);
        confs = confs.flatMap(([cat, val]) => {
            return Object.entries(val)
                .map(([confKey, confVal]) => [confKey, {...defConf, ...confVal, cat}])
                .map(([confKey, confVal]) => [confKey, {...confVal, date: moment(confVal.date)}]);
        });
        confs = _.fromPairs(confs);

        // venues grouped by cat
        let venues = _.groupBy(confs, conf => conf.cat);
        venues = _.mapValues(
            venues,
            // from list of conf to unique sorted list of venue
            subconfs => [... new Set(subconfs.map(conf => conf.venue))].sort()
        );

        // pub_dir
        const pub_dir = obj.pub_dir.replace(/^\//, '');

        return {
            pub_dir,
            confs,
            venues,
            highlight_authors: new Set(obj.highlight_authors)
        };
    }

    _maybePrependHref(pub_dir, citekey, href) {
        if (/^[a-z][a-z0-9+.-]*:/.test(href)) {
            // full href, do nothing
            return href;
        } else if (href.startsWith('/')) {
            // absolute path, do nothing
            return href;
        } else {
            // append base
            if (pub_dir) {
                return `/${pub_dir}/${citekey}/${href}`;
            } else {
                return `/${citekey}/${href}`;
            }
        }
    }

    /**
     * @param {*} args Arguments to the tag. An array of string, they are whitespace splited.
     */
    _tag = async ([dataName], content) => {
        const { hexo } = this;
        const { confs, venues, pub_dir, highlight_authors } = this._loadInstanceOpts(content);
        const now = moment();

        const hexoData = hexo.locals.get('data');
        let pubs = [];
        if (!_.has(hexoData, dataName)) {
            hexo.log.warn(`Could not find your bibtex file named ${dataName}.bib or there were errors when parsing`);
        } else {
            pubs = hexoData[dataName];
            if (!Array.isArray(pubs)) {
                hexo.log.error(`There were errors when parsing ${dataName}.bib, publist will be empty`);
                pubs = [];
            }
        }

        pubs = pubs.map(pub => {
            // first try get by cross referencing conference's date,
            const conf = _.get(confs, pub.confkey);
            let date = _.get(conf, 'date');
            if (!date) {
                // try the bib year and month field
                const mon = _.get(pub.bib.fields, 'month[0]', '1');
                const monFmt = parseInt(mon) ? 'MM' : 'MMM';
                const year = _.get(pub.bib.fields, 'year[0]', now.format('YYYY'));

                date = moment(`${year} ${mon}`, `YYYY ${monFmt}`);
                if (!date) {
                    date = now;
                }
            }
            // also treat the link href.
            const links = pub.links.map(({ name, href }) => {
                return {
                    name,
                    href: this._maybePrependHref(pub_dir, pub.citekey, href)
                };
            });
            return {
                ...pub,
                links,
                conf,
                date,
                year: date.format('YYYY'),
            };
        })
        .sort((a, b) => b.date.diff(a.date))
        .filter(pub => pub.date.isBefore(now));

        const locals = this._bindHelpers({
            // directly inject items into the template context
            pubs,
            venues,
            highlight_authors,
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

module.exports = (ctx, opts) => {
    const tag = new PublistTag(ctx, opts);
    ctx.extend.tag.register('publist', tag._tag, { ends: true, async: true });
};
