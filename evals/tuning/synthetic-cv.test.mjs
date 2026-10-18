import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingCV} from './synthetic-cv.mjs';
function fixture(){
 const cases=[],folds=new Map(),scores={v1:{},v2:{},v3:{}};
 for(let fold=0;fold<5;fold++){
  const group=`group-${fold}`;folds.set(group,fold);
  for(const [i,status] of ['OK','INTERVENE_DRIFT','INTERVENE_STALLED'].entries()){
   const id=`f${fold}-${i}`;cases.push({id,agenda:'Decide',transcript:[`unique ${id}`,'fact','next'],split:'train',sourceGroup:group,gold:{status},fold});
   const row={drifted:i===1?.85:.1,stalled:i===2?.85:.1,tangentIsRelevant:.1};
   scores.v1[id]={scores:row};scores.v2[id]={scores:row};scores.v3[id]={scores:{drifted:.1,stalled:.1,tangentIsRelevant:.1}};
  }
 }
 return {cases,folds,scores};
}
test('five outer folds retain families and aggregate OOF rather than fit scores',()=>{
 const {cases,folds,scores}=fixture();const before=JSON.stringify(cases);
 const result=trainingCV(cases,scores,['v1','v2','v3'],folds);
 assert.equal(result.folds.length,5);
 for(const fold of result.folds){
  assert.equal(fold.n,3);assert.equal(fold.byVersion.length,3);
  assert.equal(fold.holdoutGroups.length,1);
  assert.ok(fold.holdoutGroups.every(g=>!fold.fitGroups.includes(g)));
  assert.ok(fold.holdoutGroups.every(g=>folds.get(g)===fold.fold));
 }
 assert.equal(result.rankedVersions[0].metrics.n,cases.length);
 assert.equal(result.rankedVersions[0].metrics.accuracy,1);
 assert.deepEqual(result.finalists.map(r=>r.policy.questionVersion),['v1','v2']);
 assert.ok(result.rankedVersions[2].metrics.accuracy<1);
 assert.equal(JSON.stringify(cases),before);
});
test('rejects heldout data, invalid folds, missing versions and case/group disagreement',()=>{
 const {cases,folds,scores}=fixture();
 for(const split of ['validation','test']) assert.throws(()=>trainingCV([{...cases[0],split},...cases.slice(1)],scores,['v1','v2'],folds),/train cases only/);
 const missing=new Map(folds);missing.delete('group-0');assert.throws(()=>trainingCV(cases,scores,['v1','v2'],missing),/fold/);
 const bad=new Map(folds);bad.set('group-0',5);assert.throws(()=>trainingCV(cases,scores,['v1','v2'],bad),/fold/);
 assert.throws(()=>trainingCV([{...cases[0],fold:4},...cases.slice(1)],scores,['v1','v2'],folds),/mismatch/);
 assert.throws(()=>trainingCV(cases,{v1:scores.v1},['v1','v2'],folds),/score version/);
});
test('outer-group labels do not alter its inner-selected policy',()=>{
 const {cases,folds,scores}=fixture();
 const original=trainingCV(cases,scores,['v1','v2'],folds);
 const changed=cases.map(c=>folds.get(c.sourceGroup)===0?{...c,gold:{status:'OK'}}:c);
 const rerun=trainingCV(changed,scores,['v1','v2'],folds);
 assert.deepEqual(rerun.folds[0].byVersion.map(v=>v.policy),original.folds[0].byVersion.map(v=>v.policy));
});
test('OOF evaluation preserves runtime cooldown gates and missing score errors',()=>{
 const {cases,folds,scores}=fixture();
 cases[0].secondsSinceLastIntervention=0;delete scores.v1[cases[0].id];
 delete scores.v1[cases[1].id];
 const result=trainingCV(cases,scores,['v1','v2'],folds);
 const v1=result.rankedVersions.find(r=>r.version==='v1');
 assert.equal(v1.metrics.errors,1,'cooldown needs no model score; eligible missing result is an error');
});
test('campaign supports v4 alongside v2 and v3',()=>{
 const {cases,folds,scores}=fixture();scores.v4=scores.v1;
 const result=trainingCV(cases,scores,['v2','v3','v4'],folds);
 assert.ok(result.rankedVersions.some(r=>r.version==='v4'));
 assert.deepEqual(result.finalists.map(r=>r.policy.questionVersion),['v2','v4']);
});
