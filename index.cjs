'use strict';

/* global hexo, require */

// Temporary CJS shim for hexo's plugin loader. Hexo reads this entry file as
// text and executes it inside an async vm wrapper
// (`async function(exports, require, module, __filename, __dirname, hexo)`),
// so ESM syntax cannot appear here, and dynamic `import()` is also unavailable
// in the vm context (hexo does not pass importModuleDynamically, so it throws
// ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING). Instead, hop through bridge.cjs,
// which is loaded by the real `require` and can dynamic-import the ESM
// implementation. The wrapper is async and its return value is awaited, so
// top-level `await` works here.
//
// Both this file and bridge.cjs can be deleted (and `main` pointed back at
// src/index.js) once hexo supports ESM plugin entries natively
// (hexojs/hexo#5820).
await require('./bridge.cjs').register(hexo);
