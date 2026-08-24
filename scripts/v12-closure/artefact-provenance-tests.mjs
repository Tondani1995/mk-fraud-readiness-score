#!/usr/bin/env node
/**
 * Artefact build provenance contract.
 *
 * The point of this module is that an artefact can prove which code produced it, so the
 * tests that matter are the ones asserting a missing SHA is visible rather than papered
 * over. Offline; no database, no network, no provider call.
 */
import assert from 'node:assert/strict';
import {
  buildArtefactProvenance, missingCertificationProvenance, resolveSourceGitSha,
  resolveSourceRef, REPORT_SCHEMA_VERSION
} from '../../src/lib/reports/provenance/artefact-provenance.ts';

const base = {
  assessmentId: 'f136b838-340a-4119-91eb-6afa8a6930e6',
  assessmentReference: 'MKFRS-V12-COMP-VHUTSHILO',
  scoreRunId: '3d95ca67-b8d3-4088-ba02-44123064bac0',
  graphVersion: 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821',
  graphFingerprint: '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7',
  inputHash: 'ea3272e54876e6be54b9647343255b1121d94b3a67c33f1f281415b7d91bb80e'
};

const saved = { sha: process.env.VERCEL_GIT_COMMIT_SHA, head: process.env.MK_RELEASE_HEAD_SHA, ref: process.env.VERCEL_GIT_COMMIT_REF, headRef: process.env.MK_RELEASE_HEAD_REF };
const clearEnv = () => { delete process.env.VERCEL_GIT_COMMIT_SHA; delete process.env.MK_RELEASE_HEAD_SHA; delete process.env.VERCEL_GIT_COMMIT_REF; delete process.env.MK_RELEASE_HEAD_REF; };
const restoreEnv = () => { for (const [key, value] of [['VERCEL_GIT_COMMIT_SHA', saved.sha], ['MK_RELEASE_HEAD_SHA', saved.head], ['VERCEL_GIT_COMMIT_REF', saved.ref], ['MK_RELEASE_HEAD_REF', saved.headRef]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };

const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', detail: error.message.split('\n')[0] }); } };

check('an unknown build SHA stays null rather than becoming a placeholder', () => {
  clearEnv();
  assert.equal(resolveSourceGitSha(), null);
  assert.equal(resolveSourceRef(), null);
  restoreEnv();
});

check('the Vercel commit SHA is preferred, with the release head as fallback', () => {
  clearEnv();
  process.env.MK_RELEASE_HEAD_SHA = 'release-head';
  assert.equal(resolveSourceGitSha(), 'release-head');
  process.env.VERCEL_GIT_COMMIT_SHA = 'vercel-sha';
  assert.equal(resolveSourceGitSha(), 'vercel-sha');
  restoreEnv();
});

check('an artefact built without a known SHA fails certification and names the field', () => {
  clearEnv();
  const missing = missingCertificationProvenance(buildArtefactProvenance(base));
  assert.deepEqual(missing, ['sourceGitSha']);
  restoreEnv();
});

check('a fully attributed artefact passes certification', () => {
  clearEnv();
  process.env.VERCEL_GIT_COMMIT_SHA = 'f5d82d34d8109f672c6a4cd95beb41237f9c1771';
  assert.deepEqual(missingCertificationProvenance(buildArtefactProvenance(base)), []);
  restoreEnv();
});

check('a deterministic render is certifiable without narrative provenance', () => {
  clearEnv();
  process.env.VERCEL_GIT_COMMIT_SHA = 'abc123';
  const provenance = buildArtefactProvenance(base);
  assert.equal(provenance.narrativeProvider, null);
  assert.equal(provenance.narrativeModel, null);
  assert.deepEqual(missingCertificationProvenance(provenance), []);
  restoreEnv();
});

check('the schema version is stamped on every record', () => {
  assert.equal(buildArtefactProvenance(base).reportSchemaVersion, REPORT_SCHEMA_VERSION);
});

check('every owner-required field is present on the record', () => {
  const provenance = buildArtefactProvenance({ ...base, pdfChecksumSha256: 'pdf', workbookChecksumSha256: 'xlsx' });
  for (const field of ['assessmentId', 'assessmentReference', 'scoreRunId', 'graphVersion', 'graphFingerprint',
    'inputHash', 'sourceGitSha', 'sourceRef', 'templateId', 'templateVersion', 'reportSchemaVersion',
    'narrativeProvider', 'narrativeModel', 'writerVersion', 'generatedAt', 'pdfChecksumSha256',
    'workbookChecksumSha256', 'commercialAcceptance']) {
    assert.ok(field in provenance, `provenance record is missing ${field}`);
  }
});

check('the commercial acceptance stamp records the minimum, not an average', () => {
  const provenance = buildArtefactProvenance({ ...base, commercialAcceptance: { minimumSubKpi: 9.4, passed: false, evaluatedAt: '2026-08-24T00:00:00.000Z', failing: ['evidence-requirements'] } });
  assert.equal(provenance.commercialAcceptance.passed, false);
  assert.equal(provenance.commercialAcceptance.minimumSubKpi, 9.4);
  assert.deepEqual(provenance.commercialAcceptance.failing, ['evidence-requirements']);
});

const failed = results.filter((entry) => entry.status === 'FAIL');
console.log(JSON.stringify({ suite: 'artefact-provenance', results, status: failed.length ? 'FAIL' : 'PASS' }, null, 2));
process.exit(failed.length ? 1 : 0);
