// Ad-hoc verification script for docs/safe-launch/25-source-cloud-migration-reconciliation.md.
// Boots disposable embedded Postgres, replays every committed migration file in exact filename
// (version) order, and reports the exact failure point if any. Not part of the release test suite
// registry -- a one-off reconciliation-proof artifact, referenced by doc 25.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const pg = await import('pg');

const port = 58500 + (process.pid % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0-reconciliation-replay-'));
const postgres = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false });
const db = new pg.default.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb' });

console.log('Booting disposable local Postgres...');
await postgres.initialise();
await postgres.start();
await postgres.createDatabase('testdb');
await db.connect();

try {
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
    create schema if not exists vault;
    create table if not exists vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, owner uuid, owner_id text, public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
      if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser login; end if;
    end
    $$;
    grant anon, authenticated, service_role to postgres;
    alter database testdb set search_path=public,extensions;
  `);

  const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
  console.log(`Replaying ${migrationFiles.length} migration files in order...`);
  let lastOk = null;
  for (const name of migrationFiles) {
    try {
      await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
      lastOk = name;
    } catch (error) {
      console.log(`\nFAILED at ${name}`);
      console.log(`Last successful migration: ${lastOk}`);
      console.log(`Error: ${error.message}`);
      process.exitCode = 1;
      throw error;
    }
  }
  console.log('All migrations replayed successfully with no error.');

  // Report-templates row count -- proves/disproves the documented 0011-vs-restored-migrations
  // duplicate-seed-state concern for report_templates specifically.
  const templates = await db.query(`select template_code, version_number from public.report_templates order by template_code, version_number`);
  console.log(`\nreport_templates rows after replay (${templates.rows.length}):`);
  for (const row of templates.rows) console.log(`  ${row.template_code} v${row.version_number}`);

  const buckets = await db.query(`select id, file_size_limit from storage.buckets order by id`);
  console.log(`\nstorage.buckets rows after replay (${buckets.rows.length}):`);
  for (const row of buckets.rows) console.log(`  ${row.id} -> ${row.file_size_limit}`);

  const blockCount = await db.query(`select count(*)::int as n from public.report_content_blocks`);
  console.log(`\nreport_content_blocks row count after replay: ${blockCount.rows[0].n}`);

  const funcDef = await db.query(`select pg_get_functiondef('public.invalidate_phase14_authority_on_gate_change()'::regprocedure) as def`);
  const hasWhereTrue = funcDef.rows[0].def.includes('where true');
  console.log(`\ninvalidate_phase14_authority_on_gate_change() has "where true": ${hasWhereTrue}`);
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
