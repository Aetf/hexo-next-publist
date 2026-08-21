import pathFn from 'node:path';

import { WIDGET_DIR, SELF } from './consts.js';
import { Widget } from './widget/index.js';

export class PublistWidget extends Widget {
    constructor(ctx, opts) {
        // widget_dir must be from the hexo.base_dir/node_modules
        // which may be a symlink. So we can not directly use WIDGET_DIR
        //const widget_dir = pathFn.join(hexo.base_dir, 'node_modules', 'hexo-next-publist', 'widget');
        const debug = pathFn.resolve(ctx.base_dir) === SELF;
        const selfNodeModules = pathFn.join(SELF, 'node_modules');

        super(ctx, 'publist', WIDGET_DIR, {
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
