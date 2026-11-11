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
import { readFileSync, statSync } from 'node:fs';
import { DatabaseConfigRefused, reviewDatabaseConfig } from '../../src/lib/readiness-review/database-config.ts';

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
    `The hosted suite needs the server-side secret key of the authorised temporary project ${ref} (mk-review-store-temp). It was not provided.`,
    `1. In the Supabase dashboard, open mk-review-store-temp (${ref}), Project Settings, API Keys. Create a secret key for these tests (or use the legacy service_role key), and copy the publishable key. Never use the project that preview and production share.`,
    '2. Save the secret key in a file only your user can read, outside the repository, and never in an environment file that is committed or packaged:',
    '     umask 077 && mkdir -p ~/.config/mk-review && $EDITOR ~/.config/mk-review/temp-secret-key && chmod 600 ~/.config/mk-review/temp-secret-key',
    '3. From the repository root, with dependencies installed:',
    '     MK_REVIEW_TEST_BACKEND=hosted \\',
    `     MK_READINESS_REVIEW_DB_URL=https://${ref}.supabase.co \\`,
    `     MK_READINESS_REVIEW_DB_PROJECT_REF=${ref} \\`,
    "     MK_REVIEW_TEST_PUBLIC_KEY='<publishable key>' \\",
    '     MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE=~/.config/mk-review/temp-secret-key \\',
    '     MK_REVIEW_DB_RESULTS=./database-tests-hosted.json \\',
    '     node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-database-tests.mjs',
    '4. Delete the secret key in the dashboard after the run, and delete the file.',
    'The key is read only by this process, is never printed or written to the results, and is refused if the file can be read by other users.'
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

  const inline = env.MK_READINESS_REVIEW_DB_SERVICE_KEY?.trim();
  const file = env.MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE?.trim();
  if (inline && file) throw new BackendRefused('Set the secret key either as MK_READINESS_REVIEW_DB_SERVICE_KEY or as MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE, not both. Nothing was run.');
  let secretKey = inline || null;
  if (file) {
    let st;
    try {
      st = statSync(file);
    } catch {
      throw new BackendRefused('MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE does not name a readable file. Nothing was run.');
    }
    if (!st.isFile()) throw new BackendRefused('MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE is not a file. Nothing was run.');
    if (st.mode & 0o077) throw new BackendRefused('The secret key file can be read by other users. Run chmod 600 on it first. Nothing was run.');
    secretKey = readFileSync(file, 'utf8').trim() || null;
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
  return {
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
      const created = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { fictional: true, purpose: 'review store denial test' } });
      if (created.error) throw new Error(`The temporary fictional user could not be created: ${created.error.message}`);
      temporaryUsers.push(created.data.user.id);
      const client = createClient(cfg.url, cfg.publicKey, options);
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error || !signed.data.session) throw new Error(`The temporary fictional user could not sign in: ${signed.error?.message ?? 'no session'}`);
      const token = signed.data.session.access_token;
      if (jwtClaims(token)?.role !== 'authenticated') throw new Error('The signed-in token does not carry the authenticated role.');
      return { role: 'authenticated', client, credential: { key: cfg.publicKey, token } };
    },
    async tableAccess(credential) {
      return hostedTableAccess(cfg, credential);
    },
    serviceCredential: cfg.secretKey ? { key: cfg.secretKey } : null,
    ownerSql: null,
    /** Removes the temporary users and confirms they are gone. */
    async cleanup() {
      let removed = 0;
      for (const id of temporaryUsers) {
        await serviceClient.auth.admin.deleteUser(id);
        const check = await serviceClient.auth.admin.getUserById(id);
        if (!check.data?.user) removed++;
      }
      return { temporaryUsers: temporaryUsers.length, removed };
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
    async cleanup() {
      return { temporaryUsers: 0, removed: 0 };
    }
  };
}

/** Opens the backend MK_REVIEW_TEST_BACKEND names, or refuses. */
export async function openBackend(env = process.env, { needSecret = true } = {}) {
  const mode = testBackendMode(env);
  return mode === 'local' ? openLocal(env) : openHosted(env, { needSecret });
}
