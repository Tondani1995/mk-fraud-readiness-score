// Test backends for scripts/readiness-review-database-tests.mjs, chosen explicitly with MK_REVIEW_TEST_BACKEND.
//
//   local   The embedded Postgres in ./readiness-review-pglite-client.mjs (unchanged), with the store migration and the
//           Supabase API roles. Nothing is sent over the network; hosted settings in the environment are ignored.
//   hosted  The authorised temporary Supabase project only, through the existing RPC interface (PostgREST), with the
//           server-side secret key. Pinned to AUTHORISED_HOSTED_TEST_PROJECT_REF; any other project is refused.
//
// Both fail closed. A missing or unknown mode, a missing setting, a project other than the authorised one, a key of the
// wrong kind or project, or a key without the expected privileges stops the run before any test executes (exit 2). A
// missing secret key on its own blocks the tests that need it (exit 3) and is never reported as a pass. There is no
// default project and no fallback: nothing here reads a saved file of settings or chooses a project on its own.
import { randomBytes } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseConfigRefused, reviewDatabaseConfig } from '../../src/lib/readiness-review/database-config.ts';

const REPOSITORY = realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
/** A legacy service_role key is accepted only if it expires within this time; otherwise use a dedicated secret key. */
const MAX_LEGACY_KEY_LIFETIME_SECONDS = 24 * 60 * 60;

export const AUTHORISED_HOSTED_TEST_PROJECT_REF = 'zuqegvsfhzgcydyivnqv';
export const STORE_FUNCTIONS = [
  'review_create_session',
  'review_append_actions',
  'review_load_session',
  'review_find_link',
  'review_action_count',
  'review_record_report_run',
  'review_report_runs',
  'review_purge_session'
];
export const STORE_TABLES = ['rulesets', 'sessions', 'links', 'actions', 'report_runs'];

/** The run must not start: configuration missing or wrong, or the project or key is not the authorised one. */
export class BackendRefused extends Error {}
/** The hosted secret key is not available. The tests that need it are blocked, not passed. */
export class BackendBlocked extends Error {}

const LOCAL_SETTINGS = {
  MK_READINESS_REVIEW_DB_URL: 'http://127.0.0.1:54321',
  MK_READINESS_REVIEW_DB_PROJECT_REF: 'local',
  MK_READINESS_REVIEW_DB_SERVICE_KEY: 'local-embedded-database-no-key'
};

export function hostedConfigurationInstructions() {
  const ref = AUTHORISED_HOSTED_TEST_PROJECT_REF;
  return [
    `The hosted suite needs a short-lived secret key of the authorised temporary project ${ref} (mk-review-store-temp). It was not provided.`,
    `1. In the Supabase dashboard, open mk-review-store-temp (${ref}), Project Settings, API Keys. Create a new secret key used only for this run (for example mk-review-tests-<date>). The long-lived legacy service_role key is refused. Never use the project that preview and production share.`,
    '2. Put the secret key and the publishable key in a private folder outside the repository. Copy each value in the dashboard, then:',
    '     umask 077 && mkdir -p ~/.config/mk-review',
    '     pbpaste > ~/.config/mk-review/temp-secret-key        (with the secret key copied; on Linux use an editor)',
    '     pbpaste > ~/.config/mk-review/publishable-key        (with the publishable key copied)',
    '     chmod 600 ~/.config/mk-review/* && pbcopy < /dev/null (clears the clipboard)',
    '   The harness refuses a key given in an environment variable, a key file inside the repository, owned by another user or readable by others.',
    '3. From the repository root, with dependencies installed:',
    '     scripts/readiness-review-hosted-tests.sh',
    '   It writes the results to ~/.config/mk-review/results/ and exits 0 only if every test passed and the cleanup of every record and temporary user was verified.',
    '4. Delete the secret key in the dashboard straight after the run, then: rm ~/.config/mk-review/temp-secret-key',
    'The key is read only by this process and is never printed or written to the results.'
  ].join('\n');
}

/** The test mode. Required: there is no default. */
export function testBackendMode(env = process.env) {
  const mode = env.MK_REVIEW_TEST_BACKEND?.trim();
  if (mode === 'local' || mode === 'hosted') return mode;
  throw new BackendRefused(`MK_REVIEW_TEST_BACKEND must be "local" or "hosted"${mode ? `, not "${mode}"` : ' and is not set'}. Nothing was run.`);
}

function jwtClaims(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** What kind of Supabase API key this is, without contacting anything. */
export function classifyKey(key) {
  if (/^sb_secret_/.test(key)) return { kind: 'secret' };
  if (/^sb_publishable_/.test(key)) return { kind: 'publishable' };
  const claims = jwtClaims(key);
  if (claims && typeof claims.role === 'string') return { kind: `jwt:${claims.role}`, ref: claims.ref ?? null };
  return { kind: 'unknown' };
}

/**
 * Hosted settings, checked without contacting anything. needSecret false is for the public-key checks only
 * (--access-denied); every other hosted test needs the secret key.
 */
export function hostedTestConfig(env = process.env, { needSecret = true } = {}) {
  const ref = AUTHORISED_HOSTED_TEST_PROJECT_REF;
  const url = env.MK_READINESS_REVIEW_DB_URL?.trim();
  const projectRef = env.MK_READINESS_REVIEW_DB_PROJECT_REF?.trim();
  if (!url || !projectRef) throw new BackendRefused('Hosted mode needs MK_READINESS_REVIEW_DB_URL and MK_READINESS_REVIEW_DB_PROJECT_REF. Nothing was run.');
  if (projectRef !== ref) throw new BackendRefused(`The settings name project ${projectRef}. The hosted suite runs only against the authorised temporary project ${ref}. Nothing was run.`);
  if (url.replace(/\/+$/, '') !== `https://${ref}.supabase.co`) throw new BackendRefused(`The address is not https://${ref}.supabase.co. Nothing was run.`);

  const publicKey = env.MK_REVIEW_TEST_PUBLIC_KEY?.trim();
  if (!publicKey) throw new BackendRefused('Hosted mode needs MK_REVIEW_TEST_PUBLIC_KEY, the publishable (public) key of the authorised project, for the denial checks. Nothing was run.');
  const pub = classifyKey(publicKey);
  if (!(pub.kind === 'publishable' || (pub.kind === 'jwt:anon' && pub.ref === ref))) {
    throw new BackendRefused(`MK_REVIEW_TEST_PUBLIC_KEY is not the public key of project ${ref} (it is ${pub.kind}${pub.ref ? ` for ${pub.ref}` : ''}). Nothing was run.`);
  }

  if (env.MK_READINESS_REVIEW_DB_SERVICE_KEY?.trim()) {
    throw new BackendRefused('The hosted tests read the secret key only from a file (MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE), never from an environment variable. Nothing was run.');
  }
  const file = env.MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE?.trim();
  let secretKey = null;
  if (file) {
    let st;
    let real;
    try {
      real = realpathSync(file);
      st = statSync(real);
    } catch {
      throw new BackendRefused('MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE does not name a readable file. Nothing was run.');
    }
    if (!st.isFile()) throw new BackendRefused('MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE is not a file. Nothing was run.');
    if (real === REPOSITORY || real.startsWith(REPOSITORY + path.sep)) throw new BackendRefused('The secret key file is inside the repository. Keep it outside, for example in ~/.config/mk-review. Nothing was run.');
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) throw new BackendRefused('The secret key file belongs to another user. Nothing was run.');
    if (st.mode & 0o077) throw new BackendRefused('The secret key file can be read by other users. Run chmod 600 on it first. Nothing was run.');
    secretKey = readFileSync(real, 'utf8').trim() || null;
    if (!secretKey) throw new BackendRefused('The secret key file is empty. Nothing was run.');
  }
  if (!secretKey) {
    if (needSecret) throw new BackendBlocked(hostedConfigurationInstructions());
    return { url: `https://${ref}.supabase.co`, ref, publicKey, secretKey: null, secretKind: null };
  }
  const sec = classifyKey(secretKey);
  if (sec.kind === 'publishable' || sec.kind === 'jwt:anon' || sec.kind === 'jwt:authenticated') {
    throw new BackendRefused('The secret key setting holds a public key. The hosted suite needs the server-side secret key. Nothing was run.');
  }
  if (!(sec.kind === 'secret' || sec.kind === 'jwt:service_role')) throw new BackendRefused(`The secret key is not a Supabase secret or service_role key (it is ${sec.kind}). Nothing was run.`);
  if (sec.kind === 'jwt:service_role' && sec.ref !== ref) throw new BackendRefused(`The service_role key belongs to project ${sec.ref}, not ${ref}. Nothing was run.`);
  if (sec.kind === 'jwt:service_role') {
    const exp = Number(jwtClaims(secretKey)?.exp);
    const left = exp - Date.now() / 1000;
    if (!Number.isFinite(exp) || left <= 0 || left > MAX_LEGACY_KEY_LIFETIME_SECONDS) {
      throw new BackendRefused('The service_role key is long-lived or expired. Create a dedicated secret key for this run and delete it afterwards. Nothing was run.');
    }
  }
  if (secretKey === publicKey) throw new BackendRefused('The secret key and the public key are the same value. Nothing was run.');
  // The application's own rules for the same settings: the address must belong to the declared project, and the
  // shared preview and production project is refused.
  try {
    reviewDatabaseConfig({ MK_READINESS_REVIEW_DB_URL: url, MK_READINESS_REVIEW_DB_PROJECT_REF: projectRef, MK_READINESS_REVIEW_DB_SERVICE_KEY: secretKey });
  } catch (error) {
    if (error instanceof DatabaseConfigRefused) throw new BackendRefused(`${error.message} (the application refused these settings)`);
    throw error;
  }
  return { url: `https://${ref}.supabase.co`, ref, publicKey, secretKey, secretKind: sec.kind };
}

async function rest(cfg, path, { key, token = key, method = 'GET', body, profile } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (profile) headers[method === 'GET' ? 'Accept-Profile' : 'Content-Profile'] = profile;
  const res = await fetch(`${cfg.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, projectRef: res.headers.get('sb-project-ref'), json };
}

/** Network checks before any test: the project that answers, the public key refused, the secret key privileged. */
async function preflightHosted(cfg) {
  const ref = AUTHORISED_HOSTED_TEST_PROJECT_REF;
  const evidence = {};
  const sameProject = (r, what) => {
    if (r.projectRef !== ref) throw new BackendRefused(`${what}: the API answered for project ${r.projectRef ?? '(not stated)'}, not the authorised ${ref}. Nothing was run.`);
  };
  const probe = { p_session_id: `preflight-${randomBytes(6).toString('hex')}` };

  const pub = await rest(cfg, '/rest/v1/rpc/review_action_count', { key: cfg.publicKey, method: 'POST', body: probe });
  sameProject(pub, 'Public key');
  if (pub.json?.code !== '42501') {
    throw new BackendRefused(`The public key was not refused by the review store (HTTP ${pub.status}, ${pub.json?.code ?? 'no code'}). The security model is not the authorised one. Nothing was run.`);
  }
  evidence.publicKey = { projectRef: pub.projectRef, status: pub.status, code: pub.json.code };

  if (cfg.secretKey) {
    const sec = await rest(cfg, '/rest/v1/rpc/review_action_count', { key: cfg.secretKey, method: 'POST', body: probe });
    sameProject(sec, 'Secret key');
    if (sec.status === 401 || sec.status === 403) {
      if (sec.json?.code === '42501') throw new BackendRefused('The secret key lacks the privilege to execute the review store functions. Nothing was run.');
      throw new BackendRefused(`The secret key was not accepted by project ${ref} (HTTP ${sec.status}). Nothing was run.`);
    }
    if (sec.status === 404 || sec.json?.code === 'PGRST202') throw new BackendRefused(`The review store functions are not present on project ${ref}. Nothing was run.`);
    if (sec.status !== 200 || sec.json !== null) throw new BackendRefused(`Unexpected answer to the privilege check (HTTP ${sec.status}). Nothing was run.`);
    const spec = await rest(cfg, '/rest/v1/', { key: cfg.secretKey });
    sameProject(spec, 'Interface description');
    const paths = Object.keys(spec.json?.paths ?? {});
    const missing = STORE_FUNCTIONS.filter((fn) => !paths.includes(`/rpc/${fn}`));
    if (spec.status !== 200 || missing.length) throw new BackendRefused(`The authorised interface is incomplete on project ${ref}: missing ${missing.join(', ') || `(HTTP ${spec.status})`}. Nothing was run.`);
    const exposedTables = paths.filter((p) => STORE_TABLES.some((t) => p === `/${t}`));
    evidence.secretKey = { kind: cfg.secretKind, projectRef: sec.projectRef, status: sec.status, storeFunctions: STORE_FUNCTIONS.length, storeTablesInInterface: exposedTables.length };
  }
  return evidence;
}

/** Whether a role can read or write a store table directly (it must not; only the functions are an interface). */
async function hostedTableAccess(cfg, credential) {
  const out = [];
  for (const table of STORE_TABLES) {
    const read = await rest(cfg, `/rest/v1/${table}?select=*&limit=1`, { ...credential, profile: 'readiness_review' });
    const write = await rest(cfg, `/rest/v1/${table}`, { ...credential, method: 'POST', body: { fictional: true }, profile: 'readiness_review' });
    const publicSchema = await rest(cfg, `/rest/v1/${table}?select=*&limit=1`, credential);
    out.push({
      table,
      read: { refused: read.status >= 400, status: read.status, code: read.json?.code ?? null },
      write: { refused: write.status >= 400, status: write.status, code: write.json?.code ?? null },
      inPublicSchema: { refused: publicSchema.status >= 400, status: publicSchema.status, code: publicSchema.json?.code ?? null }
    });
  }
  return out;
}

async function openHosted(env, { needSecret }) {
  const cfg = hostedTestConfig(env, { needSecret });
  const preflight = await preflightHosted(cfg);
  const { createClient } = await import('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const serviceClient = cfg.secretKey ? createClient(cfg.url, cfg.secretKey, options) : null;
  if (cfg.secretKey) {
    // The service under test reads the same settings; a key read from a file is handed over in this process only.
    Object.assign(process.env, { MK_READINESS_REVIEW_DB_URL: cfg.url, MK_READINESS_REVIEW_DB_PROJECT_REF: cfg.ref, MK_READINESS_REVIEW_DB_SERVICE_KEY: cfg.secretKey });
  }
  const temporaryUsers = [];
  const sensitive = [cfg.publicKey, cfg.secretKey].filter(Boolean);
  return {
    /** Values that must never appear in any output: keys, the temporary user's credentials and token. */
    sensitive: () => sensitive.slice(),
    mode: 'hosted',
    target: `hosted project ${cfg.ref} (mk-review-store-temp) through the Supabase API`,
    preflight,
    serviceClient,
    serviceBlocked: cfg.secretKey ? null : 'the server-side secret key was not provided',
    serviceConnectsItself: true,
    /** The public role: the publishable key, as a browser would hold it. */
    async anonClient() {
      return { role: 'anon', client: createClient(cfg.url, cfg.publicKey, options), credential: { key: cfg.publicKey } };
    },
    /**
     * A signed-in user: a temporary fictional user (example.invalid) is created with the secret key, signed in with the
     * public key, and deleted by cleanup(). Needs the secret key.
     */
    async authenticatedClient() {
      if (!serviceClient) return null;
      const email = `mk-review-test-${randomBytes(6).toString('hex')}@example.invalid`;
      const password = randomBytes(24).toString('base64url');
      sensitive.push(email, password);
      const created = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { fictional: true, purpose: 'review store denial test' } });
      if (created.error) throw new Error(`The temporary fictional user could not be created: ${created.error.message}`);
      temporaryUsers.push({ id: created.data.user.id, email });
      const client = createClient(cfg.url, cfg.publicKey, options);
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error || !signed.data.session) throw new Error(`The temporary fictional user could not sign in: ${signed.error?.message ?? 'no session'}`);
      const token = signed.data.session.access_token;
      sensitive.push(token, signed.data.session.refresh_token);
      if (jwtClaims(token)?.role !== 'authenticated') throw new Error('The signed-in token does not carry the authenticated role.');
      return { role: 'authenticated', client, credential: { key: cfg.publicKey, token } };
    },
    async tableAccess(credential) {
      return hostedTableAccess(cfg, credential);
    },
    serviceCredential: cfg.secretKey ? { key: cfg.secretKey } : null,
    ownerSql: null,
    /**
     * Removes every temporary user this run created, then confirms each is gone with a separate lookup, by id and by
     * email. Never throws: failures are returned so that the caller can report them next to the test results.
     */
    async cleanup() {
      const out = { created: temporaryUsers.length, deleted: 0, confirmedAbsent: 0, errors: [] };
      for (const user of temporaryUsers) {
        try {
          let del = await serviceClient.auth.admin.deleteUser(user.id);
          if (del.error && !/not.?found/i.test(del.error.message)) del = await serviceClient.auth.admin.deleteUser(user.id);
          if (!del.error || /not.?found/i.test(del.error.message)) out.deleted++;
          else out.errors.push(`delete: ${del.error.message}`);
          const byId = await serviceClient.auth.admin.getUserById(user.id);
          const list = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const byEmail = (list.data?.users ?? []).some((u) => u.email === user.email);
          if (!byId.data?.user && !byEmail && !list.error) out.confirmedAbsent++;
          else out.errors.push(list.error ? `verify: ${list.error.message}` : 'a temporary user is still present');
        } catch (error) {
          out.errors.push(`cleanup: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return out;
    }
  };
}

async function openLocal(env) {
  if (!env.MK_PGLITE_DIR) throw new BackendRefused('Local mode needs MK_PGLITE_DIR, a folder where @electric-sql/pglite is installed (see scripts/lib/readiness-review-pglite-client.mjs). Nothing was run.');
  const ignored = ['MK_READINESS_REVIEW_DB_URL', 'MK_READINESS_REVIEW_DB_SERVICE_KEY', 'MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE', 'MK_REVIEW_TEST_PUBLIC_KEY'].filter((k) => env[k] && env[k] !== LOCAL_SETTINGS[k]);
  // Local mode never sends anything over the network; hosted settings are replaced in this process only.
  Object.assign(process.env, LOCAL_SETTINGS);
  delete process.env.MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE;
  const pg = await import('./readiness-review-pglite-client.mjs');
  const serviceClient = await pg.createRpcClient();
  return {
    mode: 'local',
    target: 'local embedded Postgres 17.5 (PGlite) with the store migration and the Supabase API roles',
    preflight: { ignoredHostedSettings: ignored },
    serviceClient,
    serviceBlocked: null,
    serviceConnectsItself: false,
    async anonClient() {
      return { role: 'anon', client: await pg.createRpcClient({ role: 'anon' }), credential: { role: 'anon' } };
    },
    async authenticatedClient() {
      return { role: 'authenticated', client: await pg.createRpcClient({ role: 'authenticated' }), credential: { role: 'authenticated' } };
    },
    async tableAccess(credential) {
      const role = credential.role;
      const out = [];
      for (const table of STORE_TABLES) {
        const read = await pg.runAsRole(role, `select * from readiness_review.${table} limit 1`);
        const write = await pg.runAsRole(role, `insert into readiness_review.${table} default values`);
        out.push({ table, read: { refused: !read.ok, code: read.code }, write: { refused: !write.ok, code: write.code } });
      }
      return out;
    },
    serviceCredential: { role: 'service_role' },
    ownerSql: (sql) => pg.runOwnerSql(sql),
    sensitive: () => [],
    async cleanup() {
      return { created: 0, deleted: 0, confirmedAbsent: 0, errors: [] };
    }
  };
}

/** Opens the backend MK_REVIEW_TEST_BACKEND names, or refuses. */
export async function openBackend(env = process.env, { needSecret = true } = {}) {
  const mode = testBackendMode(env);
  return mode === 'local' ? openLocal(env) : openHosted(env, { needSecret });
}

/**
 * Removes credentials and personal details from text that may reach a log or a results file: JSON web tokens,
 * Supabase keys, bearer tokens, API keys in addresses, email addresses, and any exact value given.
 */
export function redactText(text, values = []) {
  let out = String(text ?? '');
  for (const v of [...values].filter((x) => typeof x === 'string' && x.length >= 8).sort((a, b) => b.length - a.length)) out = out.split(v).join('[redacted]');
  return out
    .replace(/(apikey|api_key|access_token|refresh_token|password)(["']?\s*[:=]\s*["']?)[^"'&\s,}]+/gi, '$1$2[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[redacted token]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted key]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]');
}
