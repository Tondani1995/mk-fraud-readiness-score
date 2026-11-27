// Live, read-only validation of the MK Fraud Signals restriction screen against the real Attio
// workspace (approval A6). Creates and updates nothing in Attio and sends nothing anywhere else.
//
// Run with the token in a file OUTSIDE the repository, never on the command line:
//   node --env-file=$HOME/.mk-attio-readonly.env --experimental-strip-types \
//     --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/marketing-attio-live-readonly-check.mjs
// The file holds MK_ATTIO_RESTRICTION_READ_TOKEN (plus the two list IDs below if they ever change).
//
// Output is counts, decisions and hashed identifiers only: no names, domains, addresses or token.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { screenSubscriberAgainstAttio, resetRestrictionCacheForTests } from '../src/lib/marketing/attio-restrictions.ts';

const token = process.env.MK_ATTIO_RESTRICTION_READ_TOKEN?.trim();
if (!token) {
  console.error('MK_ATTIO_RESTRICTION_READ_TOKEN is not set (use --env-file with a file outside the repository).');
  process.exit(2);
}
const RESTRICTED = process.env.MK_ATTIO_RESTRICTED_LIST_ID?.trim() || '858bdb00-fec0-4707-8d01-9ca966e43c25';
const REGISTER = process.env.MK_ATTIO_COMMERCIAL_REGISTER_LIST_ID?.trim() || 'cad2b859-469f-448b-9339-42ea4a13e83a';
const API = 'https://api.attio.com/v2';
const short = (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 10);

let requests = 0;
async function call(method, path, body) {
  // Only GET and the documented read-only POST query endpoints are ever called.
  assert.ok(method === 'GET' || (method === 'POST' && /\/(entries|records)\/query$/.test(path)), `refusing non-read call ${method} ${path}`);
  requests += 1;
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`attio_${response.status}_${path.split('/').slice(0, 3).join('_')}`);
  return json;
}

async function allEntries(listId, filter) {
  const out = [];
  for (let offset = 0; offset < 10_000; offset += 500) {
    const page = await call('POST', `/lists/${listId}/entries/query`, { limit: 500, offset, ...(filter ? { filter } : {}) });
    out.push(...page.data);
    if (page.data.length < 500) break;
  }
  return out;
}

const report = { checkedAt: new Date().toISOString() };

// 1. Least privilege: the token must hold read scopes only.
const self = await call('GET', '/self');
assert.equal(self.active, true, 'token is not active (unknown, revoked or deleted)');
const scopes = String(self.scope ?? '').split(/\s+/).filter(Boolean);
report.tokenScopes = scopes;
assert.ok(scopes.length > 0, 'token scopes could not be read');
assert.ok(scopes.every((scope) => scope.endsWith(':read')), `token has non-read scopes: ${scopes.filter((s) => !s.endsWith(':read')).join(', ')}`);

// 2. Full Restricted Organisations register, independent of any saved view.
const restricted = await allEntries(RESTRICTED, null);
const restrictedParents = new Set(restricted.map((e) => e.parent_record_id));
report.restrictedRegister = {
  entries: restricted.length,
  distinctParentRecords: restrictedParents.size,
  duplicateEntries: restricted.length - restrictedParents.size,
  parentObjects: restricted.reduce((acc, e) => ({ ...acc, [e.parent_object]: (acc[e.parent_object] ?? 0) + 1 }), {})
};

// 3. Commercial register: every entry, and the exclusion subset by status.
const register = await allEntries(REGISTER, null);
const excluded = await allEntries(REGISTER, { relationship_status: { status: { $eq: 'Excluded' } } });
report.commercialRegister = {
  entries: register.length,
  excludedEntries: excluded.length,
  excludedDistinctParents: new Set(excluded.map((e) => e.parent_record_id)).size,
  excludedAlsoInRestricted: excluded.filter((e) => restrictedParents.has(e.parent_record_id)).length
};

// 4. Domains on restricted companies (aliases included), for the screen test only.
const companyIds = [...restrictedParents];
const companies = companyIds.length
  ? (await call('POST', '/objects/companies/records/query', { filter: { record_id: { $in: companyIds } }, limit: 500 })).data
  : [];
const domainsByCompany = companies.map((c) => (c.values?.domains ?? []).map((d) => d.domain).filter(Boolean));
report.restrictedCompanies = {
  companyRecordsFound: companies.length,
  withAtLeastOneDomain: domainsByCompany.filter((d) => d.length > 0).length,
  withAliasDomains: domainsByCompany.filter((d) => d.length > 1).length,
  withoutDomain: domainsByCompany.filter((d) => d.length === 0).length
};

// 5. Real screen decisions for synthetic addresses on real restricted domains. Nothing is sent.
const config = {
  token,
  restrictedListId: RESTRICTED,
  commercialRegisterListId: REGISTER,
  exclusionStatusAttribute: 'relationship_status',
  exclusionStatuses: ['Excluded']
};
const decisions = [];
const sampleDomains = domainsByCompany.flat().slice(0, 12);
for (const domain of sampleDomains) {
  resetRestrictionCacheForTests();
  const result = await screenSubscriberAgainstAttio(`mk-qa-screen-check@${domain}`, config);
  decisions.push({ domain: short(domain), decision: result.decision, detail: result.evidence.detail });
}
resetRestrictionCacheForTests();
const unrelated = await screenSubscriberAgainstAttio('mk-qa-screen-check@unrelated-domain-for-testing.invalid', config);
resetRestrictionCacheForTests();
const personal = await screenSubscriberAgainstAttio('mk-qa-screen-check-not-a-person@gmail.com', config);
report.screenDecisions = {
  restrictedDomainsTested: decisions.length,
  restricted: decisions.filter((d) => d.decision === 'restricted').length,
  ambiguous: decisions.filter((d) => d.decision === 'ambiguous').length,
  clear: decisions.filter((d) => d.decision === 'clear').length,
  unchecked: decisions.filter((d) => d.decision === 'unchecked').length,
  detail: decisions,
  unrelatedDomain: unrelated.decision,
  personalMailboxWithNoPerson: personal.decision
};
report.attioRequests = requests;

console.log(JSON.stringify(report, null, 2));
const failures = [];
if (report.screenDecisions.clear > 0) failures.push('a restricted domain screened clear');
if (unrelated.decision !== 'clear') failures.push('an unrelated domain did not screen clear');
if (personal.decision !== 'clear') failures.push('an unknown personal mailbox did not screen clear');
if (failures.length) {
  console.error('FAIL:', failures.join('; '));
  process.exit(1);
}
console.log('PASS: live read-only screen behaves as designed.');
