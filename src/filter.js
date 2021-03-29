'use strict'

const _ = require('lodash');
const chalk = require('chalk');

function streamToString (stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  })
}

async function replaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
        const promise = asyncFn(match, ...args);
        promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
}

class SSRFilter {
    constructor(ctx, opts) {
        this.ctx = ctx;
        this.opts = opts;
    }

    _ssr_post = async (path, content) => {
        const { ctx } = this;
        const ptn = /^\s*<!-- begin-(\S+) -->$[\s\S]+?^\s*<!-- end-\1 -->$/gm;
        return await replaceAsync(content, ptn, async (match, p1) => {
            ctx.log.info(`Embeded publist css file: ${chalk.magenta(path)}`);

            const linesPromise = match.split('\n')
                .map(async line => {
                    const found = line.match(/^<link\s+href="([^"]+\.css)"/);
                    if (found == null) {
                        return line;
                    }
                    const css = ctx.route.get(found[1]);
                    if (_.isUndefined(css)) {
                        ctx.log.debug(`Route ${found[1]} not found`);
                        ctx.log.debug('All routes', ctx.route.list());
                        return line;
                    }
                    const style = await streamToString(css);
                    return `<style type="text/css">\n${style}\n</style>`;
                });
            return (await Promise.all(linesPromise)).join('\n');
        });
    }

    after_generate = async () => {
        const { ctx, opts } = this;
        if (!opts.embed_css) {
            return;
        }

        for (const path of ctx.route.list()) {
            if (!/\.html$/.test(path)) {
                continue;
            }
            const post_stream = ctx.route.get(path);
            if (_.isUndefined(post_stream)) {
                continue;
            }
            let content = await streamToString(post_stream);
            content = await this._ssr_post(path, content);
            ctx.route.set(path, {
                modified: true,
                data: content,
            });
        }
    }

    register = () => {
        const { ctx } = this;

        const filters = _.functions(this)
            .filter(name => !name.startsWith('_') && name !== 'register');
        for (const filter of filters) {
            ctx.extend.filter.register(
                filter,
                this[filter],
                100,
            );
        }
    }
}

module.exports.SSRFilter = SSRFilter;
