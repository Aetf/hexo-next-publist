# Changelog

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
