import pathFn from 'node:path';
import { fileURLToPath } from 'node:url';

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

export class PublistStrictAbort extends Error {
    constructor(file: string, cause?: Error) {
        super(`'${file}': aborting because there were errors and the strict mode is enabled`, { cause });
        this.name = 'PublistStrictAbort';
        Error.captureStackTrace(this, PublistStrictAbort);
    }
}

export class PublistWebpackError extends Error {
    constructor(cause?: Error) {
        super(`Aborting because there were errors when webpacking`, { cause });
        this.name = 'PublistWebpackError';
        Error.captureStackTrace(this, PublistWebpackError);
    }
}
