import type {
  NarrativeGenerationInput,
  NarrativeRepairScope,
  NarrativeValidationIssue,
  NarrativeValidationResult,
  PremiumReportAiEditorialPlan,
  PremiumReportNarrativeBrief
} from './types';

function issue(path: string, message: string): NarrativeValidationIssue {
  return { code: 'repair_modified_compliant_section', path, message, blocking: true };
}

function allSectionIds(brief: PremiumReportNarrativeBrief) {
  return [
    brief.executive.sectionId,
    brief.falseComfort.sectionId,
    brief.leadership.sectionId,
    ...Object.values(brief.domains).map((entry) => entry.sectionId),
    ...Object.values(brief.gaps).map((entry) => entry.sectionId)
  ];
}

export function buildPremiumReportRepairScope(
  input: Pick<NarrativeGenerationInput, 'narrativeBrief' | 'previousOutput' | 'validationIssues'>
): NarrativeRepairScope {
  const orderedIds = allSectionIds(input.narrativeBrief);
  const wanted = new Set<string>();
  const previous = input.previousOutput;

  for (const validationIssue of input.validationIssues ?? []) {
    const path = validationIssue.path ?? '';
    if (/executive(?:Body|EvidenceRefs|Diagnosis)?/i.test(path)) wanted.add('executive');
    if (/falseComfort|false_comfort/i.test(path)) wanted.add('false_comfort');
    if (/leadership(?:Body|EvidenceRefs|Attention)?/i.test(path)) wanted.add('leadership');

    const domainIndex = path.match(/domain(?:Evidence|Narratives)\[(\d+)\]/i)?.[1];
    if (domainIndex !== undefined) {
      const domainCode = previous?.domainEvidence?.[Number(domainIndex)]?.domainCode;
      if (domainCode) wanted.add(`domain:${domainCode}`);
    } else if (/domain(?:Evidence|Narratives)/i.test(path)) {
      Object.values(input.narrativeBrief.domains).forEach((entry) => wanted.add(entry.sectionId));
    }

    const gapIndex = path.match(/gap(?:Evidence|Commentary)\[(\d+)\]/i)?.[1];
    if (gapIndex !== undefined) {
      const questionCode = previous?.gapEvidence?.[Number(gapIndex)]?.questionCode;
      if (questionCode) wanted.add(`gap:${questionCode}`);
    } else if (/gap(?:Evidence|Commentary)/i.test(path)) {
      Object.values(input.narrativeBrief.gaps).forEach((entry) => wanted.add(entry.sectionId));
    }
  }

  return {
    failedSectionIds: orderedIds.filter((sectionId) => wanted.size === 0 || wanted.has(sectionId))
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameBytes(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validatePremiumReportRepairPreservation(
  previousOutput: PremiumReportAiEditorialPlan,
  repairedOutput: unknown,
  scope: NarrativeRepairScope,
  schemaVersion: string,
  now = new Date()
): NarrativeValidationResult {
  const issues: NarrativeValidationIssue[] = [];
  const failed = new Set(scope.failedSectionIds);
  if (!record(repairedOutput)) {
    return {
      ok: false,
      issues: [issue('$', 'Repair output is not an object and cannot preserve compliant sections.')],
      checkedAt: now.toISOString(),
      schemaVersion
    };
  }
  const repaired = repairedOutput as unknown as PremiumReportAiEditorialPlan;

  const preserveRoot = (
    sectionId: string,
    bodyKey: keyof PremiumReportAiEditorialPlan,
    refsKey: keyof PremiumReportAiEditorialPlan
  ) => {
    if (failed.has(sectionId)) return;
    if (!sameBytes(previousOutput[bodyKey], repaired[bodyKey])) {
      issues.push(issue(String(bodyKey), `Repair modified compliant section ${sectionId}.`));
    }
    if (!sameBytes(previousOutput[refsKey], repaired[refsKey])) {
      issues.push(issue(String(refsKey), `Repair modified compliant evidence references for ${sectionId}.`));
    }
  };
  preserveRoot('executive', 'executiveBody', 'executiveEvidenceRefs');
  preserveRoot('false_comfort', 'falseComfortBody', 'falseComfortEvidenceRefs');
  preserveRoot('leadership', 'leadershipBody', 'leadershipEvidenceRefs');

  const preserveEntries = (
    collection: 'domainEvidence' | 'gapEvidence',
    identifier: 'domainCode' | 'questionCode',
    prefix: 'domain' | 'gap'
  ) => {
    const before = previousOutput[collection];
    const after = repaired[collection];
    if (!Array.isArray(after)) {
      issues.push(issue(collection, `Repair output omitted the ${collection} collection.`));
      return;
    }

    const compliantEntries = (entries: unknown[]) => entries.filter((entry) => {
      if (!record(entry)) return true;
      return !failed.has(`${prefix}:${String(entry[identifier])}`);
    });
    const beforeCompliant = compliantEntries(before);
    const afterCompliant = compliantEntries(after);
    if (afterCompliant.length !== beforeCompliant.length) {
      issues.push(issue(collection, `Repair inserted or deleted a compliant ${collection} entry.`));
      return;
    }
    beforeCompliant.forEach((entry, index) => {
      const repairedEntry = afterCompliant[index];
      const expectedIdentifier = record(entry) ? entry[identifier] : undefined;
      const actualIdentifier = record(repairedEntry) ? repairedEntry[identifier] : undefined;
      if (expectedIdentifier !== actualIdentifier) {
        issues.push(issue(`${collection}[${index}].${identifier}`, `Repair reordered or replaced a compliant ${collection} entry.`));
        return;
      }
      if (!sameBytes(entry, repairedEntry)) {
        const sectionId = `${prefix}:${String(expectedIdentifier)}`;
        issues.push(issue(`${collection}[${index}]`, `Repair modified compliant section ${sectionId}.`));
      }
    });
  };
  preserveEntries('domainEvidence', 'domainCode', 'domain');
  preserveEntries('gapEvidence', 'questionCode', 'gap');

  return {
    ok: issues.length === 0,
    issues,
    checkedAt: now.toISOString(),
    schemaVersion
  };
}
