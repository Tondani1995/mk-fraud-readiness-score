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

    // Code-aware mapping for whole-narrative rules. adaptive_exposure_unsupported carries the path
    // 'narrative', which no section matcher recognises, so wanted stayed empty and the fallback
    // below expanded the repair to all 19 sections. The rule is evaluated over exactly three root
    // bodies, so exactly those three are repaired -- domains and gaps are left byte-preserved.
    if (validationIssue.code === 'adaptive_exposure_unsupported') {
      wanted.add('executive');
      wanted.add('false_comfort');
      wanted.add('leadership');
      continue;
    }

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

export class PremiumReportRepairMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PremiumReportRepairMergeError';
  }
}

/** Merge only failed sections; the raw provider response remains in repairGeneration. */
export function mergePremiumReportRepairOutput(
  previousOutput: PremiumReportAiEditorialPlan,
  repairedOutput: unknown,
  scope: NarrativeRepairScope
): { output: PremiumReportAiEditorialPlan; discardedCompliantRepairSectionIds: string[] } {
  if (!record(repairedOutput)) throw new PremiumReportRepairMergeError('Repair output is not an object.');
  const repaired = repairedOutput as Record<string, unknown>;
  const failed = new Set(scope.failedSectionIds);
  const known = new Set([
    'executive', 'false_comfort', 'leadership',
    ...previousOutput.domainEvidence.map((entry) => `domain:${entry.domainCode}`),
    ...previousOutput.gapEvidence.map((entry) => `gap:${entry.questionCode}`)
  ]);
  for (const id of failed) {
    if (!known.has(id) && !/^(?:domain|gap):.+$/.test(id)) throw new PremiumReportRepairMergeError(`Repair scope contains unknown section ${id}.`);
  }

  const output = { ...previousOutput } as PremiumReportAiEditorialPlan;
  const discarded = new Set<string>();
  const mergeRoot = (sectionId: string, bodyKey: keyof PremiumReportAiEditorialPlan, refsKey: keyof PremiumReportAiEditorialPlan) => {
    if (failed.has(sectionId)) {
      output[bodyKey] = repaired[bodyKey] as never;
      output[refsKey] = repaired[refsKey] as never;
    } else if (!sameBytes(previousOutput[bodyKey], repaired[bodyKey]) || !sameBytes(previousOutput[refsKey], repaired[refsKey])) {
      discarded.add(sectionId);
    }
  };
  mergeRoot('executive', 'executiveBody', 'executiveEvidenceRefs');
  mergeRoot('false_comfort', 'falseComfortBody', 'falseComfortEvidenceRefs');
  mergeRoot('leadership', 'leadershipBody', 'leadershipEvidenceRefs');

  const mergeCollection = (
    key: 'domainEvidence' | 'gapEvidence',
    identifier: 'domainCode' | 'questionCode',
    prefix: 'domain' | 'gap'
  ) => {
    const before = previousOutput[key];
    const after = repaired[key];
    if (!Array.isArray(before) || !Array.isArray(after)) throw new PremiumReportRepairMergeError(`Repair output omitted ${key}.`);
    const beforeIds = before.map((entry) => record(entry) ? String((entry as Record<string, unknown>)[identifier]) : '');
    const afterIds = after.map((entry) => record(entry) ? String((entry as Record<string, unknown>)[identifier]) : '');
    if (beforeIds.some((id) => !id) || afterIds.some((id) => !id)) throw new PremiumReportRepairMergeError(`${key} contains an entry without ${identifier}.`);
    if (new Set(beforeIds).size !== beforeIds.length || new Set(afterIds).size !== afterIds.length) throw new PremiumReportRepairMergeError(`${key} contains duplicate ${identifier} values.`);
    if (beforeIds.some((id) => !afterIds.includes(id) && !failed.has(`${prefix}:${id}`))) throw new PremiumReportRepairMergeError(`${key} deleted a compliant section.`);
    if (beforeIds.some((id) => !afterIds.includes(id) && failed.has(`${prefix}:${id}`))) throw new PremiumReportRepairMergeError(`${key} omitted a failed section that the repair was required to provide.`);
    if (afterIds.some((id) => !beforeIds.includes(id) && !failed.has(`${prefix}:${id}`))) throw new PremiumReportRepairMergeError(`${key} inserted an unscoped section.`);
    const afterById = new Map(after.map((entry) => [String((entry as Record<string, unknown>)[identifier]), entry]));
    const merged = before.map((entry, index) => {
      const id = beforeIds[index];
      const sectionId = `${prefix}:${id}`;
      const candidate = afterById.get(id);
      if (failed.has(sectionId)) return candidate as never;
      if (!sameBytes(entry, candidate) || afterIds[index] !== id) discarded.add(sectionId);
      return entry;
    }) as never;
    const newFailed = after
      .filter((entry) => {
        const id = String((entry as Record<string, unknown>)[identifier]);
        return !beforeIds.includes(id) && failed.has(`${prefix}:${id}`);
      });
    output[key] = [...(merged as unknown[]), ...newFailed] as never;
  };
  mergeCollection('domainEvidence', 'domainCode', 'domain');
  mergeCollection('gapEvidence', 'questionCode', 'gap');
  return {
    output,
    discardedCompliantRepairSectionIds: [...discarded].sort((left, right) => left.localeCompare(right))
  };
}
