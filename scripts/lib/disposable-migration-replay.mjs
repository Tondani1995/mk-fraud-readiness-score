/**
 * Disposable Postgres with the committed migration chain replayed, for tests that must exercise real SQL functions,
 * constraints and unique indexes without touching Supabase, Vercel or any shared environment. The bootstrap mirrors
 * scripts/v12-stalled-lead-controls-setter-tests.mjs (Supabase-managed schemas stubbed; pg_cron and pg_net replaced by
 * local stubs), plus a stub cron.alter_job so schedule changes can be asserted.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEDULER_MIGRATION = '20260831181553_v12_stalled_lead_supabase_scheduler.sql';
const V12_ACTIVATION_MIGRATION = '20260821090000_adaptive_v1_2_staging_activation.sql';

export async function startReplayedDatabase({ root = process.cwd(), label = 'replay' } = {}) {
  let EmbeddedPostgres;
  let pg;
  try {
    ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
    pg = await import('pg');
  } catch {
    return null;
  }
  const port = 57400 + ((process.pid + 97) % 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-pg-`));
  const postgres = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('testdb');
  const connect = async () => {
    const client = new pg.default.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb' });
    await client.connect();
    return client;
  };
  const db = await connect();
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create schema if not exists storage;
    create schema if not exists vault;
    create schema if not exists cron;
    create schema if not exists net;
    create schema if not exists supabase_migrations;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
    create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now());
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
    alter table storage.objects enable row level security;
    create table if not exists vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text not null, description text, decrypted_secret text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table if not exists cron.job (jobid bigint generated always as identity primary key, jobname text not null unique, schedule text not null, command text not null, active boolean not null default true);
    create or replace function cron.schedule(p_job_name text, p_schedule text, p_command text) returns bigint language plpgsql as $$
    declare v_job_id bigint;
    begin insert into cron.job(jobname, schedule, command) values (p_job_name, p_schedule, p_command) returning jobid into v_job_id; return v_job_id; end; $$;
    create or replace function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active boolean default null) returns void language plpgsql as $$
    begin update cron.job j set schedule = coalesce(alter_job.schedule, j.schedule), command = coalesce(alter_job.command, j.command), active = coalesce(alter_job.active, j.active) where j.jobid = alter_job.job_id; end; $$;
    create or replace function net.http_get(url text, params jsonb default null, headers jsonb default null, timeout_milliseconds integer default 1000) returns bigint language sql as $$ select 1::bigint $$;
    insert into vault.decrypted_secrets(name, decrypted_secret) values ('v12_stalled_lead_cron_secret', 'scheduler-test-secret-never-in-command-256-bit');
  `);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$;`);
  }
  await db.query('grant usage on schema public to anon, authenticated, service_role');

  const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    let sql = fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
    if (name === SCHEDULER_MIGRATION) {
      sql = sql
        .replace(/create extension if not exists pg_cron with schema pg_catalog;\s*/i, '')
        .replace(/create extension if not exists pg_net;\s*/i, '');
    }
    try {
      await db.query(sql);
    } catch (error) {
      throw new Error(`migration ${name} failed to replay: ${error.message}`);
    }
    if (name === V12_ACTIVATION_MIGRATION) {
      const graph = fs.readFileSync(path.join(root, 'docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json'), 'utf8');
      await db.query(`select public.publish_adaptive_graph_version('MFRS-V1.1-ADAPTIVE-DRAFT-20260804')`);
      await db.query(`select public.register_adaptive_staging_candidate($1::jsonb)`, [graph]);
    }
  }

  return {
    db,
    connect,
    migrationCount: files.length,
    async stop() {
      await db.end().catch(() => {});
      await postgres.stop().catch(() => {});
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

/**
 * A minimal supabase-js style query builder over a pg client, covering exactly what the internal notification queue
 * and dispatcher use (select/insert/update with eq, is, in, lt, gte, limit, maybeSingle, single). It lets the real
 * TypeScript dispatch code run against the real email_events table, its constraints and its unique dedupe index.
 */
export function pgSupabaseAdapter(client) {
  const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
  const column = (expr) => {
    // metadata_json->>last_activity_at style filters
    const json = /^([a-z_]+)->>([a-z_]+)$/i.exec(expr);
    if (json) return `${quoteIdent(json[1])}->>'${json[2]}'`;
    return quoteIdent(expr);
  };
  function builder(table) {
    const state = { table, action: 'select', columns: '*', values: null, where: [], params: [], limit: null, returning: null, mode: 'many' };
    const p = (value) => {
      state.params.push(value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value) ? JSON.stringify(value) : value);
      return `$${state.params.length}`;
    };
    const api = {
      select(cols = '*') {
        if (state.action === 'select') state.columns = cols;
        else state.returning = cols;
        return api;
      },
      insert(values) { state.action = 'insert'; state.values = values; return api; },
      update(values) { state.action = 'update'; state.values = values; return api; },
      upsert(values, opts = {}) { state.action = 'upsert'; state.values = values; state.onConflict = opts.onConflict; return api; },
      eq(col, value) { state.where.push(`${column(col)} = ${p(value)}`); return api; },
      is(col, value) { state.where.push(`${column(col)} is ${value === null ? 'null' : value ? 'true' : 'false'}`); return api; },
      in(col, values) { state.where.push(`${column(col)} = any(${p(values)})`); return api; },
      lt(col, value) { state.where.push(`${column(col)} < ${p(value)}`); return api; },
      gte(col, value) { state.where.push(`${column(col)} >= ${p(value)}`); return api; },
      not(col, op, value) { state.where.push(`not (${column(col)} ${op === 'is' ? `is ${value === null ? 'null' : value}` : `= ${p(value)}`})`); return api; },
      limit(n) { state.limit = n; return api; },
      maybeSingle() { state.mode = 'maybe'; return run(); },
      single() { state.mode = 'single'; return run(); },
      then(resolve, reject) { return run().then(resolve, reject); }
    };
    async function run() {
      try {
        const where = state.where.length ? ` where ${state.where.join(' and ')}` : '';
        let sql;
        if (state.action === 'select') {
          sql = `select ${state.columns === '*' ? '*' : state.columns.split(',').map((c) => quoteIdent(c.trim())).join(',')} from public.${quoteIdent(table)}${where}${state.limit ? ` limit ${Number(state.limit)}` : ''}`;
        } else if (state.action === 'insert' || state.action === 'upsert') {
          const keys = Object.keys(state.values);
          const values = keys.map((k) => p(state.values[k]));
          sql = `insert into public.${quoteIdent(table)} (${keys.map(quoteIdent).join(',')}) values (${values.join(',')})`;
          if (state.action === 'upsert') {
            sql += ` on conflict (${quoteIdent(state.onConflict)}) do update set ${keys.filter((k) => k !== state.onConflict).map((k) => `${quoteIdent(k)} = excluded.${quoteIdent(k)}`).join(',')}`;
          }
          sql += ` returning ${state.returning ? state.returning.split(',').map((c) => quoteIdent(c.trim())).join(',') : '*'}`;
        } else {
          const keys = Object.keys(state.values);
          sql = `update public.${quoteIdent(table)} set ${keys.map((k) => `${quoteIdent(k)} = ${p(state.values[k])}`).join(',')}${where} returning ${state.returning ? state.returning.split(',').map((c) => quoteIdent(c.trim())).join(',') : 'id'}`;
        }
        const result = await client.query(sql, state.params);
        const rows = result.rows;
        if (state.mode === 'maybe') return { data: rows[0] ?? null, error: null };
        if (state.mode === 'single') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row, got ${rows.length}` } };
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }
    }
    return api;
  }
  return { from: builder };
}
