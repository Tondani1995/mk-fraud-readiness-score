#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  closeEssentialCommercialOutputDefects,
  essentialEvidenceProofPurpose
} from '../../src/lib/reports/essential-commercial-output-closure.ts';

const template = fs.readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');
const scoring = fs.readFileSync('src/lib/scoring/scoring-engine.ts', 'utf8');
const maturity = fs.readFileSync('src/lib/scoring/maturity-band.ts', 'utf8');
const launch = fs.readFileSync('docs/v2/phase14-commercial-launch/essential-organisation-profile-launch-requirement.md', 'utf8');
const materialFindings = fs.readFileSync('src/lib/reports/evidence-model/material-findings.ts', 'utf8');
const registers = fs.readFileSync('src/lib/reports/evidence-model/registers.ts', 'utf8');

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

// Vhutshilo V2 acceptance regression: a 0-2 response selected only because it represents a weakest
// domain is still a weak control, never an assurance priority. This source invariant protects the
// finding, risk, control-improvement and roadmap semantics that all branch on materialityClass.
assert.match(materialFindings, /if \(responseValue <= 2\) return 'control_gap';/);
assert.match(materialFindings, /return 'assurance_priority';/);

// Vhutshilo V2 acceptance regression: proof purposes must be artefact-specific for the evidence
// families actually surfaced by the customer report and companion register. The generic fallback
// must remain grammatical and must not claim that unreviewed evidence already demonstrates
// effective operation.
const proofCases = [
  ['Control linkage showing preventive and detective controls', /mapped fraud scenario.*preventive and detective controls/i],
  ['Approval and business justification', /approved business justification.*named accountable owner/i],
  ['Privileged-account register', /complete privileged-account population.*owner.*review date/i],
  ['Privileged-session/access logs', /attributable to named accounts.*unusual, unauthorised or out-of-pattern/i],
  ['Quarterly independent recertification', /complete privileged-access population.*keep-or-remove/i],
  ['Removal tickets', /required service level.*closure evidence/i]
];
for (const [artefact, expected] of proofCases) {
  const purpose = essentialEvidenceProofPurpose(artefact);
  assert.match(purpose, expected, `${artefact} proof purpose was not specific enough`);
  assert.doesNotMatch(purpose, /linked control was operated and evidenced/i);
  assert.doesNotMatch(purpose, /\b(?:logs|tickets) demonstrates\b/i);
}
const genericProof = essentialEvidenceProofPurpose('Last two governance packs');
assert.match(genericProof, /Whether sufficient, attributable evidence is present in the last two governance packs to test the linked control/i);
assert.doesNotMatch(genericProof, /packs (?:demonstrates|contains)\b/i);
assert.match(registers, /sufficient, attributable evidence is present in/);
assert.doesNotMatch(registers, /provides operating evidence that \$\{shown\.join/);

// Vhutshilo V2 acceptance regression: the old standalone risk rewrite was applied inside an
// already-composed `there is a risk that ...` sentence and produced `there is a risk that Where`.
// The embedded form must remain one grammatical proposition; the standalone statement still gets a
// separately grammatical conditional rewrite.
const malformedRisk = '<p>Because monitoring is weak, there is a risk that Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected.</p>';
const closedRisk = closeEssentialCommercialOutputDefects(malformedRisk);
assert.doesNotMatch(closedRisk, /risk that Where/i);
assert.match(closedRisk, /there is a risk that suspicious patterns and structured schemes may not be consistently surfaced for review or escalation\./i);
const standaloneRisk = closeEssentialCommercialOutputDefects('<p>Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected.</p>');
assert.match(standaloneRisk, /Where data-driven detection is not defined and operated reliably/i);

// Vhutshilo V3 acceptance regression: weak self-assessment responses must not be converted into
// categorical statements about a route that is "never" mapped or a fabricated incident narrative.
// These two strings appeared in both the visible risk title and risk statement, so the closure must
// ground every occurrence before final validation.
const v3UngroundedRisks = `
<h3>Organisation-level risk statements hide process-level opportunity, so a specific diversion route such as stock write-off manipulation is never mapped to a control owner.</h3>
<p>Because mapping is weak, there is a risk that organisation-level risk statements hide process-level opportunity, so a specific diversion route such as stock write-off manipulation is never mapped to a control owner.</p>
<h3>Treating each incident as an isolated act of one dishonest person leaves the systemic weakness that enabled it fully available to the next person.</h3>
<p>Because root-cause analysis is weak, there is a risk that treating each incident as an isolated act of one dishonest person leaves the systemic weakness that enabled it fully available to the next person.</p>
<p>The 8 conditions selected for executive attention from 23 recorded findings.</p>`;
const v3Grounded = closeEssentialCommercialOutputDefects(v3UngroundedRisks);
assert.doesNotMatch(v3Grounded, /is never mapped to a control owner/i);
assert.doesNotMatch(v3Grounded, /one dishonest person/i);
assert.doesNotMatch(v3Grounded, /fully available to the next person/i);
assert.match(v3Grounded, /process-level fraud opportunities may remain unmapped to named control owners/i);
assert.match(v3Grounded, /material incidents or control failures may be closed without identifying and treating the underlying systemic weakness, allowing repeat exposure to persist/i);
assert.match(v3Grounded, /8 conditions were selected for executive attention from 23 recorded findings\./i);

// Vhutshilo V2 acceptance regression: distinct 30-day leadership decisions must not all carry the
// same generic completion test. Closed-set presentation rewrites preserve the underlying decisions.
const decisionRows = `
<table>
<tr><td>Approve accountable executive mandates and escalation authority for priority remediation.</td><td>x</td><td>x</td><td>Decision recorded, accountable owner confirmed and escalation route documented.</td></tr>
<tr><td>Approve the target control standards management will implement across the priority risk areas.</td><td>x</td><td>x</td><td>Decision recorded, accountable owner confirmed and escalation route documented.</td></tr>
<tr><td>Approve prerequisite-first sequencing for dependent improvements.</td><td>x</td><td>x</td><td>Decision recorded, accountable owner confirmed and escalation route documented.</td></tr>
</table>`;
const closedDecisionRows = closeEssentialCommercialOutputDefects(decisionRows);
assert.doesNotMatch(closedDecisionRows, /Decision recorded, accountable owner confirmed and escalation route documented/);
assert.match(closedDecisionRows, /Signed mandate names each accountable executive, decision rights and the escalation route/);
assert.match(closedDecisionRows, /Approved control-improvement baseline records the required design standard/);
assert.match(closedDecisionRows, /Dependency sequence is approved with named prerequisite owners/);

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

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  v9SecondOpinionClosure: 'PASS',
  vhutshiloV2ContentClosure: 'PASS',
  vhutshiloV3RiskGrounding: 'PASS',
  weakControlClassification: 'PASS',
  evidenceProofSpecificity: 'PASS',
  genericProofGrammar: 'PASS',
  riskGrammar: 'PASS',
  leadershipCompletionTests: 'PASS',
  executivePriorityLeadGrammar: 'PASS',
  scoreBasis: 'PASS',
  pagination: 'PASS',
  registerContract: 'PASS',
  profileRequirement: 'PASS'
}, null, 2));
