import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        // vm shim: its top-level await only parses inside hexo's async
        // wrapper, not as a standalone file
        ignores: ['index.cjs'],
    },
    {
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: {
            globals: globals.node,
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
