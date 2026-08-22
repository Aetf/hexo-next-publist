import pathFn from 'node:path';
import { fileURLToPath } from 'node:url';

import verror from 'verror';

const { VError, WError } = verror;

const __dirname = pathFn.dirname(fileURLToPath(import.meta.url));

export const SELF = pathFn.resolve(__dirname, '..');
export const TEMPLATE_DIR = pathFn.resolve(__dirname, '../templates');
export const WIDGET_DIR = pathFn.resolve(__dirname, '../widget');

/** Site-wide options under `publist:` in the consuming site's _config.yml. */
export interface PublistOptions {
    assets_prefix: string;
    new_months: number;
    strict: boolean;
    embed_css: boolean;
    /** The month span actually read by the New-badge logic; see publist-tag. */
    new_month?: number;
}

export const DEFAULT_OPTIONS: PublistOptions = {
    assets_prefix: '/assets/publist/',
    new_months: 3,
    strict: false,
    embed_css: true,
};

type ErrorCtor = (...args: never[]) => void;

export class PublistStrictAbort extends VError {
    constructor(file: string, cause?: Error, info?: object) {
        super({
            name: 'PublistStrictAbort',
            cause,
            info,
            constructorOpt: PublistStrictAbort as unknown as ErrorCtor,
        }, `'${file}': aborting because there were errors and the strict mode is enabled`);
    }
}

export class PublistWebpackError extends WError {
    constructor(cause?: Error, info?: object) {
        super({
            name: 'PublistWebpackError',
            cause,
            info,
            constructorOpt: PublistWebpackError as unknown as ErrorCtor,
        }, `Aborting because there were errors when webpacking`);
    }
}
