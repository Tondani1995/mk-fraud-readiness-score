// Phase 14 launch readiness -- M11: CI dependency-security gate.
//
// Reads `npm audit --omit=dev --json` output (a production-dependency-only audit; dev tooling
// vulnerabilities do not ship to customers and are recorded but never block the build) and fails
// the build on any unexpired Critical or High severity advisory that is not explicitly listed in
// security/dependency-audit-exceptions.json. Moderate and Low findings are always recorded (never
// silently ignored) but never fail the build on their own. An exception must carry a reason, an
// owner, and an expiry date; an EXPIRED exception no longer suppresses its advisory (the build
// fails again until the exception is renewed or the advisory is actually fixed) -- an exception
// can never be a permanent, unreviewed bypass.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const auditJsonPath = process.argv[2];
if (!auditJsonPath) {
  console.error('Usage: node scripts/phase14-dependency-audit-gate.mjs <npm-audit-json-path>');
  process.exit(2);
}

const exceptionsPath = path.join(root, 'security/dependency-audit-exceptions.json');
const exceptions = fs.existsSync(exceptionsPath)
  ? JSON.parse(fs.readFileSync(exceptionsPath, 'utf8')).exceptions
  : [];

const today = new Date().toISOString().slice(0, 10);
const activeExceptions = [];
const expiredExceptions = [];
for (const exception of exceptions) {
  if (!exception.reason?.trim() || !exception.owner?.trim() || !exception.expires?.trim()) {
    console.error(`Malformed exception entry (reason/owner/expires all required): ${JSON.stringify(exception)}`);
    process.exit(2);
  }
  (exception.expires >= today ? activeExceptions : expiredExceptions).push(exception);
}
if (expiredExceptions.length > 0) {
  console.warn('The following dependency-audit exceptions have EXPIRED and no longer suppress their advisories:');
  for (const exception of expiredExceptions) {
    console.warn(`  - ${exception.package} / ${exception.advisoryIdPattern} (expired ${exception.expires}, owner: ${exception.owner})`);
  }
}

function isExcepted(advisoryId, packageName, severity) {
  return activeExceptions.some((exception) =>
    new RegExp(`^${exception.advisoryIdPattern}$`).test(advisoryId)
    && exception.package === packageName
    && exception.severity === severity);
}

const audit = JSON.parse(fs.readFileSync(auditJsonPath, 'utf8'));
const vulnerabilities = audit.vulnerabilities ?? {};

const blocking = [];
const suppressed = [];
const recorded = { moderate: [], low: [], info: [] };

for (const [packageName, entry] of Object.entries(vulnerabilities)) {
  const severity = entry.severity;
  const advisoryIds = (entry.via ?? [])
    .filter((v) => typeof v === 'object' && v.url)
    .map((v) => v.url.split('/').pop());
  const uniqueAdvisoryIds = advisoryIds.length > 0 ? [...new Set(advisoryIds)] : ['(unspecified)'];

  for (const advisoryId of uniqueAdvisoryIds) {
    const record = { packageName, severity, advisoryId, range: entry.range };
    if (severity === 'critical' || severity === 'high') {
      if (isExcepted(advisoryId, packageName, severity)) {
        suppressed.push(record);
      } else {
        blocking.push(record);
      }
    } else if (severity === 'moderate') {
      recorded.moderate.push(record);
    } else if (severity === 'low') {
      recorded.low.push(record);
    } else {
      recorded.info.push(record);
    }
  }
}

console.log('--- Phase 14 dependency audit gate ---');
console.log(`Blocking (Critical/High, unsuppressed): ${blocking.length}`);
console.log(`Suppressed by documented exception (Critical/High): ${suppressed.length}`);
console.log(`Recorded, non-blocking (Moderate): ${recorded.moderate.length}`);
console.log(`Recorded, non-blocking (Low): ${recorded.low.length}`);
if (recorded.moderate.length > 0) {
  console.log('Moderate findings (recorded, does not fail the build):');
  for (const r of recorded.moderate) console.log(`  - ${r.packageName} (${r.advisoryId}) range=${r.range}`);
}
if (suppressed.length > 0) {
  console.log('Suppressed Critical/High findings (documented exception -- see security/dependency-audit-exceptions.json):');
  for (const r of suppressed) console.log(`  - ${r.packageName} (${r.advisoryId}) severity=${r.severity} range=${r.range}`);
}

if (blocking.length > 0) {
  console.error('BLOCKING: the following Critical/High advisories have no active documented exception:');
  for (const r of blocking) console.error(`  - ${r.packageName} (${r.advisoryId}) severity=${r.severity} range=${r.range}`);
  console.error('Fix the dependency, or add a time-boxed exception with reason/owner/expiry to security/dependency-audit-exceptions.json.');
  process.exit(1);
}

console.log('Dependency audit gate passed.');
