import { getEmailProviderMode } from '@/lib/notifications/email-provider';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { FRAUD_READINESS_TERMS_VERSION, PRIVACY_NOTICE_VERSION } from '@/lib/legal/fraud-readiness-terms';
import { COMMERCIAL_CATALOGUE } from '@/lib/commercial/product-catalogue';
import { isValidGaMeasurementId, isValidDeploymentSha, EXPECTED_PRODUCTION, EXPECTED_PUBLIC_PRODUCTS, EXPECTED_ADVISORY_PRICE_FROM_CENTS, READINESS_REQUIRED_ENVIRONMENT, READINESS_OPTIONAL_MONITOR_ENVIRONMENT, overallStatusFromChecks, type ReadinessCheck, type ReadinessEvaluation, type MonitoringStatus } from './contracts';

type QueryResult = { data: any; error: unknown };

export type ReadinessContext = {
  db?: any;
  env?: NodeJS.ProcessEnv;
  origin?: string | null;
  fetchImpl?: typeof fetch;
  now?: Date;
  heartbeatStaleMinutes?: number;
  failureInjection?: ReadinessFailureInjection;
};

export type ReadinessFailureInjection =
  | 'adaptive_sha_mismatch'
  | 'database_failure'
  | 'public_route_failure'
  | 'stale_heartbeat';

function configuredSupabaseProjectRef(env: NodeJS.ProcessEnv) {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function addCheck(checks: ReadinessCheck[], key: string, category: string, status: MonitoringStatus, safeCode: string) {
  checks.push({ key, category, status, safeCode });
}

function isPresent(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  return Boolean(value && !['replace', 'placeholder', 'your-project', 'example'].some((marker) => value.toLowerCase().includes(marker)));
}

function isProductionEnvironment(env: NodeJS.ProcessEnv) {
  return env.MK_READINESS_EXPECTED_ENVIRONMENT?.trim().toLowerCase() === 'production'
    || env.VERCEL_ENV?.trim().toLowerCase() === 'production';
}

async function querySafely(factory: () => PromiseLike<QueryResult>): Promise<QueryResult> {
  try {
    return await factory();
  } catch {
    return { data: null, error: new Error('query_failed') };
  }
}

function expectedContract(env: NodeJS.ProcessEnv) {
  const production = isProductionEnvironment(env);
  return {
    environment: production ? EXPECTED_PRODUCTION.environment : (env.MK_READINESS_EXPECTED_ENVIRONMENT?.trim().toLowerCase() || env.VERCEL_ENV?.trim().toLowerCase() || 'local'),
    supabaseProjectRef: production ? EXPECTED_PRODUCTION.supabaseProjectRef : (env.MK_EXPECTED_SUPABASE_PROJECT_REF?.trim() || configuredSupabaseProjectRef(env) || ''),
    adaptiveGraphVersion: env.MK_EXPECTED_ADAPTIVE_GRAPH_VERSION?.trim() || EXPECTED_PRODUCTION.adaptiveGraphVersion,
    adaptiveGraphFingerprint: env.MK_EXPECTED_ADAPTIVE_GRAPH_FINGERPRINT?.trim() || EXPECTED_PRODUCTION.adaptiveGraphFingerprint,
    activeMethodologyVersion: env.MK_EXPECTED_ACTIVE_METHODOLOGY_VERSION?.trim() || EXPECTED_PRODUCTION.activeMethodologyVersion
  };
}

async function publicRouteCheck(
  checks: ReadinessCheck[],
  fetchImpl: typeof fetch,
  origin: string,
  path: string,
  key: string,
  category: string,
  predicate?: (body: string, response: Response) => boolean
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL(path, origin).toString();
    const response = await fetchImpl(url, { cache: 'no-store', redirect: 'follow', signal: controller.signal });
    const body = predicate ? await response.text() : '';
    const passed = response.status === 200 && (!predicate || predicate(body, response));
    addCheck(checks, key, category, passed ? 'PASS' : 'FAIL', passed ? 'public_route_ok' : 'public_route_unavailable_or_invalid');
  } catch {
    addCheck(checks, key, category, 'FAIL', 'public_route_unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

async function publicChecks(checks: ReadinessCheck[], context: ReadinessContext, production: boolean) {
  const origin = context.origin?.trim();
  if (!origin) {
    addCheck(checks, 'public_routes', 'public_route', production ? 'FAIL' : 'WARN', 'public_origin_unconfigured');
    return;
  }
  const fetchImpl = context.fetchImpl ?? fetch;
  await Promise.all([
    publicRouteCheck(checks, fetchImpl, origin, '/', 'public_home', 'public_route'),
    publicRouteCheck(checks, fetchImpl, origin, '/score/start', 'public_score_start', 'public_route'),
    publicRouteCheck(checks, fetchImpl, origin, '/fraud-readiness', 'public_fraud_readiness', 'public_route'),
    publicRouteCheck(checks, fetchImpl, origin, '/sitemap.xml', 'sitemap', 'seo', (body) => body.includes('/fraud-readiness') && !body.includes('/fraud-readiness-score')),
    publicRouteCheck(checks, fetchImpl, origin, '/robots.txt', 'robots', 'seo', (body) => body.includes('/sitemap.xml')),
    publicRouteCheck(checks, fetchImpl, origin, '/fraud-readiness-score', 'legacy_canonical', 'seo', (body) => /noindex/i.test(body) && /canonical[^>]+\/fraud-readiness(?:["'])/i.test(body))
  ]);
}

function checkRequiredEnvironment(checks: ReadinessCheck[], env: NodeJS.ProcessEnv, production: boolean) {
  const missing = READINESS_REQUIRED_ENVIRONMENT.filter((key) => key !== 'MK_INTERNAL_NOTIFICATIONS_EMAIL' && !isPresent(env, key));
  const recipientPresent = isPresent(env, 'MK_INTERNAL_NOTIFICATIONS_EMAIL') || isPresent(env, 'MK_INTERNAL_LEADS_EMAIL');
  if (!recipientPresent) missing.push('MK_INTERNAL_NOTIFICATIONS_EMAIL');
  addCheck(checks, 'runtime_environment', 'dependency', missing.length === 0 ? 'PASS' : (production ? 'FAIL' : 'WARN'), missing.length === 0 ? 'required_environment_present' : 'required_environment_missing');

  const missingMonitor = READINESS_OPTIONAL_MONITOR_ENVIRONMENT.filter((key) => !isPresent(env, key));
  addCheck(checks, 'monitoring_configuration', 'dependency', missingMonitor.length === 0 ? 'PASS' : 'WARN', missingMonitor.length === 0 ? 'monitoring_secrets_present' : 'monitoring_external_activation_pending');
}

export async function evaluateProductionReadiness(context: ReadinessContext = {}): Promise<ReadinessEvaluation> {
  const env = context.env ?? process.env;
  const now = context.now ?? new Date();
  const production = isProductionEnvironment(env);
  const contract = expectedContract(env);
  const checks: ReadinessCheck[] = [];
  const deploymentSha = env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() || null;
  const supabaseProjectRef = configuredSupabaseProjectRef(env);

  addCheck(checks, 'deployment_environment', 'release', contract.environment === 'production' && env.VERCEL_ENV === 'production' && isValidDeploymentSha(deploymentSha) ? 'PASS' : production ? 'FAIL' : 'WARN', contract.environment === 'production' ? 'production_environment_bound' : 'non_production_environment');
  addCheck(checks, 'supabase_project_identity', 'dependency', supabaseProjectRef && supabaseProjectRef === contract.supabaseProjectRef ? 'PASS' : production ? 'FAIL' : 'WARN', supabaseProjectRef && supabaseProjectRef === contract.supabaseProjectRef ? 'supabase_project_expected' : 'supabase_project_unexpected');
  checkRequiredEnvironment(checks, env, production);

  let db: any;
  try {
    db = context.db ?? createSupabaseServiceClient();
  } catch {
    addCheck(checks, 'database_reachable', 'dependency', 'FAIL', 'database_client_unavailable');
    addCheck(checks, 'adaptive_activation', 'adaptive', 'FAIL', 'database_client_unavailable');
    addCheck(checks, 'methodology', 'methodology', 'FAIL', 'database_client_unavailable');
    addCheck(checks, 'products', 'commercial', 'FAIL', 'database_client_unavailable');
    await publicChecks(checks, context, production);
    return { status: overallStatusFromChecks(checks), checks, checkedAt: now.toISOString(), currentDeploymentSha: deploymentSha, configuredSupabaseProjectRef: supabaseProjectRef };
  }

  const [activation, graphs, methodologies, products, settings, heartbeat] = await Promise.all([
    querySafely(() => db.from('adaptive_activation_policies').select('policy_key,environment,supabase_project,graph_version,graph_fingerprint,enabled,activation_sha').eq('policy_key', 'customer_start').maybeSingle()),
    querySafely(() => db.from('adaptive_graph_versions').select('graph_version,graph_fingerprint,methodology_version,status').eq('graph_version', contract.adaptiveGraphVersion).maybeSingle()),
    querySafely(() => db.from('methodology_versions').select('version_code,status').eq('status', 'active')),
    querySafely(() => db.from('products').select('product_code,price_cents,currency,active,requires_payment_verification,delivery_mode').in('product_code', EXPECTED_PUBLIC_PRODUCTS.map((product) => product.productCode))),
    querySafely(() => db.from('app_settings').select('setting_key,value_json').in('setting_key', ['phase14_autonomous_report_engine', 'respondent_token_policy', 'phase13_commercial_event_foundation'])),
    querySafely(() => db.from('production_monitor_heartbeats').select('monitor_name,last_started_at,last_completed_at,status,deployment_sha').eq('monitor_name', 'production-incident-monitor').maybeSingle())
  ]);

  const dbReachable = [activation, graphs, methodologies, products, settings, heartbeat].some((result) => !result.error);
  addCheck(checks, 'database_reachable', 'dependency', dbReachable ? 'PASS' : 'FAIL', dbReachable ? 'database_query_completed' : 'database_query_failed');

  const policy = activation.data;
  addCheck(checks, 'adaptive_activation_exists', 'adaptive', policy && !activation.error ? 'PASS' : 'FAIL', policy ? 'adaptive_policy_present' : 'adaptive_policy_missing');
  addCheck(checks, 'adaptive_activation_binding', 'adaptive', policy
    && policy.policy_key === 'customer_start'
    && policy.environment === contract.environment
    && policy.supabase_project === contract.supabaseProjectRef
    && policy.enabled === true
    && isValidDeploymentSha(policy.activation_sha)
    && policy.activation_sha.toLowerCase() === deploymentSha
    ? 'PASS' : 'FAIL', policy ? 'adaptive_policy_binding_checked' : 'adaptive_policy_unavailable');

  const graph = graphs.data;
  addCheck(checks, 'adaptive_graph_identity', 'adaptive', graph
    && graph.status === 'published'
    && graph.graph_version === contract.adaptiveGraphVersion
    && graph.graph_fingerprint === contract.adaptiveGraphFingerprint
    ? 'PASS' : 'FAIL', graph ? 'adaptive_graph_identity_checked' : 'adaptive_graph_missing');

  const activeMethodologies = Array.isArray(methodologies.data) ? methodologies.data : [];
  addCheck(checks, 'methodology_single_active', 'methodology', activeMethodologies.length === 1 && activeMethodologies[0]?.version_code === contract.activeMethodologyVersion ? 'PASS' : 'FAIL', activeMethodologies.length === 1 ? 'single_active_methodology_checked' : 'ambiguous_active_methodology');

  const productRows = Array.isArray(products.data) ? products.data : [];
  const productsPass = EXPECTED_PUBLIC_PRODUCTS.every((expected) => {
    const actual = productRows.find((row: any) => row.product_code === expected.productCode);
    return Boolean(actual && actual.active === true && Number(actual.price_cents) === expected.priceCents && actual.currency === expected.currency && actual.requires_payment_verification === expected.requiresPaymentVerification && actual.delivery_mode === expected.deliveryMode);
  });
  const advisoryPrice = 'priceFromCents' in COMMERCIAL_CATALOGUE.advisory ? COMMERCIAL_CATALOGUE.advisory.priceFromCents : null;
  const cataloguePass = advisoryPrice === EXPECTED_ADVISORY_PRICE_FROM_CENTS
    && COMMERCIAL_CATALOGUE.free.priceCents === 0;
  addCheck(checks, 'products_public_contract', 'commercial', productsPass && cataloguePass ? 'PASS' : 'FAIL', productsPass && cataloguePass ? 'public_products_expected' : 'public_products_drift');

  const termsPass = Boolean(FRAUD_READINESS_TERMS_VERSION && PRIVACY_NOTICE_VERSION && isPresent(env, 'ASSESSMENT_TOKEN_PEPPER'));
  addCheck(checks, 'legal_contract', 'legal', termsPass ? 'PASS' : 'WARN', termsPass ? 'legal_runtime_present' : 'legal_runtime_unverified');

  const gaMeasurement = env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const gaProperty = env.GA_PROPERTY_ID?.trim();
  addCheck(checks, 'ga4_configuration', 'analytics', isValidGaMeasurementId(gaMeasurement) && gaMeasurement === EXPECTED_PRODUCTION.gaMeasurementId && gaProperty === EXPECTED_PRODUCTION.gaPropertyId ? 'PASS' : production ? 'FAIL' : 'WARN', isValidGaMeasurementId(gaMeasurement) ? 'ga_measurement_format_checked' : 'ga_measurement_missing_or_invalid');

  const settingsPass = Array.isArray(settings.data) && settings.data.some((row: any) => row.setting_key === 'phase14_autonomous_report_engine');
  addCheck(checks, 'critical_runtime_settings', 'dependency', settingsPass ? 'PASS' : production ? 'FAIL' : 'WARN', settingsPass ? 'critical_runtime_settings_present' : 'critical_runtime_settings_missing');

  const providerMode = getEmailProviderMode();
  const providerPass = providerMode === 'live' && isPresent(env, 'RESEND_API_KEY');
  addCheck(checks, 'internal_email_provider', 'dependency', providerPass ? 'PASS' : 'WARN', providerPass ? 'internal_provider_live' : providerMode === 'disabled' ? 'internal_provider_disabled' : 'internal_provider_not_ready');

  const heartbeatRow = heartbeat.data;
  const staleMinutes = context.heartbeatStaleMinutes ?? 30;
  const heartbeatAge = heartbeatRow?.last_completed_at ? now.getTime() - new Date(heartbeatRow.last_completed_at).getTime() : Number.POSITIVE_INFINITY;
  const runningAge = heartbeatRow?.last_started_at ? now.getTime() - new Date(heartbeatRow.last_started_at).getTime() : Number.POSITIVE_INFINITY;
  const heartbeatPass = Boolean(
    heartbeatRow
      && ((heartbeatRow.status === 'healthy' && heartbeatAge <= staleMinutes * 60_000)
        || (heartbeatRow.status === 'running' && runningAge <= staleMinutes * 60_000))
  );
  addCheck(checks, 'internal_monitor_heartbeat', 'dependency', heartbeatPass ? 'PASS' : production ? 'FAIL' : 'WARN', heartbeatPass ? 'monitor_heartbeat_fresh' : 'monitor_heartbeat_stale_or_missing');

  await publicChecks(checks, context, production);

  // Failure injection is a Preview-only certification aid. It is deliberately applied after the
  // real checks so a test can prove the incident path without changing Production semantics.
  if (!production && context.failureInjection) {
    const injected = context.failureInjection;
    const category = injected === 'adaptive_sha_mismatch'
      ? 'adaptive'
      : injected === 'database_failure'
        ? 'dependency'
        : injected === 'public_route_failure'
          ? 'public_route'
          : 'dependency';
    addCheck(checks, `injected_${injected}`, category, 'FAIL', 'preview_failure_injected');
  }

  return {
    status: overallStatusFromChecks(checks),
    checks,
    checkedAt: now.toISOString(),
    currentDeploymentSha: deploymentSha,
    configuredSupabaseProjectRef: supabaseProjectRef
  };
}

export function publicReadinessPayload(evaluation: ReadinessEvaluation) {
  return {
    ok: evaluation.status !== 'INCIDENT',
    status: evaluation.status,
    checked_at: evaluation.checkedAt,
    checks: evaluation.checks.map(({ key, status }) => ({ key, status }))
  };
}
