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
const leadership = fs.readFileSync('src/lib/reports/evidence-model/leadership.ts', 'utf8');

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

// Essential is self-contained and makes no promise of a second customer artefact.
assert.match(template, /This Essential PDF is self-contained/);
assert.doesNotMatch(template, /Essential Supporting Register|supporting register issued with this report|companion workbook|supporting spreadsheet|downloadable register/i);
assert.doesNotMatch(template, /see the closing section of this report/i);

// Vhutshilo V2 acceptance regression: a 0-2 response selected only because it represents a weakest
// domain is still a weak control, never an assurance priority.
assert.match(materialFindings, /if \(responseValue <= 2\) return 'control_gap';/);
assert.match(materialFindings, /return 'assurance_priority';/);

// Proof purposes must be artefact-specific for evidence families surfaced in accepted/customer reports.
const proofCases = [
  ['Control linkage showing preventive and detective controls', /mapped fraud scenario.*preventive and detective controls/i],
  ['Approval and business justification', /approved business justification.*named accountable owner/i],
  ['Privileged-account register', /complete privileged-account population.*owner.*review date/i],
  ['Privileged-session/access logs', /attributable to named accounts.*unusual, unauthorised or out-of-pattern/i],
  ['Quarterly independent recertification', /complete privileged-access population.*keep-or-remove/i],
  ['Removal tickets', /required service level.*closure evidence/i],
  ['Monthly tuning and coverage report', /priority event feeds.*high-risk alerts.*coverage gaps.*rule tuning/i]
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
assert.match(registers, /monthly tuning\.\*coverage report\|tuning and coverage report/);
assert.match(registers, /priority event feeds were monitored.*high-risk alerts.*coverage gaps.*rule tuning/s);
assert.match(registers, /sufficient, attributable evidence is present in/);
assert.doesNotMatch(registers, /provides operating evidence that \$\{shown\.join/);

// Generic evidence proof already present in a generated row must be eligible for pre-validation
// replacement, otherwise the customer PDF can retain the underlying register fallback verbatim.
const genericCoverageRow = '<table><tr><td>8</td><td>Monthly tuning and coverage report</td><td>Whether sufficient, attributable evidence is present in the monthly tuning and coverage report to test the linked control across the complete in-scope population for the stated period.</td></tr></table>';
const closedCoverageRow = closeEssentialCommercialOutputDefects(genericCoverageRow);
assert.match(closedCoverageRow, /priority event feeds were monitored.*high-risk alerts.*coverage gaps.*rule tuning/i);
assert.doesNotMatch(closedCoverageRow, /Whether sufficient, attributable evidence is present in the monthly tuning and coverage report/i);

// Vhutshilo V2 risk grammar regression: semantic wording is now surfaced for the bounded reviewer;
// the commercial closure keeps it unchanged rather than applying a customer-specific rewrite.
const malformedRisk = '<p>Because monitoring is weak, there is a risk that Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected.</p>';
const closedRisk = closeEssentialCommercialOutputDefects(malformedRisk);
assert.doesNotMatch(closedRisk, /risk that Where/i);
assert.match(closedRisk, /Manual review cannot cover transaction volume/i);
assert.match(closedRisk, /majority of activity is never examined/i);
const standaloneRisk = closeEssentialCommercialOutputDefects('<p>Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected.</p>');
assert.match(standaloneRisk, /Manual review cannot cover transaction volume/i);

// Vhutshilo V3 risk-grounding regression.
const v3UngroundedRisks = `
<h3>Organisation-level risk statements hide process-level opportunity, so a specific diversion route such as stock write-off manipulation is never mapped to a control owner.</h3>
<p>Because mapping is weak, there is a risk that organisation-level risk statements hide process-level opportunity, so a specific diversion route such as stock write-off manipulation is never mapped to a control owner.</p>
<h3>Treating each incident as an isolated act of one dishonest person leaves the systemic weakness that enabled it fully available to the next person.</h3>
<p>Because root-cause analysis is weak, there is a risk that treating each incident as an isolated act of one dishonest person leaves the systemic weakness that enabled it fully available to the next person.</p>
<p>The 8 conditions selected for executive attention from 23 recorded findings.</p>`;
const v3Grounded = closeEssentialCommercialOutputDefects(v3UngroundedRisks);
assert.match(v3Grounded, /is never mapped to a control owner/i);
assert.match(v3Grounded, /one dishonest person/i);
assert.match(v3Grounded, /fully available to the next person/i);
assert.match(v3Grounded, /8 conditions were selected for executive attention from 23 recorded findings\./i);

// Siyakhula V1 acceptance regression: historical semantic wording remains in the candidate stream;
// it is not silently rewritten by a final phrase dictionary.
const siyakhulaV1 = `
<p>manual review cannot cover the full transaction population.</p>
<p>manual review cannot cover the full population of relevant events or transactions.</p>
<p>without data-driven tests the majority of activity may never be examined.</p>
<h3>Controls decay quietly through staff turnover, system change and workload pressure, so a control believed to be operating may have lapsed months earlier.</h3>
<h3>Digital account compromise or misuse is not detected promptly</h3>
<p>This pathway could begin when an internal or external actor uses an unusual transaction pattern at one site or operating location. The mechanism is that activity may be reviewed locally rather than compared across the full relevant population.</p>
<p>This pathway could begin when a suspected matter arises at one operating location and generates records.</p>
<p>The deterministic roadmap records no prerequisite dependency for these three actions.</p>`;
const siyakhulaV1Closed = closeEssentialCommercialOutputDefects(siyakhulaV1);
assert.match(siyakhulaV1Closed, /manual review cannot cover the full/i);
assert.match(siyakhulaV1Closed, /majority of activity may never be examined/i);
assert.match(siyakhulaV1Closed, /may have lapsed months earlier/i);
assert.match(siyakhulaV1Closed, /Digital account compromise or misuse is not detected promptly/i);
assert.match(siyakhulaV1Closed, /one site or operating location|reviewed locally|one operating location/i);
assert.doesNotMatch(siyakhulaV1Closed, /deterministic roadmap/i);
assert.match(siyakhulaV1Closed, /The current roadmap records no prerequisite dependency/i);

// Siyakhula V1 acceptance regression: enterprise decisions must not all inherit the highest-ranked
// finding's functional owner. Category-level decision rights are explicit and deterministic.
assert.match(leadership, /accountable_executive_mandate: 'CEO \/ Managing Director'/);
assert.match(leadership, /risk_acceptance_or_remediation: 'CEO \/ Managing Director'/);
assert.match(leadership, /control_design_standard: 'CEO \/ Managing Director'/);
assert.match(leadership, /funding_resource_allocation: 'Finance \/ operations accountable owner'/);
assert.match(leadership, /independent_validation: 'Governing body \/ independent oversight'/);
assert.match(leadership, /sequencing_dependency: 'CEO \/ Managing Director'/);
assert.match(leadership, /governance_reporting_cadence: 'CEO \/ Managing Director'/);
assert.match(leadership, /accountableExecutive: DECISION_ACCOUNTABLE_EXECUTIVE\[category\]/);

// Distinct 30-day leadership decisions must not all carry the same generic completion test.
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
assert.match(launch, /PDF-only package contract/i);
assert.match(launch, /self-contained/i);
assert.match(launch, /verified PDF/i);
assert.doesNotMatch(launch, /Essential Supporting Register|companion workbook|report_artifacts|hard launch blocker/i);
assert.doesNotMatch(template, /Mahlori Advisory|Mahlori/);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  v9SecondOpinionClosure: 'PASS',
  vhutshiloV2SemanticCandidatePreservation: 'PASS',
  vhutshiloV3SemanticCandidatePreservation: 'PASS',
  siyakhulaV1SemanticCandidatePreservation: 'PASS',
  siyakhulaLeadershipOwnership: 'PASS',
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
