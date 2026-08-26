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

export function configuredSupabaseProjectRef() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

export function assertAdaptivePreviewEnvironment() {
  const environment = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (environment !== 'preview') throw new Error('adaptive_preview_only');
  const projectRef = configuredSupabaseProjectRef();
  if (!projectRef) throw new Error('adaptive_supabase_project_unresolved');
  return { environment, projectRef };
}

async function loadAdaptiveActivationPolicy(db: any) {
  const runtime = assertAdaptivePreviewEnvironment();
  const { data, error } = await db.from('adaptive_activation_policies')
    .select('policy_key,environment,supabase_project,graph_version,graph_fingerprint,enabled,activation_sha')
    .eq('policy_key', 'customer_start').maybeSingle();
  if (error) throw error;
  if (!data
    || data.enabled !== true
    || data.environment !== runtime.environment
    || data.supabase_project !== runtime.projectRef
    || typeof data.graph_version !== 'string'
    || data.graph_version.trim() === ''
    || typeof data.graph_fingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(data.graph_fingerprint)
    || typeof data.activation_sha !== 'string'
    || !/^[0-9a-f]{40}$/.test(data.activation_sha)) {
    throw new Error('adaptive_activation_disabled');
  }
  return data;
}

export async function assertAdaptiveActivationForDb(db: any) {
  return await loadAdaptiveActivationPolicy(db);
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

export async function loadConfiguredAdaptiveGraph() {
  const db = createSupabaseServiceClient() as any;
  const activation = await loadAdaptiveActivationPolicy(db);
  const configuredVersion = process.env.MK_ADAPTIVE_GRAPH_VERSION?.trim() || activation.graph_version;
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

async function loadAdaptiveByToken(assessmentReference: string, rawToken: string) {
  const db = createSupabaseServiceClient() as any;
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
  const [{ data: organisation }, { data: respondent }] = await Promise.all([
    db.from('organisations').select('id,legal_name,trading_name,industry,sector,country,province,employee_band,annual_revenue_band').eq('id', assessment.organisation_id).maybeSingle(),
    assessment.primary_respondent_id ? db.from('respondents').select('id,full_name,email,role_title').eq('id', assessment.primary_respondent_id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  return { db, assessment: assessment as AdaptiveAssessment, organisation, respondent, activation };
}

async function loadState(db: any, assessment: AdaptiveAssessment, activation: any) {
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
  if (graphRow.status !== 'published'
    || graphRow.graph_version !== activation.graph_version
    || graphRow.graph_fingerprint !== activation.graph_fingerprint
    || graphRow.graph_version !== assessment.graph_version_snapshot
    || graphRow.graph_fingerprint !== assessment.graph_fingerprint_snapshot
    || graphRow.methodology_version_id !== assessment.methodology_version_id) {
    throw new Error('adaptive_graph_binding_invalid');
  }
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

export async function saveAdaptiveAssessmentState(input: {
  assessmentReference: string;
  token: string;
  expectedSaveSequence: number;
  currentScreen: 'gateway' | 'question' | 'review' | 'complete';
  currentQuestionId: string | null;
  visitedQuestionIds: string[];
  gatewayAnswers: AdaptiveGatewayAnswers;
  controlResponses: AdaptiveControlResponses;
  confirmGatewayChange?: boolean;
}) {
  const access = await loadAdaptiveByToken(input.assessmentReference, input.token);
  if (access.assessment.status !== 'draft' || access.assessment.locked_at || access.assessment.submitted_at) return { ok: false as const, status: 409, errors: ['adaptive_assessment_locked'] };
  const current = await loadState(access.db, access.assessment, access.activation);
  const graph = current.graph;
  for (const gateway of graph.gateways) if (input.gatewayAnswers[gateway.questionId] && !gateway.responseOptions.some((option) => option.value === input.gatewayAnswers[gateway.questionId])) return { ok: false as const, status: 400, errors: [`Invalid response for ${gateway.questionId}.`] };
  for (const [questionId, response] of Object.entries(input.controlResponses)) {
    if (response.responseState === 'unknown' && response.responseValue !== null) return { ok: false as const, status: 400, errors: [`Unknown response for ${questionId} must not include a maturity value.`] };
    if (response.responseState === 'maturity' && (!Number.isInteger(response.responseValue) || response.responseValue! < 0 || response.responseValue! > 5)) return { ok: false as const, status: 400, errors: [`Invalid maturity response for ${questionId}.`] };
  }
  const gatewayChanged = graph.gateways.some((gateway) => current.gatewayAnswers[gateway.questionId] !== input.gatewayAnswers[gateway.questionId]);
  const change = gatewayChanged ? previewGatewayChange({ graph, currentAnswers: current.gatewayAnswers, nextAnswers: input.gatewayAnswers, controlResponses: current.controlResponses }) : null;
  if (change?.requiresConfirmation && !input.confirmGatewayChange) return { ok: false as const, status: 409, reason: 'gateway_change_confirmation_required' as const, affectedQuestionIds: change.affectedQuestionIds, pathAfter: change.after };
  const history = (change?.affectedQuestionIds ?? []).map((questionId) => ({ question_id: questionId, event_type: 'invalidation', previous_answer: current.controlResponses[questionId] ?? null, upstream_cause_question_id: graph.gateways.find((gateway) => current.gatewayAnswers[gateway.questionId] !== input.gatewayAnswers[gateway.questionId])?.questionId ?? null, reason_code: 'gateway_scope_changed' }));
  const invalidateQuestionIds = input.confirmGatewayChange ? (change?.affectedQuestionIds ?? []) : [];
  const { data, error } = await access.db.rpc('adaptive_save_state', {
    p_assessment_id: access.assessment.id, p_expected_save_sequence: input.expectedSaveSequence, p_current_screen: input.currentScreen,
    p_current_question_id: input.currentQuestionId, p_visited_question_ids: input.visitedQuestionIds,
    p_gateway_answers: Object.entries(input.gatewayAnswers).filter(([, value]) => value).map(([question_id, response_value]) => ({ question_id, response_value })),
    p_control_responses: Object.entries(input.controlResponses).map(([question_id, response]) => ({ question_id, response_state: response.responseState, response_value: response.responseValue })),
    p_invalidate_question_ids: invalidateQuestionIds, p_history: history
  });
  if (error) return { ok: false as const, status: 500, errors: [error.message] };
  if (data?.conflict) return { ok: false as const, status: 409, reason: 'save_conflict' as const, recovery: data };
  const updated = await getAdaptiveAssessmentState(input.assessmentReference, input.token);
  return { ok: true as const, state: updated.publicState, invalidatedQuestionIds: invalidateQuestionIds };
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
  const missingGateways = current.graph.gateways.filter((gateway) => !current.gatewayAnswers[gateway.questionId]).map((gateway) => gateway.questionId);
  const signals = deriveAdaptiveIntegritySignals({ graph: current.graph, path: current.path, navigation: current.navigation, gatewayAnswers: current.gatewayAnswers });
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
