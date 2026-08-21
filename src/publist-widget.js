import pathFn from 'node:path';
import { existsSync } from 'node:fs';

import { WIDGET_DIR, SELF } from './consts.js';
import { Widget } from './widget/index.js';

export class PublistWidget extends Widget {
    constructor(ctx, opts) {
        // hexo's Box derives cache ids as src.substring(base_dir.length), which
        // assumes the box lives under the site's base_dir. Prefer the (possibly
        // symlinked) install path inside the site so that assumption holds;
        // otherwise (e.g. running this repo's own tests, where base_dir is the
        // repo itself) fall back to our real widget dir.
        const installedWidgetDir = pathFn.join(ctx.base_dir, 'node_modules', 'hexo-next-publist', 'widget');
        const widgetDir = existsSync(installedWidgetDir) ? installedWidgetDir : WIDGET_DIR;
        const debug = pathFn.resolve(ctx.base_dir) === SELF;
        const selfNodeModules = pathFn.join(SELF, 'node_modules');

        super(ctx, 'publist', widgetDir, {
            prefixUrl: opts.assets_prefix,
            // additional resolve paths for self's node_modules
            webpackConfig: {
                resolve: {
                    modules: [selfNodeModules]
                },
                resolveLoader: {
                    modules: [selfNodeModules]
                },
            },
            webpackConfigPath: 'webpack.config.js',
            debug: debug ? {
                snapshot: {
                    managedPaths: [selfNodeModules]
                }
            } : undefined,
        });
    }
}
