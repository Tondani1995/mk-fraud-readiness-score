// A local stand-in for the Supabase API, for running scripts/readiness-review-database-tests.mjs without a hosted
// project: an embedded Postgres 17 (PGlite) with the Supabase API roles and the store migration applied, and an RPC
// client that calls the store functions the way PostgREST does, as one role per client.
//
// PGlite is not a project dependency. Install it anywhere outside the project and point MK_PGLITE_DIR at that folder:
//   mkdir /tmp/pglite && cd /tmp/pglite && npm init -y && npm install @electric-sql/pglite@0.3
//   MK_PGLITE_DIR=/tmp/pglite MK_REVIEW_DB_TEST_CLIENT=./scripts/lib/readiness-review-pglite-client.mjs node ... database-tests.mjs
//
// Limits: one embedded connection, so calls run one after another. Concurrent saves are decided by the same row lock
// and constraints as on a hosted database, but true parallel transactions are only exercised against a hosted project.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20261111100000_readiness_review_store.sql');

// Parameter types of each store function, so JSON arguments are passed as PostgREST would pass them.
const SIGNATURES = {
  review_create_session: { p_session: 'jsonb', p_ruleset: 'jsonb', p_ruleset_key: 'text', p_links: 'jsonb', p_actions: 'jsonb' },
  review_append_actions: { p_session_id: 'text', p_expected_length: 'integer', p_actions: 'jsonb' },
  review_load_session: { p_session_id: 'text' },
  review_find_link: { p_token_sha256: 'text' },
  review_action_count: { p_session_id: 'text' },
  review_record_report_run: { p_run: 'jsonb' },
  review_report_runs: { p_session_id: 'text' },
  review_purge_session: { p_session_id: 'text' }
};

let database;
async function db() {
  if (database) return database;
  const dir = process.env.MK_PGLITE_DIR;
  if (!dir) throw new Error('Set MK_PGLITE_DIR to a folder where @electric-sql/pglite is installed.');
  const { PGlite } = await import(pathToFileURL(path.join(dir, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
  database = new PGlite();
  await database.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin;');
  await database.exec(readFileSync(MIGRATION, 'utf8'));
  return database;
}

let queue = Promise.resolve();
/** One statement at a time on the single embedded connection, each under the client's role. */
function serial(work) {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

export async function createRpcClient({ role = 'service_role' } = {}) {
  const pg = await db();
  return {
    rpc(fn, args = {}) {
      return serial(async () => {
        const sig = SIGNATURES[fn];
        if (!sig) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } };
        const names = Object.keys(sig);
        const values = names.map((n) => (args[n] === undefined || args[n] === null ? null : sig[n] === 'jsonb' ? JSON.stringify(args[n]) : args[n]));
        const call = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}::${sig[n]}`).join(', ')}) as result`;
        try {
          await pg.exec(`set role ${role}`);
          const res = await pg.query(call, values);
          return { data: res.rows[0]?.result ?? null, error: null };
        } catch (error) {
          return { data: null, error: { code: error.code ?? '', message: error.message } };
        } finally {
          await pg.exec('reset role');
        }
      });
    }
  };
}

/** Whether the given role can read a store table directly. */
export async function tableReadable(role = 'anon') {
  const pg = await db();
  return serial(async () => {
    try {
      await pg.exec(`set role ${role}`);
      await pg.query('select 1 from readiness_review.sessions limit 1');
      return { readable: true, code: null };
    } catch (error) {
      return { readable: false, code: error.code ?? null };
    } finally {
      await pg.exec('reset role');
    }
  });
}
