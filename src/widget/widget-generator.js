'use strict';

const { extname, join } = require('path');

const fs = require('hexo-fs');
const browserify = require('browserify');

function mapAsync(array, callbackfn) {
  return Promise.all(array.map(callbackfn));
}

async function filterAsync(array, callbackfn) {
  const filterMap = await mapAsync(array, callbackfn);
  return array.filter((value, index) => filterMap[index]);
}

const process = async (ctx, { prefix }, name) => {
  prefix = prefix || '';

  let files = await ctx.model(name).toArray();
  files = await filterAsync(files, async file => {
    const e = await fs.exists(file.source);
    if (!e) {
      await file.remove();
    }
    return e;
  });

  return await mapAsync(files, async file => {
    const { source } = file;
    let { path } = file;
    const data = {
      modified: file.modified
    };

    // join any prefix
    path = join(prefix, path);

    if (extname(path) === 'js') {
      // browserify js
      data.data = () => browserify({ debug: true })
        .add(source)
        .transform('babelify', {
          presets: [
            [
              '@babel/preset-env',
              {
                targets: {
                  edge: "17",
                  firefox: "60",
                  chrome: "67",
                  safari: "11.1",
                },
                useBuiltIns: "usage",
              }
            ]
          ],
          sourceMapsAbsolute: true
        })
        .bundle();
    } else if (file.renderable && ctx.render.isRenderable(path)) {
      // default handling of other types
      // Replace extension name if the asset is renderable
      const filename = path.substring(0, path.length - extname(path).length);

      path = `${filename}.${ctx.render.getOutput(path)}`;

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
  return async () => {
    const data = await Promise.all(
      names.map(name => process(ctx, opts, name))
    );
    return [].concat(...data);
  }
};
