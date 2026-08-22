import pathFn from 'node:path';
import crypto from 'node:crypto';

import chalk from 'chalk';
import verror from 'verror';
import type Hexo from 'hexo';

import { process_tag } from '../bib-wasm/pkg/publist_bib_wasm.js';

import { TEMPLATE_DIR, PublistStrictAbort, type PublistOptions } from './consts.js';
import type { BibItem } from './bib-renderer.js';

const { VError } = verror;

/** The rendering context hexo passes to a tag: where the tag appears. */
export interface TagContext {
    source: string;
}

function formatLocation(context: TagContext): string {
    return `${chalk.magenta(context.source)}: publist`;
}

// Necessary for this error to survive from NunJucks error prettify
function tagErrorSafe(err: Error): void {
    Object.assign(err, { lineno: 1, Update: () => err });
}

export class PublistTagError extends Error {
    /**
     * The message should NOT match /Line (\d+), Column \d+/ to survive from hexo's formatNunJucksError
     */
    constructor(message: string, context: TagContext, caller?: (...args: never[]) => unknown) {
        super(`${formatLocation(context)}: ${message}`);
        this.name = 'PublistTagError';
        Error.captureStackTrace(this, caller ?? PublistTagError);
        tagErrorSafe(this);
    }
}

interface WasmDiag {
    level: 'warn' | 'info';
    message: string;
}

interface WasmFatal {
    kind: 'tag' | 'strict';
    message: string;
}

/** A publication entry as handed to the template, JSON all the way down. */
export interface ResolvedPub extends BibItem {
    conf: Record<string, unknown> | null;
    date: string;
    year: string;
    is_new: boolean;
    extra: Record<string, unknown[]>;
    extra_json_escaped: string;
}

export interface TagResult {
    instOpts: Record<string, unknown>;
    pubs: ResolvedPub[];
    fspecs: unknown[];
    logs: WasmDiag[];
    fatal: WasmFatal | null;
}

/**
 * Run the whole tag data pipeline (yaml parsing/validation, conf matching,
 * date resolution, sorting, filter specs) in the wasm module, then surface
 * its diagnostics through hexo's log and error conventions.
 */
export function resolvePublist(
    hexo: Hexo,
    opts: Partial<PublistOptions>,
    instOptsYaml: string | Buffer,
    items: BibItem[],
    context: TagContext,
): TagResult {
    const input = {
        yaml: String(instOptsYaml),
        items,
        strict: opts.strict ?? false,
        newMonth: opts.new_month ?? null,
        nowMs: Date.now(),
    };
    const result = JSON.parse(process_tag(JSON.stringify(input))) as TagResult;

    for (const log of result.logs) {
        hexo.log[log.level](`${formatLocation(context)}: ${log.message}`);
    }
    if (result.fatal != null) {
        if (result.fatal.kind === 'tag') {
            throw new PublistTagError(result.fatal.message, context);
        }
        throw new PublistStrictAbort(
            context.source,
            new VError(`${formatLocation(context)}: ${result.fatal.message}`),
        );
    }
    return result;
}

export class PublistTag {
    constructor(
        private readonly hexo: Hexo,
        private readonly opts: Partial<PublistOptions>,
        private readonly test_id?: string,
    ) {}

    /**
     * @param args Arguments to the tag, whitespace split
     * @param content The content between the opening and ending tag
     * @param context The calling context, contains info about the rendering source
     */
    _tag = ([dataName]: string[], content: string, context: TagContext): string => {
        const { hexo, opts, test_id } = this;

        const hexoData = hexo.locals.get('data') as Record<string, { items: BibItem[] }>;
        const data = dataName == null ? undefined : hexoData[dataName];
        if (data == null) {
            throw new PublistTagError(`Could not find your bibtex file named ${dataName}.bib`, context);
        }
        const rawPubs = data.items;

        try {
            const { instOpts, pubs, fspecs } = resolvePublist(hexo, opts, content, rawPubs, context);

            // create a unique id for this instance
            const publist_id = test_id ?? `publist-${crypto.randomBytes(4).toString('hex')}`;

            hexo.log.info(`${formatLocation(context)}: created with ${pubs.length} bib entries`);
            const locals = this._bindHelpers({
                // directly inject items into the template context
                pubs,
                fspecs,
                instOpts,
                opts,
                publist_id,
                // emulate hexo's own local environment in the rendering
                config: hexo.config,
                theme: Object.assign({}, hexo.config, hexo.theme.config, hexo.config.theme_config),
                layout: 'layout',
                cache: false,
                env: hexo.env,
                page: this,
                view_dir: TEMPLATE_DIR,
            });

            try {
                return hexo.render.renderSync({
                    path: pathFn.join(TEMPLATE_DIR, 'publist.njk'),
                }, locals);
            } catch (err) {
                // wrap our internal nunjucks render error, and do not have [Line xx, Column xx] in the message
                // so hexo don't confuse it with the context of outside document.
                const message = err instanceof Error ? err.message : String(err);
                const e = new PublistTagError(
                    `Publist internal error:\n` + message.replace(/\((.+)\) \[Line (\d+), Column (\d+)\]/, '$1:$2:$3'),
                    context,
                );
                e.cause = err;
                throw e;
            }
        } catch (err) {
            if (err instanceof Error && !(err instanceof PublistTagError)) {
                tagErrorSafe(err);
            }
            throw err;
        }
    };

    _bindHelpers = (locals: Record<string, unknown>): Record<string, unknown> => {
        const helpers = this.hexo.extend.helper.list();
        for (const key of Object.keys(helpers)) {
            locals[key] = helpers[key]!.bind(locals as never);
        }

        return locals;
    };

    register = (): void => {
        const { hexo, _tag } = this;
        hexo.extend.tag.register(
            'publist',
            function (this: TagContext, args: string[], body: string) {
                return _tag(args, body, this);
            },
            { ends: true, async: false },
        );
    };
}
