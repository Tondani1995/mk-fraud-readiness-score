import assert from 'node:assert/strict';
import {questionScrollDelta} from '../src/components/adaptive/question-scroll.ts';
let cases=0;
for(const viewportHeight of [568,812,844,900,1000]) {
 for(const headerHeight of [80,127,158]) {
  for(const headingHeight of [92,154,246,350]) {
   for(const contextHeight of [36,52,143]) {
    for(const headingTop of [40,145,300,800]) {
     const contextTop=headingTop-contextHeight;
     const headingBottom=headingTop+headingHeight;
     const delta=questionScrollDelta({headingTop,headingBottom,contextTop,headerHeight,viewportHeight,preferredAnchor:headerHeight+58});
     assert.ok(Number.isFinite(delta));
     if(headingHeight<=viewportHeight-headerHeight-24) {
      assert.ok(headingTop-delta>=headerHeight+12-1e-8,'Never hide a fitting prompt under the progress header');
      assert.ok(headingBottom-delta<=viewportHeight-12+1e-8,'Keep the complete fitting prompt on screen');
     }
     if(contextHeight+headingHeight<=viewportHeight-headerHeight-24) {
      assert.ok(contextTop-delta>=headerHeight+12-1e-8,'Keep saved-answer/area context visible when it fits');
     }
     cases++;
    }
   }
  }
 }
}
console.log(JSON.stringify({ok:true,cases,scope:'Scroll geometry preserves context when it fits and prioritises the full prompt otherwise. No timers, transport or product decisions.'},null,2));
