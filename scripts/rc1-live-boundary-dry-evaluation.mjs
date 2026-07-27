// Guarded launcher for the future read-only RC1 Production preflight.
// It validates every non-PII baseline variable and the approved target fingerprint before psql
// can connect. Output is deliberately restricted to PASS/STOP/NOT_DATABASE_VISIBLE result lines.
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const required = [
  'RC1_READ_ONLY_DATABASE_URL',
  'RC1_APPROVED_TARGET_FINGERPRINT',
  'RC1_CONNECTION_MODE',
  'RC1_APPROVED_RPC_BASELINE_JSON',
  'RC1_EXPECTED_BASELINE_COUNTS_JSON',
  'RC1_APPROVED_PROTECTED_STATE_FINGERPRINT',
  'RC1_APPROVED_EMAIL_STATUS_COUNTS_JSON',
  'RC1_APPROVED_EMAIL_STATUS_FINGERPRINT',
];
const countKeys = [
  'order_events', 'report_events', 'email_events', 'email_provider_events',
  'report_delivery_authorizations', 'report_delivery_finalizations',
  'report_delivery_remediations', 'phase14_operational_alerts',
  'manual_report_generation_attempts', 'reports', 'payment_automation_records',
  'customer_report_access_tokens', 'storage.objects', 'orders',
];
const emailStatusKeys = ['queued', 'recorded_disabled', 'sent'];
const allowedOutput = /^[a-z0-9_]+\|(PASS|STOP|NOT_DATABASE_VISIBLE)$/;

function stop(reason) {
  process.stdout.write(`${reason}|STOP\n`);
  process.exit(3);
}
function parseObject(name) {
  try {
    const value = JSON.parse(process.env[name]);
    if (!value || Array.isArray(value) || typeof value !== 'object') stop(`invalid_${name.toLowerCase()}`);
    return value;
  } catch {
    stop(`invalid_${name.toLowerCase()}`);
  }
}
function isSha256(value) {
  return /^[0-9a-f]{64}$/.test(value ?? '');
}

for (const name of required) {
  if (!process.env[name]) stop(`missing_${name.toLowerCase()}`);
}
if (process.env.RC1_CONNECTION_MODE !== 'read-only') stop('connection_mode_result');
if (!isSha256(process.env.RC1_APPROVED_TARGET_FINGERPRINT)) stop('target_fingerprint_input_result');
if (!isSha256(process.env.RC1_APPROVED_PROTECTED_STATE_FINGERPRINT)) stop('protected_state_fingerprint_input_result');
if (!isSha256(process.env.RC1_APPROVED_EMAIL_STATUS_FINGERPRINT)) stop('email_status_fingerprint_input_result');

const rpcBaseline = parseObject('RC1_APPROVED_RPC_BASELINE_JSON');
if (Object.keys(rpcBaseline).length !== 5 ||
    Object.values(rpcBaseline).some((value) => !/^[0-9a-f]{32}$/.test(String(value)))) {
  stop('rpc_baseline_input_result');
}
const baselineCounts = parseObject('RC1_EXPECTED_BASELINE_COUNTS_JSON');
if (Object.keys(baselineCounts).length !== countKeys.length ||
    countKeys.some((key) => !/^\d+$/.test(String(baselineCounts[key] ?? '')))) {
  stop('baseline_counts_input_result');
}
const emailStatusCounts = parseObject('RC1_APPROVED_EMAIL_STATUS_COUNTS_JSON');
if (Object.keys(emailStatusCounts).length !== emailStatusKeys.length ||
    emailStatusKeys.some((key) => !Number.isSafeInteger(emailStatusCounts[key]) || emailStatusCounts[key] < 0)) {
  stop('email_status_counts_input_result');
}

let databaseUrl;
try {
  databaseUrl = new URL(process.env.RC1_READ_ONLY_DATABASE_URL);
} catch {
  stop('read_only_connection_url_result');
}
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname || !databaseUrl.username || !databaseUrl.pathname.slice(1)) {
  stop('read_only_connection_url_result');
}
const port = databaseUrl.port || '5432';
const database = decodeURIComponent(databaseUrl.pathname.slice(1));
const targetDescriptor = `host=${databaseUrl.hostname.toLowerCase()}|port=${port}|database=${database}`;
const actualTargetFingerprint = crypto.createHash('sha256').update(targetDescriptor).digest('hex');
if (actualTargetFingerprint !== process.env.RC1_APPROVED_TARGET_FINGERPRINT) {
  stop('target_fingerprint_result');
}

const childEnv = {
  ...process.env,
  PGHOST: databaseUrl.hostname,
  PGPORT: port,
  PGDATABASE: database,
  PGUSER: decodeURIComponent(databaseUrl.username),
  PGPASSWORD: decodeURIComponent(databaseUrl.password),
  PGOPTIONS: '-c default_transaction_read_only=on',
  PGSSLMODE: databaseUrl.searchParams.get('sslmode') || 'require',
};
delete childEnv.RC1_READ_ONLY_DATABASE_URL;

const args = [
  '-X', '-v', 'ON_ERROR_STOP=1',
  '-v', `rc1_approved_rpc_baseline_json=${JSON.stringify(rpcBaseline)}`,
  '-v', `rc1_expected_baseline_counts_json=${JSON.stringify(baselineCounts)}`,
  '-v', `rc1_approved_protected_state_fingerprint=${process.env.RC1_APPROVED_PROTECTED_STATE_FINGERPRINT}`,
  '-v', `rc1_approved_email_status_counts_json=${JSON.stringify(emailStatusCounts)}`,
  '-v', `rc1_approved_email_status_fingerprint=${process.env.RC1_APPROVED_EMAIL_STATUS_FINGERPRINT}`,
  '-f', path.join(process.cwd(), 'scripts', 'rc1-production-preflight.sql'),
];
const result = spawnSync(process.env.PSQL ?? 'psql', args, {
  env: childEnv,
  encoding: 'utf8',
});
const lines = String(result.stdout ?? '').split('\n').filter((line) => allowedOutput.test(line));
if (result.status !== 0 || lines.length === 0) stop('preflight_execution_result');
for (const line of lines) process.stdout.write(`${line}\n`);
if (lines.some((line) => line.endsWith('|STOP'))) process.exit(3);
