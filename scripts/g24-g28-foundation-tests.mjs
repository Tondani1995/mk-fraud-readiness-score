import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const graph = JSON.parse(readFileSync('docs/adaptive-assessment/adaptive-graph-v1-draft.json', 'utf8'));
const guidance = JSON.parse(readFileSync('docs/adaptive-assessment/g28-evidence-guidance-v1.json', 'utf8'));
const migration = readFileSync('supabase/migrations/20260804170000_g24_adaptive_foundation_g28_evidence_guidance.sql', 'utf8');
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const questionCodes = graph.questions.map((question) => question.questionCode);
const expectedCounts = [6, 8, 7, 7, 7, 6, 7, 8, 6, 6];
const expectedCodes = Array.from({ length: 10 }, (_, domainIndex) => Array.from({ length: expectedCounts[domainIndex] }, (_, questionIndex) => `D${domainIndex + 1}-Q${String(questionIndex + 1).padStart(2, '0')}`)).flat();

assert(graph.graphVersion === 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804', 'wrong graph version');
assert(graph.status === 'draft' && graph.activationPolicy === 'not_customer_active', 'graph is not draft-only');
const { graphFingerprint, ...graphWithoutFingerprint } = graph;
assert(graphFingerprint === sha(canonical(graphWithoutFingerprint)), 'graph fingerprint mismatch');
assert(graph.questions.length === 68 && new Set(questionCodes).size === 68, 'graph does not contain exactly 68 unique questions');
assert(JSON.stringify(questionCodes) === JSON.stringify(expectedCodes), 'question ordering or domain cardinality changed');
assert(graph.gateways.length === 14 && graph.oversightVariants.length === 6 && graph.gatewayBlocks.length === 4, 'graph structure counts changed');
assert(graph.responseScale.length === 6 && graph.responseScale.map((item) => item.normalisedScore).join(',') === '0,20,40,60,80,100', 'response scale changed');
assert(guidance.length === 68 && new Set(guidance.map((item) => item.questionCode)).size === 68, 'G28 guidance is not 68/68');
for (const item of guidance) {
  assert(questionCodes.includes(item.questionCode), `guidance is not bound to graph: ${item.questionCode}`);
  assert(item.exampleArtifacts.length >= 2 && item.exampleArtifacts.length <= 4, `guidance examples outside 2-4: ${item.questionCode}`);
  assert(item.likelyEvidenceOwner && item.goodEvidenceLooksLike.length > 80, `guidance lacks question-specific content: ${item.questionCode}`);
  assert(!/placeholder|prototype|todo/i.test(JSON.stringify(item)), `placeholder guidance: ${item.questionCode}`);
  assert(/^[0-9a-f]{64}$/.test(item.contentFingerprint), `bad guidance fingerprint: ${item.questionCode}`);
}
assert(migration.includes("assessment_mode text not null default 'legacy_fixed'"), 'legacy mode default missing');
assert(migration.includes('customer routing') && migration.includes('service_role'), 'migration boundary evidence missing');
for (const forbidden of ['premium_report', 'payment_transition', 'report_delivery_authorizations', 'email_provider_events']) assert(!migration.includes(forbidden), `commercial path touched: ${forbidden}`);
console.log(`G24/G28 foundation tests passed: ${graph.questions.length}/68 questions, ${guidance.length}/68 guidance entries, fingerprint ${graph.graphFingerprint}`);
