import assert from 'node:assert/strict';
import { buildCalculatedSnapshotFixture, CALCULATED_VARIANTS } from '../src/lib/visual-review/calculated-fixtures.ts';
import { buildSnapshotVisualReviewFixture } from '../src/lib/visual-review/fixtures.ts';
import { buildCommercialSnapshotInsights } from '../src/lib/snapshot/commercial-insights.ts';
import { buildManagementView } from '../src/lib/snapshot/management-view.ts';
import { buildDeterministicSnapshotNarrative } from '../src/lib/snapshot/narrative.ts';
import { buildNextStepRecommendation } from '../src/lib/snapshot/next-step-recommendation.ts';
import { readFileSync, writeFileSync } from 'node:fs';
const evidence=[];
for (const variant of CALCULATED_VARIANTS) {
 const snapshot=buildCalculatedSnapshotFixture(variant);
 const insights=buildCommercialSnapshotInsights(snapshot);
 const view=buildManagementView(snapshot, insights);
 const narrative=buildDeterministicSnapshotNarrative({snapshot,insights});
 assert.equal(view.reconciled,true,variant+' reconciles control counts, classifications and domains');
 assert.equal(narrative.aiCallCount,0);
 assert.deepEqual(view.priorities.map(p=>p.domainCode),view.insufficient?[]:insights.priorityAreas.map(p=>p.domainCode));
 assert.equal(view.domains.reduce((n,d)=>n+d.responses.applicable,0),snapshot.adaptiveMetrics.applicableCount);
 assert.equal(view.domains.reduce((n,d)=>n+d.responses.unanswered,0),snapshot.adaptiveMetrics.unansweredApplicableCount);
 if(variant==='strong-controls') {assert.equal(snapshot.overallScore,100);assert.equal(snapshot.finalMaturity,'Strategic');assert.equal(snapshot.criticalGapCount,0);assert.equal(view.strengths.length,2);assert.ok(view.priorities.every(p=>p.controls.length===0));}
 if(variant==='mixed-controls') {assert.equal(snapshot.capApplied,true);assert.deepEqual(view.priorities.slice(0,2).map(p=>p.domainCode),['D3','D7']);assert.ok(view.priorities[0].controls.length>0);}
 if(variant==='visibility-limited') {assert.equal(snapshot.overallScore,null);assert.equal(view.insufficient,true);assert.deepEqual(view.priorities,[]);assert.deepEqual(view.strengths,[]);assert.ok(snapshot.adaptiveMetrics.visibilityGaps.length>0);}
 if(variant==='partial-coverage') {assert.ok(snapshot.coveragePct<90);assert.ok(snapshot.domains.filter(d=>d.rawScore!==null).every(d=>d.coveragePct===100));assert.ok(view.domains.some(d=>d.responses.unanswered>0));}
 const drift=structuredClone(snapshot);drift.adaptiveMetrics.questionTraces.pop();
 assert.equal(buildManagementView(drift,buildCommercialSnapshotInsights(drift)).reconciled,false);
 const duplicate=structuredClone(snapshot);duplicate.adaptiveMetrics.questionTraces.push(duplicate.adaptiveMetrics.questionTraces[0]);
 assert.equal(buildManagementView(duplicate,insights).reconciled,false);
 evidence.push({variant,score:snapshot.overallScore,calculated:snapshot.calculatedMaturity,recorded:snapshot.finalMaturity,status:snapshot.resultStatus,critical:snapshot.criticalGapCount,major:snapshot.majorGapCount,coverage:snapshot.coveragePct,visibility:snapshot.adaptiveMetrics.controlVisibilityPct,unknownShare:snapshot.adaptiveMetrics.unknownSharePct,applicable:snapshot.adaptiveMetrics.applicableCount,unknown:snapshot.adaptiveMetrics.unknownCount,unanswered:snapshot.adaptiveMetrics.unansweredApplicableCount,priorityDomains:view.priorities.map(p=>p.domainCode),strengths:view.strengths.map(p=>p.domainCode),narrativeFallback:narrative.fallbackReason??null,historicalRecommendation:buildNextStepRecommendation(snapshot),domains:view.domains.map(d=>({code:d.domainCode,score:d.rawScore,coverage:d.coveragePct,responses:d.responses}))});
}
const sample=buildSnapshotVisualReviewFixture('score-60');
const sampleView=buildManagementView(sample,buildCommercialSnapshotInsights(sample));
assert.equal(sampleView.reconciled,false);assert.ok(sampleView.priorities.every(p=>p.controls.length===0));
assert.ok(sampleView.domains.every(d=>d.responses===null));
const mismatched=structuredClone(sample);mismatched.domains[0].domainName='Different historical domain';
assert.ok(buildCommercialSnapshotInsights(mismatched).priorityAreas.every(p=>p.domainName!=='Fraud Leadership and Governance'));
const ui=readFileSync('src/components/products/ProductChoice.tsx','utf8');
assert.doesNotMatch(ui,/Best fit for your result|recommendation\.recommendedTier|recommendation\.reason/);
assert.match(ui,/\['essential', 'comprehensive'\]/);
assert.match(ui,/COMMERCIAL_CATALOGUE\[tier\]/);
console.log(JSON.stringify(evidence,null,2));
console.error('Snapshot management tests passed: all five engine cases, trace drift, duplicates, unsupported attribution, withholding, domain identity and neutral scope selection.');
