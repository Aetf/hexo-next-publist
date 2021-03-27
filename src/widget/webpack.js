const { promisify } = require('util');
const webpack = require('webpack');
const { pDebounce } = require('./pDebounce.js');

class MemFsPlugin {
    constructor(fs) {
        this.fs = fs;
    }

    apply(compiler) {
        const { fs } = this;
        compiler.hooks.environment.tap(
            'MemFsPlugin',
            () => {
                compiler.outputFileSystem = fs;
            }
        );
    }
}

class WebpackProcessor {
    constructor(ctx, genWebpackConfig) {
        this.ctx = ctx;
        this.running = false;
        this.genWebpackConfig = genWebpackConfig;

        // include everything in widget folder
        // we want to get notified for every file so we can call webpack again
        this.pattern = {
            test: () => true,
            match: () => true,
        };
    }

    _compile = async () => {
        const { ctx, genWebpackConfig } = this;

        if (this.running) {
            return;
        }
        this.running = true;

        const config = genWebpackConfig();
        ctx.log.info('Webpack on widget: %s', config.name);

        const compiler = webpack(config);
        try {
            const stats = await promisify(compiler.run).apply(compiler);
            if (stats.hasErrors() || stats.hasWarnings()) {
                const info = stats.toJson();
                info.errors.forEach(e => ctx.log.error(e));
                info.warnings.forEach(w => ctx.log.warn(w));
            }
            await promisify(compiler.close).apply(compiler);
            return stats;
        } catch (err) {
            ctx.log.error(err.stack || err);
            if (err.details) {
                ctx.log.error(err.details);
            }
        } finally {
            this.running = false;
        }
    }

    // first pDebounce.promise makes sure if webpack is running, the existing Promise is returned
    // second pDebounce actually groups calls waiting for 100ms
    _compileDebounce = pDebounce(pDebounce.promise(this._compile), 100)

    process = async (file) => {
        // The file may be deleted, changed or created.
        // No matter what, we just rerun webpack
        await this._compileDebounce();
    }
}

module.exports.WebpackProcessor = WebpackProcessor;
module.exports.MemFsPlugin = MemFsPlugin;
