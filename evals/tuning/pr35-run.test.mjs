import test from 'node:test';
import assert from 'node:assert/strict';
import { payload, reservation, validateFreeze, binary } from './pr35-run.mjs';
import { casePrediction } from './core.mjs';
test('frozen artifacts and live questions validate before API calls',()=>{assert.equal(validateFreeze().inputs.length,169);});
test('API payload contains only agenda and transcript, excluding annotations and runtime metadata',()=>{assert.deepEqual(payload({agenda:'A',transcript:['S: text'],phase:'secret',gold:'OK',secondsSinceLastIntervention:120},'v3',{v3:{drifted:'q'}},'typesafe-ai/jev-1.14.0'),{model:'typesafe-ai/jev-1.14.0',state:{agenda:'A',conversation:['S: text']},questions:{drifted:'q'}});});
test('two-turn gate works without score; missing model scores remain errors',()=>{assert.deepEqual(casePrediction({transcript:['a','b'],secondsSinceLastIntervention:120},null),{status:'OK',action:'WAIT'});assert.equal(casePrediction({transcript:['a','b','c'],secondsSinceLastIntervention:120},null).status,null);assert.equal(binary([{gold:'OK',actual:null}]).missing,1);});
test('reservation rounds up conservatively',()=>{assert.equal(reservation(28000),4000);assert.equal(reservation(1),641);});
