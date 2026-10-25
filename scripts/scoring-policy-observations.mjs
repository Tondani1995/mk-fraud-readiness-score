/** Decision evidence only. Executes the current calculator; never alters scoring policy or stored results. */
import fs from 'node:fs';
import { buildAdaptiveVisualReviewState } from '../src/lib/visual-review/fixtures.ts';
import { calculateAdaptiveReadinessScore } from '../src/lib/scoring/adaptive-scoring.ts';
const state=buildAdaptiveVisualReviewState('review'),graph=state.graph;
const methodology={domains:graph.domains.map(domain=>({id:domain.domainCode,domainCode:domain.domainCode,name:domain.name,weightPct:domain.weightPct,domainType:'control',isCore:Boolean(domain.isCore),sortOrder:domain.sortOrder,questions:graph.questions.filter(q=>q.domainCode===domain.domainCode).map((q,i)=>({id:q.questionId,questionCode:q.questionCode,domainCode:q.domainCode,domainName:domain.name,prompt:q.prompt,helpText:null,weight:q.weight,isCritical:q.isCritical,isHardGate:q.isHardGate,nAAllowed:false,nARuleKey:null,triggerKey:null,sortOrder:i}))})),responseScale:[],exposureFactors:[]};
const controls=state.path.activeNodes.filter(n=>n.kind!=='gateway');
const observations=[];
for(const count of [0,1,14,20,controls.length]){
 const controlResponses=Object.fromEntries(controls.map((node,i)=>[node.nodeId,i<count?{responseState:'unknown',responseValue:null}:{responseState:'maturity',responseValue:4}]));
 const r=calculateAdaptiveReadinessScore({graph,methodology,gatewayAnswers:state.gatewayAnswers,controlResponses});
 const unknownTraces=r.questionTraces.filter(t=>t.triggeredRules.includes('unknown_response_excluded_from_score_denominator'));
 observations.push({unknownCount:count,applicableCount:r.metrics.applicableCount,unknownSharePct:r.metrics.unknownSharePct,coveragePct:r.summary.coveragePct,visibilityPct:r.metrics.controlVisibilityPct,status:r.resultStatus,issuedScore:r.summary.overallScore,criticalGapCount:r.summary.criticalGapCount,unknownDenominatorContributions:[...new Set(unknownTraces.map(t=>t.denominatorContribution))],limitationReasons:r.metrics.limitationReasons});
}
const report={kind:'current-executable-policy-observations',graph:graph.graphVersion,metadata:graph.uncertaintyOption,adapter:'Existing G27 deterministic methodology adapter, no database or new scoring rules.',observations};
console.log(JSON.stringify(report,null,2));
