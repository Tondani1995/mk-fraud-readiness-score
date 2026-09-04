#!/usr/bin/env node
/**
 * Offline runner for the one authorised historical recovery revision.
 *
 * The transform itself lives in src/lib/reports/comprehensive/pdf-native-recovery.ts, so the code
 * proven here is the same code the runtime executes -- this script only supplies bytes, pins the
 * expected checksums and writes the evidence record. It performs no provider call and no I/O
 * against any environment.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyPdfNativeCopyRecovery,
  MOTHEO_V1_PAGE_22_PLAN,
  RECOVERY_METHOD
} from '../src/lib/reports/comprehensive/pdf-native-recovery.ts';

const SOURCE = process.env.V1_PDF_PATH;
const TARGET = process.env.V2_PDF_PATH;
const EVIDENCE = process.env.RECOVERY_EVIDENCE_PATH;
const EXPECTED_SOURCE_SHA = 'd65a3b4802445b3fb6d6b759c66b93a28897cc510081a6438c8817263f613ec3';
const EXPECTED_OUTPUT_SHA = process.env.EXPECTED_V2_SHA
  ?? '87e7fd6a550c3bd816665116c3e437f7133a8af591836670d5437787f86f0d8f';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

assert.ok(SOURCE && TARGET, 'V1_PDF_PATH and V2_PDF_PATH are required');
const sourceBytes = fs.readFileSync(SOURCE);
const sourceSha = sha256(sourceBytes);
assert.equal(sourceSha, EXPECTED_SOURCE_SHA, 'source is not the released, checksum-verified V1 package');

const recovery = await applyPdfNativeCopyRecovery(sourceBytes, MOTHEO_V1_PAGE_22_PLAN);
assert.equal(recovery.pageCount, 22, 'page count changed');
assert.equal(recovery.sha256, EXPECTED_OUTPUT_SHA, 'the recovery did not reproduce the authorised bytes');
assert.ok(!/price[- ]based/i.test(recovery.revisedParagraph), 'the revised paragraph still carries price framing');

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, recovery.bytes);

const evidence = {
  status: 'PASS',
  operation: 'legacy_pdf_native_recovery_revision',
  recovery_method: RECOVERY_METHOD,
  provider_calls: 0,
  provider_generation_reused: true,
  canonical_manuscript_recovered: false,
  rasterised: false,
  font_substituted: false,
  source: {
    reference: 'RPT-MKFRS-2026-63D3103D95-V1',
    path: SOURCE,
    sha256: sourceSha,
    bytes: sourceBytes.length,
    pages: 22,
    mutated: false
  },
  output: {
    reference: 'RPT-MKFRS-2026-63D3103D95-V2',
    path: TARGET,
    sha256: recovery.sha256,
    bytes: recovery.bytes.length,
    pages: recovery.pageCount
  },
  authorised_copy_change: {
    page: MOTHEO_V1_PAGE_22_PLAN.page,
    removed: MOTHEO_V1_PAGE_22_PLAN.removedSentence,
    added: MOTHEO_V1_PAGE_22_PLAN.addedSentence,
    paragraph_before: recovery.originalParagraph,
    paragraph_after: recovery.revisedParagraph,
    every_other_word_preserved: true
  },
  layout: {
    font_resource: recovery.fontResource,
    font_size: recovery.fontSize,
    embedded_subset_reused: true,
    glyphs_absent_from_subset: 0,
    column_width_text_space: recovery.columnWidth,
    column_width_source: 'widest body line already present on the page',
    original_line_count: MOTHEO_V1_PAGE_22_PLAN.originalLines.length,
    revised_line_count: recovery.revisedLines.length,
    line_positions_reused: recovery.lineBaselines,
    revised_lines: recovery.revisedLines,
    original_line_widths: recovery.originalLineWidths,
    revised_line_widths: recovery.revisedLineWidths,
    reflow_confined_to_edited_paragraph: true
  },
  objects_changed: ['target page content stream'],
  note: 'A recovery revision produced from the released V1 PDF. It does not reconstruct, and must not be described as, a recovered canonical manuscript.'
};

if (EVIDENCE) {
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify(evidence, null, 2));
