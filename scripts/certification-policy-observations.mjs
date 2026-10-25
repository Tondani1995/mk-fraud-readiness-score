/** Decision evidence: unchanged executable calculator, existing deterministic graph adapter. */
import assert from 'node:assert/strict';
import { buildAdaptiveVisualReviewState } from '../src/lib/visual-review/fixtures.ts';
import { calculateAdaptiveReadinessScore } from '../src/lib/scoring/adaptive-scoring.ts';
const state = buildAdaptiveVisualReviewState('review'), graph = state.graph;
const methodology = {
  domains: graph.domains.map(domain => ({
    id:domain.domainCode,domainCode:domain.domainCode,name:domain.name,weightPct:domain.weightPct,
    domainType:'control',isCore:Boolean(domain.isCore),sortOrder:domain.sortOrder,
    questions:graph.questions.filter(q=>q.domainCode===domain.domainCode).map((q,i)=>({
      id:q.questionId,questionCode:q.questionCode,domainCode:q.domainCode,domainName:domain.name,
      prompt:q.prompt,helpText:null,weight:q.weight,isCritical:q.isCritical,isHardGate:q.isHardGate,
      nAAllowed:false,nARuleKey:null,triggerKey:null,sortOrder:i
    }))
  })),responseScale:[],exposureFactors:[]
};
const controls=state.path.activeNodes.filter(n=>n.kind!=='gateway');
const cases=[
  ['all-known-4',()=>({responseState:'maturity',responseValue:4})],
  ['one-unknown',(_n,i)=>i<1?{responseState:'unknown',responseValue:null}:{responseState:'maturity',responseValue:4}],
  ['fourteen-unknown',(_n,i)=>i<14?{responseState:'unknown',responseValue:null}:{responseState:'maturity',responseValue:4}],
  ['twenty-unknown',(_n,i)=>i<20?{responseState:'unknown',responseValue:null}:{responseState:'maturity',responseValue:4}],
  ['all-unknown',()=>({responseState:'unknown',responseValue:null})],
  ['whole-D9-unknown',n=>n.domainCode==='D9'?{responseState:'unknown',responseValue:null}:{responseState:'maturity',responseValue:4}],
  ['ten-unanswered',(_n,i)=>i<10?null:{responseState:'maturity',responseValue:4}],
  ['all-unanswered',()=>null],
  ['all-numeric-zero',()=>({responseState:'maturity',responseValue:0})]
];
const observations=cases.map(([name,respond])=>{
  const controlResponses=Object.fromEntries(controls.map((node,i)=>[node.nodeId,respond(node,i)]).filter(([,answer])=>answer!==null));
  const result=calculateAdaptiveReadinessScore({graph,methodology,gatewayAnswers:state.gatewayAnswers,controlResponses});
  for(const trace of result.questionTraces.filter(t=>t.triggeredRules.includes('unknown_response_excluded_from_score_denominator')))
    assert.equal(trace.denominatorContribution,0);
  return {name,metrics:result.metrics,summary:result.summary,resultStatus:result.resultStatus,
    domains:result.domainResults,questionTraces:result.questionTraces};
});
assert.equal(observations.find(x=>x.name==='all-unknown').summary.overallScore,null);
console.log(JSON.stringify({kind:'current-executable-unknown-policy-evidence',graph:graph.graphVersion,
  metadata:graph.uncertaintyOption,scope:'Unchanged calculator; existing G27-style deterministic methodology adapter. No hosted data, scoring-policy change or issued-report calculation.',observations},null,2));
