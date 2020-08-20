'use strict';

const Promise = require('bluebird');
const { extname, join } = require('path');
const prequire = require('parent-require');

const fs = prequire('hexo-fs');

const process = (ctx, { prefix }, name) => {
  prefix = prefix || '';

  return Promise.filter(ctx.model(name).toArray(), asset => fs.exists(asset.source).tap(exist => {
    if (!exist) return asset.remove();
  })).map(asset => {
    const { source } = asset;
    let { path } = asset;
    const data = {
      modified: asset.modified
    };

    // join any prefix
    ctx.log.info(`Publist asset prefix is '${prefix}'`);
    path = join(prefix, path);


    if (asset.renderable && ctx.render.isRenderable(path)) {
      // Replace extension name if the asset is renderable
      const filename = path.substring(0, path.length - extname(path).length);

      path = `${filename}.${ctx.render.getOutput(path)}`;
      ctx.log.info(`Publist asset served at: ${path}`)

      data.data = () => ctx.render.render({
        path: source,
        toString: true
      }).catch(err => {
        ctx.log.error({err}, 'Asset render failed: %s', path);
      });
    } else {
      data.data = () => fs.createReadStream(source);
    }

    return { path, data };
  });
};

module.exports = (ctx, opts, ...names) => {
  /**
   * An asset generator for as many models as given by `names`
   */
  return () => {
    return Promise.all(
      names.map(name => process(ctx, opts, name))
    ).then(data => [].concat(...data));
  }
};
