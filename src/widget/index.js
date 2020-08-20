'use strict'
/* global hexo */

const pathFn = require('path');
const prequire = require('parent-require');

const Box = prequire('hexo/lib/box');
const { Asset } = prequire('hexo/lib/models');
const { Pattern } = prequire('hexo-util');

const createModelGenerator = require('./model_gen');

class WidgetProcessor {
    constructor(ctx) {
        this.ctx = ctx;

        // include everything in widget folder
        this.pattern = new Pattern(path => true);
    }

    process = async (file) => {
        const { ctx } = this;
        const id = pathFn.relative(ctx.base_dir, file.source).replace(/\\/g, '/');
        const PublistAsset = ctx.model('PublistAsset');
        const doc = PublistAsset.findById(id);

        if (file.type === 'delete') {
            if (doc) {
                return doc.remove();
            }
            return;
        }

        const res = await PublistAsset.save({
            _id: id,
            path: file.path,
            modified: file.type !== 'skip',
            renderable: ctx.render.isRenderable(file.path),
        });
        return res;
    }
}

class Widget extends Box {
    constructor(ctx) {
        // widget_dir must be from the ctx.base_dir/node_modules
        // which may be a symlink. So we can not directly use WIDGET_DIR
        const widget_dir = pathFn.join(ctx.base_dir, 'node_modules', 'hexo-next-publist', 'widget');
        super(ctx, widget_dir);
        this.processors = [
            new WidgetProcessor(ctx),
        ];
    }
}

module.exports = ctx => {
    // register a new model
    ctx.model('PublistAsset', Asset(ctx));
    // register a new generator for the PublistAsset model
    const modelGenerator = createModelGenerator(
        ctx,
        {
            prefix: ctx.config.publist.assets_prefix,
        },
        'PublistAsset'
    );
    ctx.extend.generator.register('publist-asset', modelGenerator);

    // create the widget box once
    const publist_widget = new Widget(ctx);

    ctx.extend.filter.register('before_generate', async () => {
        // run widget.process, which calls our widget processor and
        // save discovered files to PublistAsset model
        await publist_widget.process();
    });
}
