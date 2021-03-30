const pathFn = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const cssnano = require('cssnano');

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
                            presets: [
                                [
                                    '@babel/preset-env',
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

module.exports = config;
