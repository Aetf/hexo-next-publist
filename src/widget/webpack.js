const { promisify } = require('util');

const _ = require('lodash');
const webpack = require('webpack');
const chalk = require('chalk');

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
    constructor(ctx, initialWebpackConfig, opts) {
        this.ctx = ctx;
        this.running = false;
        this.initialWebpackConfig = initialWebpackConfig;
        this.opts = opts;

        // include everything in widget folder
        // we want to get notified for every file so we can call webpack again
        this.pattern = {
            test: () => true,
            match: () => true,
        };
    }

    _genWebpackConfig = () => {
        const {debug, webpackConfig, webpackConfigPath} = this.opts;

        // try load config from the widget folder first
        let loadedConfig = {};
        try {
            loadedConfig = require(webpackConfigPath);
        } catch (e) {
            if (e.code !== 'MODULE_NOT_FOUND') {
                throw e;
            }
        }
        // if debug
        const debugConfig = _.isUndefined(debug) ? {} : _.merge({
            mode: "development",
        }, debug);

        return _.mergeWith(
            this.initialWebpackConfig,
            debugConfig,
            loadedConfig,
            webpackConfig,
            // concat array instead of recursive merge
            (objVal, srcVal) => {
                if (_.isArray(objVal)) {
                    return objVal.concat(srcVal);
                }
            }
        );
    };

    _compile = async () => {
        const { ctx } = this;

        if (this.running) {
            return;
        }
        this.running = true;

        const config = this._genWebpackConfig();
        ctx.log.debug(`Widget ${chalk.magenta(config.name)}: webpacking`);

        const compiler = webpack(config);
        try {
            const stats = await promisify(compiler.run).apply(compiler);
            const info = stats.toJson();
            if (stats.hasErrors() || stats.hasWarnings()) {
                info.errors.forEach(e => ctx.log.error(e));
                info.warnings.forEach(w => ctx.log.warn(w));
            }
            await promisify(compiler.close).apply(compiler);

            if (!stats.hasErrors()) {
                ctx.log.info(`${info.assets.length} files webpacked for ${config.name} in ${chalk.cyan(info.time, 'ms')}`);
                for (const asset of info.assets) {
                    ctx.log.debug(`Webpacked: ${config.name}::${asset.name} ${asset.size} bytes`);
                }
            }

            return stats;
        } catch (err) {
            ctx.log.error(err.stack || err);
            if (err.details) {
                ctx.log.error(err.details);
            }
            throw err;
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
