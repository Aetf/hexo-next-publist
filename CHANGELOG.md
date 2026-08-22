# Changelog

## [3.1.0](https://github.com/Aetf/hexo-next-publist/compare/v3.0.0...v3.1.0) (2026-08-22)


### Features

* mark equal contributors with the publist_coauthor bib field ([027f77b](https://github.com/Aetf/hexo-next-publist/commit/027f77bf12a892ef5d48dc4a79797e5bd806b522)), closes [#13](https://github.com/Aetf/hexo-next-publist/issues/13)
* move tag pipeline to Rust, convert the JS glue to TypeScript ([f42da3c](https://github.com/Aetf/hexo-next-publist/commit/f42da3ce6f76649eaab30f39c62a395986de64c1))
* replace @retorquere/bibtex-parser with in-repo Rust wasm module ([be8c3c1](https://github.com/Aetf/hexo-next-publist/commit/be8c3c1e9e8fa1555cf9bdc345bba132b0e0a563))


### Bug Fixes

* anchor the widget box at the plugin's install path inside the site ([c35faea](https://github.com/Aetf/hexo-next-publist/commit/c35faea6a8b419803030472d8321c66207083566))
* **deps:** update babel monorepo to v7.29.7 ([#209](https://github.com/Aetf/hexo-next-publist/issues/209)) ([4aab536](https://github.com/Aetf/hexo-next-publist/commit/4aab536036786b8c94f378e52e613653f20a6327))
* **deps:** update babel monorepo to v8 ([6fbe979](https://github.com/Aetf/hexo-next-publist/commit/6fbe979b60f678120a7921ae60db25abfa50cfa8))
* **deps:** update dependency @primer/css to v22 ([2dc564b](https://github.com/Aetf/hexo-next-publist/commit/2dc564b0277112574b6bdbbf5850bae3a88743d8))
* **deps:** update dependency @retorquere/bibtex-parser to v7.0.16 ([#210](https://github.com/Aetf/hexo-next-publist/issues/210)) ([8aa3818](https://github.com/Aetf/hexo-next-publist/commit/8aa3818482aeb427f6ef6fc61474aeebd032a49a))
* **deps:** update dependency babel-loader to v10 ([7eeb2a1](https://github.com/Aetf/hexo-next-publist/commit/7eeb2a177c3ac516e036a01c158ceb6c5b04a17b))
* **deps:** update dependency chalk to v6 ([c16c8f9](https://github.com/Aetf/hexo-next-publist/commit/c16c8f98053c4851e1a03ee70d6ef1586884b708))
* **deps:** update dependency css-loader to v7 ([810da1b](https://github.com/Aetf/hexo-next-publist/commit/810da1b85e13444a8f3265ce064b249b8040cc9b))
* **deps:** update dependency cssnano to v8 ([66ebfa4](https://github.com/Aetf/hexo-next-publist/commit/66ebfa47663e723a3a048fcfe7f986e7b8d9035a))
* **deps:** update dependency cssnano-preset-advanced to v8 ([ebc4d81](https://github.com/Aetf/hexo-next-publist/commit/ebc4d816289267cc31acc11e0e4eef0def549885))
* **deps:** update dependency hexo-fs to v5 ([02587ef](https://github.com/Aetf/hexo-next-publist/commit/02587ef5742cc000f897930954cf3acbc3fefd33))
* **deps:** update dependency hexo-renderer-marked to v7 ([0e93dba](https://github.com/Aetf/hexo-next-publist/commit/0e93dba02f652658973aeec58d410d6359178f7d))
* **deps:** update dependency postcss-loader to v8 ([e6e06dd](https://github.com/Aetf/hexo-next-publist/commit/e6e06dd70192985f395d41510da73cb17ee838c6))
* **deps:** update dependency sass-loader to v17 ([b1c4291](https://github.com/Aetf/hexo-next-publist/commit/b1c4291d5ecef82026dc381bf71b7415a31e0029))
* **deps:** update dependency style-loader to v4 ([7940a44](https://github.com/Aetf/hexo-next-publist/commit/7940a44d67cae4670f600da9d8d0fca001c32c05))
* **deps:** update rust crate biblatex to 0.12 ([#233](https://github.com/Aetf/hexo-next-publist/issues/233)) ([7cdab0b](https://github.com/Aetf/hexo-next-publist/commit/7cdab0b013b8e4765b47b4ee1407d2c267c32b82))
* **deps:** update rust crate regress to 0.11 ([#234](https://github.com/Aetf/hexo-next-publist/issues/234)) ([66e706b](https://github.com/Aetf/hexo-next-publist/commit/66e706b9e788c6374995e319bd34d4b99418128d))
* migrate error classes off verror to native Error causes ([5cabfc5](https://github.com/Aetf/hexo-next-publist/commit/5cabfc5cc95b8c0b0422597086f2a88f993ca243))
* migrate useBuiltIns to babel-plugin-polyfill-corejs3 for babel 8 ([4813e0c](https://github.com/Aetf/hexo-next-publist/commit/4813e0c26be624ebe0d30290f0e3559e91aae528))
* vendor Label/Counter styles removed from @primer/css v22 ([c8a8ca6](https://github.com/Aetf/hexo-next-publist/commit/c8a8ca6c33dc3925f144daed82d29801dcf78b21))

## [3.0.0](https://github.com/Aetf/hexo-next-publist/compare/v2.2.4...v3.0.0) (2026-08-21)


### ⚠ BREAKING CHANGES

* the package is now ESM. Loading it as a hexo plugin keeps working unchanged on hexo >= 6 via a bundled CJS entry shim, but require()-ing the package directly from CJS code is no longer supported.

### Features

* convert the package to ESM ([c44ef68](https://github.com/Aetf/hexo-next-publist/commit/c44ef6896fbb841ce49329d2c67960357fdc2615))
* let an entry's biblatex date field override the conference date ([898748b](https://github.com/Aetf/hexo-next-publist/commit/898748b117b86f16ddde0e2ca92cb19e18b9a560))


### Bug Fixes

* restore a working eslint setup ([be11451](https://github.com/Aetf/hexo-next-publist/commit/be114513eccb0e5d71a7723c7a55998f249618e3))


### Continuous Integration

* switch releases from release-it to release-please ([992942e](https://github.com/Aetf/hexo-next-publist/commit/992942ec1ddf3df49f15beea92e25e9520ca97d6))
