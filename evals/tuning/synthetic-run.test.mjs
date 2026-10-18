import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const cli=fileURLToPath(new URL('./synthetic-run.mjs',import.meta.url));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
function fixture(t,count=500){
 const dir=mkdtempSync(join(tmpdir(),'jev-synthetic-run-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const out=join(dir,'out'),campaign=join(dir,'campaign'),data=join(dir,'cases.json'),splitPath=join(dir,'splits.json'),requests=join(dir,'requests.jsonl');
 const split={version:'synthetic-benchmark-v1',groups:[],caseAssignments:[]},cases=[];
 for(let i=0;i<100;i++){
  const group=`family-${i}`,partition=i<60?'train':i<80?'validation':'test',fold=i<60?i%5:null;
  split.groups.push({familyId:group,split:partition,fold,author:'author-a'});
  for(let j=0;j<5;j++){
   const id=`case-${i}-${j}`,status=['OK','INTERVENE_DRIFT','INTERVENE_STALLED'][j%3];
   split.caseAssignments.push({id,sourceGroup:group,split:partition,fold});
   if(cases.length<count)cases.push({id,agenda:`Release decision ${i}`,phase:'意思決定',transcript:[`${status} ${id} ${partition}`,...Array.from({length:5},(_,k)=>`Speaker ${k}: unique evidence ${i}-${j}-${k}`)],sourceGroup:group,split:partition,fold,secondsSinceLastIntervention:120,dataKind:'synthetic',generation:{version:split.version,familyId:group,author:'author-a',researchReferences:['DR01']},gold:{status,reason:'Observed progression'},annotation:{labelSource:'independent_gpt_silver',humanReviewed:false,annotator:'independent-b',confidence:'high',evidenceTurns:[0,1],reason:'Observed progression',uncertain:false}});
  }
 }
 writeFileSync(data,JSON.stringify(cases));writeFileSync(splitPath,JSON.stringify(split));
 const preload=join(dir,'mock.mjs');writeFileSync(preload,`import {appendFileSync,existsSync} from 'node:fs';
 globalThis.fetch=async(url,options)=>{
  const b=JSON.parse(options.body),first=b.state.conversation[0],kind=first.split(' ')[0];
  if(first.endsWith(' test')&&!existsSync(process.env.MOCK_LOCK))throw new Error('Test accessed before selection lock');
  appendFileSync(process.env.MOCK_REQUESTS,JSON.stringify({first,locked:existsSync(process.env.MOCK_LOCK)})+'\\n');
  const s={drifted:kind==='INTERVENE_DRIFT'?.85:.1,stalled:kind==='INTERVENE_STALLED'?.85:.1,tangentIsRelevant:.1};
  return new Response(JSON.stringify({model:b.model,answers:Object.fromEntries(Object.entries(s).map(([k,noul])=>[k,{type:'noul',noul}])),usage:{input_tokens:42}}),{status:200});
 };`);
 const run=(command,ok=true)=>{
  const result=spawnSync(process.execPath,['--import',preload,cli,command,`--data=${data}`,`--split-manifest=${splitPath}`,`--out=${out}`,`--campaign=${campaign}`,'--concurrency=4','--budget-usd=5'],{env:{...process.env,AI_GATEWAY_API_KEY:'offline-mock-only',MOCK_REQUESTS:requests,MOCK_LOCK:join(out,'test-lock.json')},encoding:'utf8',timeout:120000});
  assert.ifError(result.error);if(ok)assert.equal(result.status,0,result.stderr);else assert.notEqual(result.status,0,result.stdout);return result;
 };
 const calls=()=>existsSync(requests)?readFileSync(requests,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 return {dir,out,campaign,run,calls,cases};
}
test('500-case synthetic campaign isolates Train CV, shortlist Validation, frozen Test and cached requests',t=>{
 const f=fixture(t);
 f.run('pilot');assert.equal(f.calls().length,10);assert.ok(f.calls().every(r=>r.first.endsWith(' train')));
 f.run('score-train');assert.equal(f.calls().length,900);assert.ok(f.calls().every(r=>r.first.endsWith(' train')));
 f.run('cross-validate');
 const cv=read(join(f.out,'train-selection.json'));
 assert.equal(cv.cv.folds.length,5);assert.equal(cv.cv.rankedVersions.length,3);
 for(const row of cv.cv.rankedVersions)assert.equal(row.metrics.n,300,'only training rows enter OOF');
 for(const fold of cv.cv.folds){assert.equal(fold.n,60);assert.equal(fold.fitGroups.length,48);assert.equal(fold.holdoutGroups.length,12);assert.ok([...fold.fitGroups,...fold.holdoutGroups].every(g=>Number(g.split('-')[1])<60));}
 const frozenCV=readFileSync(join(f.out,'train-selection.json'),'utf8');
 f.run('score-validation');assert.ok(f.calls().every(r=>!r.first.endsWith(' test')));
 const valCalls=f.calls().length;assert.ok(valCalls>=1100&&valCalls<=1200);
 f.run('select');const selection=readFileSync(join(f.out,'selection.json'),'utf8');
 assert.equal(read(join(f.out,'selection.json')).selected.metrics.n,100);
 assert.equal(readFileSync(join(f.out,'train-selection.json'),'utf8'),frozenCV);
 assert.equal(f.calls().length,valCalls,'selection reuses scores');
 f.run('final');const final=read(join(f.out,'final.json'));
 assert.equal(final.after.n,100);assert.equal(final.after.accuracy,1);assert.equal(final.syntheticOnly,true);
 assert.ok(f.calls().filter(r=>r.first.endsWith(' test')).every(r=>r.locked));
 assert.equal(readFileSync(join(f.out,'selection.json'),'utf8'),selection);
 const completed=f.calls().length;
 f.run('report');assert.equal(f.calls().length,completed);
 assert.match(readFileSync(join(f.out,'REPORT.md'),'utf8'),/silver/);
 assert.match(f.run('final',false).stderr,/Final already completed/);
 assert.match(f.run('select',false).stderr,/Test locked/);
 assert.match(f.run('score-train',false).stderr,/Test locked/);
 assert.equal(f.calls().length,completed);
});
test('partial declared dataset cannot run final or cross-validation',t=>{
 const f=fixture(t,499);
 assert.match(f.run('final',false).stderr,/>=500/);
 assert.match(f.run('cross-validate',false).stderr,/>=500/);
 assert.equal(f.calls().length,0);
 assert.equal(existsSync(join(f.out,'test-lock.json')),false);
});
