import assert from 'node:assert/strict';
import { createQuestionTransition, waitForQuestionMotion, QUESTION_MOTION } from '../src/lib/adaptive/question-transition.ts';
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
// Actual DOM-commit coordinator with a minimal observer double; CSS remains browser-verified.
const previousObserver=globalThis.MutationObserver;
let mutationCallback;
globalThis.MutationObserver=class { constructor(callback){mutationCallback=callback;} observe(){} disconnect(){} };
try {
  const animation=deferred();let inspected=0,finished=false;
  const stage={dataset:{transitionPhase:'idle'},querySelectorAll:()=>[{getAnimations:()=>{inspected++;return [{finished:animation.promise}];}}]};
  const controller=new AbortController();
  const waiting=waitForQuestionMotion(()=>stage,'exit',controller.signal,false).then(()=>{finished=true;});
  await Promise.resolve();assert.equal(inspected,0,'no animation inspection before React commits the phase');
  stage.dataset.transitionPhase='collapsing';mutationCallback();
  await Promise.resolve();assert.equal(inspected,1);assert.equal(finished,false,'actual animation must finish');
  animation.resolve();await waiting;assert.equal(finished,true);checks+=4;
  stage.dataset.transitionPhase='idle';const cancelled=new AbortController();
  const interrupted=waitForQuestionMotion(()=>stage,'entry',cancelled.signal,false);
  const rejection=assert.rejects(interrupted,{name:'AbortError'});cancelled.abort();await rejection;checks++;
  let touched=false;await waitForQuestionMotion(()=>{touched=true;return stage;},'entry',new AbortController().signal,true);
  assert.equal(touched,false,'reduced motion has no DOM/frame wait');checks++;
} finally {if(previousObserver)globalThis.MutationObserver=previousObserver;else delete globalThis.MutationObserver;}
console.log(JSON.stringify({ok:true,checks,scope:'Actual transition coordinator: fast/ordinary/slow acknowledgements, cancellation and reduced motion; browser CSS separately verified.'}));
