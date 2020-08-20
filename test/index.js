'use strict';

const test = require('ava');

const path = require('path');
const fs = require('fs');
const bibtex = require('@retorquere/bibtex-parser');
const stripIndent = require('strip-indent');

const BIBSOURCE =
`% publist specific settings starts with publist_, they will not show up in the end result
@inproceedings{yu20mlsys,
    title = {{Salus}: Find-grained {GPU} Sharing primitives for Deep Learning Applications},
    author = {Yu, Peifeng and Chowdhury, Mosharaf and Efd, Eff},
    booktitle = {Proceedings of the 3rd Conference on Machine Learning and Systems},
    year = {2020},

    publist_confkey = {MLSys'20},
    publist_link = {paper || yu20mlsys/yu20mlsys.pdf},
    publist_link = {talk || yu20mlsys/yu20mlsys-talk.pptx},
    publist_link = {poster || yu20mlsys/yu20mlsys-poster.pdf},
    publist_badge = {Artifacts Available},
    publist_badge = {Artifacts Evaluated Functional},
    publist_badge = {Artifacts Replicated},
    publist_abstract = {
        Unlike traditional resources such as CPU or the network, modern GPUs do not natively support
        fine-grained sharing primitives.
        Consequently, implementing common policies such as time sharing and preemption are expensive. Worse,
        when a deep learning (DL) application cannot completely use a GPU's resources, the GPU cannot be efficiently shared
        between multiple applications, leading to GPU underutilization.

        We present Salus to enable two GPU sharing primitives: __fast job
        switching__ and __memory sharing__, to achieve fine-grained GPU sharing
        among multiple DL applications. Salus is an efficient, consolidated
        execution service that exposes the GPU to different DL applications, and it
        enforces fine-grained sharing by performing iteration scheduling and
        addressing associated memory management issues. We show that these primitives
        can then be used to implement flexible sharing policies. Our integration of
        Salus with TensorFlow and evaluation on popular DL jobs shows that Salus
        can improve the average completion time of DL training jobs by 3.19x, GPU utilization for hyper-parameter tuning by 2.38x, and GPU
        utilization of DL inference applications by 42x over not sharing
        the GPU and 7x over NVIDIA MPS with small overhead.
    }
}
`;

const BIBCOPY =
`@inproceedings{yu20mlsys,
    title = {{Salus}: Find-grained {GPU} Sharing primitives for Deep Learning Applications},
    author = {Yu, Peifeng and Chowdhury, Mosharaf and Efd, Eff},
    booktitle = {Proceedings of the 3rd Conference on Machine Learning and Systems},
    year = {2020},
}
`;

const ABSTRACT = 
`Unlike traditional resources such as CPU or the network, modern GPUs do not natively support
fine-grained sharing primitives.
Consequently, implementing common policies such as time sharing and preemption are expensive. Worse,
when a deep learning (DL) application cannot completely use a GPU's resources, the GPU cannot be efficiently shared
between multiple applications, leading to GPU underutilization.

We present Salus to enable two GPU sharing primitives: __fast job
switching__ and __memory sharing__, to achieve fine-grained GPU sharing
among multiple DL applications. Salus is an efficient, consolidated
execution service that exposes the GPU to different DL applications, and it
enforces fine-grained sharing by performing iteration scheduling and
addressing associated memory management issues. We show that these primitives
can then be used to implement flexible sharing policies. Our integration of
Salus with TensorFlow and evaluation on popular DL jobs shows that Salus
can improve the average completion time of DL training jobs by 3.19x, GPU utilization for hyper-parameter tuning by 2.38x, and GPU
utilization of DL inference applications by 42x over not sharing
the GPU and 7x over NVIDIA MPS with small overhead.`;

test('bibtex parsing', t => {
    const opts = {
        verbatimFields: [/^publist_/],
    }
    const chunks = bibtex.chunker(BIBSOURCE, opts);
    t.is(chunks.length, 1);

    const chunk = chunks[0].text;
    // normal info
    const bib = bibtex.parse(chunk, opts).entries[0];
    // get ast to strip fields
    const ast = bibtex.ast(chunk, opts);
    const entryAst = ast[0].children[0];

    const fields = entryAst.fields.filter(field => !field.name.startsWith('publist_'));
    let gen = `@${entryAst.type}{${entryAst.id},\n`;
    gen += fields.map(field => '    ' + field.source.trim()).join('\n');
    gen += '\n}\n';

    t.is(gen, BIBCOPY);

    // get abstract
    const absField = entryAst.fields.filter(field => field.name === 'publist_abstract')[0];

    const concat_source = (node) => {
        if (Array.isArray(node)) {
            return node.map(concat_source).join('');
        }

        return node.source || concat_source(node.value);
    }
    // strip surrounding braces
    let abs = concat_source(absField.value).replace(/^{/, '').replace(/}$/, '');
    abs = stripIndent(abs).trim();

    t.is(abs, ABSTRACT);
});
