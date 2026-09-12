import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const url = new URL(process.env.MONITOR_TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/postgres');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Disposable local database only');
const db = new pg.Client({connectionString:url.href});await db.connect();
try {
 await db.query('BEGIN');
 for(const name of ['anon','authenticated','service_role']) {
  const {rows}=await db.query('select 1 from pg_roles where rolname=$1',[name]);
  if(!rows.length) await db.query(`CREATE ROLE ${name} ${name==='service_role'?'BYPASSRLS':''}`);
 }
 // Supabase owners can inherit broad defaults; the migration must narrow them explicitly.
 await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role');
 await db.query(readFileSync('supabase/migrations/20260912082816_production_monitor_reliability.sql','utf8'));
 await db.query('SET LOCAL ROLE service_role');
 await db.query("insert into production_monitor_notifications(notification_key,payload_json) values ('episode:1:initial','{\"text\":\"first payload\"}') on conflict do nothing");
 await db.query("insert into production_monitor_notifications(notification_key,payload_json) values ('episode:1:initial','{\"text\":\"changed payload\"}') on conflict do nothing");
 const {rows}=await db.query('select * from production_monitor_notifications');assert.equal(rows.length,1);assert.equal(rows[0].payload_json.text,'first payload');
 await db.query("update production_monitor_notifications set sent_at=now(),provider_message_id='test-provider-id' where notification_key='episode:1:initial'");
 assert.equal((await db.query('select provider_message_id from production_monitor_notifications')).rows[0].provider_message_id,'test-provider-id');
 await db.query('RESET ROLE');
 const {rows:[priv]}=await db.query("select has_table_privilege('anon','production_monitor_notifications','SELECT') as anon_read,has_table_privilege('authenticated','production_monitor_notifications','SELECT') as auth_read,has_column_privilege('service_role','production_monitor_notifications','payload_json','UPDATE') as payload_update");
 assert.deepEqual(priv,{anon_read:false,auth_read:false,payload_update:false});
 console.log('ok - local Postgres migration, unique immutable payload, sent receipt, least-privilege grants');
} finally {await db.query('ROLLBACK');await db.end();}
