import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(
  fs.readFileSync('src/lib/reports/email/delivery-dispatch.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
).outputText;
const deliveryModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)((specifier) => {
  if (specifier === 'node:crypto') return { __esModule: true, default: crypto };
  if (specifier === '../phase14-security') return {
    async executePhase14WorkerStep() { throw new Error('worker path was not expected in this provider test'); }
  };
  throw new Error(`Unexpected delivery-dispatch dependency: ${specifier}`);
}, deliveryModule, deliveryModule.exports);
const { executeClaimedReportDelivery } = deliveryModule.exports;

const pdf = Buffer.from('%PDF-1.7\nphase14 isolated provider test');
const checksum = crypto.createHash('sha256').update(pdf).digest('hex');
const report = {
  id: '00000000-0000-0000-0000-000000000010',
  storage_bucket: 'generated-reports',
  storage_path: 'A/report.pdf',
  checksum
};
const claim = {
  authorization_id: '00000000-0000-0000-0000-000000000011',
  lease_token: '00000000-0000-0000-0000-000000000012',
  email_event_id: '00000000-0000-0000-0000-000000000013',
  report_checksum: checksum
};
const transportInput = {
  from: 'sender@example.invalid',
  to: 'recipient@example.invalid',
  replyTo: 'reply@example.invalid',
  subject: 'Test',
  html: '<p>Test</p>',
  text: 'Test',
  attachment: { filename: 'report.pdf', contentBase64: '' },
  idempotencyKey: 'phase14-test-key',
  tags: []
};

function dbDouble(options = {}) {
  const calls = [];
  return {
    calls,
    db: {
      storage: {
        from() {
          return {
            async download() {
              calls.push(['download']);
              const bytes = options.wrongChecksum ? Buffer.from('wrong') : pdf;
              return { data: new Blob([bytes]), error: null };
            }
          };
        }
      },
      from(table) {
        return {
          async upsert(value) {
            calls.push(['upsert', table, value]);
            return { error: null };
          }
        };
      },
      async rpc(name, args) {
        calls.push([name, args]);
        if (name === 'finalize_premium_report_delivery' && options.finalizationError) {
          return { data: null, error: new Error('isolated finalization fault') };
        }
        return { data: name === 'finalize_premium_report_delivery' ? { finalized: true } : true, error: null };
      }
    }
  };
}

async function execute(double, transport) {
  return executeClaimedReportDelivery({
    db: double.db,
    rpcDb: double.db,
    report,
    claim,
    transport,
    transportInput
  });
}

{
  const double = dbDouble({ wrongChecksum: true });
  let providerCalls = 0;
  await assert.rejects(execute(double, async () => {
    providerCalls += 1;
    return { messageId: 'must-not-send' };
  }), /checksum mismatch/);
  assert.equal(providerCalls, 0, 'checksum mismatch must stop before the provider boundary');
  assert(double.calls.some(([name]) => name === 'fail_premium_report_delivery_before_dispatch'));
  assert(!double.calls.some(([name]) => name === 'mark_premium_report_delivery_dispatch_started'));
}

{
  const double = dbDouble();
  await assert.rejects(execute(double, async () => {
    throw new Error('isolated ambiguous provider failure');
  }), /ambiguous provider failure/);
  const boundary = double.calls.findIndex(([name]) => name === 'mark_premium_report_delivery_dispatch_started');
  const reconciliation = double.calls.findIndex(([name, args]) =>
    name === 'mark_premium_report_delivery_reconciliation_required'
    && args.p_provider_message_id === null);
  assert(boundary >= 0 && reconciliation > boundary, 'post-boundary failure must become reconciliation-required');
  assert(!double.calls.some(([name]) => name === 'fail_premium_report_delivery_before_dispatch'));
}

{
  const double = dbDouble({ finalizationError: true });
  await assert.rejects(execute(double, async () => ({ messageId: 'provider-accepted-1' })), /requires reconciliation/);
  const finalization = double.calls.findIndex(([name]) => name === 'finalize_premium_report_delivery');
  const reconciliation = double.calls.findIndex(([name, args]) =>
    name === 'mark_premium_report_delivery_reconciliation_required'
    && args.p_provider_message_id === 'provider-accepted-1');
  assert(finalization >= 0 && reconciliation > finalization, 'accepted request must retain provider identity for reconciliation');
  assert(!double.calls.some(([name]) => name === 'fail_premium_report_delivery_before_dispatch'));
}

{
  const double = dbDouble();
  const result = await execute(double, async (input) => {
    assert(input.attachment.contentBase64.length > 0, 'verified PDF must be attached at the dispatch boundary');
    return { messageId: 'provider-accepted-2' };
  });
  assert.equal(result.providerMessageId, 'provider-accepted-2');
  assert.equal(double.calls.filter(([name]) => name === 'finalize_premium_report_delivery').length, 1);
}

console.log('phase14_provider_fault_injection_tests_passed');
