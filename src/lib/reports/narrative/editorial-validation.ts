import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeManuscript } from './manuscript';
import type { NarrativeStoryPlan } from './story-plan';
import type { NarrativeValidationIssue } from './validation';

export interface EditorialValidationReport {
  ok: boolean;
  checkedAt: string;
  issues: NarrativeValidationIssue[];
  summary: { sections: number; paragraphs: number; transitions: number; repeatedConstructionCount: number };
}

const fail = (code: string, path: string, message: string): NarrativeValidationIssue => ({ code, path, message, blocking: true });
const prose = (manuscript: NarrativeManuscript) => manuscript.sections.flatMap((section) => [section.heading.text, ...section.paragraphs.map((paragraph) => paragraph.text), ...(section.transition ? [section.transition.text] : [])]);

export function validateNarrativeEditorial(manuscript: NarrativeManuscript, pack: NarrativeFactPack, plan: NarrativeStoryPlan): EditorialValidationReport {
  const issues: NarrativeValidationIssue[] = [];
  const sectionIds = manuscript.sections.map((section) => section.sectionId);
  if (sectionIds[0] === 'ANALYTICAL-BASIS') issues.push(fail('methodology_first', 'sections[0]', 'The manuscript must begin with executive diagnosis, not methodology.'));
  const executive = manuscript.sections.find((section) => section.sectionId === 'EXECUTIVE-DIAGNOSIS');
  if (!executive || executive.paragraphs.length < 2) issues.push(fail('executive_metric_dump', 'EXECUTIVE-DIAGNOSIS', 'Executive diagnosis must contain multiple connected narrative paragraphs.'));
  if (pack.systemicThemeInputs.length > 0) {
    const themes = manuscript.sections.find((section) => section.sectionId === 'SYSTEMIC-THEMES');
    if (!themes || themes.paragraphs.length === 0) issues.push(fail('empty_thematic_section', 'SYSTEMIC-THEMES', 'Systemic theme section cannot be empty when deterministic themes exist.'));
  }
  const scenarios = manuscript.sections.find((section) => section.sectionId === 'FRAUD-SCENARIOS');
  if (pack.scenarios.length > 0 && (!scenarios || scenarios.paragraphs.length === 0)) issues.push(fail('invalid_scenario_section', 'FRAUD-SCENARIOS', 'Scenario section must contain connected fraud-pathway prose.'));
  const conclusion = manuscript.sections.find((section) => section.sectionId === 'CONCLUSION');
  if (!conclusion || conclusion.paragraphs.length < 1) issues.push(fail('conclusion_not_narrative', 'CONCLUSION', 'Conclusion must contain narrative prose.'));
  const major = new Set(['EXECUTIVE-DIAGNOSIS', 'SYSTEMIC-THEMES', 'PRIORITY-FINDINGS', 'MATERIAL-FINDINGS', 'FRAUD-SCENARIOS', 'MANAGEMENT-PRIORITIES', 'CONTROL-BLUEPRINTS', 'LEADERSHIP-DECISIONS', 'TRANSFORMATION-BLUEPRINT']);
  manuscript.sections.forEach((section, index) => {
    if (index < manuscript.sections.length - 1 && major.has(section.sectionId) && !section.transition) issues.push(fail('missing_transition', `sections[${index}]`, `Major section ${section.sectionId} requires a transition.`));
  });
  const all = prose(manuscript);
  const mechanical = all.filter((value) => /\b(?:The assessment indicates|Management should|This report|The organisation)\b/i.test(value)).length;
  if (mechanical > Math.max(3, Math.ceil(all.length * 0.45))) issues.push(fail('mechanical_cadence', 'manuscript', 'Repeated mechanical sentence construction exceeds the permitted threshold.'));
  if (all.some((value) => /\b(?:Material finding|Priority exposure|Target control blueprint)\s+\d+\b/i.test(value))) issues.push(fail('generic_headings', 'manuscript', 'Generic database headings are not acceptable advisory headings.'));
  if (all.some((value) => /\b(?:diagnosis|interpretation)\b/i.test(value) && /\b(?:recorded control condition|specific control on whether)\b/i.test(value))) issues.push(fail('questionnaire_repetition', 'manuscript', 'Findings must interpret the position rather than repeat questionnaire wording.'));
  return { ok: issues.length === 0, checkedAt: new Date().toISOString(), issues, summary: { sections: manuscript.sections.length, paragraphs: manuscript.sections.reduce((count, section) => count + section.paragraphs.length, 0), transitions: manuscript.sections.filter((section) => Boolean(section.transition)).length, repeatedConstructionCount: mechanical } };
}
