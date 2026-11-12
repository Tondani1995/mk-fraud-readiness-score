// Before and after for MK's second direction of 12 November: the first correction (commit afa6915, kept in
// docs/readiness-review/report-correction/) against this revision (docs/readiness-review/report-revision/), for the
// same four fictional organisations. Measures what MK asked to be compared: substantive conclusions, valid
// dependencies, practical recommendations, management decisions and actionability, plus score presentation and
// ranking language. Reads the saved artefacts only.
//   node scripts/revised-reports/revision-comparison.mjs
import fs from 'node:fs';
import path from 'node:path';

const BEFORE = 'docs/readiness-review/report-correction';
const AFTER = 'docs/readiness-review/report-revision';
const ORGS = ['P3', 'P4', 'P5', 'P6b'];
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const read = (dir, k, f) => fs.readFileSync(path.join(dir, k, f), 'utf8');
const count = (t, re) => (t.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)) ?? []).length;
const pages = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'pdf-pages.json'), 'utf8')); } catch { return {}; } };
const PB = pages(BEFORE), PA = pages(AFTER);

const GENERIC_MEASURE = /this practice applied to every case in scope/i;
const MECHANICAL = /Agree the design with the [^,]+, so that it meets the target standard|Keep the records in E\d+|Review the first full cycle against M\d+/;
const MATERIALITY = /material fraud exposure|matter most|priority exposure|priority order|where to act first|weakest first|exposure materialise/i;
const BAND = /\b(Reactive|Developing|Structured|Strategic)\b/;

const rows = {};
for (const k of ORGS) {
  const b = JSON.parse(read(BEFORE, k, 'model.json')).report;
  const a = JSON.parse(read(AFTER, k, 'model.json')).report;
  const be = read(BEFORE, k, 'corrected-essential.html'), ae = read(AFTER, k, 'corrected-essential.html');
  const bc = read(BEFORE, k, 'corrected-comprehensive.html'), ac = read(AFTER, k, 'corrected-comprehensive.html');
  const both = (fn) => ({ before: fn(b, be, bc), after: fn(a, ae, ac) });
  const essentialCover = (h) => text(h.split('</section>')[0]);
  const page2 = (h) => text(h.split('</section>')[1] ?? '');
  rows[k] = {
    conclusions: {
      coverJudgement: { before: (b.findings && essentialCover(be).match(/(On its own answers[^.]*\.|In \d+[^.]*\.|[A-Z][^.]{20,}scheme[^.]*\.)/)?.[0]) ?? '', after: essentialCover(ae).match(/On its own answers[^.]*\./)?.[0] ?? '' },
      unresolvedInconsistencies: both((r) => (r.summary.byKind.contradiction ?? 0) + (r.summary.byKind.dependency ?? 0)),
      questionsToClarify: both((r) => r.summary.byKind.clarify ?? 0),
      gapScenarios: both((r) => r.summary.byKind.gap),
      bandShownInEssential: both((_r, e) => (text(e).match(BAND)?.[0] ?? 'none')),
      largeScoreOnPage2: both((_r, e) => /class="stats"|Readiness score<br>out of 100/.test(e.split('</section>')[1] ?? '')),
      fourStatementsOnPage2: both((_r, e) => ['Calculated test result', 'Unresolved inconsistencies', 'Provisional management interpretation', 'Approved readiness conclusion'].every((l) => page2(e).toLowerCase().includes(l.toLowerCase())))
    },
    dependencies: {
      necessaryDependencies: both((r) => r.relations.filter((x) => x.type === 'necessary-dependency').length),
      dependenciesFromRouting: both((r) => r.relations.filter((x) => x.basis === 'method-structure').length),
      assumedComplementary: both((r) => r.relations.filter((x) => x.basis === 'default').length),
      notApplicableTreatedAsUntested: both((r) => r.relations.filter((x) => x.type === 'untested-practice' && /not applicable/i.test(x.practiceReported ?? '')).length),
      prerequisiteControls: both((r) => r.controls.filter((c) => c.dependentRefs.length).length),
      prerequisiteStage: both((r) => r.actions.some((x) => x.phase === 3))
    },
    recommendations: {
      controls: both((r) => r.controls.length),
      genericSuccessMeasures: both((r) => r.measures.filter((m) => GENERIC_MEASURE.test(m.measure)).length),
      distinctSuccessMeasures: both((r) => new Set(r.measures.map((m) => m.measure)).size),
      controlsWithNamedRecords: both((r) => r.controls.filter((c) => (c.recordText ?? c.records)).length),
      controlsWithTargetPractice: both((r) => r.controls.filter((c) => (c.target ?? c.standard) && !/in place across everything it should cover/.test(c.target ?? c.standard)).length),
      mechanicalActivityLines: both((r) => r.controls.flatMap((c) => c.activities).filter((x) => MECHANICAL.test(x)).length),
      controlsWithFailureResponse: both((r) => r.controls.filter((c) => c.onFailure).length)
    },
    decisions: {
      decisions: both((r) => r.decisions.map((d) => d.decision)),
      orderDecidedOnExplicitFactors: both((r) => r.decisions.some((d) => /explicit factors/.test(d.decision)))
    },
    actionability: {
      actions: both((r) => r.actions.length),
      actionsRepeatingOneControl: both((r) => r.actions.filter((x) => x.controlRefs.length === 1 && x.phase >= 3).length),
      questionsForManagement: both((r) => r.findings.flatMap((f) => f.questions ?? []).length),
      rankNumbersInEssential: both((_r, e) => count(e, /<td class="rank">/)),
      materialityPhrases: both((_r, e, c) => count(text(e) + text(c), MATERIALITY)),
      essentialPages: { before: PB[`${k}/corrected-essential`] ?? null, after: PA[`${k}/corrected-essential`] ?? null },
      comprehensivePages: { before: PB[`${k}/corrected-comprehensive`] ?? null, after: PA[`${k}/corrected-comprehensive`] ?? null }
    }
  };
}

// Content enrichment examples: the same control in the first correction and in this revision.
const example = (k, id) => {
  const b = JSON.parse(read(BEFORE, k, 'model.json')).report.controls.find((c) => c.id === id);
  const a = JSON.parse(read(AFTER, k, 'model.json')).report.controls.find((c) => c.id === id);
  return { organisation: k, control: a?.key, before: b && { target: b.standard, activities: b.activities, records: b.records, measure: b.successMeasure }, after: a && { target: a.target, owner: a.ownerRole, activities: a.activities, records: a.recordText, measure: a.successMeasure, cycle: a.operatingCycle, onFailure: a.onFailure, pattern: a.archetype, sources: a.contentSources } };
};
const examples = [example('P6b', 'D4-V-15'), example('P3', 'D4-O-01'), example('P3', 'D8-C-03'), example('P6b', 'D2-I-09'), example('P4', 'D5-K-01')].filter((x) => x.after);

fs.writeFileSync(path.join(AFTER, 'revision-comparison.json'), JSON.stringify({ before: 'afa6915 (report-correction)', after: 'this revision (report-revision)', rows, examples }, null, 1) + '\n');
for (const k of ORGS) console.log(k, JSON.stringify({ unresolved: rows[k].conclusions.unresolvedInconsistencies, clarify: rows[k].conclusions.questionsToClarify, nd: rows[k].dependencies.necessaryDependencies, generic: rows[k].recommendations.genericSuccessMeasures, actions: rows[k].actionability.actions, pages: rows[k].actionability.comprehensivePages }));
