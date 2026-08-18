#!/usr/bin/env python3
from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        print(f"already applied: {label}")
        return text
    raise SystemExit(f"missing patch anchor: {label}")


def sub_once(text: str, pattern: str, replacement: str, label: str, flags=0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count == 1:
        return updated
    raise SystemExit(f"missing regex patch anchor: {label}")


path = Path('src/lib/reports/templates/report-template.ts')
text = path.read_text()

text = replace_once(
    text,
    "import { getMaturityBand } from '../../scoring/maturity-band';",
    "import { getMaturityBand, MATURITY_BAND_THRESHOLDS } from '../../scoring/maturity-band';",
    'authoritative maturity thresholds import'
)

helper_anchor = """function bandFor(value: number | null): string {
  if (value === null) return 'Not scored';
  return getMaturityBand(value);
}
"""
helper_block = helper_anchor + """
function customerSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

function customerFindingWhyItMatters(value: string): string {
  return value
    .replace(
      /This recorded weakness affects a methodology hard gate and must be remediated before relying on the aggregate maturity result\./gi,
      'This is a maturity-limiting control condition. Management should implement the recommended control and obtain the specified operating proof before treating the condition as resolved or relying on a higher maturity position.'
    )
    .replace(
      /This recorded weakness affects a methodology critical control and warrants priority treatment\./gi,
      'This is a priority control condition under the MK methodology. Management should implement the recommended control and obtain the specified operating proof before treating the condition as resolved.'
    );
}

function customerRiskTitle(title: string, riskEvent: string): string {
  return /control effectiveness risk$/i.test(title.trim()) ? customerSentence(riskEvent) : title;
}
"""
text = replace_once(text, helper_anchor, helper_block, 'customer copy helpers')

text = replace_once(
    text,
    """  const generatedDate = new Date(data.generatedAt).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
""",
    """  const generatedDate = new Date(data.generatedAt).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
  const supportingRegisterFileName = `${data.reportReference}-supporting-register.xlsx`;
  const supportingRegisterReference = `Essential Supporting Register (${supportingRegisterFileName})`;
""",
    'supporting register identity'
)

priority_pattern = r"""  let criticalLabelEmitted = false;\n  const priorityGaps = data\.criticalMajorGaps\.map\(\(gap, index\) => \{.*?\n  \}\)\.join\(''\);"""
priority_replacement = """  const priorityGaps = data.criticalMajorGaps.map((gap) => {
    const severityLabel = gap.isCriticalGap ? 'Critical control gap' : 'Major control gap';
    return `<div class=\"compact-card alert-card\">
      <div class=\"card-eyebrow\">${severityLabel} · ${esc(gap.domainName)}</div>
      <h3>${esc(gap.prompt)}</h3>
      <p>This recorded condition is considered in the diagnosis, priority findings, risks and roadmap that follow where it is material to the executive priority set.</p>
    </div>`;
  }).join('');"""
text = sub_once(text, priority_pattern, priority_replacement, 'coherent priority-gap taxonomy', flags=re.S)

cap_pattern = r"""  const capCards = data\.maturityCapEvents\.map\(\(event\) => `<div class=\"compact-card amber-card\">.*?\n  </div>`\)\.join\(''\);"""
cap_replacement = """  const capCards = data.maturityCapEvents.map((event) => {
    const governanceCrossReference = event.relatedDomainName === 'Fraud Leadership and Governance'
      ? '<p><strong>Management response:</strong> see Leadership decisions and roadmap for accountable executive mandates, escalation authority and the fraud-risk implementation and control-effectiveness review cadence.</p>'
      : '';
    return `<div class=\"compact-card amber-card\">
      <div class=\"card-eyebrow\">Maturity ceiling · ${esc(event.relatedDomainName ?? 'Cross-domain')}</div>
      <h3>${esc(event.relatedQuestionPrompt ?? customerDomainText(event.reason))}</h3>
      <p>This rule sets a maximum maturity of <strong>${esc(event.capTo)}</strong>. More than one ceiling may apply at the same time; the strictest applicable ceiling governs the final maturity. The recorded condition remains subject to the operating proof specified in this report.</p>
      ${governanceCrossReference}
    </div>`;
  }).join('');"""
text = sub_once(text, cap_pattern, cap_replacement, 'maturity ceiling explanation and governance cross-reference', flags=re.S)

text = replace_once(
    text,
    "${labelled('Why it matters', finding.whyItMatters)}",
    "${labelled('Why it matters', customerFindingWhyItMatters(finding.whyItMatters))}",
    'customer hard-gate wording'
)
text = replace_once(
    text,
    """      ${labelled('Recommended control', finding.recommendedControl)}
      ${labelled('Accountable executive', finding.accountableOwner)}
""",
    """      ${labelled('Recommended control', finding.recommendedControl)}
      ${labelled('Control owner', finding.processOwner || finding.accountableOwner)}
      ${labelled('Accountable executive', finding.accountableOwner)}
""",
    'control owner versus accountable executive'
)

text = replace_once(
    text,
    "<div class=\"record-heading\"><div><span class=\"record-number\">Risk ${index + 1} · ${esc(affectedDomainLabels)}</span><h3>${esc(risk.title)}</h3></div><span class=\"priority-badge priority-${risk.priority.toLowerCase()}\">${esc(risk.priority)}</span></div>",
    "<div class=\"record-heading\"><div><span class=\"record-number\">Risk ${index + 1} · ${esc(affectedDomainLabels)}</span><h3>${esc(customerRiskTitle(risk.title, risk.riskEvent))}</h3></div><span class=\"priority-badge priority-${risk.priority.toLowerCase()}\">${esc(risk.priority)}</span></div>",
    'customer risk titles'
)
text = replace_once(
    text,
    """      ${labelled('Cause', risk.cause)}
      ${labelled('Risk event', risk.riskEvent)}
      ${labelled('Likelihood', `${risk.likelihood} — ${risk.likelihoodRationale}`)}
""",
    """      ${labelled('Likelihood', `${risk.likelihood} — ${risk.likelihoodRationale}`)}
""",
    'remove adjacent duplicated risk cause event'
)

text = replace_once(
    text,
    "Every decision below carries a named accountable executive and a fixed target period; each is grounded in the material findings, risks and controls set out in this report and in the complete registers in the supporting register issued with this report.",
    "Every decision below carries a defined accountable executive role and a fixed target period; each is grounded in the material findings, risks and controls set out in this report and in the complete registers in the companion ${esc(supportingRegisterReference)}.",
    'leadership role wording and register identity'
)

text = replace_once(
    text,
    """  const methodology = `<p>This report is generated from a structured self-assessment across ten fraud-risk-management domains. The score, maturity constraints and advisory model use only the recorded assessment inputs and the deterministic methodology.</p>
    <p><strong>Limitations.</strong> This is not a forensic investigation, external audit, compliance certification or guarantee. Responses were not independently verified. Findings, scenarios and recommendations are decision-support material; leadership should obtain the specified operating proof before treating a control as effective or a finding as resolved.</p>
    <p><strong>Control completeness.</strong> Every priority control should state the What, Who, Population, Frequency, Evidence retained, Independent check, Escalation trigger and recipient, SLA, Effectiveness measure and Failure response.</p>
    <p class=\"section-note\">Source: persisted assessment record, evidence model and supporting register.</p>
    `;
""",
    """  const methodology = `<p>This report is generated from a structured self-assessment across ten fraud-risk-management domains. The score, maturity ceilings and advisory model use only the recorded assessment inputs and the MK Fraud Readiness methodology.</p>
    <p><strong>Limitations.</strong> This is not a forensic investigation, external audit, compliance certification or guarantee. Responses were not independently verified. Findings, scenarios and recommendations are decision-support material; leadership should obtain the specified operating proof before treating a control as effective or a finding as resolved.</p>
    <p><strong>Control design standard.</strong> Priority controls are specified by responsibility, population or scope, operating frequency, retained evidence, independent challenge, escalation trigger, service level, effectiveness measure and response to failure.</p>
    <p><strong>Companion register.</strong> The complete Essential delivery includes the ${esc(supportingRegisterReference)}. It carries the complete finding, risk, control-action, evidence, roadmap and question-trace registers that are intentionally bounded in this PDF.</p>
    <p class=\"section-note\">Assessment basis: submitted self-assessment responses and the MK Fraud Readiness methodology.</p>
    `;
""",
    'customer methodology terminology and register identity'
)

# Replace every customer-visible generic register reference that remains in template literals.
text = text.replace('supporting register issued with this report', '${esc(supportingRegisterReference)}')
text = text.replace('supporting register issued with it', '${esc(supportingRegisterReference)}')
text = text.replace('the supporting register (see the closing section of this report)', 'the companion ${esc(supportingRegisterReference)}')
text = text.replace('the full checklist in the supporting register.', 'the full checklist in the companion ${esc(supportingRegisterReference)}.')
text = text.replace('the full checklist in the supporting register.</p>', 'the full checklist in the companion ${esc(supportingRegisterReference)}.</p>')

# Replace definitions/score-basis scorecard repetition with the authoritative score explanation.
definitions_pattern = r"""  const definitionsBlock = `<table class=\"continuing-table compact-register score-basis-table\">.*?Likelihood/impact ratings are qualitative, not statistical probabilities\.</p>`;"""
definitions_replacement = """  const maturityScaleRows = MATURITY_BAND_THRESHOLDS.map((band) => {
    const upper = Number.isFinite(band.max) ? band.max : 100;
    const range = band.label === 'Strategic' ? `${band.min}–100` : `${band.min}–<${upper}`;
    return `<tr><td>${esc(band.label)}</td><td>${esc(range)}</td><td>${esc(
      band.label === 'Reactive' ? 'Foundational controls are limited or mainly reactive.'
        : band.label === 'Developing' ? 'Core control elements exist but are incomplete, inconsistent or not yet connected.'
          : band.label === 'Structured' ? 'Controls are more consistently defined, owned and operated.'
            : 'Fraud-risk management is embedded, monitored and continually improved.'
    )}</td></tr>`;
  }).join('');
  const numericBand = sr.overallScore === null ? null : getMaturityBand(sr.overallScore);
  const numericBandIndex = numericBand ? MATURITY_BAND_THRESHOLDS.findIndex((band) => band.label === numericBand) : -1;
  const nextNumericBand = numericBandIndex >= 0 ? MATURITY_BAND_THRESHOLDS[numericBandIndex + 1] : undefined;
  const scoreInterpretation = sr.overallScore === null
    ? 'No overall readiness score was issued because the assessment did not meet the scoring conditions.'
    : `The weighted overall score is ${Number(sr.overallScore).toFixed(2)}/100, which maps numerically to ${numericBand}. The final maturity shown in this report is ${sr.finalMaturity}. ${nextNumericBand ? `The next numerical band begins at ${nextNumericBand.min}/100; a higher numerical score alone does not override a stricter applicable maturity ceiling.` : 'This is the highest numerical maturity band.'}`;
  const definitionsBlock = `
    <h3>How the score is calculated</h3>
    <p>Each applicable assessment response is normalised to a 0–100 control score and weighted within its domain. Domain scores are then combined using the methodology's domain weights to produce the overall readiness score. A control recorded as not applicable is excluded from its scoring denominator rather than treated as a weakness.</p>
    <p>${esc(scoreInterpretation)}</p>
    <h3>Maturity scale</h3>
    <table class=\"continuing-table compact-register maturity-scale-table\"><thead><tr><th>Maturity</th><th>Score range</th><th>Interpretation</th></tr></thead><tbody>${maturityScaleRows}</tbody></table>
    <h3>Maturity ceilings</h3>
    <p>Maturity ceilings protect against a strong average masking a material weakness. A hard-gate critical control scored 0 or 1 sets a maximum of Developing; a hard-gate control scored 2 sets a maximum of Structured; three or more critical controls scored 0, 1 or 2 set a maximum of Developing; any core domain below 40 sets a maximum of Developing; and any core domain below 60 sets a maximum of Structured. Where several ceilings apply, the strictest ceiling governs the final maturity.</p>
    <h3>Reported domain scores</h3>
    <table class=\"continuing-table compact-register score-basis-table\"><thead><tr><th>Domain</th><th>Reported score</th><th>Maturity</th></tr></thead><tbody>${data.domainResults.map((domain) => `<tr><td>${esc(domain.domainName)}</td><td>${score(domain.rawScore)}/100</td><td>${esc(bandFor(domain.rawScore))}</td></tr>`).join('')}</tbody></table>
    <p class=\"section-note\">Risk priority uses the deterministic qualitative likelihood/impact matrix. Risks in the same priority class are not further ranked by their display sequence. Priority and materiality are derived from assessment evidence; neither is an independent risk assessment.</p>`;"""
text = sub_once(text, definitions_pattern, definitions_replacement, 'real definitions and score basis', flags=re.S)

text = replace_once(
    text,
    "${subsection(content.executiveSummary.title, `",
    "${subsection(customerSentence(content.executiveSummary.title), `",
    'executive headline sentence'
)

text = replace_once(
    text,
    """    section('Priority findings, contradictions and scenarios', 'Priority findings, contradictions and scenarios', `
      <p class=\"lede\">The ${topFindings.length} conditions selected for executive attention from ${sortedFindings.length} recorded findings. The complete register of all ${sortedFindings.length} findings is provided in the ${esc(supportingRegisterReference)}.</p>
""",
    """    section('Priority findings, contradictions and scenarios', 'Priority findings, contradictions and scenarios', `
      <p class=\"lede\">The ${topFindings.length} conditions selected for executive attention from ${sortedFindings.length} recorded findings. The complete register of all ${sortedFindings.length} findings is provided in the ${esc(supportingRegisterReference)}.</p>
      <p class=\"section-note\"><strong>Role distinction:</strong> Control owner identifies the role responsible for implementing or operating the control. Accountable executive identifies the executive role responsible for sponsorship, decision rights and escalation. The two roles may legitimately differ.</p>
""",
    'role distinction note'
)

text = replace_once(
    text,
    """    section('Priority risks', 'Priority risks', `
      <p class=\"section-note\">Priority is derived from the assessment evidence and is not an independent risk assessment. The complete risk register (${sortedRisks.length} risks) is provided in the ${esc(supportingRegisterReference)}.</p>
""",
    """    section('Priority risks', 'Priority risks', `
      <p class=\"section-note\">Risk priority is produced by the deterministic qualitative likelihood/impact matrix. Risks sharing the same priority class are not more finely ranked by their display order. Likelihood and impact are qualitative descriptors, not statistical probabilities. The complete risk register (${sortedRisks.length} risks) is provided in the ${esc(supportingRegisterReference)}.</p>
""",
    'risk ordering explanation'
)

text = replace_once(
    text,
    "'long-section continue-after-short-tail'),\n    section('Priority risks'",
    "'long-section continue-after-short-tail splittable-finding-section'),\n    section('Priority risks'",
    'splittable finding section class'
)

text = replace_once(
    text,
    ".cap-card-list { break-inside: avoid; page-break-inside: avoid; }",
    ".cap-card-list { break-inside: auto; page-break-inside: auto; }",
    'maturity cards fill available page space'
)

css_anchor = """  .manuscript-section { margin-bottom: 4mm; }
  .manuscript-section:last-child { margin-bottom: 0; }
"""
css_block = """  .manuscript-section { margin-bottom: 4mm; }
  .manuscript-section:last-child { margin-bottom: 0; }
  .manuscript-section > h3 { break-after: avoid; page-break-after: avoid; }
  .manuscript-section > h3 + p { break-before: avoid; page-break-before: avoid; }
"""
text = replace_once(text, css_anchor, css_block, 'manuscript heading orphan protection')

css_risk_anchor = """  .splittable-risk-section .record-heading,
  .splittable-risk-section .risk-statement,
  .splittable-risk-section .field { break-inside: avoid; page-break-inside: avoid; }
"""
css_risk_block = css_risk_anchor + """  .splittable-finding-section .finding-record { break-inside: auto; page-break-inside: auto; }
  .splittable-finding-section .record-heading,
  .splittable-finding-section .field { break-inside: avoid; page-break-inside: avoid; }
"""
text = replace_once(text, css_risk_anchor, css_risk_block, 'finding pagination utilisation')

text = replace_once(
    text,
    ".recommended-next-step { margin-top:4mm; padding:3mm 4mm; background:var(--mk-neutral-bg); border-left:1mm solid var(--mk-navy-500); break-before:avoid; page-break-before:avoid; }",
    ".recommended-next-step { margin-top:4mm; padding:3mm 4mm; background:var(--mk-neutral-bg); border-left:1mm solid var(--mk-navy-500); break-before:avoid; page-break-before:avoid; break-inside:avoid; page-break-inside:avoid; }\n  .score-basis-table th:nth-child(1), .score-basis-table td:nth-child(1) { width:58%; }\n  .score-basis-table th:nth-child(2), .score-basis-table td:nth-child(2) { width:18%; white-space:nowrap; }\n  .score-basis-table th:nth-child(3), .score-basis-table td:nth-child(3) { width:24%; }\n  .maturity-scale-table th:nth-child(1), .maturity-scale-table td:nth-child(1) { width:20%; }\n  .maturity-scale-table th:nth-child(2), .maturity-scale-table td:nth-child(2) { width:18%; white-space:nowrap; }",
    'callout keep and score table geometry'
)

path.write_text(text)

# A permanent provider-free regression for the second-opinion closure items.
regression = Path('scripts/commercial-quality/essential-v9-second-opinion-regression.mjs')
regression.write_text("""#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template = fs.readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');
const scoring = fs.readFileSync('src/lib/scoring/scoring-engine.ts', 'utf8');
const maturity = fs.readFileSync('src/lib/scoring/maturity-band.ts', 'utf8');
const launch = fs.readFileSync('docs/v2/phase14-commercial-launch/essential-organisation-profile-launch-requirement.md', 'utf8');

// Score basis comes from the authoritative scoring contract, not a local invented scale.
assert.match(template, /MATURITY_BAND_THRESHOLDS/);
for (const expected of ["Reactive', min: 0, max: 40", "Developing', min: 40, max: 60", "Structured', min: 60, max: 80", "Strategic', min: 80"]) assert.match(maturity, new RegExp(expected.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
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
assert.match(template, /Management response:<\\\/strong> see Leadership decisions and roadmap/);

// Supporting register is named precisely and the commercial package contract is explicit.
assert.match(template, /supportingRegisterFileName = `\\$\\{data\.reportReference\\}-supporting-register\.xlsx`/);
assert.match(template, /Essential Supporting Register/);
assert.doesNotMatch(template, /supporting register issued with this report/i);
assert.doesNotMatch(template, /see the closing section of this report/i);

// Pagination/geometry guards for the exact V9 visual failures.
assert.match(template, /splittable-finding-section/);
assert.match(template, /\.cap-card-list \{ break-inside: auto; page-break-inside: auto; \}/);
assert.match(template, /\.manuscript-section > h3 \{ break-after: avoid; page-break-after: avoid; \}/);
assert.match(template, /\.recommended-next-step .*break-inside:avoid; page-break-inside:avoid/);
assert.match(template, /\.score-basis-table th:nth-child\(1\).*width:58%/);

// Upstream organisation specificity is a launch requirement; no Mahlori-specific facts are hard-coded.
for (const field of ['sector', 'size band', 'material value-bearing processes', 'systems and channels', 'operating footprint', 'third-party']) assert.match(launch, new RegExp(field, 'i'));
assert.match(launch, /must not infer or invent/i);
assert.match(launch, /report_artifacts/i);
assert.match(launch, /hard launch blocker/i);
assert.doesNotMatch(template, /Mahlori Advisory|Mahlori/);

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', v9SecondOpinionClosure: 'PASS', scoreBasis: 'PASS', pagination: 'PASS', registerContract: 'PASS', profileRequirement: 'PASS' }, null, 2));
""")

# Launch requirement: profile capture is upstream and factual, never model-invented. Also record the
# verified current supporting-register infrastructure blocker without mutating production.
launch_doc = Path('docs/v2/phase14-commercial-launch/essential-organisation-profile-launch-requirement.md')
launch_doc.parent.mkdir(parents=True, exist_ok=True)
launch_doc.write_text("""# Essential organisation-profile and companion-register launch requirement

Status: **REQUIRED BEFORE UNRESTRICTED COMMERCIAL LAUNCH**

## Purpose

The Essential report must remain grounded in recorded assessment evidence while becoming materially more organisation-specific. The report generator must not infer or invent facts about an organisation's sector, scale, processes, systems, footprint or operating model merely to make narrative sound bespoke.

## Minimum organisation profile

Before a paid Essential assessment can be submitted, the intake journey must capture a small structured profile, separate from the scored control answers. At minimum it must capture: sector / industry; organisation size band; the material value-bearing processes actually present (for example procurement, payments, refunds, claims, stock / held assets, supplier management or service delivery); material systems and channels used for those processes; operating footprint / location model; and the third-party / intermediary operating model. Optional free text may add context but must never override the structured selections without an explicit customer correction.

These fields are context, not readiness scores. They must not change a control score merely because of organisation type. Their purpose is to constrain applicability language, scenario selection and examples so the report does not recommend irrelevant processes or channels. Narrative generation may use only persisted profile facts and assessment evidence; missing profile facts must remain unknown rather than be guessed.

## Customer correction and privacy boundary

The respondent must be able to review and correct the profile before submission. Capture only the minimum business context needed for the advisory report; do not request personal data, named employees, customer records or confidential transaction detail through this profile gateway.

## Essential Supporting Register is part of the product contract

The companion workbook is the **Essential Supporting Register**, with the deterministic filename `<report-reference>-supporting-register.xlsx`. The source already builds the complete register from authoritative L1 data, verifies its stored bytes by SHA-256 and size, and exposes customer-authorised retrieval as the `register` artefact under the parent report's secure access authority.

A read-only production verification on 18 August 2026 found that the `report_artifacts` relation is not present in the current production schema (`42P01 undefined_table`). The current runtime therefore cannot persist and release the supporting register there. This is a **hard launch blocker** because the bounded PDF deliberately defers complete findings, risks, control actions, evidence requirements, roadmap actions and question trace to that companion workbook.

No production migration is authorised by this requirement. Before unrestricted commercial launch, the separately governed migration / release process must enable the accepted secondary-artefact schema and prove end to end that a paid Essential fulfilment produces both: (1) the verified PDF, and (2) the verified Essential Supporting Register, with both downloadable through authorised customer access and both tied to the same current report version. If the register cannot be produced and released, the Essential delivery must fail closed rather than tell the customer that omitted registers were supplied elsewhere.

## Acceptance criteria

Commercial launch is blocked until the structured organisation profile is persisted and available to report generation, no report path invents absent organisation facts, the companion register capability is present in the target production schema, and end-to-end acceptance proves that the PDF and its named supporting register are delivered as one coherent Essential package.
""")

print('V9 second-opinion deterministic hardening staged')
