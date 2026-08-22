import chalk from 'chalk';
import type Hexo from 'hexo';

import type { PublistOptions } from './consts.js';

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err: Error) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

async function replaceAsync(
    str: string,
    regex: RegExp,
    asyncFn: (match: string) => Promise<string>,
): Promise<string> {
    const promises: Promise<string>[] = [];
    str.replace(regex, (match) => {
        promises.push(asyncFn(match));
        return match;
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift()!);
}

export class SSRFilter {
    constructor(
        private readonly ctx: Hexo,
        private readonly opts: Partial<PublistOptions>,
    ) {}

    _ssr_post = async (path: string, content: string): Promise<string> => {
        const { ctx } = this;
        const ptn = /^\s*<!-- begin-(\S+) -->$[\s\S]+?^\s*<!-- end-\1 -->$/gm;
        return await replaceAsync(content, ptn, async (match) => {
            const linesPromise = match.split('\n')
                .map(async line => {
                    const found = line.match(/^<link\s+href="([^"]+\.css)"/);
                    if (found?.[1] == null) {
                        return line;
                    }
                    const css = this.ctx.route.get(found[1]);
                    if (css == null) {
                        ctx.log.error(`Route ${found[1]} not found`);
                        ctx.log.debug('All routes', ctx.route.list());
                        return line;
                    }
                    ctx.log.info(`Embeded publist css file: ${chalk.magenta(path)}`);
                    const style = await streamToString(css);
                    return `<style type="text/css">\n${style}\n</style>`;
                });
            return (await Promise.all(linesPromise)).join('\n');
        });
    };

    after_generate = async (): Promise<void> => {
        const { ctx, opts } = this;
        if (!opts.embed_css) {
            return;
        }

        for (const path of ctx.route.list()) {
            if (!/\.html$/.test(path)) {
                continue;
            }
            const post_stream = ctx.route.get(path);
            if (post_stream == null) {
                continue;
            }
            let content = await streamToString(post_stream);
            content = await this._ssr_post(path, content);
            ctx.route.set(path, {
                modified: true,
                data: content,
            });
        }
    };

    register = (): void => {
        this.ctx.extend.filter.register('after_generate', this.after_generate, 100);
    };
}
