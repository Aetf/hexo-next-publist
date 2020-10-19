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
            extra_filters: [],
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

        // ensure pub_dir has no leading / or tailing /
        const pub_dir = obj.pub_dir.replace(/^\//, '').replace(/\/$/, '/');

        const extra_filters = obj.extra_filters.map(fspec => ({
            id: fspec.name.toLowerCase().replace(' ', '-'),
            ...fspec,
        }));

        return {
            pub_dir,
            confs,
            extra_filters,
            highlight_authors: new Set(obj.highlight_authors),
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
    _tag = ([dataName], content, context) => {
        const { hexo, opts } = this;
        const instOpts = this._loadInstanceOpts(content);
        const now = moment();

        const hexoData = hexo.locals.get('data');
        let pubs = [];
        if (!_.has(hexoData, dataName)) {
            hexo.log.warn(`Could not find your bibtex file named ${dataName}.bib`);
        } else {
            pubs = hexoData[dataName];
            if (pubs.errors.length != 0) {
                for (const err of pubs.errors) {
                    hexo.log.error(`Error when parsing ${dataName}.bib: ${err.errorString}`);
                }
                if (opts.strict) {
                    throw new Error(`Abort generating '${context.source}': '${dataName}'.bib contains errors and strict mode is enabled`);
                } else {
                    hexo.log.warn(`There were errors when parsing ${dataName}.bib, publist may be incomplete`);
                }
            }
            pubs = pubs.items;
        }

        // sort and filter any unpublished items
        pubs = pubs.map(pub => {
            // first try get by cross referencing conference's date,
            const conf = _.get(instOpts.confs, pub.confkey);
            let date = _.get(conf, 'date', moment.invalid());
            if (!date.isValid()) {
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
                    href: this._maybePrependHref(instOpts.pub_dir, pub.citekey, href)
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

        hexo.log.info(`${context.source}: Generating ${pubs.length} bib entries`);

        // prepare filtering
        // generate an extra object containig every extra attr specified in extra_filters
        for (const item of pubs) {
            item.extra = {};
            for (const fspec of instOpts.extra_filters) {
                let value = _.get(item, fspec.path, []);
                if (!Array.isArray(value)) {
                    // convert everything to array
                    value = [value];
                }
                item.extra[fspec.id] = value;
            }
            item.extra_json_escaped = _.escape(JSON.stringify(item.extra));
        }
        // generate additional metadata used in the search panel
        const fspecs = instOpts.extra_filters.map(fspec => {
            const possibleValues = pubs.flatMap(item => item.extra[fspec.id]);
            let counts = possibleValues.reduce((counts, x) => {
                counts[x] = (counts[x] || 0) + 1;
                return counts;
            }, {});
            const choices = Object.entries(counts)
                .map(([k, v]) => ({ value: k, count: v}))
                .sort((x, y) => x.value.localeCompare(y.value));
            // add !others
            const cntOthers = pubs.filter(item => item.extra[fspec.id].length === 0).length;
            choices.unshift({display: 'Others', value: '!others', count: cntOthers});
            // add !all
            choices.unshift({display: 'All', value: '!all', count: pubs.length});
            // there is only one level for extra filter
            return {
                name: fspec.name,
                id: fspec.name.toLowerCase().replace(' ', '-'),
                path: fspec.path,
                choices: {
                    '': choices,
                },
            };
        });
        // add venue to the list of filters
        // venues grouped by cat
        let venues = _.mapValues(
            _.groupBy(instOpts.confs, conf => conf.cat),
            // from list of conf to unique sorted list of venue
            subconfs => [... new Set(subconfs.map(conf => conf.venue))].sort()
        );
        // count pubs
        venues = _.mapValues(venues, venueNames => venueNames.map(name => {
            const count = pubs.filter(pub => _.get(pub, 'conf.venue', '') === name).length;
            return {
                value: name,
                count: count,
            }
        }));
        // add !all
        venues[''] = [
            {display: 'All', value: '!all', count: pubs.length},
            {
                display: 'Others',
                value: '!others',
                count: pubs.filter(pub => pub.confkey.length === 0).length,
            },
        ];

        fspecs.unshift({
            name: 'Venue',
            id: 'venue',
            choices: venues,
        });

        const locals = this._bindHelpers({
            // directly inject items into the template context
            pubs,
            fspecs,
            instOpts,
            // emulate hexo's own local environment in the rendering
            config: hexo.config,
            theme: Object.assign({}, hexo.config, hexo.theme.config, hexo.config.theme_config),
            layout: 'layout',
            cache: false,
            env: hexo.env,
            page: this,
            view_dir: TEMPLATE_DIR
        });

        return hexo.render.renderSync({
            path: pathFn.join(TEMPLATE_DIR, 'publist.njk'),
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
    ctx.extend.tag.register(
        'publist',
        function (args, body) { return tag._tag(args, body, this) },
        { ends: true, async: false }
    );
};
