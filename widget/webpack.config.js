import pathFn from 'node:path';
import { fileURLToPath } from 'node:url';

import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import cssnano from 'cssnano';
import babelPresetEnvModule from '@babel/preset-env';

// @babel/preset-env is CJS with an interop default export
const babelPresetEnv = babelPresetEnvModule.default ?? babelPresetEnvModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathFn.dirname(__filename);

const SELF = pathFn.resolve(__dirname, '..');

function isSub(parent, path) {
    const relative = pathFn.relative(parent, path);
    return relative && !relative.startsWith('..') && !pathFn.isAbsolute(relative);
}

function isOurCode(ext) {
    const SELF_MODULES = pathFn.join(SELF, 'node_modules');
    return path => {
        // only care about one type of file
        if (!path.endsWith(ext)) {
            return false;
        }
        // if the file is within our own node_modules, exclude
        if (isSub(SELF_MODULES, path)) {
            return false;
        }
        // include our code
        if (isSub(SELF, path)) {
            return true;
        }
        // not everything else
        return false;
    }
}

const config = {
    entry: {
        main: ['./publist.js', './publist.scss'],
    },
    plugins: [new MiniCssExtractPlugin()],
    module: {
        rules: [
            {
                test: isOurCode('.js'),
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            root: __dirname,
                            presets: [
                                [
                                    // load preset-env by require directly
                                    // otherwise babel has problem finding the correct node_modules
                                    // path when this is used as a library
                                    babelPresetEnv,
                                    {
                                        targets: "defaults",
                                        useBuiltIns: "usage",
                                        corejs: "3.9",
                                        shippedProposals: true
                                    }
                                ]
                            ]
                        }
                    }
                ]
            },
            {
                test: /\.scss$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    {
                        loader: "postcss-loader",
                        options: {
                            postcssOptions: {
                                plugins: [
                                    cssnano({ preset: 'default', }),
                                ],
                            },
                        },
                    },
                    'sass-loader'
                ]
            }
        ]
    },
    cache: {
        buildDependencies: {
            // make this file a dependency of the build, used by webpack to invalidate the cache
            config: [__filename],
        },
    },
};

export default config;
