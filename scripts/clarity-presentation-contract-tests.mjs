import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const compiled = buildSync({
  stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { DomainReadinessMap } from './src/components/clarity/DomainReadinessMap';
    import { CompletionMap } from './src/components/clarity/CompletionMap';
    export const domains = (value) => renderToStaticMarkup(React.createElement(DomainReadinessMap, {snapshot:value}));
    export const completion = (value) => renderToStaticMarkup(React.createElement(CompletionMap, {progress:value}));
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['react', 'react-dom/server'], jsx: 'automatic'
}).outputFiles[0].text;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require });
const {domains,completion} = module.exports;
const domain = (id,score,coverage,gaps) => ({domainId:id,domainName:id,rawScore:score,coveragePct:coverage,criticalGapCount:gaps});
const rendered = domains({domains:[domain('Recorded zero',0,82,3),domain('Unscored applicable area',null,0,0),domain('Recorded fractional score',49.75,67,1)]});
assert.match(rendered, /Recorded zero/);
assert.match(rendered, /<strong>0<small>\/100<\/small><\/strong>/);
assert.match(rendered, /Not scored/);
assert.match(rendered, /49\.75<small>\/100/);
assert.match(rendered, /82% coverage · 3 critical-control gaps/);
assert.match(rendered, /67% coverage · 1 critical-control gap<\/p>/);
assert.ok(rendered.indexOf('Recorded zero') < rendered.indexOf('Unscored applicable area'));
assert.ok(rendered.indexOf('Unscored applicable area') < rendered.indexOf('Recorded fractional score'));
assert.equal(domains({domains:[]}), '');
for (const progress of [0,44,100]) {
  const markup = completion(progress);
  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /COMPLETION ONLY/);
  assert.doesNotMatch(markup, /readiness score|critical.control gap|maturity/i);
}
console.log('Clarity presentation contracts passed: persisted zero, null, fractional values, coverage, gap counts and order preserved; completion cannot present readiness findings.');
