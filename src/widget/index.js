'use strict'

const pathFn = require('path');
const prequire = require('parent-require');
const { Pattern } = require('hexo-util');

const Box = prequire('hexo/lib/box');
const { Asset } = prequire('hexo/lib/models');

const createWidgetGenerator = require('./widget-generator');

class WidgetProcessor {
    constructor(ctx, name) {
        this.ctx = ctx;
        this.name = name;

        // include everything in widget folder
        this.pattern = new Pattern(path => true);
    }

    process = async (file) => {
        const { ctx, name } = this;
        const id = pathFn.relative(ctx.base_dir, file.source).replace(/\\/g, '/');
        const model = ctx.model(name);
        const doc = model.findById(id);

        if (file.type === 'delete') {
            if (doc) {
                return doc.remove();
            }
            return;
        }

        const res = await model.save({
            _id: id,
            path: file.path,
            modified: file.type !== 'skip',
            renderable: ctx.render.isRenderable(file.path),
        });
        return res;
    }
}

class Widget extends Box {
    constructor(ctx, base, name) {
        super(ctx, base);
        this.processors = [
            new WidgetProcessor(ctx, name),
        ];
    }
}

/**
 * A widget box
 * @param {*} ctx The hexo instance
 * @param {string} name Unique name of the box
 * @param {string} base Base path of the box
 * @param {*} options Must contains a baseUrl key, which will be the baseUrl to serve files
 */
module.exports = (ctx, name, base, { baseUrl }) => {
    // register a new model
    ctx.model(name, Asset(ctx));
    // register a new generator for the model
    ctx.extend.generator.register(`${name}-widget`, createWidgetGenerator(
        ctx,
        { prefix: baseUrl },
        name,
    ));

    // create the widget box once
    const widget = new Widget(ctx, base, name);

    ctx.extend.filter.register('before_generate', async () => {
        // run widget.process, which calls our widget processor and
        // save discovered files to PublistAsset model
        await widget.process();
    });
}
