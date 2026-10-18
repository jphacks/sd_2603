import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptCases,assertProvenance,authoredCaseHashes,validateSplitManifest} from './data.mjs';
const authored=()=>({id:'s1',agenda:'Choose date',transcript:['one','two','three'],sourceGroup:'family1',split:'test',dataKind:'synthetic',generation:{version:'synthetic-benchmark-v1',familyId:'family1',author:'a',researchReferences:['DR01']},gold:{status:'OK',reason:'New information advances decision'},annotation:{annotator:'independent-b',labelSource:'independent_gpt_silver',humanReviewed:false,confidence:'high',uncertain:false,evidenceTurns:[0,2]}});
const manifest=()=>({version:'synthetic-benchmark-v1',groups:[{familyId:'family1',split:'test',fold:null,author:'a'}],caseAssignments:[{id:'s1',sourceGroup:'family1',split:'test',fold:null}]});
const options=()=>({allowAuthoredEvaluation:true,splitManifest:manifest()});
test('authored synthetic evaluation is opt-in and manifest controlled',()=>{
 const c=authored();
 assert.throws(()=>assertProvenance([c]),/outside train/);
 assert.doesNotThrow(()=>assertProvenance([c],options()));
 assert.throws(()=>assertProvenance([c],{allowAuthoredEvaluation:true}),/manifest/);
 assert.doesNotThrow(()=>assertProvenance(adaptCases([c]),options()));
});
test('authored provenance rejects disguise, changed family, split, author, label and missing evidence',()=>{
 for(const mutate of [c=>c.dataKind='real',c=>c.source={kind:'real'},c=>c.generation.familyId='other',c=>c.split='train',c=>c.generation.author='other',c=>c.generation.version='v2',c=>c.generation.researchReferences=[],c=>c.generation.researchReferences=[' '],c=>c.gold.status='WAIT',c=>c.annotation={},c=>c.parentId='old-test']){
  const c=authored();mutate(c);assert.throws(()=>assertProvenance([c],options()));
 }
});
test('split manifest rejects duplicate identifiers and family splitting',()=>{
 const m=manifest();m.groups.push({...m.groups[0],split:'train'});assert.throws(()=>validateSplitManifest(m));
 const n=manifest();n.caseAssignments.push({...n.caseAssignments[0]});assert.throws(()=>validateSplitManifest(n));
 const k=manifest();k.caseAssignments[0].split='train';assert.throws(()=>validateSplitManifest(k));
 const f=manifest();f.caseAssignments[0].fold=2;assert.throws(()=>validateSplitManifest(f));
});
test('separate frozen hashes detect input and label mutations',()=>{
 const c=authored(),o=options();Object.assign(o.splitManifest.caseAssignments[0],authoredCaseHashes(c));
 assert.doesNotThrow(()=>assertProvenance([c],o));
 const changed=structuredClone(c);changed.transcript[0]='different';assert.throws(()=>assertProvenance([changed],o),/inputHash/);
 const relabeled=structuredClone(c);relabeled.gold.status='INTERVENE_DRIFT';assert.throws(()=>assertProvenance([relabeled],o),/labelHash/);
});
test('legacy synthetic stays train-only with same-training-group parent; real provenance preserved',()=>{
 const real={id:'p',sourceGroup:'meeting',split:'train',source:{seriesId:'meeting',license:'CC BY',url:'https://example.org',meetingId:'m'}};
 const child={id:'child',sourceGroup:'meeting',split:'train',dataKind:'synthetic',parentId:'p'};
 assert.doesNotThrow(()=>assertProvenance([real,child]));
 assert.throws(()=>assertProvenance([child]),/parent/);
 assert.throws(()=>assertProvenance([real,{...child,split:'test'}]),/outside train/);
 assert.throws(()=>assertProvenance([{...real,source:{}}]),/source\/license\/meeting/);
});

test('independent annotation rejects missing, invalid and self-authored evidence',()=>{
 for(const mutate of [
  c=>c.gold.reason='',c=>c.annotation.labelSource='generation_intent',
  c=>c.annotation.humanReviewed=true,c=>delete c.annotation.humanReviewed,
  c=>c.annotation.annotator=' ',c=>c.annotation.annotator=c.generation.author,
  c=>c.annotation.confidence='certain',c=>c.annotation.uncertain='false',
  c=>c.annotation.evidenceTurns=[],c=>c.annotation.evidenceTurns=[-1],
  c=>c.annotation.evidenceTurns=[3],c=>c.annotation.evidenceTurns=[1.5],
  c=>c.annotation.evidenceTurns=['0'],c=>c.cvFold=2,
 ]){const c=authored();mutate(c);assert.throws(()=>assertProvenance([c],options()));}
 const c=authored();c.cvFold=null;assert.doesNotThrow(()=>assertProvenance([c],options()));
});
test('phase is frozen with authored model inputs',()=>{
 const c={...authored(),phase:'comparison'},o=options();
 Object.assign(o.splitManifest.caseAssignments[0],authoredCaseHashes(c));
 assert.doesNotThrow(()=>assertProvenance([c],o));
 assert.throws(()=>assertProvenance([{...c,phase:'decision'}],o),/inputHash/);
});
