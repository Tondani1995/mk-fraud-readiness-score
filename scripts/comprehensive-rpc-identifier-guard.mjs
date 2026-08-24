import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const rpcIdentifierPattern = /\.rpc\(\s*(['"])([^'"]+)\1/g;
const identifiers = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.tsx?$/.test(entry.name)) {
      const source = fs.readFileSync(absolute, 'utf8');
      for (const match of source.matchAll(rpcIdentifierPattern)) {
        identifiers.push({
          file: path.relative(root, absolute).split(path.sep).join('/'),
          name: match[2]
        });
      }
    }
  }
}

walk(sourceRoot);
assert.ok(identifiers.length > 0, 'the application must expose at least one literal RPC contract for the guard');
for (const identifier of identifiers) {
  assert.ok(
    Buffer.byteLength(identifier.name, 'utf8') <= 63,
    `application-facing PostgreSQL RPC identifier exceeds 63 bytes: ${identifier.name} (${identifier.file})`
  );
}

const phase1 = fs.readFileSync(path.join(root, 'src/lib/reports/phase1-manual-fulfilment.ts'), 'utf8');
assert.match(phase1, /rpc\('finalise_comprehensive_report_package'/);
assert.doesNotMatch(phase1, /rpc\('finalise_comprehensive_automated_report_with_supporting_register'/);
assert.equal(
  Buffer.byteLength('finalise_comprehensive_report_package', 'utf8'),
  37,
  'the deliberate Comprehensive finalisation identifier length must remain explicit and bounded'
);

console.log(`comprehensive RPC identifier guard: ${identifiers.length} literal RPC identifiers <= 63 bytes; finalise_comprehensive_report_package = 37 bytes.`);
