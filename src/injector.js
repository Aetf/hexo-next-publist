'use strict';

const pathFn = require('path');
const { TEMPLATE_DIR } = require('./consts');

function inject(injects) {
    injects.head.file('publist-headend', pathFn.join(TEMPLATE_DIR, 'headend.njk'), {}, { cache: false });
    injects.bodyEnd.file('publist-bodyend', pathFn.join(TEMPLATE_DIR, 'bodyend.njk'), {}, { cache: false });
}

module.exports = ctx => {
    ctx.extend.filter.register('theme_inject', inject);
};
