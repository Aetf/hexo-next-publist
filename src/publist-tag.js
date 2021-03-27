'use strict';

const pathFn = require('path');

const _ = require('lodash');
const moment = require('moment');
const yaml = require('js-yaml');
const Ajv = require('ajv').default;
const betterAjvErrors = require('@sidvind/better-ajv-errors').default;

const schema_instopts = require('./schema_instopts.json');
const { TEMPLATE_DIR, DEFAULT_INSTOPTS } = require('./consts');

const ajv = new Ajv({ strict: true });
const instOptsValidator = ajv.compile(schema_instopts);

function maybePrependHref(pub_dir, citekey, href) {
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

class PubsResolver {
    constructor(instOpts, now) {
        this.instOpts = instOpts;
        this.now = now || moment()
    }

    processPubs = pubs => {
        const { now, instOpts } = this;

        // resolve fields
        pubs = pubs.map(this._pubResolveConf)
            .map(this._pubResolveDate)
            .map(this._pubResolveHref);
        // sort and filter any unpublished items
        pubs = pubs.sort((a, b) => b.date.diff(a.date))
            .filter(pub => pub.date.isBefore(now));

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
        return pubs
    }

    processFspecs = pubs => {
        const { instOpts } = this;

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

        return fspecs;
    }

    _pubResolveHref = pub => {
        const { pub_dir } = this.instOpts;
        const links = pub.links.map(({ name, href }) => {
            return {
                name,
                href: maybePrependHref(pub_dir, pub.citekey, href)
            };
        });
        return {
            ...pub,
            links,
        };
    }

    _pubResolveConf = pub => {
        const { confs, confs_fuzzy } = this.instOpts;
        // if we can get it directly from confs, use it
        let conf = _.get(confs, pub.confkey);
        if (_.isUndefined(conf)) {
            // try get it from a regex match
            const found = _.find(confs_fuzzy, ({regex}) => regex.test(pub.confkey))
            if (!_.isUndefined(found)) {
                conf = found.conf;
                // resolve fields that may depends on the match
                conf.url = pub.confkey.replace(found.regex, conf.url);
                conf.name = pub.confkey.replace(found.regex, conf.name);
            }
        }
        return {
            ...pub,
            conf
        };
    }

    _pubResolveDate = pub => {
        const { now } = this;

        let date = _.get(pub.conf, 'date', moment.invalid());
        if (!date.isValid()) {
            // try the bib year and month field
            const mon = _.get(pub.bib.fields, 'month[0]', '1');
            const monFmt = parseInt(mon) ? 'MM' : 'MMM';
            const year = _.get(pub.bib.fields, 'year[0]', now.format('YYYY'));
            date = moment.utc(`${year} ${mon}`, `YYYY ${monFmt}`);

            if (!date) {
                date = moment();
            }
        }
        return {
            ...pub,
            date,
            year: date.format('YYYY'),
        };
    }
}

function loadInstanceOpts(content) {
    const loaded = {
        version: 1,
        ...yaml.load(content, {
            schema: yaml.CORE_SCHEMA
        })
    };
    if (loaded.version < 2) {
        // TODO: warning
        return processInstanceOptsV1(loaded);
    }
    if (loaded.version < 3) {
        return processInstanceOptsV2(loaded);
    }
    throw new Error(`Config version newer than supported: ${loaded.version}`);
}

/**
 * The content is expected to be the yaml string representing an object
 * Each key is the category, values are conference name => conference data
 * @param {String} content the yaml string
 */
function processInstanceOptsV1(loaded) {
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
        ...loaded,
    };

    // flatten the list of conferences
    let confs = Object.entries(obj.venues);
    confs = confs.flatMap(([cat, val]) => {
        return Object.entries(val)
            .map(([confKey, confVal]) => [confKey, {...defConf, ...confVal, cat}])
            .map(([confKey, confVal]) => [confKey, {...confVal, date: moment.utc(confVal.date)}]);
    });
    confs = _.fromPairs(confs);

    // ensure pub_dir has no leading / or tailing /
    const pub_dir = obj.pub_dir.replace(/^\//, '').replace(/\/$/, '/');

    const extra_filters = obj.extra_filters.map(fspec => ({
        id: fspec.name.toLowerCase().replace(' ', '-'),
        ...fspec,
    }));

    return {
        version: 1,
        pub_dir,
        confs,
        extra_filters,
        highlight_authors: new Set(obj.highlight_authors),
        confs_fuzzy: []
    };
}

function processInstanceOptsV2(loaded) {
    const instOpts = {...DEFAULT_INSTOPTS, ...loaded};

    if (!instOptsValidator(instOpts)) {
        const output = betterAjvErrors(schema_instopts, instOpts, instOptsValidator.errors);
        console.log(output);
        throw new Error("Invalid inst options");
    }

    // ensure pub_dir has no leading / or tailing /
    const pub_dir = instOpts.pub_dir.replace(/^\//, '').replace(/\/$/, '/');

    // add an id for each fspec
    const extra_filters = instOpts.extra_filters.map(fspec => ({
        id: fspec.name.toLowerCase().replace(' ', '-'),
        ...fspec,
    }));

    // highlight authors should be a unique set
    const highlight_authors = new Set(instOpts.highlight_authors);

    // flatten the list of conferences to confkey => conf details
    const confs = _.chain(instOpts.venues)
        .flatMap((venue, venueId) => {
            return venue.occurances.map(conf => [
                conf.key,
                _.defaults(
                    {venue: venueId, cat: venue.category},
                    _.update(conf, 'date', date => _.isUndefined(date) ? undefined : moment.utc(date)),
                    {url: venue.url}
                ),
            ]);
        })
        .fromPairs()
        .value();
    // also take note of confs need regex matching
    const confs_fuzzy = _.chain(confs)
        .values()
        .filter(conf => !_.isUndefined(conf.matches))
        .map(conf => ({ 
            regex: new RegExp(conf.matches),
            conf
         }))
        .value();

    return {
        version: instOpts.version,
        pub_dir,
        extra_filters,
        highlight_authors,
        confs,
        confs_fuzzy,
    }
}

class PublistTag {
    constructor(hexo, opts) {
        this.hexo = hexo;
        this.opts = opts;
    }

    /**
     * @param {String} dataName 
     * @param {*} context 
     * @returns An array of raw pub entries
     */
    _loadRawPubs = (dataName, context) => {
        const { hexo, opts } = this;
        const hexoData = hexo.locals.get('data');
        if (!_.has(hexoData, dataName)) {
            hexo.log.warn(`Could not find your bibtex file named ${dataName}.bib`);
            return [];
        } else {
            const {errors, items: pubs} = hexoData[dataName];
            for (const err of errors) {
                hexo.log.error(`Error when parsing ${dataName}.bib: ${err.errorString}`);
            }
            if (errors.length != 0) {
                if (opts.strict) {
                    throw new Error(`Abort generating '${context.source}': '${dataName}'.bib contains errors and strict mode is enabled`);
                } else {
                    hexo.log.warn(`There were errors when parsing ${dataName}.bib, publist may be incomplete`);
                }
            }
            return pubs;
        }
    }

    /**
     * @param {Array} args Arguments to the tag. An array of string, they were whitespace splited
     * @param {String} content The content between the opening and ending tag
     * @param {*} context The calling context, contains info about the rendering source
     */
    _tag = ([dataName], content, context) => {
        const { hexo, opts } = this;
        const instOpts = loadInstanceOpts(content);

        const rawPubs = this._loadRawPubs(dataName, context);

        const resolver = new PubsResolver(instOpts);
        const pubs = resolver.processPubs(rawPubs);
        const fspecs = resolver.processFspecs(pubs);

        hexo.log.info(`${context.source}: Created publist with ${pubs.length} bib entries`);
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

exports.loadInstanceOpts = loadInstanceOpts;
exports.PubsResolver = PubsResolver;
exports.register = (ctx, opts) => {
    const tag = new PublistTag(ctx, opts);
    ctx.extend.tag.register(
        'publist',
        function (args, body) { return tag._tag(args, body, this) },
        { ends: true, async: false }
    );
};
