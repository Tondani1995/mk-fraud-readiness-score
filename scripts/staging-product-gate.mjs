#!/usr/bin/env node
/** Read-only evidence gate. Never creates records, orders, payments, reports or messages. */
import fs from 'node:fs';
import path from 'node:path';
const cases = ['identity','creation','branching','save-resume','completion','private-result','essential-order','comprehensive-order','payment-negative','payment-confirmation','report-generation','private-delivery','recovery','mobile-assistive'];
const manifestPath=process.argv[2];
const report={kind:'staging-product-verification-gate',mode:'read-only evidence validation',passed:[],blocked:[]};
if(!manifestPath) report.blocked.push('Supply a completed staging-evidence.json manifest. No application/provider credentials are configured for this checkout.');
else {
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const checks={
  'environment is preview':manifest.environment==='preview',
  'deployment commit is bound':/^[a-f0-9]{40}$/i.test(manifest.deploymentSha??''),
  'isolated disposable data is confirmed':manifest.isolationConfirmed===true,
  'all payment paths are non-chargeable':manifest.nonChargeablePayments===true,
  'all report/AI paths are non-chargeable':manifest.nonChargeableGeneration===true,
  'external customer communications are blocked':manifest.customerCommunicationBlocked===true,
  'project identity is recorded':typeof manifest.projectRef==='string' && manifest.projectRef.length>0,
  'production domain is excluded':manifest.productionExcluded===true && /^https:\/\//.test(manifest.baseUrl??''),
  'methodology uncertainty policy reconciled':manifest.methodologyPolicyReconciled===true
 };
 for(const [label,ok] of Object.entries(checks)) (ok?report.passed:report.blocked).push(label);
 for(const id of cases) {
  const result=manifest.cases?.[id];
  const valid=result?.status==='pass' && result.deploymentSha===manifest.deploymentSha && typeof result.observation==='string' && result.observation.trim().length>10 && Array.isArray(result.evidenceFiles) && result.evidenceFiles.length>0 && result.evidenceFiles.every(file=>fs.existsSync(path.resolve(path.dirname(manifestPath),file)));
  (valid?report.passed:report.blocked).push(`${id}: ${valid?'evidence supplied':'missing passing result, matching commit, observation or evidence files'}`);
 }
}
report.releaseRecommendation=report.blocked.length?'NO-GO: staging verification incomplete':'Staging evidence gate passed; human review of evidence and separate production authorization still required';
console.log(JSON.stringify(report,null,2));
process.exitCode=report.blocked.length?2:0;
