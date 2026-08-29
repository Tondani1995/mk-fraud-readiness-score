import { createAssessmentReference } from '@/lib/respondent/reference';
import { createResumeTokenPayload } from '@/lib/respondent/tokens';
import { hashAssessmentToken } from '@/lib/security/hash';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { parseStartAssessmentInput, type StartAssessmentInput } from '@/lib/respondent/validation';
import {
  deriveAdaptiveIntegritySignals,
  previewGatewayChange,
  profileRowsForPath,
  resolveAdaptivePath,
  validateAdaptiveGraph,
  type AdaptiveControlResponses,
  type AdaptiveGatewayAnswers,
  type AdaptiveGraph
} from '@/lib/adaptive/engine';

type AdaptiveAssessment = {
  id: string;
  assessment_reference: string;
  organisation_id: string;
  primary_respondent_id: string | null;
  methodology_version_id: string;
  status: string;
  assessment_mode: string;
  current_score_run_id: string | null;
  graph_version_id: string;
  graph_version_snapshot: string;
  graph_fingerprint_snapshot: string;
  submitted_at: string | null;
  locked_at: string | null;
};

type AdaptiveNavigation = {
  graph_version_id: string;
  current_question_id: string | null;
  visited_question_ids: string[];
  current_screen: string;
  save_sequence: number;
  last_saved_at: string | null;
  submitted_at: string | null;
};

type AdaptiveLoadedState = {
  graph: AdaptiveGraph;
  gatewayAnswers: AdaptiveGatewayAnswers;
  controlResponses: AdaptiveControlResponses;
  guidanceByQuestion: Record<string, { goodEvidenceLooksLike: string; exampleArtifacts: string[]; likelyEvidenceOwner: string }>;
  navigation: AdaptiveNavigation;
  path: ReturnType<typeof resolveAdaptivePath>;
  signals: ReturnType<typeof deriveAdaptiveIntegritySignals>;
};

type AdaptiveSaveInput = {
  assessmentReference: string;
  token: string;
  expectedSaveSequence: number;
  currentScreen: 'gateway' | 'question' | 'review' | 'complete';
  currentQuestionId: string | null;
  visitedQuestionIds: string[];
  gatewayAnswers: AdaptiveGatewayAnswers;
  controlResponses: AdaptiveControlResponses;
  confirmGatewayChange?: boolean;
};

export type AdaptiveAnswerDelta = {
  gatewayAnswers: Array<{ question_id: string; response_value: string }>;
  controlResponses: Array<{ question_id: string; response_state: 'maturity' | 'unknown'; response_value: number | null }>;
};

export type AdaptiveAnswerDeltaResult =
  | { ok: true; delta: AdaptiveAnswerDelta }
  | { ok: false; reason: 'adaptive_answer_delta_invalid' | 'adaptive_multiple_answer_deltas' | 'adaptive_answer_delta_missing' };

/**
 * Return the gateways that are currently required by the resolved customer path.
 * Conditional gateways absent from that path are intentionally not submission requirements.
 */
export function requiredAdaptiveGatewayIds(path: ReturnType<typeof resolveAdaptivePath>) {
  return path.nodes
    .filter((node) => node.kind === 'gateway' && node.state === 'active')
    .map((node) => node.nodeId);
}

export function missingAdaptiveGatewayIds(
  path: ReturnType<typeof resolveAdaptivePath>,
  gatewayAnswers: AdaptiveGatewayAnswers
) {
  return requiredAdaptiveGatewayIds(path).filter((questionId) => !effectiveGatewayAnswer(gatewayAnswers[questionId]));
}

const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const DEPLOYMENT_SHA_PATTERN = /^[0-9a-f]{40}$/;

type AdaptiveRuntimeIdentity = {
  environment: 'preview' | 'production';
  projectRef: string;
  deploymentSha: string;
};

export function configuredSupabaseProjectRef(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] && SUPABASE_PROJECT_REF_PATTERN.test(match[1]) ? match[1] : '';
  } catch {
    return '';
  }
}

export function configuredAdaptiveDeploymentSha(env: NodeJS.ProcessEnv = process.env) {
  const deploymentSha = env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? '';
  return DEPLOYMENT_SHA_PATTERN.test(deploymentSha) ? deploymentSha : '';
}

export function assertAdaptiveRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env): AdaptiveRuntimeIdentity {
  const environment = env.VERCEL_ENV?.trim().toLowerCase();
  if (environment !== 'preview' && environment !== 'production') {
    throw new Error('adaptive_runtime_environment_invalid');
  }
  const projectRef = configuredSupabaseProjectRef(env);
  if (!projectRef) throw new Error('adaptive_runtime_project_unresolved');
  const deploymentSha = configuredAdaptiveDeploymentSha(env);
  if (!deploymentSha) throw new Error('adaptive_deployment_sha_invalid');
  return { environment, projectRef, deploymentSha };
}

async function loadAdaptiveActivationPolicy(db: any, env: NodeJS.ProcessEnv = process.env) {
  const runtime = assertAdaptiveRuntimeEnvironment(env);
  const { data, error } = await db.from('adaptive_activation_policies')
    .select('policy_key,environment,supabase_project,graph_version,graph_fingerprint,enabled,activation_sha')
    .eq('policy_key', 'customer_start').maybeSingle();
  if (error) throw error;
  if (!data || data.enabled !== true) throw new Error('adaptive_activation_disabled');
  if (data.environment !== runtime.environment) throw new Error('adaptive_activation_environment_mismatch');
  if (data.supabase_project !== runtime.projectRef) throw new Error('adaptive_activation_project_mismatch');
  if (typeof data.graph_version !== 'string' || data.graph_version.trim() === '') {
    throw new Error('adaptive_activation_graph_version_invalid');
  }
  if (typeof data.graph_fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(data.graph_fingerprint)) {
    throw new Error('adaptive_activation_graph_fingerprint_invalid');
  }
  if (typeof data.activation_sha !== 'string' || !DEPLOYMENT_SHA_PATTERN.test(data.activation_sha)) {
    throw new Error('adaptive_activation_sha_invalid');
  }
  if (data.activation_sha.toLowerCase() !== runtime.deploymentSha) {
    throw new Error('adaptive_activation_sha_mismatch');
  }
  return data;
}

export async function assertAdaptiveActivationForDb(db: any, env: NodeJS.ProcessEnv = process.env) {
  return await loadAdaptiveActivationPolicy(db, env);
}

function asGraph(value: unknown): AdaptiveGraph {
  if (!value || typeof value !== 'object') throw new Error('adaptive_graph_invalid_json');
  return value as AdaptiveGraph;
}

function assertGraphIdentity(graph: AdaptiveGraph, row: {
  graph_version: string;
  methodology_version: string;
  graph_fingerprint: string;
}) {
  if (graph.graphVersion !== row.graph_version
    || graph.methodologyVersion !== row.methodology_version
    || graph.graphFingerprint !== row.graph_fingerprint) {
    throw new Error('adaptive_graph_identity_mismatch');
  }
}

export async function loadConfiguredAdaptiveGraph(
  db: any = createSupabaseServiceClient() as any,
  env: NodeJS.ProcessEnv = process.env
) {
  const activation = await loadAdaptiveActivationPolicy(db, env);
  const configuredVersion = env.MK_ADAPTIVE_GRAPH_VERSION?.trim() || activation.graph_version;
  const { data, error } = await db
    .from('adaptive_graph_versions')
    .select('id,graph_version,methodology_version_id,methodology_version,status,compiled_graph_json,graph_fingerprint')
    .eq('graph_version', configuredVersion)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('adaptive_graph_not_found');
  if (data.status === 'retired') throw new Error('adaptive_graph_retired');
  if (data.status !== 'published') throw new Error('adaptive_graph_not_published');
  if (data.graph_fingerprint !== activation.graph_fingerprint) throw new Error('adaptive_graph_fingerprint_mismatch');
  const graph = asGraph(data.compiled_graph_json);
  assertGraphIdentity(graph, data);
  const validationErrors = validateAdaptiveGraph(graph, data.graph_fingerprint);
  if (validationErrors.length) throw new Error(`adaptive_graph_invalid:${validationErrors.join(',')}`);
  if (activation.graph_version !== data.graph_version || activation.graph_fingerprint !== data.graph_fingerprint) throw new Error('adaptive_activation_graph_mismatch');
  return { graph, graphRow: data, activation };
}

export function assertAdaptiveAssessmentBinding(
  assessment: Pick<AdaptiveAssessment, 'methodology_version_id' | 'graph_version_snapshot' | 'graph_fingerprint_snapshot'>,
  graphRow: {
    status: string;
    graph_version: string;
    graph_fingerprint: string;
    methodology_version_id: string;
  },
  activation: { graph_version: string; graph_fingerprint: string }
) {
  if (graphRow.status !== 'published'
    || graphRow.graph_version !== activation.graph_version
    || graphRow.graph_fingerprint !== activation.graph_fingerprint
    || graphRow.graph_version !== assessment.graph_version_snapshot
    || graphRow.graph_fingerprint !== assessment.graph_fingerprint_snapshot
    || graphRow.methodology_version_id !== assessment.methodology_version_id) {
    throw new Error('adaptive_graph_binding_invalid');
  }
}

async function loadAdaptiveByToken(
  assessmentReference: string,
  rawToken: string,
  options: { db?: any; includeIdentity?: boolean } = {}
) {
  const db = options.db ?? (createSupabaseServiceClient() as any);
  const tokenHash = hashAssessmentToken(rawToken);
  const { data: token, error: tokenError } = await db.from('assessment_tokens')
    .select('id,assessment_id,token_type,expires_at,max_uses,use_count,revoked_at')
    .eq('token_hash', tokenHash).eq('token_type', 'resume').maybeSingle();
  if (tokenError || !token) throw new Error('adaptive_invalid_token');
  if (token.revoked_at) throw new Error('adaptive_revoked_token');
  if (new Date(token.expires_at).getTime() <= Date.now()) throw new Error('adaptive_expired_token');
  if (token.use_count >= token.max_uses) throw new Error('adaptive_token_use_limit_reached');

  const activation = await loadAdaptiveActivationPolicy(db);

  const { data: assessment, error: assessmentError } = await db.from('assessments')
    .select('id,assessment_reference,organisation_id,primary_respondent_id,methodology_version_id,status,assessment_mode,current_score_run_id,graph_version_id,graph_version_snapshot,graph_fingerprint_snapshot,submitted_at,locked_at')
    .eq('id', token.assessment_id).eq('assessment_reference', assessmentReference).maybeSingle();
  if (assessmentError || !assessment) throw new Error('adaptive_assessment_not_found');
  if (assessment.assessment_mode !== 'adaptive') throw new Error('adaptive_mode_required');
  if (!assessment.graph_version_id
    || assessment.graph_version_snapshot !== activation.graph_version
    || assessment.graph_fingerprint_snapshot !== activation.graph_fingerprint) throw new Error('adaptive_graph_pin_invalid');
  let organisation = null;
  let respondent = null;
  if (options.includeIdentity !== false) {
    [{ data: organisation }, { data: respondent }] = await Promise.all([
      db.from('organisations').select('id,legal_name,trading_name,industry,sector,country,province,employee_band,annual_revenue_band').eq('id', assessment.organisation_id).maybeSingle(),
      assessment.primary_respondent_id ? db.from('respondents').select('id,full_name,email,role_title').eq('id', assessment.primary_respondent_id).maybeSingle() : Promise.resolve({ data: null })
    ]);
  }
  return { db, assessment: assessment as AdaptiveAssessment, organisation, respondent, activation };
}

async function loadState(db: any, assessment: AdaptiveAssessment, activation: any): Promise<AdaptiveLoadedState> {
  const [{ data: graphRow, error: graphError }, { data: navigation, error: navigationError }, { data: gatewayRows, error: gatewayError }, { data: controlRows, error: controlError }, { data: guidanceRows, error: guidanceError }] = await Promise.all([
    db.from('adaptive_graph_versions').select('compiled_graph_json,graph_version,graph_fingerprint,methodology_version_id,methodology_version,status').eq('id', assessment.graph_version_id).single(),
    db.from('assessment_navigation_states').select('graph_version_id,current_question_id,visited_question_ids,current_screen,save_sequence,last_saved_at,submitted_at').eq('assessment_id', assessment.id).single(),
    db.from('adaptive_gateway_answers').select('question_id,response_value').eq('assessment_id', assessment.id).eq('graph_version_id', assessment.graph_version_id),
    db.from('adaptive_control_responses').select('question_id,response_state,response_value').eq('assessment_id', assessment.id).eq('graph_version_id', assessment.graph_version_id),
    db.from('assessment_evidence_guidance').select('question_code,good_evidence_looks_like,example_artifacts,likely_evidence_owner').eq('graph_version_id', assessment.graph_version_id).eq('status', 'draft')
  ]);
  if (graphError) throw graphError;
  if (navigationError) throw navigationError;
  if (gatewayError) throw gatewayError;
  if (controlError) throw controlError;
  if (guidanceError) throw guidanceError;
  assertAdaptiveAssessmentBinding(assessment, graphRow, activation);
  const graph = asGraph(graphRow.compiled_graph_json);
  assertGraphIdentity(graph, graphRow);
  const graphValidationErrors = validateAdaptiveGraph(graph, graphRow.graph_fingerprint);
  if (graphValidationErrors.length) throw new Error(`adaptive_graph_invalid:${graphValidationErrors.join(',')}`);
  const gatewayAnswers: AdaptiveGatewayAnswers = Object.fromEntries((gatewayRows ?? []).map((row: any) => [row.question_id, row.response_value]));
  const controlResponses: AdaptiveControlResponses = Object.fromEntries((controlRows ?? []).map((row: any) => [row.question_id, { responseState: row.response_state, responseValue: row.response_value }]));
  const guidanceByQuestion = Object.fromEntries((guidanceRows ?? []).map((row: any) => [row.question_code, {
    goodEvidenceLooksLike: row.good_evidence_looks_like,
    exampleArtifacts: Array.isArray(row.example_artifacts) ? row.example_artifacts : [],
    likelyEvidenceOwner: row.likely_evidence_owner
  }]));
  const path = resolveAdaptivePath({ graph, gatewayAnswers, controlResponses, guidanceByQuestion });
  const signals = deriveAdaptiveIntegritySignals({ graph, path, navigation: { currentQuestionId: navigation.current_question_id, currentScreen: navigation.current_screen }, gatewayAnswers });
  return { graph, gatewayAnswers, controlResponses, guidanceByQuestion, navigation, path, signals };
}

function effectiveGatewayAnswer(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function gatewayAnswerKeys(answers: AdaptiveGatewayAnswers) {
  return new Set(Object.entries(answers).filter(([, value]) => effectiveGatewayAnswer(value) !== undefined).map(([questionId]) => questionId));
}

function gatewayAnswerDiff(current: AdaptiveGatewayAnswers, next: AdaptiveGatewayAnswers) {
  const keys = new Set([...gatewayAnswerKeys(current), ...gatewayAnswerKeys(next)]);
  return [...keys].filter((questionId) => effectiveGatewayAnswer(current[questionId]) !== effectiveGatewayAnswer(next[questionId]));
}

function controlResponsesEqual(left: AdaptiveControlResponses[string] | undefined, right: AdaptiveControlResponses[string] | undefined) {
  if (!left || !right) return left === right;
  return left.responseState === right.responseState && left.responseValue === right.responseValue;
}

export function deriveAdaptiveAnswerDelta(input: {
  currentGatewayAnswers: AdaptiveGatewayAnswers;
  currentControlResponses: AdaptiveControlResponses;
  nextGatewayAnswers: AdaptiveGatewayAnswers;
  nextControlResponses: AdaptiveControlResponses;
  invalidatedQuestionIds?: string[];
}): AdaptiveAnswerDeltaResult {
  const invalidated = new Set(input.invalidatedQuestionIds ?? []);
  const changedGatewayIds = gatewayAnswerDiff(input.currentGatewayAnswers, input.nextGatewayAnswers);
  if (changedGatewayIds.some((questionId) => effectiveGatewayAnswer(input.nextGatewayAnswers[questionId]) === undefined)) return { ok: false, reason: 'adaptive_answer_delta_invalid' };
  const currentControlIds = Object.keys(input.currentControlResponses);
  const nextControlIds = Object.keys(input.nextControlResponses);
  const controlIds = new Set([...currentControlIds, ...nextControlIds]);
  const changedControlIds: string[] = [];

  for (const questionId of controlIds) {
    const currentHas = Object.prototype.hasOwnProperty.call(input.currentControlResponses, questionId);
    const nextHas = Object.prototype.hasOwnProperty.call(input.nextControlResponses, questionId);
    if (invalidated.has(questionId)) {
      if (currentHas && nextHas && !controlResponsesEqual(input.currentControlResponses[questionId], input.nextControlResponses[questionId])) changedControlIds.push(questionId);
      else if (!currentHas && nextHas) changedControlIds.push(questionId);
      continue;
    }
    if (currentHas && !nextHas) return { ok: false, reason: 'adaptive_answer_delta_invalid' };
    if (!currentHas && nextHas) changedControlIds.push(questionId);
    else if (currentHas && nextHas && !controlResponsesEqual(input.currentControlResponses[questionId], input.nextControlResponses[questionId])) changedControlIds.push(questionId);
  }

  const changedCount = changedGatewayIds.length + changedControlIds.length;
  if (changedCount === 0) return { ok: false, reason: 'adaptive_answer_delta_missing' };
  if (changedCount > 1) return { ok: false, reason: 'adaptive_multiple_answer_deltas' };

  return {
    ok: true,
    delta: {
      gatewayAnswers: changedGatewayIds.map((questionId) => ({ question_id: questionId, response_value: effectiveGatewayAnswer(input.nextGatewayAnswers[questionId])! })),
      controlResponses: changedControlIds.filter((questionId) => !invalidated.has(questionId)).map((questionId) => {
        const response = input.nextControlResponses[questionId];
        return { question_id: questionId, response_state: response.responseState, response_value: response.responseValue };
      })
    }
  };
}

export function buildAdaptivePostSaveState(input: {
  current: AdaptiveLoadedState;
  saveInput: Pick<AdaptiveSaveInput, 'currentScreen' | 'currentQuestionId' | 'visitedQuestionIds'>;
  delta: AdaptiveAnswerDelta;
  invalidatedQuestionIds: string[];
  saveSequence: number;
  savedAt: string | null;
}): AdaptiveLoadedState {
  const gatewayAnswers = { ...input.current.gatewayAnswers };
  for (const answer of input.delta.gatewayAnswers) gatewayAnswers[answer.question_id] = answer.response_value;
  const controlResponses = { ...input.current.controlResponses };
  for (const response of input.delta.controlResponses) controlResponses[response.question_id] = {
    responseState: response.response_state,
    responseValue: response.response_value
  };
  for (const questionId of input.invalidatedQuestionIds) delete controlResponses[questionId];

  const navigation = {
    ...input.current.navigation,
    current_screen: input.saveInput.currentScreen,
    current_question_id: input.saveInput.currentQuestionId,
    visited_question_ids: input.saveInput.visitedQuestionIds,
    save_sequence: input.saveSequence,
    last_saved_at: input.savedAt ?? input.current.navigation.last_saved_at
  };
  const path = resolveAdaptivePath({
    graph: input.current.graph,
    gatewayAnswers,
    controlResponses,
    guidanceByQuestion: input.current.guidanceByQuestion
  });
  const signals = deriveAdaptiveIntegritySignals({
    graph: input.current.graph,
    path,
    navigation: { currentQuestionId: navigation.current_question_id, currentScreen: navigation.current_screen },
    gatewayAnswers
  });
  return { ...input.current, gatewayAnswers, controlResponses, navigation, path, signals };
}

function publicState(input: Awaited<ReturnType<typeof loadState>>) {
  return {
    graphVersion: input.graph.graphVersion,
    graphFingerprint: input.graph.graphFingerprint,
    responseScale: input.graph.responseScale,
    gateways: input.graph.gateways,
    navigation: input.navigation,
    gatewayAnswers: input.gatewayAnswers,
    controlResponses: input.controlResponses,
    path: input.path,
    integritySignals: input.signals,
    organisation: null,
    respondent: null
  };
}

export async function startAdaptiveAssessment(input: StartAssessmentInput, appBaseUrl: string) {
  const { graph, graphRow } = await loadConfiguredAdaptiveGraph();
  const db = createSupabaseServiceClient() as any;
  const created: { organisationId?: string; respondentId?: string; assessmentId?: string } = {};
  try {
    const { data: organisation, error: organisationError } = await db.from('organisations').insert({
      legal_name: input.organisationName, trading_name: input.tradingName ?? null, industry: input.industry ?? null,
      sector: input.sector ?? null, country: 'South Africa', province: input.province ?? null,
      employee_band: input.employeeBand ?? null, annual_revenue_band: input.annualRevenueBand ?? null
    }).select('id,legal_name').single();
    if (organisationError) throw organisationError;
    created.organisationId = organisation.id;
    const { data: respondent, error: respondentError } = await db.from('respondents').insert({
      organisation_id: organisation.id, full_name: input.fullName, email: input.email, role_title: input.roleTitle ?? null,
      phone: input.phone ?? null, consent_privacy: input.consentPrivacy, consent_research: input.consentResearch
    }).select('id,email,full_name').single();
    if (respondentError) throw respondentError;
    created.respondentId = respondent.id;
    const { data: assessment, error: assessmentError } = await db.from('assessments').insert({
      assessment_reference: createAssessmentReference(), organisation_id: organisation.id, primary_respondent_id: respondent.id,
      methodology_version_id: graphRow.methodology_version_id, status: 'draft', assessment_mode: 'adaptive', graph_version_id: graphRow.id,
      graph_version_snapshot: graphRow.graph_version, graph_fingerprint_snapshot: graphRow.graph_fingerprint
    }).select('id,assessment_reference,organisation_id,primary_respondent_id,methodology_version_id,status,assessment_mode,graph_version_id,graph_version_snapshot,graph_fingerprint_snapshot,submitted_at,locked_at').single();
    if (assessmentError) throw assessmentError;
    created.assessmentId = assessment.id;
    const { error: navigationError } = await db.from('assessment_navigation_states').insert({ assessment_id: assessment.id, graph_version_id: graphRow.id, current_screen: 'gateway', current_question_id: graph.gateways[0]?.questionId ?? null });
    if (navigationError) throw navigationError;
    const token = createResumeTokenPayload();
    const { error: tokenError } = await db.from('assessment_tokens').insert({ assessment_id: assessment.id, token_hash: token.tokenHash, token_type: 'resume', expires_at: token.expiresAt, max_uses: 25 });
    if (tokenError) throw tokenError;
    const resumeUrl = new URL(`/score/adaptive/${assessment.assessment_reference}`, appBaseUrl);
    resumeUrl.searchParams.set('token', token.rawToken);
    return { assessmentId: assessment.id, assessmentReference: assessment.assessment_reference, resumeUrl: resumeUrl.toString(), resumeTokenExpiresAt: token.expiresAt, graphVersion: graph.graphVersion, graphFingerprint: graph.graphFingerprint };
  } catch (error) {
    if (created.assessmentId) await db.from('assessments').delete().eq('id', created.assessmentId);
    if (created.respondentId) await db.from('respondents').delete().eq('id', created.respondentId);
    if (created.organisationId) await db.from('organisations').delete().eq('id', created.organisationId);
    throw error;
  }
}

export async function getAdaptiveAssessmentState(assessmentReference: string, token: string) {
  const access = await loadAdaptiveByToken(assessmentReference, token);
  const state = await loadState(access.db, access.assessment, access.activation);
  return { ...state, assessment: access.assessment, organisation: access.organisation, respondent: access.respondent, publicState: { ...publicState(state), organisation: access.organisation, respondent: access.respondent } };
}

export async function saveAdaptiveAssessmentState(input: AdaptiveSaveInput, dependencies: { db?: any } = {}) {
  const access = await loadAdaptiveByToken(input.assessmentReference, input.token, { db: dependencies.db, includeIdentity: false });
  if (access.assessment.status !== 'draft' || access.assessment.locked_at || access.assessment.submitted_at) return { ok: false as const, status: 409, errors: ['adaptive_assessment_locked'] };
  const current = await loadState(access.db, access.assessment, access.activation);
  const graph = current.graph;
  for (const [questionId, value] of Object.entries(input.gatewayAnswers)) {
    if (value === undefined || value === null || value === '') continue;
    const gateway = graph.gateways.find((item) => item.questionId === questionId);
    if (typeof value !== 'string' || !gateway || !gateway.responseOptions.some((option) => option.value === value)) return { ok: false as const, status: 400, errors: [`Invalid response for ${questionId}.`] };
  }
  for (const [questionId, response] of Object.entries(input.controlResponses)) {
    if (!response || typeof response !== 'object') return { ok: false as const, status: 400, errors: [`Invalid response for ${questionId}.`] };
    if (response.responseState === 'unknown' && response.responseValue !== null) return { ok: false as const, status: 400, errors: [`Unknown response for ${questionId} must not include a maturity value.`] };
    if (response.responseState === 'maturity' && (!Number.isInteger(response.responseValue) || response.responseValue! < 0 || response.responseValue! > 5)) return { ok: false as const, status: 400, errors: [`Invalid maturity response for ${questionId}.`] };
  }
  const gatewayChangeCount = gatewayAnswerDiff(current.gatewayAnswers, input.gatewayAnswers).length;
  if (gatewayChangeCount > 1) return { ok: false as const, status: 400, reason: 'adaptive_multiple_answer_deltas' as const, errors: ['adaptive_multiple_answer_deltas'] };
  const gatewayChanged = gatewayChangeCount === 1;
  const change = gatewayChanged ? previewGatewayChange({ graph, currentAnswers: current.gatewayAnswers, nextAnswers: input.gatewayAnswers, controlResponses: current.controlResponses }) : null;
  if (change?.requiresConfirmation && !input.confirmGatewayChange) return { ok: false as const, status: 409, reason: 'gateway_change_confirmation_required' as const, affectedQuestionIds: change.affectedQuestionIds, pathAfter: change.after };
  const history = (change?.affectedQuestionIds ?? []).map((questionId) => ({ question_id: questionId, event_type: 'invalidation', previous_answer: current.controlResponses[questionId] ?? null, upstream_cause_question_id: graph.gateways.find((gateway) => current.gatewayAnswers[gateway.questionId] !== input.gatewayAnswers[gateway.questionId])?.questionId ?? null, reason_code: 'gateway_scope_changed' }));
  const invalidateQuestionIds = input.confirmGatewayChange ? (change?.affectedQuestionIds ?? []) : [];
  const delta = deriveAdaptiveAnswerDelta({
    currentGatewayAnswers: current.gatewayAnswers,
    currentControlResponses: current.controlResponses,
    nextGatewayAnswers: input.gatewayAnswers,
    nextControlResponses: input.controlResponses,
    invalidatedQuestionIds: invalidateQuestionIds
  });
  if (!delta.ok) return { ok: false as const, status: 400, reason: delta.reason, errors: [delta.reason] };
  const { data, error } = await access.db.rpc('adaptive_save_state', {
    p_assessment_id: access.assessment.id, p_expected_save_sequence: input.expectedSaveSequence, p_current_screen: input.currentScreen,
    p_current_question_id: input.currentQuestionId, p_visited_question_ids: input.visitedQuestionIds,
    p_gateway_answers: delta.delta.gatewayAnswers,
    p_control_responses: delta.delta.controlResponses,
    p_invalidate_question_ids: invalidateQuestionIds, p_history: history
  });
  if (error) return { ok: false as const, status: 500, errors: [error.message] };
  const saveResult = Array.isArray(data) ? data[0] : data;
  if (saveResult?.conflict) return { ok: false as const, status: 409, reason: 'save_conflict' as const, recovery: saveResult };
  const saveSequence = Number(saveResult?.save_sequence);
  if (!Number.isSafeInteger(saveSequence) || saveSequence <= current.navigation.save_sequence) return { ok: false as const, status: 500, errors: ['adaptive_save_result_invalid'] };
  const updated = buildAdaptivePostSaveState({
    current,
    saveInput: input,
    delta: delta.delta,
    invalidatedQuestionIds: invalidateQuestionIds,
    saveSequence,
    savedAt: typeof saveResult?.saved_at === 'string' ? saveResult.saved_at : null
  });
  return { ok: true as const, state: { ...publicState(updated), organisation: access.organisation, respondent: access.respondent }, invalidatedQuestionIds: invalidateQuestionIds };
}

export async function submitAdaptiveAssessment(assessmentReference: string, token: string, expectedSaveSequence: number) {
  const access = await loadAdaptiveByToken(assessmentReference, token);
  if (access.assessment.status !== 'draft' || access.assessment.locked_at || access.assessment.submitted_at) {
    if (access.assessment.status === 'submitted' && !access.assessment.current_score_run_id) {
      return { ok: true as const, alreadySubmitted: true, submittedAt: access.assessment.submitted_at, state: (await getAdaptiveAssessmentState(assessmentReference, token)).publicState };
    }
    return { ok: false as const, status: 409, errors: ['adaptive_assessment_locked'] };
  }
  const current = await loadState(access.db, access.assessment, access.activation);
  const missingGateways = missingAdaptiveGatewayIds(current.path, current.gatewayAnswers);
  const signals = deriveAdaptiveIntegritySignals({ graph: current.graph, path: current.path, navigation: { currentQuestionId: current.navigation.current_question_id, currentScreen: current.navigation.current_screen }, gatewayAnswers: current.gatewayAnswers });
  const errors = missingGateways.length ? [`Complete the profile gateways: ${missingGateways.join(', ')}.`] : [];
  if (current.path.unansweredApplicableCount > 0) errors.push(`Complete the remaining applicable controls (${current.path.unansweredApplicableCount}).`);
  if (errors.length || signals.some((signal) => signal.blocking)) return { ok: false as const, status: 400, errors: [...errors, ...signals.filter((signal) => signal.blocking).map((signal) => signal.signalId)], state: { ...publicState(current), organisation: access.organisation, respondent: access.respondent } };
  const rpcSignals = signals.map((signal) => ({
    signal_id: signal.signalId,
    detail: signal.detail,
    blocking: signal.blocking
  }));
  const { data, error } = await access.db.rpc('adaptive_submit_assessment', { p_assessment_id: access.assessment.id, p_expected_save_sequence: expectedSaveSequence, p_profile: profileRowsForPath(current.path), p_signals: rpcSignals });
  if (error) return { ok: false as const, status: 500, errors: [error.message] };
  if (data?.conflict) return { ok: false as const, status: 409, reason: 'save_conflict' as const, recovery: data };
  return { ok: true as const, submittedAt: data?.submitted_at ?? null, state: (await getAdaptiveAssessmentState(assessmentReference, token)).publicState, profileCount: current.path.nodes.length, signalCount: signals.length };
}

export function parseAdaptiveStartInput(body: unknown) {
  return parseStartAssessmentInput(body);
}
