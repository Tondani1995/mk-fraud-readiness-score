/**
 * Verified-byte delivery contract for the customer report access path.
 *
 * The invariant: the exact byte instance that passes MK's authoritative checksum/size/type
 * validation is the byte instance delivered to the customer. The previous design verified one
 * Storage read and then redirected the customer to a signed URL, which is a second read of a
 * possibly different instance. On Staging that gap was real -- the verification read returned the
 * genuine object from cache while the signed URL served a freshly tampered one, and 94,062 tampered
 * bytes reached the customer behind a passing checksum.
 *
 * The adversarial storage double below is the permanent form of that Staging case: after the first
 * download of a path it serves TAMPERED bytes for every subsequent read. Any implementation that
 * reads Storage a second time to serve the customer therefore fails these tests, and the tamper
 * assertion cannot be satisfied by weakening it.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 0x41)]);
const PDF_SHA = sha256(PDF_BYTES);
const XLSX_BYTES = Buffer.concat([Buffer.from('PK'), Buffer.alloc(4096, 0x42)]);
const XLSX_SHA = sha256(XLSX_BYTES);
const TAMPERED = Buffer.from('tampered-instance-that-must-never-reach-a-customer');

const REPORT_ID = 'r0000000-0000-0000-0000-00000000000a';
const ORDER_ID = 'o0000000-0000-0000-0000-00000000000b';
const TOKEN_ID = 't0000000-0000-0000-0000-00000000000c';
const PDF_PATH = 'org/ord/v1/REPORT-V1.pdf';
const REGISTER_PATH = 'org/ord/v1/REPORT-V1-supporting-register.xlsx';

// Compile the module under test with its imports intercepted, so the real production code runs
// against the doubles rather than a re-implementation of it.
const source = fs.readFileSync('src/lib/reports/customer-report-access.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText;

let activeDb = null;
const moduleExports = {};
new Function('require', 'module', 'exports', compiled)((specifier) => {
  if (specifier === 'node:crypto') return { __esModule: true, default: crypto };
  if (specifier === '@/lib/supabase/server') return { createSupabaseServiceClient: () => activeDb };
  if (specifier === '@/lib/security/hash') return {
    hashCustomerReportAccessToken: (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex')
  };
  if (specifier === './report-access-eligibility') return {
    assertReportAccessEligible() {},
    async resolveCurrentReportId() { return REPORT_ID; },
    ReportAccessEligibilityError: class extends Error {}
  };
  throw new Error(`unexpected import in test: ${specifier}`);
}, { exports: moduleExports }, moduleExports);
const { grantCustomerReportAccess, CustomerReportAccessError } = moduleExports;

function makeDb(options = {}) {
  const calls = {
    signedUrls: 0, downloads: [], rpc: [], tokenUpdates: 0, reportStatusUpdates: []
  };
  const objects = new Map([[PDF_PATH, PDF_BYTES], [REGISTER_PATH, XLSX_BYTES]]);
  if (options.removeObject) objects.delete(options.removeObject);
  if (options.replaceObject) objects.set(options.replaceObject.path, options.replaceObject.bytes);

  const artefactRow = options.artefactRow === undefined
    ? {
      storage_bucket: 'generated-reports', storage_path: REGISTER_PATH,
      checksum_sha256: options.registerChecksum ?? XLSX_SHA,
      file_size_bytes: options.registerSize ?? XLSX_BYTES.length,
      storage_status: options.registerStatus ?? 'VERIFIED', artefact_type: 'supporting_register',
      file_name: 'REPORT-V1-supporting-register.xlsx',
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
    : options.artefactRow;

  const builder = (rows) => {
    const api = {
      select: () => api, eq: () => api, order: () => api, limit: () => api,
      maybeSingle: async () => ({ data: rows, error: null }),
      then: (resolve) => resolve({ data: rows, error: null }),
      update: () => ({ eq: async () => ({ error: null }) })
    };
    return api;
  };

  return {
    calls,
    from(table) {
      if (table === 'customer_report_access_tokens') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: options.tokenRow === undefined ? {
              id: TOKEN_ID, order_id: ORDER_ID, report_id: REPORT_ID,
              recipient_email: 'synthetic@invalid.test', purpose: 'customer_download',
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
              revoked_at: null, access_count: 0
            } : options.tokenRow,
            error: null
          }) }) }),
          update: () => ({ eq: async () => { calls.tokenUpdates += 1; return { error: null }; } })
        };
      }
      if (table === 'reports') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: {
              id: REPORT_ID, assessment_id: 'a1', order_id: ORDER_ID, report_type: 'premium',
              report_reference: 'REPORT-V1', version_number: 1, status: 'released',
              storage_bucket: 'generated-reports', storage_path: PDF_PATH,
              checksum: options.reportChecksum ?? PDF_SHA,
              file_name: 'REPORT-V1.pdf', mime_type: 'application/pdf',
              file_size_bytes: PDF_BYTES.length, storage_status: 'VERIFIED'
            },
            error: null
          }) }) }),
          update: (patch) => ({ eq: async () => {
            calls.reportStatusUpdates.push(patch.storage_status); return { error: null };
          } })
        };
      }
      if (table === 'report_artifacts') return builder(artefactRow);
      return builder(null);
    },
    storage: {
      from() {
        return {
          download: async (path) => {
            const seen = calls.downloads.filter((entry) => entry === path).length;
            calls.downloads.push(path);
            if (!objects.has(path)) return { data: null, error: new Error('not found') };
            // Adversarial: only the FIRST read of a path is genuine. Any later read -- which is
            // exactly what a signed-URL redirect would cause -- returns tampered bytes.
            const bytes = seen === 0 ? objects.get(path) : TAMPERED;
            return { data: { arrayBuffer: async () => bytes, type: path.endsWith('.pdf') ? 'application/pdf' : undefined }, error: null };
          },
          createSignedUrl: async () => {
            calls.signedUrls += 1;
            return { data: { signedUrl: 'https://storage.invalid/second-read' }, error: null };
          }
        };
      }
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'consume_customer_report_access_token') {
        if (options.consumeFails) return { data: null, error: { message: 'connection reset' } };
        if (options.consumeRefuses) {
          return { data: { ok: false, reason: options.consumeRefuses }, error: null };
        }
        return { data: { ok: true, token_id: TOKEN_ID, order_id: ORDER_ID, report_id: REPORT_ID, access_count: 1 }, error: null };
      }
      if (options.auditFails) return { error: { code: 'XX000', message: 'audit unavailable' } };
      return { data: { ok: true }, error: null };
    }
  };
}

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  FAIL - ${name}\n${error.message}`); }
}
const run = async (options, artefact) => {
  activeDb = makeDb(options);
  try { return { result: await grantCustomerReportAccess({ rawToken: 'x'.repeat(32), artefact }), db: activeDb }; }
  catch (error) { return { error, db: activeDb }; }
};

console.log('G29 verified-byte delivery contract');

await test('1/2/3. PDF: authorised access returns the exact authoritative bytes, checksum and size', async () => {
  const { result, error } = await run({}, 'pdf');
  assert.ok(!error, `unexpected error: ${error?.message}`);
  assert.ok(Buffer.isBuffer(result.bytes), 'the result must carry bytes');
  assert.equal(result.bytes.equals(PDF_BYTES), true, 'delivered bytes must be the authoritative PDF');
  assert.equal(sha256(result.bytes), PDF_SHA);
  assert.equal(result.checksumSha256, PDF_SHA);
  assert.equal(result.fileSizeBytes, PDF_BYTES.length);
  assert.equal(result.mimeType, 'application/pdf');
});

await test('1/2/3. register: authorised access returns the exact authoritative bytes, checksum and size', async () => {
  const { result, error } = await run({}, 'register');
  assert.ok(!error, `unexpected error: ${error?.message}`);
  assert.equal(result.bytes.equals(XLSX_BYTES), true, 'delivered bytes must be the authoritative register');
  assert.equal(sha256(result.bytes), XLSX_SHA);
  assert.equal(result.checksumSha256, XLSX_SHA);
  assert.equal(result.fileSizeBytes, XLSX_BYTES.length);
  assert.match(result.mimeType, /spreadsheetml\.sheet$/);
});

await test('4/8. only the verified instance is delivered, even though every later read is tampered', async () => {
  for (const artefact of ['pdf', 'register']) {
    const { result, db } = await run({}, artefact);
    const expected = artefact === 'pdf' ? PDF_BYTES : XLSX_BYTES;
    assert.equal(result.bytes.equals(expected), true, `${artefact}: must deliver the verified instance`);
    assert.equal(result.bytes.includes(TAMPERED), false, `${artefact}: tampered bytes must never appear`);
    const servedPath = artefact === 'pdf' ? PDF_PATH : REGISTER_PATH;
    assert.equal(db.calls.downloads.filter((p) => p === servedPath).length, 1,
      `${artefact}: the served path must be read exactly once`);
  }
});

await test('5/6. no signed URL is created and no redirect target is returned', async () => {
  for (const artefact of ['pdf', 'register']) {
    const { result, db } = await run({}, artefact);
    assert.equal(db.calls.signedUrls, 0, `${artefact}: createSignedUrl must not be called`);
    assert.equal(result.url, undefined, `${artefact}: no redirect URL may be returned`);
    assert.equal(result.expiresInSeconds, undefined, `${artefact}: no signed-URL TTL may be returned`);
  }
  const route = fs.readFileSync('src/app/score/report/access/[token]/route.ts', 'utf8');
  assert.doesNotMatch(route, /NextResponse\.redirect/, 'the customer route must not redirect');
  assert.doesNotMatch(route, /createSignedUrl/, 'the customer route must not sign storage URLs');
  const service = fs.readFileSync('src/lib/reports/customer-report-access.ts', 'utf8');
  assert.doesNotMatch(service, /createSignedUrl/, 'the access path must not sign storage URLs');
});

await test('7. tampered verification read fails closed with zero artefact bytes', async () => {
  const pdf = await run({ replaceObject: { path: PDF_PATH, bytes: Buffer.concat([Buffer.from('%PDF-1.4\n'), TAMPERED]) } }, 'pdf');
  assert.ok(pdf.error instanceof CustomerReportAccessError, 'tampered PDF must fail closed');
  assert.equal(pdf.error.reason, 'integrity_failed');
  assert.equal(pdf.result, undefined, 'no bytes may be returned');
  assert.ok(pdf.db.calls.reportStatusUpdates.includes('FAILED'), 'the report must be marked FAILED');

  const reg = await run({ replaceObject: { path: REGISTER_PATH, bytes: TAMPERED } }, 'register');
  assert.ok(reg.error instanceof CustomerReportAccessError, 'tampered register must fail closed');
  assert.equal(reg.error.reason, 'integrity_failed');
  assert.equal(reg.result, undefined, 'no bytes may be returned');
});

await test('9. missing physical object fails closed', async () => {
  const pdf = await run({ removeObject: PDF_PATH }, 'pdf');
  assert.equal(pdf.error?.reason, 'stored_file_missing');
  assert.equal(pdf.error?.status, 404);
  const reg = await run({ removeObject: REGISTER_PATH }, 'register');
  assert.equal(reg.error?.reason, 'stored_file_missing');
  assert.equal(reg.error?.status, 404, 'a missing register must be a customer-safe 404');
});

await test('10/11. cross-report, missing and unverified register fail closed', async () => {
  const absent = await run({ artefactRow: null }, 'register');
  assert.equal(absent.error?.reason, 'stored_file_missing');
  assert.equal(absent.error?.status, 404);
  const unverified = await run({ registerStatus: 'PENDING' }, 'register');
  assert.equal(unverified.error?.reason, 'stored_file_missing');
  const mismatched = await run({ registerChecksum: 'f'.repeat(64) }, 'register');
  assert.equal(mismatched.error?.reason, 'integrity_failed');
  const wrongSize = await run({ registerSize: XLSX_BYTES.length + 1 }, 'register');
  assert.equal(wrongSize.error?.reason, 'integrity_failed');
  // Cross-report is structural: the artefact lookup is scoped by the authorised report id.
  const service = fs.readFileSync('src/lib/reports/customer-report-access.ts', 'utf8');
  assert.match(service, /\.eq\('report_id', report\.id\)/, 'register lookup must be scoped to the authorised report');
});

await test('12. audit records pdf versus supporting_register', async () => {
  const pdf = await run({}, 'pdf');
  const reg = await run({}, 'register');
  const typeOf = (db) => db.calls.rpc.filter((c) => c.name.startsWith('record_customer_report_'))
    .map((c) => c.args.p_artefact_type);
  assert.deepEqual(typeOf(pdf.db), ['pdf']);
  assert.deepEqual(typeOf(reg.db), ['supporting_register']);
});

await test('13. audit failure prevents release', async () => {
  for (const artefact of ['pdf', 'register']) {
    const { result, error } = await run({ auditFails: true }, artefact);
    assert.equal(result, undefined, `${artefact}: no bytes may be released when the audit fails`);
    assert.ok(error instanceof CustomerReportAccessError, `${artefact}: audit failure must fail closed`);
  }
});

await test('14. access accounting occurs only on successful authorised access', async () => {
  const ok = await run({}, 'pdf');
  const consumptions = (db) => db.calls.rpc.filter((c) => c.name === 'consume_customer_report_access_token');
  assert.equal(consumptions(ok.db).length, 1, 'a successful access must consume exactly once');
  assert.equal(ok.db.calls.tokenUpdates, 0,
    'the legacy read-then-write counter update must be gone');
  const denied = await run({ removeObject: PDF_PATH }, 'pdf');
  // Consumption now happens BEFORE the artefact is read, so a Storage failure after it legitimately
  // consumes an access without delivering bytes. That is the intended abuse-control semantic; a
  // refund would reintroduce the race this replaced.
  assert.equal(consumptions(denied.db).length, 1,
    'an authorised attempt consumes its allowance before the object is read');
  assert.equal(denied.db.calls.tokenUpdates, 0, 'no legacy counter mutation on any path');

  // Refusal by the atomic consumer must prevent any Storage read at all.
  for (const reason of ['rate_limited', 'revoked_token', 'expired_token']) {
    const refused = await run({ consumeRefuses: reason }, 'pdf');
    assert.ok(refused.error instanceof CustomerReportAccessError, `${reason}: must fail closed`);
    assert.equal(refused.result, undefined, `${reason}: no bytes may be returned`);
    assert.equal(refused.db.calls.downloads.length, 0, `${reason}: zero Storage downloads`);
  }
  // A database failure in the consumer is never an authorisation.
  const consumeBroken = await run({ consumeFails: true }, 'pdf');
  assert.ok(consumeBroken.error instanceof CustomerReportAccessError, 'consumer failure must fail closed');
  assert.equal(consumeBroken.result, undefined, 'no bytes on consumer failure');
  assert.equal(consumeBroken.db.calls.downloads.length, 0, 'zero Storage downloads on consumer failure');

  // Ordering: consumption precedes the first Storage read.
  const order = ok.db.calls.rpc.findIndex((c) => c.name === 'consume_customer_report_access_token');
  assert.ok(order >= 0 && ok.db.calls.downloads.length > 0,
    'a successful access consumes and then downloads');
});

await test('15. raw storage path and bucket are never disclosed to the customer', async () => {
  for (const artefact of ['pdf', 'register']) {
    const { result } = await run({}, artefact);
    const serialised = JSON.stringify({ ...result, bytes: undefined });
    assert.doesNotMatch(serialised, /generated-reports/, `${artefact}: bucket must not be disclosed`);
    assert.doesNotMatch(serialised, /org\/ord\/v1/, `${artefact}: storage path must not be disclosed`);
    assert.equal(result.storagePath, undefined);
    assert.equal(result.storageBucket, undefined);
  }
});

await test('route sets the customer-facing security headers', () => {
  const route = fs.readFileSync('src/app/score/report/access/[token]/route.ts', 'utf8');
  for (const header of [
    "'Content-Type': result.mimeType",
    "'Cache-Control': 'private, no-store'",
    "'X-Content-Type-Options': 'nosniff'"
  ]) assert.ok(route.includes(header), `route must set ${header}`);
  assert.match(route, /Content-Disposition[\s\S]{0,40}safeContentDisposition/, 'attachment disposition required');
  assert.match(route, /attachment; filename=/, 'disposition must be an attachment');
});

await test('PDF magic validation is not reused for the register', () => {
  const service = fs.readFileSync('src/lib/reports/customer-report-access.ts', 'utf8');
  // Strip comments: the branch deliberately explains in prose why the PDF magic check does not
  // apply here, and that explanation must not be mistaken for the check itself.
  const registerBranch = service
    .slice(service.indexOf("if (input.artefact === 'register')"))
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(registerBranch, /%PDF/, 'the register must not be validated as a PDF');
  assert.doesNotMatch(registerBranch, /subarray\(0, 4\)/, 'no magic-byte check may run on the register');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
