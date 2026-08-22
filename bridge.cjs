'use strict';

// Second half of the CJS shim (see index.cjs): this file is loaded by the real
// Node `require`, outside hexo's vm sandbox, so dynamic `import()` works here.
// Delete together with index.cjs once hexojs/hexo#5820 lands.
module.exports.register = async function register(hexo) {
    const { default: register } = await import('./dist/index.js');
    await register(hexo);
};
