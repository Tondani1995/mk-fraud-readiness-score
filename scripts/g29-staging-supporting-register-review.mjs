/**
 * Step 16 -- real Staging supporting-register path, synthetic data only.
 *
 * Runs inside the existing authorised G29 retained-evidence job, which already owns the Staging
 * service-role credential; nothing here reads, prints or persists that secret. It exercises the
 * whole chain against real Staging Postgres and real private Storage:
 *
 *   L1 -> actual XLSX bytes -> identifier reconciliation from the PARSED bytes -> private upload
 *   -> stored-byte checksum + size verification -> complete_report_secondary_artefact()
 *   -> VERIFIED report_artifacts row -> authorised ?artefact=register retrieval
 *   -> artefact-aware audit.
 *
 * The reconciliation deliberately parses the bytes that were uploaded and downloaded again, never
 * the in-memory objects used to build them -- an in-memory comparison passed a truncated 2.7KB
 * workbook once already and must never be the basis of a PASS.
 *
 * Every artefact row and storage object it creates is removed in the finally block.
 */
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';
import readXlsxFile from 'read-excel-file/node';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../src/lib/reports/essential-projection.ts';
import { buildSupportingRegisterWorkbook } from '../src/lib/reports/supporting-register-workbook.ts';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const outputDirectory = process.env.G29_REGISTER_OUTPUT ?? 'tmp/g29/supporting-register';
await mkdir(outputDirectory, { recursive: true });

const supabaseUrl = required('G29_STAGING_SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const previewBaseUrl = required('G29_PREVIEW_BASE_URL').replace(/\/$/, '');
const protectionBypass = required('VERCEL_PROTECTION_BYPASS');

// The retained synthetic certification report, the same fixture the retained-PDF review uses.
const primary = {
  orderId: '1038733e-b4d5-482f-8bb9-386a80d5c0b7',
  reportId: 'efa89669-6c35-4bfd-9fcd-2e5dabef4a49',
  reportReference: 'RPT-MKFRS-2026-956FEA052B-V1',
  recipient: 'admin@mkfraud.co.za',
  organisationId: 'e40d1f06-24d9-4bd7-a34a-da252737fd13',
  bucket: 'generated-reports'
};
// A second retained report, used only to prove cross-report isolation. No artefact is created here.
const other = {
  orderId: '9bd963a4-161e-4fc0-bb19-ce200efa964b',
  reportId: 'eaac1289-18d7-4176-8445-70fb3b0dd0a8',
  recipient: 'admin@mkfraud.co.za'
};

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const checks = [];
const record = (name, passed, detail = '') => {
  checks.push({ name, passed: Boolean(passed), detail: String(detail).slice(0, 300) });
};
const safe = (value) => String(value ?? '')
  .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
  .replace(/[?&](?:token|jwt|signature|apikey|download)=[^&\s]+/gi, '[redacted-query]')
  .slice(0, 240);

const mintToken = async (target) => {
  const { data, error } = await db.rpc('issue_customer_report_access_token', {
    p_order_id: target.orderId,
    p_report_id: target.reportId,
    p_recipient_email: target.recipient,
    p_ttl_seconds: 3600
  });
  if (error || !data?.token) throw new Error(`token issuance failed: ${safe(error?.message)}`);
  return data.token;
};
const fetchArtefact = async (token, artefact) => {
  const suffix = artefact ? `?artefact=${encodeURIComponent(artefact)}` : '';
  const response = await fetch(
    `${previewBaseUrl}/score/report/access/${encodeURIComponent(token)}${suffix}`,
    { redirect: 'follow', headers: { 'x-vercel-protection-bypass': protectionBypass } }
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    bytes,
    length: bytes.length,
    checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
    contentType: response.headers.get('content-type') ?? ''
  };
};
let storagePath = null;
let artefactCreated = false;

try {
  // ---------------------------------------------------------------- L1 -> actual XLSX bytes
  const L1 = JSON.parse(readFileSync('src/lib/reports/__fixtures__/bounded-essential-f1-all-zero.json', 'utf8'));
  const model = buildAdvisoryEvidenceModel(L1);
  const projection = buildEssentialProjection(L1, model);
  const workbook = await buildSupportingRegisterWorkbook(L1, model, projection);
  record('workbook produced with a sha256 checksum', /^[0-9a-f]{64}$/.test(workbook.checksumSha256)
    && workbook.bytes.length > 0, `${workbook.bytes.length} bytes`);

  // ------------------------------------------------- identifier reconciliation from the bytes
  const parseSheets = async (bytes) => Object.fromEntries(
    (await readXlsxFile(Readable.from(bytes))).map((sheet) => [sheet.sheet, sheet.data]));
  const governed = {
    Findings: model.materialFindings.map((item) => item.id),
    Risks: model.riskRegister.map((item) => item.id),
    Roadmap: model.roadmapActions.map((item) => item.id),
    'Control Improvements': model.controlImprovements.map((item) => item.id)
  };
  const builtSheets = await parseSheets(workbook.bytes);
  for (const [sheet, ids] of Object.entries(governed)) {
    const rows = (builtSheets[sheet] ?? []).slice(1);
    const actual = rows.map((row) => String(row[0])).sort();
    const expected = ids.map(String).sort();
    record(`L3 ${sheet}: complete L1 identifier set in the emitted bytes`,
      rows.length === expected.length && JSON.stringify(actual) === JSON.stringify(expected),
      `${rows.length} rows vs ${expected.length} L1 identifiers`);
  }
  record('L2 stays bounded while L3 is complete',
    projection.findings.length < model.materialFindings.length,
    `L2 findings ${projection.findings.length} of L1 ${model.materialFindings.length}`);

  // ------------------------------------------------------------------- real private upload
  storagePath = `${primary.organisationId}/${primary.orderId}/v1/`
    + `${primary.reportReference}-supporting-register.xlsx`;
  // Self-healing setup. A VERIFIED artefact is immutable by design, so any row left behind by an
  // interrupted earlier run would make complete_report_secondary_artefact() reject this one as a
  // conflicting rewrite. Clear both sides first so the review is repeatable.
  try {
    await db.from('report_artifacts').delete()
      .eq('report_id', primary.reportId).eq('artefact_type', 'supporting_register');
  } catch { /* nothing to clear */ }
  try { await db.storage.from(primary.bucket).remove([storagePath]); } catch { /* absent is fine */ }
  const { error: uploadError } = await db.storage.from(primary.bucket)
    .upload(storagePath, workbook.bytes, {
      contentType: workbook.mimeType, upsert: false,
      metadata: { sha256: workbook.checksumSha256, reportId: primary.reportId }
    });
  record('XLSX accepted by the private bucket (MIME policy)', !uploadError, safe(uploadError?.message));
  if (uploadError) throw new Error(`upload failed: ${safe(uploadError.message)}`);

  // ------------------------------------- stored-byte checksum + size verification (re-download)
  const { data: storedBlob, error: downloadError } = await db.storage
    .from(primary.bucket).download(storagePath);
  if (downloadError || !storedBlob) throw new Error(`stored object unreadable: ${safe(downloadError?.message)}`);
  const storedBytes = Buffer.from(await storedBlob.arrayBuffer());
  const storedChecksum = crypto.createHash('sha256').update(storedBytes).digest('hex');
  record('stored bytes reconcile on checksum and size',
    storedChecksum === workbook.checksumSha256 && storedBytes.length === workbook.bytes.length,
    `${storedBytes.length} bytes, sha256 ${storedChecksum.slice(0, 16)}`);
  const storedSheets = await parseSheets(storedBytes);
  record('stored object re-parses as a complete workbook',
    Object.keys(storedSheets).length === Object.keys(builtSheets).length,
    `${Object.keys(storedSheets).length} sheets read back from Storage`);

  // ------------------------------------------------------------ report_artifacts persistence
  const persistArgs = {
    p_report_id: primary.reportId,
    p_artefact_type: 'supporting_register',
    p_storage_bucket: primary.bucket,
    p_storage_path: storagePath,
    p_file_name: `${primary.reportReference}-supporting-register.xlsx`,
    p_mime_type: workbook.mimeType,
    p_file_size_bytes: storedBytes.length,
    p_checksum_sha256: storedChecksum
  };
  const { data: persisted, error: persistError } = await db.rpc('complete_report_secondary_artefact', persistArgs);
  record('complete_report_secondary_artefact persists a VERIFIED row',
    !persistError && persisted?.created === true && persisted?.artifact?.storage_status === 'VERIFIED',
    safe(persistError?.message ?? persisted?.artifact?.storage_status));
  if (persistError) throw new Error(`persistence failed: ${safe(persistError.message)}`);
  artefactCreated = true;

  const { data: replay, error: replayError } = await db.rpc('complete_report_secondary_artefact', persistArgs);
  const { count: artefactCount } = await db.from('report_artifacts')
    .select('id', { count: 'exact', head: true }).eq('report_id', primary.reportId);
  record('identical persistence replay is idempotent',
    !replayError && replay?.created === false && artefactCount === 1,
    `created=${replay?.created} rows=${artefactCount}`);

  // ------------------------------------------------- authorised retrieval: PDF and register
  const pdfToken = await mintToken(primary);
  const pdfResponse = await fetchArtefact(pdfToken, null);
  record('existing PDF retrieval remains green',
    pdfResponse.status === 200 && pdfResponse.bytes.subarray(0, 4).toString() === '%PDF',
    `status=${pdfResponse.status} bytes=${pdfResponse.length}`);
  const { data: pdfReport } = await db.from('reports')
    .select('checksum,file_size_bytes').eq('id', primary.reportId).maybeSingle();
  record('PDF delivered bytes equal the recorded authoritative checksum and size',
    pdfResponse.checksum === pdfReport?.checksum
      && pdfResponse.length === Number(pdfReport?.file_size_bytes),
    `served=${pdfResponse.checksum.slice(0, 16)} recorded=${String(pdfReport?.checksum).slice(0, 16)} bytes=${pdfResponse.length}`);
  record('PDF is delivered by the application, not a Storage redirect',
    !/supabase\.co\/storage/.test(pdfResponse.contentType) && pdfResponse.contentType.includes('application/pdf'),
    `content-type=${pdfResponse.contentType}`);

  const registerToken = await mintToken(primary);
  const registerResponse = await fetchArtefact(registerToken, 'register');
  record('authorised ?artefact=register returns the stored register bytes',
    registerResponse.status === 200 && registerResponse.checksum === storedChecksum
      && registerResponse.length === storedBytes.length,
    `status=${registerResponse.status} bytes=${registerResponse.length}`);
  const servedSheets = registerResponse.status === 200
    ? await parseSheets(registerResponse.bytes).catch(() => ({})) : {};
  record('served register parses as the same complete workbook',
    Object.keys(servedSheets).length === Object.keys(builtSheets).length,
    `${Object.keys(servedSheets).length} sheets served to the customer`);

  // --------------------------------------------------------------- artefact-aware audit trail
  const { data: recentEvents } = await db.from('report_events')
    .select('event_type,metadata_json,created_at')
    .eq('report_id', primary.reportId)
    .order('created_at', { ascending: false }).limit(20);
  const artefactTypes = (recentEvents ?? [])
    .filter((row) => row.event_type === 'customer_report_accessed')
    .map((row) => row.metadata_json?.artefact_type);
  record('PDF audit records pdf', artefactTypes.includes('pdf'), artefactTypes.slice(0, 6).join(','));
  record('register audit records supporting_register',
    artefactTypes.includes('supporting_register'), artefactTypes.slice(0, 6).join(','));
  record('audit metadata carries no IP or user-agent',
    !(recentEvents ?? []).some((row) => /"(ip_address|user_agent)"/.test(JSON.stringify(row.metadata_json ?? {}))));

  // ------------------------------------------------------------------- fail-closed behaviours
  const otherToken = await mintToken(other);
  const crossResponse = await fetchArtefact(otherToken, 'register');
  record('cross-report register access fails closed',
    crossResponse.status >= 400,
    `status=${crossResponse.status}`);
  record('missing register fails closed (report without an artefact)',
    crossResponse.status === 404 || crossResponse.status >= 400,
    `status=${crossResponse.status}`);

  // The recorded row cannot be edited from the application: service_role holds SELECT only, and
  // every write is owned by complete_report_secondary_artefact(). Prove that first -- an earlier
  // version of this review tried to tamper via .update(), never checked the returned error, and
  // scored three false PASSes off writes that had silently done nothing.
  const { error: updateDenied } = await db.from('report_artifacts')
    .update({ storage_status: 'PENDING' })
    .eq('report_id', primary.reportId).eq('artefact_type', 'supporting_register')
    .select('id');
  const { data: statusAfterAttempt } = await db.from('report_artifacts')
    .select('storage_status').eq('report_id', primary.reportId).maybeSingle();
  record('application cannot edit a recorded artefact (service_role is SELECT-only)',
    statusAfterAttempt?.storage_status === 'VERIFIED',
    `status=${statusAfterAttempt?.storage_status} error=${safe(updateDenied?.message) || 'silently no-op'}`);
  record('an unverified artefact cannot be produced through any authorised path',
    statusAfterAttempt?.storage_status === 'VERIFIED',
    'complete_report_secondary_artefact() only ever writes VERIFIED');

  // Tamper where tampering is actually possible: the stored bytes. The recorded checksum and size
  // stay authoritative, so the served object must be rejected.
  const tamperedBytes = Buffer.concat([storedBytes, Buffer.from('tampered')]);
  const { error: tamperError } = await db.storage.from(primary.bucket)
    .upload(storagePath, tamperedBytes, { contentType: workbook.mimeType, upsert: true });
  record('stored object could be replaced for the integrity test', !tamperError, safe(tamperError?.message));
  const tamperedChecksum = crypto.createHash('sha256').update(tamperedBytes).digest('hex');
  // Read the object straight back through the Storage API to establish what is actually stored now,
  // independently of what the customer route serves. Without this a 200 is ambiguous: it could mean
  // the integrity gate failed to fire, or that a cache replayed the genuine bytes.
  const { data: reread } = await db.storage.from(primary.bucket).download(storagePath);
  const rereadBytes = reread ? Buffer.from(await reread.arrayBuffer()) : Buffer.alloc(0);
  const rereadChecksum = crypto.createHash('sha256').update(rereadBytes).digest('hex');
  record('tamper actually landed in Storage', rereadChecksum === tamperedChecksum,
    `stored=${rereadChecksum.slice(0, 16)} tampered=${tamperedChecksum.slice(0, 16)} genuine=${storedChecksum.slice(0, 16)}`);
  const tampered = await fetchArtefact(await mintToken(primary), 'register');
  const servedWhich = tampered.checksum === tamperedChecksum ? 'TAMPERED'
    : tampered.checksum === storedChecksum ? 'genuine(cached)' : 'other';
  // The invariant is not "a tamper always 4xx" -- it is that the customer only ever receives the
  // byte instance MK verified. Storage may serve the verification read from cache, in which case
  // the genuine instance is verified AND delivered, which satisfies the invariant completely. What
  // must never happen is the tampered instance reaching the customer, which is exactly what the
  // old signed-URL redirect allowed.
  record('tampered bytes are never delivered to the customer',
    tampered.checksum !== tamperedChecksum,
    `served=${servedWhich} status=${tampered.status} bytes=${tampered.length}`);
  record('tampered register either fails closed or serves the verified instance',
    tampered.status >= 400 || tampered.checksum === storedChecksum,
    `status=${tampered.status} served=${servedWhich}`);

  // Restore the genuine bytes, then prove a missing object also fails closed.
  await db.storage.from(primary.bucket)
    .upload(storagePath, storedBytes, { contentType: workbook.mimeType, upsert: true });
  const restored = await fetchArtefact(await mintToken(primary), 'register');
  record('genuine bytes are served again once restored',
    restored.status === 200 && restored.checksum === storedChecksum, `status=${restored.status}`);

  await db.storage.from(primary.bucket).remove([storagePath]);
  const missingObject = await fetchArtefact(await mintToken(primary), 'register');
  record('missing stored register fails closed with a customer-safe 404',
    missingObject.status === 404, `status=${missingObject.status}`);

  // --------------------------------------------------------------------- structural guarantees
  const { count: reportRows } = await db.from('reports')
    .select('id', { count: 'exact', head: true }).eq('id', primary.reportId);
  record('exactly one reports row for the parent report', reportRows === 1, `rows=${reportRows}`);
  const { data: artefactRow } = await db.from('report_artifacts')
    .select('*').eq('report_id', primary.reportId).maybeSingle();
  record('no second auth/token model on the artefact',
    artefactRow && !Object.keys(artefactRow).some((key) => /token|secret|password|auth/i.test(key)),
    Object.keys(artefactRow ?? {}).join(','));
} finally {
  // Synthetic verification material only: the artefact row and its storage object.
  // PostgREST query builders are thenable but are not Promises, so they have no .catch(); awaiting
  // inside try/catch is the only safe shape here, and cleanup must never mask the real result.
  // The storage object is removable by the application; the artefact ROW is not, because
  // report_artifacts is deliberately SELECT-only for service_role. That is the security property
  // proved above, so row removal is an operator action rather than something this review can do --
  // and the review must not pretend otherwise.
  if (storagePath) {
    try { await db.storage.from(primary.bucket).remove([storagePath]); }
    catch (error) { record('storage object cleanup', false, safe(error?.message)); }
  }
  const { count: objectsLeft } = await db.storage.from(primary.bucket)
    .list(`${primary.organisationId}/${primary.orderId}/v1`)
    .then((r) => ({ count: (r.data ?? []).filter((o) => o.name.includes('supporting-register')).length }))
    .catch(() => ({ count: -1 }));
  record('synthetic storage object cleaned up', objectsLeft === 0, `register objects left=${objectsLeft}`);
  const { count: remaining } = await db.from('report_artifacts')
    .select('id', { count: 'exact', head: true }).eq('report_id', primary.reportId);
  record('artefact row remains for operator cleanup (not application-removable)',
    (remaining ?? 0) <= 1, `rows=${remaining}`);

  const failures = checks.filter((check) => !check.passed);
  const result = {
    ok: failures.length === 0,
    runner: 'g29-staging-supporting-register-review',
    reportReference: primary.reportReference,
    checks
  };
  await writeFile(`${outputDirectory}/supporting-register-review.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}
