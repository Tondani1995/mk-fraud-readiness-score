import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';

function compileCommonJs(path, dependency) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(dependency, module, module.exports);
  return module.exports;
}

const classifier = compileCommonJs('src/lib/reports/storage-error-classifier.ts', () => {
  throw new Error('The storage classifier must remain dependency-free.');
});
const {
  publishCommittedReportObject,
  uploadTemporaryReportObject
} = compileCommonJs('src/lib/reports/storage-publication.ts', (specifier) => {
  if (specifier === 'node:crypto') return { __esModule: true, default: crypto };
  if (specifier === './storage-error-classifier') return classifier;
  throw new Error(`Unexpected storage-publication dependency: ${specifier}`);
});
import { readVerifiedReportObject } from '../src/lib/reports/download-verification.ts';

const bytes = Buffer.from('%PDF-1.7\nphase14 isolated storage test');
const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
const missingObjectError = () => Object.assign(new Error('Object not found'), {
  statusCode: 404,
  code: 'not_found'
});

function storageDouble(options = {}) {
  const objects = new Map(options.objects ?? []);
  const calls = [];
  const db = {
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      return { data: true, error: null };
    },
    from(table) {
      return {
        async upsert(value) {
          calls.push(['upsert', table, value]);
          return { error: null };
        }
      };
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, value) {
            calls.push(['upload', bucket, path]);
            if (options.uploadError) return { error: new Error(options.uploadError) };
            objects.set(`${bucket}/${path}`, Buffer.from(value));
            return { error: null };
          },
          async copy(from, to) {
            calls.push(['copy', bucket, from, to]);
            if (options.copyError) return { error: new Error(options.copyError) };
            const source = objects.get(`${bucket}/${from}`);
            if (!source) return { error: new Error('source missing') };
            objects.set(`${bucket}/${to}`, Buffer.from(source));
            return { error: null };
          },
          async download(path) {
            calls.push(['download', bucket, path]);
            const value = objects.get(`${bucket}/${path}`);
            return value
              ? { data: new Blob([value]), error: null }
              : { data: null, error: missingObjectError() };
          },
          async remove(paths) {
            calls.push(['remove', bucket, ...paths]);
            if (options.removeError) return { error: new Error(options.removeError) };
            for (const path of paths) objects.delete(`${bucket}/${path}`);
            return { error: null };
          }
        };
      }
    }
  };
  return { db, objects, calls };
}

function publicationDb(result = { data: { version_number: 2 }, error: null }) {
  const calls = [];
  return {
    calls,
    db: {
      async rpc(name, args) {
        calls.push([name, args]);
        return result;
      }
    }
  };
}

async function publish(storage, publication, extra = {}) {
  return publishCommittedReportObject({
    db: storage.db,
    bucket: 'generated-reports',
    temporaryPath: 'tmp/claim.pdf',
    finalPath: `A/report-${checksum}.pdf`,
    checksum,
    cleanupJobId: '00000000-0000-0000-0000-000000000003',
    async publishReport() {
      const { data, error } = await publication.db.rpc('publish_premium_report_generation', {
        p_claim_token: '00000000-0000-0000-0000-000000000001',
        p_report_id: '00000000-0000-0000-0000-000000000002'
      });
      if (error || !data) throw error ?? new Error('publication returned no data');
      return data;
    },
    async recordCleanupResult() { return true; },
    ...extra
  });
}

{
  const storage = storageDouble({ uploadError: 'isolated upload fault' });
  await assert.rejects(uploadTemporaryReportObject({
    db: storage.db, bucket: 'generated-reports', path: 'tmp/claim.pdf', bytes,
    checksum, reportReference: 'RPT-TEST-V1', claimToken: 'claim-token'
  }), /Temporary storage upload failed/);
  assert.equal(storage.objects.size, 0, 'upload failure must not leave an object');
}

{
  const storage = storageDouble({
    objects: [['generated-reports/tmp/claim.pdf', bytes]],
    copyError: 'isolated copy fault'
  });
  const publication = publicationDb();
  await assert.rejects(publish(storage, publication), /storage publication failed/);
  assert.equal(publication.calls.length, 0, 'copy failure must occur before database publication');
  assert(storage.objects.has('generated-reports/tmp/claim.pdf'), 'committed temporary object must remain recoverable');
}

{
  const finalPath = `generated-reports/A/report-${checksum}.pdf`;
  const storage = storageDouble({
    objects: [['generated-reports/tmp/claim.pdf', bytes], [finalPath, bytes]],
    copyError: 'duplicate object already exists'
  });
  const publication = publicationDb({ data: null, error: new Error('isolated database publication fault') });
  await assert.rejects(publish(storage, publication), /database publication fault/);
  assert(storage.objects.has(finalPath), 'verified final object must remain for deterministic retry');
  assert(!storage.objects.has('generated-reports/tmp/claim.pdf'), 'temporary object must be removed and its absence verified before terminal publication');
  assert.equal(storage.calls.filter(([name]) => name === 'remove').length, 1);
}

{
  const storage = storageDouble({
    objects: [['generated-reports/tmp/claim.pdf', bytes]],
    removeError: 'isolated cleanup fault'
  });
  const publication = publicationDb();
  const cleanupResults = [];
  const result = await publish(storage, publication, {
    recordCleanupResult(value) { cleanupResults.push(value); return true; }
  });
  assert.equal(result.cleanupFailed, true);
  assert.equal(cleanupResults.length, 1, 'cleanup failure must be persisted to the durable queue');
  assert.equal(cleanupResults[0].deletionRequested, true);
  assert.equal(cleanupResults[0].deleteApiAccepted, false);
  assert.equal(cleanupResults[0].providerResultClass, 'unknown_provider_error');
  assert.match(cleanupResults[0].error, /isolated cleanup fault/);
  assert.equal(publication.calls.length, 1, 'database publication must remain exactly once');
}

{
  const wrongBytes = Buffer.from('%PDF-1.7\nwrong object');
  const storage = storageDouble({ objects: [['generated-reports/tmp/claim.pdf', wrongBytes]] });
  const publication = publicationDb();
  await assert.rejects(publish(storage, publication), /checksum mismatch/);
  assert.equal(publication.calls.length, 0, 'checksum mismatch must fail before database publication');
}

{
  const storage = storageDouble({
    objects: [['generated-reports/tmp/claim.pdf', bytes]],
    removeError: 'isolated cleanup fault with queue outage'
  });
  const publication = publicationDb();
  await assert.rejects(publish(storage, publication, {
    async recordCleanupResult() { throw new Error('durable cleanup queue unavailable'); }
  }), /durable cleanup queue unavailable/);
}

{
  const storage = storageDouble({ objects: [['generated-reports/A/download.pdf', Buffer.from('wrong')]] });
  await assert.rejects(readVerifiedReportObject(storage.db, {
    report_id: '00000000-0000-0000-0000-000000000020',
    report_reference: 'RPT-DOWNLOAD-TEST',
    report_checksum: checksum,
    storage_bucket: 'generated-reports',
    storage_path: 'A/download.pdf',
    assessment_id: '00000000-0000-0000-0000-000000000021',
    order_id: '00000000-0000-0000-0000-000000000022'
  }), /checksum does not match/);
  assert(storage.calls.some(([kind, name, args]) =>
    kind === 'rpc' && name === 'record_phase14_operational_alert'
    && args.p_category === 'report_download_checksum_mismatch'),
  'download mismatch must create an operational alert');
}

{
  const storage = storageDouble();
  await assert.rejects(readVerifiedReportObject(storage.db, {
    report_id: '00000000-0000-0000-0000-000000000023',
    report_reference: 'RPT-DOWNLOAD-MISSING',
    report_checksum: checksum,
    storage_bucket: 'generated-reports',
    storage_path: 'A/missing.pdf',
    assessment_id: '00000000-0000-0000-0000-000000000024',
    order_id: '00000000-0000-0000-0000-000000000025'
  }), /object is missing/);
  assert(storage.calls.some(([kind, name, args]) =>
    kind === 'rpc' && name === 'record_phase14_operational_alert'
    && args.p_category === 'report_download_object_missing'));
}

{
  // L7: an exotic malformed error (a Proxy whose property access itself throws, rather than
  // merely returning undefined) must not escape the classifier as an uncaught exception -- it
  // must degrade to the same safe 'unknown_provider_error' default a merely-unrecognised error
  // already receives.
  const throwingError = new Proxy({}, {
    get() { throw new Error('isolated malformed-error property access fault'); }
  });
  assert.equal(
    classifier.classifySupabaseStorageResult(throwingError),
    'unknown_provider_error',
    'a throwing/malformed error value must resolve to unknown_provider_error, not throw'
  );
}

{
  // Sanity check: well-formed classification behaviour is unchanged by the L7 try/catch wrapper.
  assert.equal(classifier.classifySupabaseStorageResult(null), 'object_present');
  assert.equal(classifier.classifySupabaseStorageResult(missingObjectError()), 'object_not_found');
  assert.equal(
    classifier.classifySupabaseStorageResult(Object.assign(new Error('nope'), { statusCode: 500 })),
    'provider_outage'
  );
}

console.log('phase14_storage_fault_injection_tests_passed');
