import assert from 'node:assert/strict';
import test from 'node:test';
import { closeEssentialCommercialOutputDefects } from '../../src/lib/reports/essential-commercial-output-closure.ts';

const oldRisk = 'Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected.';
const safeRisk = 'Where data-driven detection is not defined and operated reliably, suspicious patterns and structured schemes may not be consistently surfaced for review or escalation.';

function close(html) {
  return closeEssentialCommercialOutputDefects(html);
}

test('0-2 systemic controls are not labelled simply absent', () => {
  const input = '<p>This assessment records an absence of foundational fraud controls across 8 of 10 assessed domains.</p><th>Recorded absent</th><p>Each step names the exact control recorded as absent.</p>';
  const output = close(input);
  assert.doesNotMatch(output, /records an absence of foundational fraud controls/);
  assert.doesNotMatch(output, /Recorded absent/);
  assert.doesNotMatch(output, /exact control recorded as absent/);
  assert.match(output, /Partially designed or below/);
  assert.match(output, /requiring establishment or strengthening/);
});

test('priority weakness card cannot describe itself as a maturity constraint', () => {
  const priorityCard = '<article class="long-record finding-record"><span class="priority-badge">Priority control weakness</span><div>This is a maturity-limiting control condition. Management should act.</div></article>';
  const maturityCard = '<article class="long-record finding-record"><span class="priority-badge">Maturity constraint</span><div>This is a maturity-limiting control condition. Management should act.</div></article>';
  const output = close(`${priorityCard}${maturityCard}`);
  assert.match(output, /Priority control weakness[\s\S]*This is a priority control weakness under the MK methodology/);
  assert.match(output, /Maturity constraint[\s\S]*This is a maturity-limiting control condition/);
});

test('proof requirement fallback is converted to clean advisory prose', () => {
  const input = '<td>Whether the last two fraud-risk governance packs provides operating evidence that A named senior owner is implemented across the complete in-scope population.</td>';
  const output = close(input);
  assert.doesNotMatch(output, /provides operating evidence that/);
  assert.match(output, /linked control requirements operate consistently across the complete in-scope population/);
});

test('unsupported transaction-volume absolutes cannot reach the PDF', () => {
  const output = close(`<div>${oldRisk}</div>`);
  assert.doesNotMatch(output, /Manual review cannot cover transaction volume/i);
  assert.doesNotMatch(output, /majority of activity is never examined/i);
  assert.match(output, new RegExp(safeRisk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('executive KPI grid is kept together across page breaks', () => {
  const input = '<style>.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; }</style>';
  const output = close(input);
  assert.match(output, /\.metric-grid \{[^}]*break-inside: avoid;[^}]*page-break-inside: avoid;/);
});

test('closure is idempotent', () => {
  const input = `<style>.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; }</style><div>${oldRisk}</div>`;
  const once = close(input);
  const twice = close(once);
  assert.equal(twice, once);
});
