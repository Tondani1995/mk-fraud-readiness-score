import assert from 'node:assert/strict';
import { createQuestionTransition, QUESTION_MOTION } from '../src/lib/adaptive/question-transition.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return {promise, resolve}; };
let checks=0;
for (const responseOrder of ['instant','ordinary','slow']) {
  const phases=[]; const exit=deferred(), entry=deferred(), confirmation=deferred();
  const delay=[]; let advances=0;
  const ticket=createQuestionTransition({reduced:false,phase:p=>phases.push(p),exit:()=>exit.promise,entry:()=>entry.promise,delay:(ms)=>{delay.push(ms);return confirmation.promise;}});
  // HTTP begins independently. A reply does not bypass the visible exit barrier.
  const response=deferred();
  const journey=(async()=>{await response.promise;await ticket.confirm();advances++;await ticket.enter();})();
  if(responseOrder==='slow') {exit.resolve();await Promise.resolve();assert.equal(advances,0);response.resolve();}
  else {response.resolve();await Promise.resolve();assert.equal(advances,0);exit.resolve();}
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(advances,0,'confirmation must resolve before changing the question');
  assert.deepEqual(phases,['collapsing','confirmed']);
  assert.deepEqual(delay,[QUESTION_MOTION.confirmationMs]);
  confirmation.resolve();for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(advances,1);assert.equal(phases.at(-1),'entering');
  entry.resolve();await journey;assert.equal(phases.at(-1),'idle');checks+=6;
}
for (const cancelAt of ['during-save','after-reply','during-entry']) {
  const exit=deferred(), entry=deferred(), confirmation=deferred();const phases=[];let advances=0;
  const ticket=createQuestionTransition({reduced:false,phase:p=>phases.push(p),exit:()=>exit.promise,entry:()=>entry.promise,delay:()=>confirmation.promise});
  const journey=(async()=>{await ticket.confirm();advances++;await ticket.enter();})();
  // A rejection handler is attached before cancelling, as in the controller.
  const rejected=assert.rejects(journey,{name:'AbortError'});
  if(cancelAt!=='during-save'){exit.resolve();for(let i=0;i<4;i++)await Promise.resolve();}
  if(cancelAt==='during-entry'){confirmation.resolve();for(let i=0;i<4;i++)await Promise.resolve();}
  ticket.cancel();exit.resolve();confirmation.resolve();entry.resolve();await rejected;
  assert.equal(phases.at(-1),'idle');assert.equal(advances,cancelAt==='during-entry'?1:0);checks+=3;
}
let called=0;const phases=[];
const reduced=createQuestionTransition({reduced:true,phase:p=>phases.push(p),exit:async()=>{called++;},entry:async()=>{called++;},delay:async()=>{called++;}});
await reduced.confirm();await reduced.enter();assert.equal(called,0);assert.deepEqual(phases,['collapsing','confirmed','entering','idle']);checks+=2;
console.log(JSON.stringify({ok:true,checks,scope:'Actual transition coordinator: fast/ordinary/slow acknowledgements, cancellation and reduced motion; browser CSS separately verified.'}));
