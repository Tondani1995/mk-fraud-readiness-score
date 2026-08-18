#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template = fs.readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');
const scoring = fs.readFileSync('src/lib/scoring/scoring-engine.ts', 'utf8');
const maturity = fs.readFileSync('src/lib/scoring/maturity-band.ts', 'utf8');
const launch = fs.readFileSync('docs/v2/phase14-commercial-launch/essential-organisation-profile-launch-requirement.md', 'utf8');

// Score basis comes from the authoritative scoring contract, not a local invented scale.
assert.match(template, /MATURITY_BAND_THRESHOLDS/);
for (const expected of ["Reactive', min: 0, max: 40", "Developing', min: 40, max: 60", "Structured', min: 60, max: 80", "Strategic', min: 80"]) assert.ok(maturity.includes(expected), `missing maturity threshold: ${expected}`);
for (const rule of ['any_hard_gate_critical_control_lte_1', 'any_hard_gate_critical_control_eq_2', 'three_or_more_critical_controls_lte_2', 'any_core_domain_below_40', 'any_core_domain_below_60']) assert.match(scoring, new RegExp(rule));
assert.match(template, /Where several ceilings apply, the strictest ceiling governs the final maturity/);
assert.match(template, /A control recorded as not applicable is excluded from its scoring denominator/);
assert.match(template, /The next numerical band begins at/);

// Customer copy and semantic taxonomy.
assert.doesNotMatch(template, /Critical control condition/);
assert.doesNotMatch(template, /Priority control condition/);
assert.doesNotMatch(template, /Recorded control condition/);
assert.doesNotMatch(template, /connected diagnosis/);
assert.match(template, /Critical control gap/);
assert.match(template, /Major control gap/);
assert.match(template, /customerFindingWhyItMatters/);
assert.match(template, /Control owner/);
assert.match(template, /Role distinction:/);
assert.match(template, /defined accountable executive role/);
assert.doesNotMatch(template, /named accountable executive and a fixed target period/);
assert.doesNotMatch(template, /Source: persisted assessment record, evidence model/);
assert.match(template, /Control design standard/);

// Risk content is not duplicated, and the ordering semantics are explicit.
assert.doesNotMatch(template, /labelled\('Cause', risk\.cause\)/);
assert.doesNotMatch(template, /labelled\('Risk event', risk\.riskEvent\)/);
assert.match(template, /customerRiskTitle/);
assert.match(template, /Risks sharing the same priority class are not more finely ranked by their display order/);

// Governance cap has an explicit management cross-reference.
assert.match(template, /Fraud Leadership and Governance/);
assert.ok(template.includes('Management response:</strong> see the leadership roadmap section'));
assert.doesNotMatch(template, /see Leadership decisions and roadmap/);

// Supporting register is named precisely and the commercial package contract is explicit.
assert.match(template, /supportingRegisterFileName = `\$\{data\.reportReference\}-supporting-register\.xlsx`/);
assert.match(template, /Essential Supporting Register/);
assert.doesNotMatch(template, /supporting register issued with this report/i);
assert.doesNotMatch(template, /see the closing section of this report/i);

// Pagination/geometry guards for the exact V9 visual failures.
assert.match(template, /splittable-finding-section/);
assert.match(template, /\.cap-card-list \{ break-inside: auto; page-break-inside: auto; \}/);
assert.match(template, /\.manuscript-section > h3 \{ break-after: avoid; page-break-after: avoid; \}/);
assert.match(template, /\.recommended-next-step .*break-inside:avoid; page-break-inside:avoid/);
assert.match(template, /\.score-basis-table th:nth-child\(1\).*width:58%/);
assert.match(template, /\.section-kicker \{[^}]*break-after: avoid; page-break-after: avoid; \}/);
assert.match(template, /\.section-kicker \+ h2 \{ break-before: avoid; page-break-before: avoid; \}/);

// Upstream organisation specificity is a launch requirement; no Mahlori-specific facts are hard-coded.
for (const field of ['sector', 'size band', 'material value-bearing processes', 'systems and channels', 'operating footprint', 'third-party']) assert.match(launch, new RegExp(field, 'i'));
assert.match(launch, /must not infer or invent/i);
assert.match(launch, /report_artifacts/i);
assert.match(launch, /hard launch blocker/i);
assert.doesNotMatch(template, /Mahlori Advisory|Mahlori/);

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', v9SecondOpinionClosure: 'PASS', scoreBasis: 'PASS', pagination: 'PASS', registerContract: 'PASS', profileRequirement: 'PASS' }, null, 2));
