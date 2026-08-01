import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const { Client } = require('pg');
const port = 58800 + (process.pid % 150);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc1-old-schema-freeze-'));
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'testpass',
  port,
  persistent: false,
});
const db = new Client({
  host: '127.0.0.1',
  port,
  user: 'postgres',
  password: 'testpass',
  database: 'testdb',
});
const pendingVersions = new Set([
  '20260722120000',
  '20260722143000',
  '20260724150000',
  '20260724160000',
  '20260724170000',
  '20260724180000',
  '20260725090000',
  '20260725150000',
  '20260728120000',
  '20260728190000',
  '20260728191000',
  '20260729113242',
  '20260729170000',
  '20260730120000',
  '20260730130000',
  '20260731130000',
  '20260731150000',
  '20260731170000',
  '20260801070000',
  '20260801090000',
  '20260801120000',
]);

function migrationParts(name) {
  const split = name.indexOf('_');
  return {
    version: name.slice(0, split),
    migrationName: name.slice(split + 1, -4),
  };
}

async function setup() {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('testdb');
  await db.connect();
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable
      as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create or replace function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users(id uuid primary key default gen_random_uuid(),email text);
    create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),not_after timestamptz);
    create schema if not exists vault;
    create table vault.decrypted_secrets(id uuid primary key default gen_random_uuid(),name text,decrypted_secret text);
    create schema if not exists storage;
    create table storage.buckets(id text primary key,name text not null,owner uuid,owner_id text,public boolean default false,avif_autodetection boolean default false,file_size_limit bigint,allowed_mime_types text[],created_at timestamptz default now(),updated_at timestamptz default now());
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,metadata jsonb,user_metadata jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text not null,statements text[] not null);
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
      if not exists(select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser login; end if;
    end $$;
    grant anon,authenticated,service_role to postgres;
    alter database testdb set search_path=public,extensions;
  `);
}

async function replayOldBoundary() {
  const files = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => !pendingVersions.has(migrationParts(name).version));
  assert.equal(files.length, 34);
  for (const name of files) {
    const { version, migrationName } = migrationParts(name);
    const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8');
    await db.query(sql);
    await db.query(
      'insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
      [version, migrationName, [sql]],
    );
  }
}

async function businessCounts() {
  const result = await db.query(`
    select jsonb_build_object(
      'orders',(select count(*) from public.orders),
      'assessments',(select count(*) from public.assessments),
      'reports',(select count(*) from public.reports),
      'order_events',(select count(*) from public.order_events),
      'report_events',(select count(*) from public.report_events),
      'email_events',(select count(*) from public.email_events),
      'email_provider_events',(select count(*) from public.email_provider_events),
      'manual_report_generation_attempts',(select count(*) from public.manual_report_generation_attempts),
      'payment_automation_records',(select count(*) from public.payment_automation_records),
      'report_ai_attempts',(select count(*) from public.report_ai_attempts),
      'storage.objects',(select count(*) from storage.objects)
    ) as value
  `);
  return result.rows[0].value;
}

try {
  await setup();
  await replayOldBoundary();
  const boundary = await db.query(
    'select count(*)::int as count,max(version) as newest from supabase_migrations.schema_migrations',
  );
  assert.deepEqual(boundary.rows[0], { count: 34, newest: '20260721150808' });
  const rpc = await db.query(
    "select to_regprocedure('public.rc1_freeze_status()') is null as absent",
  );
  assert.equal(rpc.rows[0].absent, true);

  const before = await businessCounts();
  await db.query('select count(*) from public.domains');
  await db.query('select count(*) from public.methodology_versions');
  await db.query('select count(*) from public.orders');

  const child = spawnSync(
    'npm',
    ['run', 'rc1:test-application-freeze'],
    {
      cwd: root,
      env: {
        ...process.env,
        MK_RC1_OPERATION_FREEZE_MODE: 'frozen',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(child.status, 0, `${child.stdout ?? ''}${child.stderr ?? ''}`);

  const after = await businessCounts();
  assert.deepEqual(after, before);
  assert.equal(
    await db.query("select to_regprocedure('public.rc1_freeze_status()') is null as absent")
      .then((result) => result.rows[0].absent),
    true,
  );
  console.log('PASS RC1 old-34-schema frozen compatibility: diagnostics available, 34 mutation probes caused zero writes');
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
