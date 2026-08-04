export const PREVIEW_ADAPTIVE_GRAPH_VERSION = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804';
export const PREVIEW_STAGING_PROJECT_REF = 'penhenkzfrtmcxklodtu';
export const PREVIEW_ADAPTIVE_GRAPH_FINGERPRINT = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab';

export type AdaptiveCondition =
  | null
  | { questionId: string; equals?: string; in?: string[] }
  | { all: AdaptiveCondition[] }
  | { any: AdaptiveCondition[] }
  | { not: AdaptiveCondition };

export type AdaptiveGateway = {
  questionId: string;
  section: string;
  prompt: string;
  questionType: string;
  sortOrder: number;
  responseOptions: Array<{ value: string; label: string }>;
};

export type AdaptiveQuestion = {
  questionId: string;
  questionCode: string;
  domainCode: string;
  prompt: string;
  controlObjective: string;
  weight: number;
  isCritical: boolean;
  isHardGate: boolean;
  sortOrder: number;
  applicabilityCondition: AdaptiveCondition;
  redirectWhen: { condition: AdaptiveCondition; redirectTo: string } | null;
  skipReasonCode: string | null;
  evidenceReference: string | null;
};

export type AdaptiveOversightVariant = {
  questionId: string;
  replaces: string | null;
  domainCode: string;
  prompt: string;
  displayGuidance: string;
  scoringStatus: string;
};

export type AdaptiveGraph = {
  graphVersion: string;
  methodologyVersion: string;
  status: 'draft' | 'published' | 'retired' | string;
  graphFingerprint: string;
  responseScale: Array<{ responseValue: number; label: string; operationalMeaning: string | null; normalisedScore: number }>;
  domains: Array<{ domainCode: string; name: string; weightPct: number; sortOrder: number }>;
  gateways: AdaptiveGateway[];
  questions: AdaptiveQuestion[];
  oversightVariants: AdaptiveOversightVariant[];
};

export type AdaptiveGatewayAnswers = Record<string, string | undefined>;
export type AdaptiveControlResponses = Record<string, { responseState: 'maturity' | 'unknown'; responseValue: number | null }>;

export type ResolvedNodeState = 'active' | 'excluded' | 'redirected' | 'profile-only' | 'invalidated';
export type ApplicabilityState = 'activity_exists_internal' | 'activity_outsourced' | 'activity_shared_service' | 'activity_absent' | 'unknown';

export type ResolvedAdaptiveNode = {
  nodeId: string;
  kind: 'gateway' | 'control' | 'oversight';
  domainCode: string | null;
  prompt: string;
  controlObjective: string | null;
  weight: number;
  isCritical: boolean;
  isHardGate: boolean;
  state: ResolvedNodeState;
  applicabilityState: ApplicabilityState;
  findingClass: string | null;
  recommendationClass: string | null;
  skipReason: string | null;
  redirectTo: string | null;
  replacementFor: string | null;
  evidenceReference: string | null;
  guidance?: { goodEvidenceLooksLike: string; exampleArtifacts: string[]; likelyEvidenceOwner: string } | null;
  response?: { responseState: 'maturity' | 'unknown'; responseValue: number | null } | null;
};

export type AdaptiveResolvedPath = {
  graphVersion: string;
  graphFingerprint: string;
  nodes: ResolvedAdaptiveNode[];
  activeNodes: ResolvedAdaptiveNode[];
  currentNextNode: string | null;
  currentPreviousNode: string | null;
  domainBoundaries: Array<{ domainCode: string; name: string; activeCount: number; completedCount: number; activeWeight: number; completedWeight: number }>;
  activePathCount: number;
  activePathWeight: number;
  excludedCount: number;
  excludedWeight: number;
  redirectedCount: number;
  redirectedWeight: number;
  unansweredApplicableCount: number;
  completedApplicableCount: number;
  profileOnlyNodes: string[];
};

export type AdaptiveIntegritySignal = { signalId: string; detail: Record<string, unknown>; blocking: boolean };

const PROFILE_GATEWAYS = ['G01', 'G02', 'G03', 'G08', 'G09'];
const GATEWAY_BLOCKS: Record<string, string[]> = {
  D2: ['G13'],
  D3: ['G05', 'G06', 'G10', 'G11', 'G12'],
  D7: ['G04', 'G07', 'G14']
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownGatewayValue(graph: AdaptiveGraph, questionId: string, value: string): boolean {
  const gateway = graph.gateways.find((item) => item.questionId === questionId);
  return Boolean(gateway?.responseOptions.some((option) => option.value === value));
}

export function evaluateAdaptiveCondition(condition: AdaptiveCondition, answers: AdaptiveGatewayAnswers): boolean {
  if (condition === null) return true;
  if (!isRecord(condition)) return false;
  if ('all' in condition) return Array.isArray(condition.all) && condition.all.every((item) => evaluateAdaptiveCondition(item as AdaptiveCondition, answers));
  if ('any' in condition) return Array.isArray(condition.any) && condition.any.some((item) => evaluateAdaptiveCondition(item as AdaptiveCondition, answers));
  if ('not' in condition) return evaluateAdaptiveCondition(condition.not as AdaptiveCondition, answers) === false;
  if (typeof condition.questionId !== 'string') return false;
  const value = answers[condition.questionId];
  if (!value) return false;
  if (typeof condition.equals === 'string') return value === condition.equals;
  if (Array.isArray(condition.in)) return condition.in.includes(value);
  return false;
}

export function validateAdaptiveGraph(graph: AdaptiveGraph, expectedFingerprint = PREVIEW_ADAPTIVE_GRAPH_FINGERPRINT): string[] {
  const errors: string[] = [];
  const gatewayIds = new Set(graph.gateways.map((gateway) => gateway.questionId));
  const nodeIds = new Set([...graph.questions.map((question) => question.questionId), ...graph.oversightVariants.map((variant) => variant.questionId)]);
  const visitCondition = (condition: AdaptiveCondition, path: string) => {
    if (condition === null) return;
    if (!isRecord(condition)) { errors.push(`${path}:malformed`); return; }
    if ('all' in condition || 'any' in condition) {
      const values = 'all' in condition ? condition.all : condition.any;
      if (!Array.isArray(values)) errors.push(`${path}:array_required`);
      else values.forEach((item, index) => visitCondition(item as AdaptiveCondition, `${path}.${index}`));
      return;
    }
    if ('not' in condition) { visitCondition(condition.not as AdaptiveCondition, `${path}.not`); return; }
    if (typeof condition.questionId !== 'string' || !gatewayIds.has(condition.questionId)) errors.push(`${path}:unknown_gateway`);
  };

  if (graph.graphFingerprint !== expectedFingerprint) errors.push('graph_fingerprint_mismatch');
  if (!graph.graphVersion || graph.status === 'retired') errors.push('graph_invalid_status');
  for (const question of graph.questions) {
    visitCondition(question.applicabilityCondition, `${question.questionId}.applicability`);
    if (question.redirectWhen) {
      visitCondition(question.redirectWhen.condition, `${question.questionId}.redirect`);
      if (!nodeIds.has(question.redirectWhen.redirectTo)) errors.push(`${question.questionId}:unresolved_redirect`);
    }
  }
  const seen = new Set<string>();
  for (const gateway of graph.gateways) {
    if (seen.has(gateway.questionId)) errors.push(`${gateway.questionId}:duplicate_gateway`);
    seen.add(gateway.questionId);
  }
  return errors;
}

function activityState(question: AdaptiveQuestion | AdaptiveOversightVariant, answers: AdaptiveGatewayAnswers): ApplicabilityState {
  const values = Object.values(answers);
  if (values.includes('outsourced')) return 'activity_outsourced';
  if (values.includes('shared_service')) return 'activity_shared_service';
  if (values.includes('unknown')) return 'unknown';
  return question.questionId.startsWith('OV-') ? 'activity_outsourced' : 'activity_exists_internal';
}

function isControlAnswered(node: ResolvedAdaptiveNode): boolean {
  return node.state === 'active' && Boolean(node.response) && (
    node.response?.responseState === 'unknown'
    || (node.response?.responseState === 'maturity' && Number.isInteger(node.response.responseValue))
  );
}

function orderedGatewayIds(graph: AdaptiveGraph): string[] {
  const all = graph.gateways.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((gateway) => gateway.questionId);
  const blocks = Object.values(GATEWAY_BLOCKS).flat();
  return [...PROFILE_GATEWAYS, ...all.filter((id) => !PROFILE_GATEWAYS.includes(id) && !blocks.includes(id))];
}

export function resolveAdaptivePath(input: {
  graph: AdaptiveGraph;
  gatewayAnswers?: AdaptiveGatewayAnswers;
  controlResponses?: AdaptiveControlResponses;
  guidanceByQuestion?: Record<string, { goodEvidenceLooksLike: string; exampleArtifacts: string[]; likelyEvidenceOwner: string }>;
}): AdaptiveResolvedPath {
  const { graph } = input;
  const gatewayAnswers = input.gatewayAnswers ?? {};
  const controlResponses = input.controlResponses ?? {};
  const nodes: ResolvedAdaptiveNode[] = [];
  const gatewayById = new Map(graph.gateways.map((gateway) => [gateway.questionId, gateway]));
  const questionById = new Map(graph.questions.map((question) => [question.questionId, question]));
  const variantById = new Map(graph.oversightVariants.map((variant) => [variant.questionId, variant]));

  const pushGateway = (id: string) => {
    const gateway = gatewayById.get(id);
    if (!gateway) return;
    const answered = Boolean(gatewayAnswers[id]);
    nodes.push({
      nodeId: id, kind: 'gateway', domainCode: null, prompt: gateway.prompt, controlObjective: null, weight: 0,
      isCritical: false, isHardGate: false, state: answered ? 'profile-only' : 'active',
      applicabilityState: answered ? activityState({ questionId: id } as AdaptiveQuestion, gatewayAnswers) : 'unknown',
      findingClass: 'profile_only', recommendationClass: null, skipReason: null, redirectTo: null,
      replacementFor: null, evidenceReference: null, response: answered ? { responseState: 'maturity', responseValue: null } : null
    });
  };

  for (const id of orderedGatewayIds(graph)) pushGateway(id);
  const questionsByDomain = new Map<string, AdaptiveQuestion[]>();
  for (const question of graph.questions.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = questionsByDomain.get(question.domainCode) ?? [];
    list.push(question); questionsByDomain.set(question.domainCode, list);
  }
  const variantsByReplacement = new Map<string, AdaptiveOversightVariant>();
  for (const variant of graph.oversightVariants) if (variant.replaces) variantsByReplacement.set(variant.replaces, variant);

  const pushDomain = (domainCode: string) => {
    for (const question of questionsByDomain.get(domainCode) ?? []) {
      const redirect = question.redirectWhen && evaluateAdaptiveCondition(question.redirectWhen.condition, gatewayAnswers);
      const applicable = question.applicabilityCondition === null || evaluateAdaptiveCondition(question.applicabilityCondition, gatewayAnswers);
      const response = controlResponses[question.questionId] ?? null;
      if (redirect && question.redirectWhen) {
        nodes.push({ nodeId: question.questionId, kind: 'control', domainCode, prompt: question.prompt, controlObjective: question.controlObjective, weight: question.weight,
          isCritical: question.isCritical, isHardGate: question.isHardGate, state: 'redirected', applicabilityState: activityState(question, gatewayAnswers),
          findingClass: 'redirected', recommendationClass: 'retained_oversight', skipReason: 'redirected_to_oversight', redirectTo: question.redirectWhen?.redirectTo ?? null,
          replacementFor: null, evidenceReference: question.evidenceReference, guidance: input.guidanceByQuestion?.[question.questionId] ?? null, response: null });
        const variant = variantById.get(question.redirectWhen.redirectTo) ?? variantsByReplacement.get(question.questionId);
        if (variant) nodes.push({ nodeId: variant.questionId, kind: 'oversight', domainCode: variant.domainCode, prompt: variant.prompt, controlObjective: null, weight: question.weight,
          isCritical: question.isCritical, isHardGate: question.isHardGate, state: 'active', applicabilityState: 'activity_outsourced', findingClass: 'retained_oversight',
          recommendationClass: 'retained_oversight', skipReason: null, redirectTo: null, replacementFor: question.questionId, evidenceReference: question.evidenceReference,
          guidance: input.guidanceByQuestion?.[question.questionId] ?? null, response: controlResponses[variant.questionId] ?? null });
        continue;
      }
      nodes.push({ nodeId: question.questionId, kind: 'control', domainCode, prompt: question.prompt, controlObjective: question.controlObjective, weight: question.weight,
        isCritical: question.isCritical, isHardGate: question.isHardGate, state: applicable ? 'active' : 'excluded',
        applicabilityState: applicable ? activityState(question, gatewayAnswers) : 'activity_absent', findingClass: applicable ? 'active_control' : 'excluded',
        recommendationClass: applicable ? null : 'not_in_scope', skipReason: applicable ? null : question.skipReasonCode, redirectTo: null, replacementFor: null,
        evidenceReference: question.evidenceReference, guidance: input.guidanceByQuestion?.[question.questionId] ?? null, response: applicable ? response : null });
    }
  };

  const domains = graph.domains.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  for (const domain of domains) {
    for (const gatewayId of GATEWAY_BLOCKS[domain.domainCode] ?? []) pushGateway(gatewayId);
    pushDomain(domain.domainCode);
  }

  const activeNodes = nodes.filter((node) => node.state === 'active');
  const controlActive = activeNodes.filter((node) => node.kind !== 'gateway');
  const completedApplicableCount = controlActive.filter(isControlAnswered).length;
  const unansweredApplicableCount = controlActive.filter((node) => !isControlAnswered(node)).length;
  const currentNextNode = nodes.find((node) => node.state === 'active' && ((node.kind === 'gateway' && !gatewayAnswers[node.nodeId]) || (node.kind !== 'gateway' && !isControlAnswered(node))))?.nodeId ?? null;
  const currentIndex = currentNextNode ? nodes.findIndex((node) => node.nodeId === currentNextNode) : nodes.length;
  const currentPreviousNode = [...nodes.slice(0, currentIndex)].reverse().find((node) =>
    node.kind === 'gateway'
      ? Boolean(gatewayAnswers[node.nodeId])
      : node.state === 'active' && isControlAnswered(node)
  )?.nodeId ?? null;
  const domainBoundaries = domains.map((domain) => {
    const domainNodes = controlActive.filter((node) => node.domainCode === domain.domainCode);
    return { domainCode: domain.domainCode, name: domain.name, activeCount: domainNodes.length, completedCount: domainNodes.filter(isControlAnswered).length,
      activeWeight: domainNodes.reduce((sum, node) => sum + node.weight, 0), completedWeight: domainNodes.filter(isControlAnswered).reduce((sum, node) => sum + node.weight, 0) };
  });
  return {
    graphVersion: graph.graphVersion, graphFingerprint: graph.graphFingerprint, nodes, activeNodes, currentNextNode, currentPreviousNode, domainBoundaries,
    activePathCount: controlActive.length, activePathWeight: controlActive.reduce((sum, node) => sum + node.weight, 0),
    excludedCount: nodes.filter((node) => node.state === 'excluded').length, excludedWeight: nodes.filter((node) => node.state === 'excluded').reduce((sum, node) => sum + node.weight, 0),
    redirectedCount: nodes.filter((node) => node.state === 'redirected').length, redirectedWeight: nodes.filter((node) => node.state === 'redirected').reduce((sum, node) => sum + node.weight, 0),
    unansweredApplicableCount, completedApplicableCount, profileOnlyNodes: nodes.filter((node) => node.state === 'profile-only').map((node) => node.nodeId)
  };
}

export function previewGatewayChange(input: { graph: AdaptiveGraph; currentAnswers: AdaptiveGatewayAnswers; nextAnswers: AdaptiveGatewayAnswers; controlResponses: AdaptiveControlResponses }) {
  const before = resolveAdaptivePath({ graph: input.graph, gatewayAnswers: input.currentAnswers, controlResponses: input.controlResponses });
  const after = resolveAdaptivePath({ graph: input.graph, gatewayAnswers: input.nextAnswers, controlResponses: input.controlResponses });
  const afterActiveIds = new Set(after.activeNodes.filter((node) => node.kind !== 'gateway').map((node) => node.nodeId));
  const affected = before.activeNodes.filter((node) => node.kind !== 'gateway' && isControlAnswered(node) && !afterActiveIds.has(node.nodeId)).map((node) => node.nodeId);
  return { before, after, affectedQuestionIds: affected, requiresConfirmation: affected.length > 0 };
}

export function deriveAdaptiveIntegritySignals(input: { graph: AdaptiveGraph; path: AdaptiveResolvedPath; navigation: { currentQuestionId: string | null; currentScreen: string }; gatewayAnswers: AdaptiveGatewayAnswers }): AdaptiveIntegritySignal[] {
  const signals: AdaptiveIntegritySignal[] = [];
  if (input.graph.graphFingerprint !== PREVIEW_ADAPTIVE_GRAPH_FINGERPRINT) signals.push({ signalId: 'graph_mismatch', detail: { expected: PREVIEW_ADAPTIVE_GRAPH_FINGERPRINT, actual: input.graph.graphFingerprint }, blocking: true });
  if (input.path.currentNextNode && !input.path.nodes.some((node) => node.nodeId === input.path.currentNextNode)) signals.push({ signalId: 'path_accounting_mismatch', detail: {}, blocking: true });
  if (input.navigation.currentQuestionId && !input.path.nodes.some((node) => node.nodeId === input.navigation.currentQuestionId)) signals.push({ signalId: 'stale_navigation_state', detail: { currentQuestionId: input.navigation.currentQuestionId }, blocking: true });
  if (input.path.unansweredApplicableCount > 0) signals.push({ signalId: 'incomplete_applicable_controls', detail: { count: input.path.unansweredApplicableCount }, blocking: true });
  const unknownCount = input.path.activeNodes.filter((node) => node.kind !== 'gateway' && node.response?.responseState === 'unknown').length;
  if (input.path.activePathCount > 0 && unknownCount / input.path.activePathCount >= 0.3) signals.push({ signalId: 'high_unknown_share', detail: { unknownCount, activePathCount: input.path.activePathCount }, blocking: false });
  if (input.path.redirectedCount > 0) signals.push({ signalId: 'material_redirected_scope', detail: { count: input.path.redirectedCount, weight: input.path.redirectedWeight }, blocking: false });
  for (const domain of input.path.domainBoundaries) if (domain.activeCount === 0) signals.push({ signalId: 'whole_domain_exclusion', detail: { domainCode: domain.domainCode }, blocking: false });
  for (const node of input.path.nodes) if (node.state === 'excluded' && node.isCritical) signals.push({ signalId: 'excluded_critical_control', detail: { questionId: node.nodeId }, blocking: false });
  for (const node of input.path.nodes) if (node.state === 'excluded' && node.isHardGate) signals.push({ signalId: 'excluded_hard_gate_control', detail: { questionId: node.nodeId }, blocking: false });
  return signals;
}

export function profileRowsForPath(path: AdaptiveResolvedPath) {
  return path.nodes.map((node) => ({
    question_id: node.nodeId,
    applicability_state: node.applicabilityState,
    finding_class: node.findingClass,
    recommendation_class: node.recommendationClass,
    scoring_weight: node.weight,
    included_in_denominator: node.state === 'active',
    excluded_from_denominator_rule: node.state === 'excluded' ? node.skipReason : null,
    skip_reason: node.skipReason,
    control_visibility_state: node.state === 'redirected' ? 'redirected' : node.state === 'excluded' ? 'skipped' : 'visible',
    redirected_question_id: node.redirectTo,
    replacement_question_id: node.replacementFor
  }));
}
