import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
    js.configs.recommended,
    {
        // vm shim: its top-level await only parses inside hexo's async
        // wrapper, not as a standalone file; bib-wasm/pkg is wasm-pack
        // generated code, dist/ is tsc output, ci/site/public is a hexo
        // build output
        ignores: ['index.cjs', 'bib-wasm/', 'dist/', 'ci/site/public/', 'ci/site/db.json'],
    },
    ...tseslint.configs.recommended.map(conf => ({
        ...conf,
        files: ['src/**/*.ts'],
    })),
    {
        files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        // drives a browser via playwright: node script containing page.evaluate
        // callbacks that run in the browser
        files: ['ci/site/render-check.mjs'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
    },
    {
        // client-side code bundled by webpack
        files: ['widget/*.js'],
        ignores: ['widget/webpack.config.js'],
        languageOptions: {
            globals: globals.browser,
        },
    },
];
