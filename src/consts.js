import pathFn from 'node:path';
import { fileURLToPath } from 'node:url';

import verror from 'verror';

const { VError, WError } = verror;

const __dirname = pathFn.dirname(fileURLToPath(import.meta.url));

export const SELF = pathFn.resolve(__dirname, '..');
export const TEMPLATE_DIR = pathFn.resolve(__dirname, '../templates');
export const WIDGET_DIR = pathFn.resolve(__dirname, '../widget');

export const DEFAULT_OPTIONS = {
    assets_prefix: '/assets/publist/',
    new_months: 3,
    strict: false,
    embed_css: true,
};

export const DEFAULT_INSTOPTS = {
    version: 2,
    pub_dir: 'assets',
    show_unpublished: false,
    highlight_authors: [],
    extra_filters: [],
    venues: {},
}

export class PublistStrictAbort extends VError {
    constructor(file, cause, info) {
        super({
            name: 'PublistStrictAbort',
            cause,
            info,
            constructorOpt: PublistStrictAbort,
        }, `'${file}': aborting because there were errors and the strict mode is enabled`);
    }
}

export class PublistWebpackError extends WError {
    constructor(cause, info) {
        super({
            name: 'PublistWebpackError',
            cause,
            info,
            constructorOpt: PublistWebpackError,
        }, `Aborting because there were errors when webpacking`);
    }
}
