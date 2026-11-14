// Deterministic writer doubles for the revised generation pipeline. TEST ONLY: never imported by application code.
// The manuscript is assembled from the Fact Pack's own prose (finding mechanisms, pathway structures, blueprint designs,
// decision reasons) in the Story Plan's order, with every figure inserted as a slot and every paragraph carrying its
// references, so the same validator, composer and layout as the live path can run without a paid model call.
// Modes model the provider behaviours the fulfilment path must handle.
const DIGIT = /\d/;
const LEADS = ['The figure that frames this part is #.', 'This part rests on a count of #.', 'The relevant total here is #.', 'Against this, the answers give #.', 'For this part the count stands at #.', 'The number that applies here is #.', 'Here the answers produce #.'];
const BAD = [
  /—|\s–\s/, /\b(D\d+-[A-Z]-\d+|FS-D\d+-\d+|(?:FINDING|PRIORITY|PATHWAY|BLUEPRINT|DECISION|STAGE|MEASURE|POSITION|AREA|THEME)-[A-Z0-9-]+|OBJ-X-\d+)\b/,
  /\b(Reactive|Structured|Strategic|Developing|maturity band)\b/, /\b(most material|highest[- ]priority|top priority|critical risks?|high[- ]priority|matters? most|most important|biggest risk|most serious|material exposure)\b/i,
  /\b(tested|verified|validated|examined|evidence-based|evidence-linked)\b/i, /\b(recorded condition|recorded weakness|hard gate|cap event|the engine|the model|fact pack|story plan)\b/i,
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:[a-z-]+\s+){0,2}?(findings|themes|patterns|routes|pathways|responses|decisions|controls|scenarios|questions|areas|gaps|blueprints)\b/i,
  /\bnot [^.;:,]{1,60}, but\b/i, /\b(?:is|was|are|were) not [^.;:]{1,80}[;,] (?:it|they|this) (?:is|are|was|were)\b/i,
  /\b(self-reported|self-assessed|own answers|not independently verified|workbook|spreadsheet|register)\b/i, /\bmanagement should\b/i, /\[\[|\]\]/
];
const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
function sentences(t) {
  return clean(t).split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 30 && s.length < 320 && /[.!?]$/.test(s) && !DIGIT.test(s) && !BAD.some((re) => re.test(s)));
}
function corpus(fp) {
  const raw = [
    ...fp.findings.flatMap((f) => [f.how, f.why, f.position, f.selectedBecause, ...f.furtherWeaknesses]),
    ...fp.pathways.flatMap((p) => Object.values(p.structure ?? {}).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v) => typeof v === 'string')),
    ...fp.blueprints.flatMap((b) => [b.purpose, b.target, b.objective, ...b.activities, b.onFailure]),
    ...fp.decisions.flatMap((d) => [d.why, d.delay, d.options?.rationale, ...(d.options?.options ?? []).flatMap((o) => [o.description, o.benefit, o.tradeOff])]),
    ...fp.themes.map((t) => t.basis), ...fp.roadmap.map((s) => s.purpose), ...fp.operatingModel.map((r) => r.responsibility), ...fp.priorities.flatMap((p) => [p.why, p.establish])
  ];
  const seen = new Set();
  // Respect the mechanical-language families the validator counts (recorded, management should, approved response).
  return raw.flatMap(sentences).filter((s) => (seen.has(s) ? false : (seen.add(s), true))).filter((s) => !/\brecorded\b|\bapproved response\b|\brecorded response\b/i.test(s));
}
const numericFacts = (fp) => Object.values(fp.facts).filter((f) => typeof f.value === 'number').map((f) => f.ref);
const textFacts = (fp) => Object.values(fp.facts).filter((f) => typeof f.value === 'string' && f.ref.startsWith('T-')).map((f) => f.ref);

function unitTitle(fp, u) {
  const pick = (xs) => xs.find((x) => x.ref === u.ref);
  const t = pick(fp.findings)?.title ?? pick(fp.pathways)?.title ?? pick(fp.blueprints)?.name ?? pick(fp.decisions)?.question ?? pick(fp.themes)?.title ?? pick(fp.roadmap)?.label ?? 'The organisation can act on this area';
  const s = clean(t).replace(/[.?]$/, '');
  return DIGIT.test(s) || BAD.some((re) => re.test(s)) ? 'The organisation can act on this area with a clear owner' : s;
}

export function deterministicManuscript(fp, plan, opts = {}) {
  const pool = corpus(fp);
  const nums = numericFacts(fp);
  const texts = textFacts(fp);
  let k = 0;
  const take = () => pool[(k++) % Math.max(pool.length, 1)] ?? 'The organisation can strengthen this control with a named owner and a regular review.';
  const para = (refs, n = opts.sentences ?? 4) => {
    const slot = refs.find((r) => nums.includes(r)) ?? nums[k % nums.length];
    const body = Array.from({ length: n }, take).join(' ');
    const lead = LEADS[k % LEADS.length].replace('#', `[[${slot}]]`);
    return [`${lead} ${body}`, `<!-- refs: ${[slot, ...refs.filter((r) => r !== slot)].slice(0, 4).join(', ')} -->`, ''];
  };
  const L = [];
  for (const s of plan.sections) {
    const req = s.requiredFacts.filter((r) => fp.facts[r]);
    L.push(`<!-- section: ${s.id} -->`, `# ${clean(s.title).replace(/[.?]$/, '')} sets out where the organisation stands and what follows`, '');
    const nPara = /EXEC$/.test(s.id) ? 4 : /CONCLUSION$/.test(s.id) ? 2 : s.units?.length ? 1 : 2;
    const account = texts.includes('T-SCENARIO-ACCOUNT') ? 'T-SCENARIO-ACCOUNT' : texts[0];
    if (/EXEC$/.test(s.id) && account) L.push(`[[${account}]]`, `<!-- refs: ${account} -->`, '');
    for (let i = 0; i < nPara; i++) L.push(...para(req));
    for (const e of s.exhibits) L.push(`[[exhibit:${e}]]`, '');
    for (const u of s.units ?? []) {
      L.push(`## ${unitTitle(fp, u)}`, '');
      L.push(...para([u.ref, ...req]));
      if (u.exhibit) L.push(`[[exhibit:${u.exhibit}]]`, '');
      L.push(...para([u.ref, ...req], 3));
    }
  }
  return L.join('\n');
}

/**
 * A ManuscriptWriter double. Modes:
 *   valid      a deterministic manuscript (passes the validator when the corpus allows)
 *   reject     a manuscript with a typed figure in every paragraph (blocking, repairable)
 *   fail       the provider throws
 *   slow       resolves after `delayMs`, for timeout and duplicate-dispatch tests
 *   sequence   one mode per call, e.g. ['reject', 'valid']
 */
export function writerDouble({ fp, plan, mode = 'valid', delayMs = 0, sequence = null, onCall = null } = {}) {
  const calls = [];
  const writer = async (input) => {
    const m = sequence ? sequence[Math.min(calls.length, sequence.length - 1)] : mode;
    calls.push({ model: input.model, mode: m, at: Date.now() });
    onCall?.(calls.length);
    if (delayMs || m === 'slow') await new Promise((r) => setTimeout(r, delayMs || 1000));
    if (m === 'fail') throw new Error('writer_double_provider_failed');
    const base = deterministicManuscript(fp(), plan());
    // A line-repair request answers in the JSON line format the pipeline asks for, with the clean line at that position.
    if (/## Lines to correct/.test(input.prompt) && m !== 'reject') {
      const rows = base.split('\n');
      const lines = [...input.prompt.matchAll(/### LINE (\d+)/g)].map((x) => Number(x[1]));
      return { text: JSON.stringify(lines.map((n) => ({ line: n, text: rows[n - 1] ?? '' }))), provider: 'writer-double', model: `double:${m}`, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 };
    }
    const text = m === 'reject' ? base.replace(/^([^<#\n][^\n]*?\[\[[A-Z0-9-]+\]\][^\n]*?\.)/gm, '$1 It covers 17 cases.') : base;
    return { text, provider: 'writer-double', model: `double:${m}`, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 };
  };
  return { writer, calls };
}
