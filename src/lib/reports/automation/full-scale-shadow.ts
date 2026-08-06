export const PRE_G30_SHADOW_PROJECT_ID = 'prj_jFSTfwL14kk8UURjaaRwYe2HWuhK';
export const PRE_G30_SHADOW_SUPABASE_PROJECT = 'penhenkzfrtmcxklodtu';
export const PRE_G30_SHADOW_PR_NUMBER = '52';
export const PRE_G30_SHADOW_PROVIDER = 'openai';
export const PRE_G30_SHADOW_MODEL = 'openai/gpt-5.5';
export const PRE_G30_SHADOW_ASSESSMENT = 'MKFRS-2026-ACACD50A9F';
export const PRE_G30_SHADOW_ORDER = 'MKORD-2026-RHFC6DYH';
export const PRE_G30_SHADOW_OPERATION = 'pre-g30-full-scale-journey5-shadow-v1';

export type FullScaleShadowFenceInput = {
  vercelEnvironment: string;
  projectId: string;
  supabaseProject: string;
  pullRequest: string;
  runtimeSha: string;
  provider: string;
  model: string;
};

export function evaluateFullScaleShadowFence(input: FullScaleShadowFenceInput) {
  const checks = {
    previewEnvironment: input.vercelEnvironment === 'preview',
    mkFraudProject: input.projectId === PRE_G30_SHADOW_PROJECT_ID,
    stagingSupabase: input.supabaseProject === PRE_G30_SHADOW_SUPABASE_PROJECT,
    approvedPullRequest: input.pullRequest === PRE_G30_SHADOW_PR_NUMBER,
    diagnosticShaPresent: /^[0-9a-f]{40}$/i.test(input.runtimeSha),
    openAiProvider: input.provider === PRE_G30_SHADOW_PROVIDER,
    approvedModel: input.model === PRE_G30_SHADOW_MODEL
  };
  return {
    allowed: Object.values(checks).every(Boolean),
    checks,
    reasons: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name)
  };
}

export type FullScaleShadowReconciliation = {
  rootSectionCount: number;
  domainCodes: string[];
  visibilityGapCodes: string[];
  narrativeBodyCount: number;
  duplicateDomainCodes: string[];
  duplicateVisibilityGapCodes: string[];
  missingDomainCodes: string[];
  missingVisibilityGapCodes: string[];
  unexpectedDomainCodes: string[];
  unexpectedVisibilityGapCodes: string[];
  complete: boolean;
};

function duplicates(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value).sort();
}

function missing(expected: string[], actual: string[]) {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value)).sort();
}

function unexpected(expected: string[], actual: string[]) {
  const expectedSet = new Set(expected);
  return actual.filter((value) => !expectedSet.has(value)).sort();
}

export function reconcileFullScaleShadowOutput(input: {
  output: {
    domainEvidence: Array<{ domainCode: string }>;
    gapEvidence: Array<{ questionCode: string }>;
  };
  expectedDomainCodes: string[];
  expectedVisibilityGapCodes: string[];
}): FullScaleShadowReconciliation {
  const domainCodes = input.output.domainEvidence.map((entry) => entry.domainCode);
  const visibilityGapCodes = input.output.gapEvidence.map((entry) => entry.questionCode);
  const duplicateDomainCodes = duplicates(domainCodes);
  const duplicateVisibilityGapCodes = duplicates(visibilityGapCodes);
  const missingDomainCodes = missing(input.expectedDomainCodes, domainCodes);
  const missingVisibilityGapCodes = missing(input.expectedVisibilityGapCodes, visibilityGapCodes);
  const unexpectedDomainCodes = unexpected(input.expectedDomainCodes, domainCodes);
  const unexpectedVisibilityGapCodes = unexpected(input.expectedVisibilityGapCodes, visibilityGapCodes);
  const rootSectionCount = 3;
  const narrativeBodyCount = rootSectionCount + domainCodes.length + visibilityGapCodes.length;
  return {
    rootSectionCount,
    domainCodes: [...domainCodes].sort(),
    visibilityGapCodes: [...visibilityGapCodes].sort(),
    narrativeBodyCount,
    duplicateDomainCodes,
    duplicateVisibilityGapCodes,
    missingDomainCodes,
    missingVisibilityGapCodes,
    unexpectedDomainCodes,
    unexpectedVisibilityGapCodes,
    complete: rootSectionCount === 3
      && domainCodes.length === input.expectedDomainCodes.length
      && visibilityGapCodes.length === input.expectedVisibilityGapCodes.length
      && duplicateDomainCodes.length === 0
      && duplicateVisibilityGapCodes.length === 0
      && missingDomainCodes.length === 0
      && missingVisibilityGapCodes.length === 0
      && unexpectedDomainCodes.length === 0
      && unexpectedVisibilityGapCodes.length === 0
      && narrativeBodyCount === 23
  };
}
