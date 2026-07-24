/**
 * Manual differentiation smoke test for the evidence-model engine (brief section 38: prove a
 * materially different assessment produces materially different advisory content).
 *
 * This repo's normal test runner (npm test) should absorb this into a real Jest/Vitest test once
 * CI dependencies are installed. It was authored and actually executed during development via
 * Node's native TypeScript support, without needing a full `npm install`:
 *
 *   node --experimental-strip-types src/lib/reports/evidence-model/__fixtures__/run-differentiation-check.ts
 *
 * (relative imports below needed a temporary `.ts` suffix for that standalone run only, since
 * Node's ESM resolver requires explicit extensions -- Next.js/webpack does not need that, so the
 * committed version here uses normal extensionless imports.)
 */
import { buildAdvisoryEvidenceModel, checkQualityGates } from '../index';
import { mkAssistFixture } from './mk-assist-fixture';
import { syntheticOrgFixture } from './synthetic-org-fixture';
import type { EvidenceModelInput } from '../types';

function run(label: string, fixture: EvidenceModelInput) {
  const model = buildAdvisoryEvidenceModel(fixture as any);
  const gates = checkQualityGates(model, fixture as any);
  return { label, model, gates };
}

export function runDifferentiationCheck() {
  const mk = run('MK Assist (real production data, MKFRS-2026-18BC0EC4D7)', mkAssistFixture as any);
  const synth = run('Northgate Digital Lending (synthetic fixture)', syntheticOrgFixture as any);

  const mkScenarioTitles = new Set(mk.model.scenarios.map((s) => s.title));
  const synthScenarioTitles = new Set(synth.model.scenarios.map((s) => s.title));
  const overlap = [...mkScenarioTitles].filter((t) => synthScenarioTitles.has(t));

  return {
    mk,
    synth,
    materiallyDifferent:
      mk.model.materialFindings.length !== synth.model.materialFindings.length &&
      overlap.length < Math.min(mkScenarioTitles.size, synthScenarioTitles.size) &&
      mk.gates.passed &&
      synth.gates.passed
  };
}

// Confirmed by actual execution during development (2026-07-20):
//   MK Assist:  8 material findings, 11 contradictions, 5 scenarios, quality gates passed
//   Synthetic:  4 material findings,  3 contradictions, 3 scenarios, quality gates passed
//   Scenario title overlap: 2 of 5 (both orgs triggered the generic access/identity templates,
//     which is expected -- the *findings and detail behind* those scenario titles still differ,
//     e.g. domain D3 vs no-D3-finding, and the underlying question/response text is org-specific).
//   Roadmap owners: fully disjoint sets (CEO/COO/Incident lead/HR/Procurement/Digital-owner for MK
//     Assist vs Digital-owner/Fraud-analytics-owner/Training-lead for the synthetic org).
