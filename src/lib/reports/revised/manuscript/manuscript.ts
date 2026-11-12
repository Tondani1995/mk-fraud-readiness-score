import { analyseMechanicalLanguage } from '../../narrative/mechanical-language';
import type { RevisedFactPack } from './fact-pack';
import type { RevisedStoryPlan } from './story-plan';

/**
 * Manuscript parsing and narrative validation (Reporting Bible v1.1, sections 4, 5, 17, 18 and 21.1; stages 7 to 9).
 *
 * FICTIONAL PROTOTYPE. The manuscript is Markdown written under the writer contract: planned sections in order, a
 * claim heading for each section and unit, every paragraph followed by the references it relies on, every figure
 * inserted from the Fact Pack as a slot, and exhibits placed by name. Validation has a factual layer (unknown
 * references, figures typed by the writer, prohibited claims, internal language) and an editorial layer (missing
 * movements or exhibits, label headings, mechanical cadence, fragments, repeated contrasts). A manuscript that fails
 * a blocking check is not composed.
 */
export const MANUSCRIPT_VALIDATOR_VERSION = 'revised-manuscript-validator-0.1';

export type Block = { type: 'h2' | 'h3' | 'p' | 'exhibit'; text: string; refs: string[]; line: number };
export type ParsedSection = { id: string; heading: string; blocks: Block[]; line: number };
export type ParsedManuscript = { header: string; sections: ParsedSection[] };

export function parseManuscript(md: string): ParsedManuscript {
  const lines = md.replace(/\r/g, '').split('\n');
  const sections: ParsedSection[] = [];
  let header = '';
  let cur: ParsedSection | null = null;
  let para: string[] = [];
  let paraLine = 0;
  const flush = () => {
    if (!para.length || !cur) { para = []; return; }
    cur.blocks.push({ type: 'p', text: para.join(' ').trim(), refs: [], line: paraLine });
    para = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const sec = line.match(/^<!--\s*section:\s*([A-Z0-9-]+)\s*-->$/);
    const refs = line.match(/^<!--\s*refs:\s*(.*?)\s*-->$/);
    if (sec) { flush(); cur = { id: sec[1], heading: '', blocks: [], line: i + 1 }; sections.push(cur); return; }
    if (refs) {
      flush();
      const last = cur?.blocks[cur.blocks.length - 1];
      if (last) last.refs = refs[1].split(',').map((x) => x.trim()).filter(Boolean);
      return;
    }
    if (/^<!--.*-->$/.test(line)) { if (!cur) header += line; return; }
    if (!line) { flush(); return; }
    if (!cur) return;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      if (h[1] === '#') cur.heading = h[2].trim();
      else cur.blocks.push({ type: h[1] === '##' ? 'h2' : 'h3', text: h[2].trim(), refs: [], line: i + 1 });
      return;
    }
    const ex = line.match(/^\[\[exhibit:([a-z0-9:-]+)\]\]$/i);
    if (ex) { flush(); cur.blocks.push({ type: 'exhibit', text: ex[1], refs: [], line: i + 1 }); return; }
    if (!para.length) paraLine = i + 1;
    para.push(line);
  });
  flush();
  return { header, sections };
}

const NUMBER_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** Replace `[[REF]]`, `[[REF|w]]` and `[[REF|W]]` with Fact Pack values. Unknown references are left marked. */
export function fillSlots(text: string, fp: RevisedFactPack): { text: string; unknown: string[] } {
  const unknown: string[] = [];
  const out = text.replace(/\[\[([A-Z0-9-]+)(?:\|([wW]))?\]\]/g, (_m, ref: string, mode?: string) => {
    const f = fp.facts[ref];
    if (!f) { unknown.push(ref); return `⟦${ref}⟧`; }
    if (mode && typeof f.value === 'number' && f.value >= 0 && f.value <= 10) {
      const w = NUMBER_WORDS[f.value];
      return mode === 'W' ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }
    return typeof f.value === 'number' ? f.value.toLocaleString('en-ZA').replace(/ /g, ' ') : String(f.value);
  });
  return { text: out, unknown };
}

export function knownRefs(fp: RevisedFactPack): Set<string> {
  return new Set([
    ...Object.keys(fp.facts), ...fp.position.map((p) => p.ref), ...fp.areas.map((a) => a.ref), ...fp.themes.map((t) => t.ref),
    ...fp.findings.map((f) => f.ref), ...fp.pathways.map((p) => p.ref), ...fp.priorities.map((p) => p.ref), ...fp.blueprints.map((b) => b.ref),
    ...fp.decisions.map((d) => d.ref), ...fp.roadmap.map((s) => s.ref), ...fp.scorecard.map((m) => m.ref), ...fp.operatingModel.map((r) => r.ref),
    ...fp.pending.map((p) => p.ref), ...(fp.legal ?? []).map((l) => l.ref)
  ]);
}

export type Issue = { code: string; layer: 'factual' | 'editorial'; blocking: boolean; section: string; line: number; detail: string };
export type ManuscriptValidation = {
  validator: typeof MANUSCRIPT_VALIDATOR_VERSION; product: string; pass: boolean; issues: Issue[];
  stats: { sections: number; paragraphs: number; words: number; headings: number; exhibits: number; refsPerParagraph: number; slots: number; mechanical: unknown; contrasts: number; shortParagraphs: number; boundaryMentions: number; manuscriptTest: Record<string, boolean> };
};

const ALLOWED_DIGITS = /\b(30|60|90)(?=[\s-](?:day|days)\b)|\b(30|60|90)(?=,\s*60|\s+and\s+90)|\b12(?=[\s-]months?\b)|\bmonths? [47](?: to (?:6|12))?\b|\b(?:4|7) to (?:6|12)\b|\bsection \d+(?= of (?:POPIA|PRECCA|the Protected Disclosures Act)\b)/g;
const PROHIBITED: { code: string; re: RegExp; detail: string }[] = [
  { code: 'BAND', re: /\b(Reactive|Structured|Strategic)\b|(?<![.!?]\s)(?<!^)\bDeveloping\b|\bmaturity band\b(?! or)/g, detail: 'A maturity band is stated.' },
  { code: 'RANKING', re: /\b(most material|material (?:fraud )?exposure|highest[- ]priority|top priority|critical risks?|high[- ]priority|ranked (?:first|highest)|matters? most|most important risks?|the biggest risk|most serious)\b/gi, detail: 'Ranking or materiality language without an approved method.' },
  { code: 'ASSURANCE', re: /\b(MK|we) (?:has |have )?(?:tested|verified|validated|confirmed|examined)\b|\b(independently verified|evidence-based|evidence-linked|has been verified|have been verified|has been validated|have been validated|was tested by|were tested by)\b/gi, detail: 'A claim of testing, verification or validation.' },
  { code: 'EM-DASH', re: /—|\s–\s/g, detail: 'An em dash, or an en dash used as a dash.' },
  { code: 'RAW-ID', re: /\b(D\d+-[A-Z]-\d+|FS-D\d+-\d+|(?:FINDING|PRIORITY|PATHWAY|BLUEPRINT|DECISION|STAGE|MEASURE|POSITION|AREA)-[A-Z0-9-]+|THEME-[A-Z0-9-]+|OBJ-X-\d+)\b/g, detail: 'An internal identifier in customer prose.' },
  { code: 'ENGINE', re: /\b(recorded condition|recorded weakness|hard gate|cap event|the engine|the model (?:identified|selected)|generated interpretation|aggregate maturity|named record|fact pack|story plan|test-injected)\b/gi, detail: 'Engine or internal language.' }
];
const COUNT_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:[a-z-]+\s+){0,2}?(findings|themes|patterns|routes|pathways|responses|decisions|controls|scenarios|questions|areas|gaps|blueprints)\b/gi;
const CONTRAST = /\b(?:is|was|are|were) not [^.;:]{1,80}[;,] (?:it|they|this) (?:is|are|was|were)\b|\bnot [^.;:,]{1,60}, but\b/gi;
const BOUNDARY = /\b(self-reported|self-assessed|own answers|not independently verified)\b/gi;

export function validateManuscript(md: string, fp: RevisedFactPack, plan: RevisedStoryPlan): ManuscriptValidation {
  const parsed = parseManuscript(md);
  const known = knownRefs(fp);
  const issues: Issue[] = [];
  const add = (code: string, layer: Issue['layer'], blocking: boolean, section: string, line: number, detail: string) => issues.push({ code, layer, blocking, section, line, detail });
  let words = 0, paragraphs = 0, refsTotal = 0, slots = 0, headings = 0, exhibits = 0, contrasts = 0, shortParagraphs = 0, boundary = 0;
  const slotsForMech: { slotId: string; prose: string }[] = [];

  // Structure: every planned section, in order.
  const ids = parsed.sections.map((s) => s.id);
  const planned = plan.sections.map((s) => s.id);
  if (ids.join('|') !== planned.join('|')) add('STRUCTURE', 'editorial', true, '', 0, `Sections ${ids.join(', ')} do not match the plan ${planned.join(', ')}.`);
  for (const ps of plan.sections) {
    const s = parsed.sections.find((x) => x.id === ps.id);
    if (!s) continue;
    if (!s.heading) add('HEADING-MISSING', 'editorial', true, s.id, s.line, 'The section has no heading.');
    const ex = s.blocks.filter((b) => b.type === 'exhibit').map((b) => b.text);
    for (const e of ps.exhibits) if (!ex.includes(e)) add('EXHIBIT-MISSING', 'editorial', true, s.id, s.line, `Planned exhibit ${e} is not placed.`);
    for (const u of ps.units ?? []) if (u.exhibit && !ex.includes(u.exhibit)) add('EXHIBIT-MISSING', 'editorial', true, s.id, s.line, `Planned exhibit ${u.exhibit} is not placed.`);
    const h2 = s.blocks.filter((b) => b.type === 'h2');
    if (ps.units && h2.length !== ps.units.length) add('UNITS', 'editorial', true, s.id, s.line, `${h2.length} unit headings for ${ps.units.length} planned units.`);
    for (const e of ex) if (!['contents', 'position', 'profile', 'priorities', 'roadmap-90', 'roadmap-12', 'theme-map', 'operating-model', 'scorecard', 'method-status'].includes(e) && !/^(finding|pathway|blueprint|decision):[A-Z0-9-]+$/.test(e)) add('EXHIBIT-UNKNOWN', 'editorial', true, s.id, s.line, `Unknown exhibit ${e}.`);
  }
  for (const s of parsed.sections) {
    const heads = [s.heading, ...s.blocks.filter((b) => b.type !== 'p' && b.type !== 'exhibit').map((b) => b.text)];
    for (const h of heads) {
      headings++;
      if (/^(Finding|Material finding|Scenario|Pathway|Theme|Blueprint|Priority|Decision|Section)\s*\d*$/i.test(h.replace(/\[\[[^\]]+\]\]/g, '').trim())) add('LABEL-HEADING', 'editorial', true, s.id, s.line, `Heading "${h}" is a label, not a claim.`);
      const { unknown } = fillSlots(h, fp);
      for (const u of unknown) add('SLOT-UNKNOWN', 'factual', true, s.id, s.line, `Unknown slot ${u} in a heading.`);
      const hc = h.replace(/\[\[[^\]]+\]\]/g, '').match(COUNT_WORDS);
      if (hc) add('TYPED-COUNT', 'factual', true, s.id, s.line, `Counts typed in a heading: ${hc.join(', ')}.`);
      for (const p of PROHIBITED) if (new RegExp(p.re.source, p.re.flags).test(fillSlots(h, fp).text)) add(p.code, 'factual', true, s.id, s.line, `${p.detail} Heading: "${h}"`);
    }
    for (const b of s.blocks) {
      if (b.type === 'exhibit') { exhibits++; continue; }
      if (b.type !== 'p') continue;
      paragraphs++;
      const slotCount = (b.text.match(/\[\[[A-Z0-9-]+(?:\|[wW])?\]\]/g) ?? []).length;
      slots += slotCount;
      const { text, unknown } = fillSlots(b.text, fp);
      for (const u of unknown) add('SLOT-UNKNOWN', 'factual', true, s.id, b.line, `Unknown slot ${u}.`);
      const wc = text.split(/\s+/).filter(Boolean).length;
      words += wc;
      slotsForMech.push({ slotId: `${s.id}:${b.line}`, prose: text });
      if (!b.refs.length) add('NO-PROVENANCE', 'factual', true, s.id, b.line, 'The paragraph has no references.');
      refsTotal += b.refs.length;
      for (const r of b.refs) if (!known.has(r)) add('REF-UNKNOWN', 'factual', true, s.id, b.line, `Unknown reference ${r}.`);
      // Figures typed by the writer: every digit must come from a slot or be a permitted planning term.
      // A statute citation ("section 34A of PRECCA") is not a figure when the paragraph cites a legal-context fact that
      // carries exactly that section; any other number is still a typed figure.
      const lawText = b.refs.map((r) => (fp.legal ?? []).find((l) => l.ref === r)?.text ?? '').join(' ');
      const typed = b.text.replace(/\[\[[^\]]+\]\]/g, '').replace(ALLOWED_DIGITS, '')
        .replace(/\bsections?\s+(\d+[A-Z]?)\b/gi, (m, n) => (new RegExp(`\\bsection ${n}\\b`, 'i').test(lawText) ? '' : m));
      const digits = typed.match(/\d[\d\s,.]*/g);
      const counted = typed.match(COUNT_WORDS);
      if (counted) add('TYPED-COUNT', 'factual', true, s.id, b.line, `Counts typed in words instead of inserted from the Fact Pack: ${counted.join(', ')}.`);
      if (digits) add('TYPED-FIGURE', 'factual', true, s.id, b.line, `Figures typed instead of inserted from the Fact Pack: ${digits.map((d) => d.trim()).join(', ')}.`);
      for (const p of PROHIBITED) {
        const m = text.match(new RegExp(p.re.source, p.re.flags));
        if (m) add(p.code, 'factual', true, s.id, b.line, `${p.detail} Found: ${[...new Set(m)].join(', ')}.`);
      }
      const c = text.match(CONTRAST);
      if (c) contrasts += c.length;
      boundary += (text.match(BOUNDARY) ?? []).length;
      if (wc < 14) { shortParagraphs++; add('SHORT-PARAGRAPH', 'editorial', false, s.id, b.line, `A paragraph of ${wc} words.`); }
    }
  }
  // Editorial thresholds.
  const exec = parsed.sections.find((s) => /EXEC$/.test(s.id));
  if (!exec || exec.blocks.filter((b) => b.type === 'p').length < 3) add('EXEC-NARRATIVE', 'editorial', true, exec?.id ?? '', 0, 'The executive section has fewer than three narrative paragraphs.');
  const concl = parsed.sections.find((s) => /CONCLUSION$/.test(s.id));
  if (!concl || concl.blocks.filter((b) => b.type === 'p').length < 2) add('CONCLUSION-NARRATIVE', 'editorial', true, concl?.id ?? '', 0, 'The conclusion has fewer than two narrative paragraphs.');
  const mechanical = analyseMechanicalLanguage(slotsForMech);
  const mech = mechanical as unknown as { reportFindings?: { family: string; count: number; allowance: number }[]; pass?: boolean };
  for (const f of mech.reportFindings ?? []) if (f.count > f.allowance) add('MECHANICAL', 'editorial', true, '', 0, `Mechanical family "${f.family}" used ${f.count} times (allowance ${f.allowance}).`);
  if (contrasts > 4) add('CONTRASTS', 'editorial', true, '', 0, `${contrasts} "not X, but Y" constructions (allowance 4).`);
  if (boundary > 8) add('BOUNDARY-REPEATED', 'editorial', false, '', 0, `${boundary} mentions of the self-assessment basis (allowance 8).`);
  // Manuscript test (Bible 5.1): each question has a section that answers it.
  const has = (re: RegExp) => parsed.sections.some((s) => re.test(s.id) && s.blocks.some((b) => b.type === 'p'));
  const manuscriptTest = {
    'Where does the organisation stand?': has(/EXEC$/), 'What does that position mean?': has(/EXEC$|PROFILE$/), 'What patterns drive the result?': has(/THEMES$/),
    'Which findings matter and why?': has(/FINDINGS$/), 'How could they translate into fraud?': has(/PATHWAYS$/), 'What should management do first?': has(/PRIORITIES$|ROADMAP$|TARGET$|PROGRAMME$/),
    'What should the organisation become?': has(/ROADMAP$|TARGET$|OPMODEL$|PROGRAMME$/), 'What should management take away?': has(/CONCLUSION$/)
  };
  for (const [q, ok] of Object.entries(manuscriptTest)) if (!ok) add('MANUSCRIPT-TEST', 'editorial', true, '', 0, `No section answers "${q}"`);
  return {
    validator: MANUSCRIPT_VALIDATOR_VERSION, product: fp.product, pass: !issues.some((i) => i.blocking), issues,
    stats: { sections: parsed.sections.length, paragraphs, words, headings, exhibits, refsPerParagraph: paragraphs ? Number((refsTotal / paragraphs).toFixed(2)) : 0, slots, mechanical, contrasts, shortParagraphs, boundaryMentions: boundary, manuscriptTest }
  };
}

/** The plain-text manuscript (Bible section 5): headings and prose only, slots filled, references and exhibits removed. */
export function plainManuscript(md: string, fp: RevisedFactPack, plan: RevisedStoryPlan): string {
  const parsed = parseManuscript(md);
  const out: string[] = [];
  for (const s of parsed.sections) {
    const ps = plan.sections.find((x) => x.id === s.id);
    out.push(`# ${fillSlots(s.heading, fp).text}`, '');
    if (ps && ps.title !== s.heading) out.push(`(${ps.title})`, '');
    for (const b of s.blocks) {
      if (b.type === 'exhibit') continue;
      if (b.type === 'h2') out.push(`## ${fillSlots(b.text, fp).text}`, '');
      else if (b.type === 'h3') out.push(`### ${fillSlots(b.text, fp).text}`, '');
      else out.push(fillSlots(b.text, fp).text, '');
    }
  }
  return out.join('\n');
}
