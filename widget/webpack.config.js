const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const cssnano = require('cssnano');

const config = {
    entry: {
        main: ['./publist.js', './publist.scss'],
    },
    plugins: [new MiniCssExtractPlugin()],
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
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
