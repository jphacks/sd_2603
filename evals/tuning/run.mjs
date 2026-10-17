import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseline, hash, validateCases, evaluate, select } from './core.mjs';
import { requestJevScores, questions, JevPolicySchema, decideFromScores } from './load-jev.mjs';
import { adaptCases, assertProvenance } from './data.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const arg=(k,d)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3)??d;
const cmd=process.argv[2]??'validate';
const dataPath=resolve(arg('data',`${root}/../jev-cases.json`));
const out=resolve(arg('out',`${root}/runs/pilot-legacy`));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const cases=adaptCases(read(dataPath));validateCases(cases);
if(process.argv.includes('--require-provenance'))assertProvenance(cases);
const model=arg('model','typesafe-ai/jev-1.14.0');
const versions=['v1','v2','v3'];
const specs=Object.fromEntries(versions.map(v=>[v,questions(v)]));
const datasetHash=hash(cases), specificationHash=hash(specs);
mkdirSync(out,{recursive:true});
const manifest={datasetHash,specificationHash,model,cases:cases.length,splits:Object.fromEntries(['train','validation','test'].map(s=>[s,cases.filter(c=>c.split===s).length]))};
const manifestPath=`${out}/manifest.json`;
if(existsSync(manifestPath)&&hash(read(manifestPath))!==hash(manifest))throw new Error('Inputs/model/questions changed; use a NEW --out directory');
if(!existsSync(manifestPath))save(manifestPath,manifest);
const cachePath=resolve(arg('cache',`${root}/runs/cache.json`));mkdirSync(dirname(cachePath),{recursive:true});
const cache=existsSync(cachePath)?read(cachePath):{};
const ledgerPath=resolve(arg('ledger',`${root}/runs/spend.json`));mkdirSync(dirname(ledgerPath),{recursive:true});
const ledger=existsSync(ledgerPath)?read(ledgerPath):{attempts:0,reservedUsd:0};
const maxCalls=Number(arg('max-calls','500')), maxUsd=Number(arg('budget-usd','2'));
if(!Number.isInteger(maxCalls)||maxCalls<1||!Number.isFinite(maxUsd)||maxUsd<=0||maxUsd>5)throw new Error('Invalid budget');
const key=(c,v)=>hash({schema:'jev-noul-v1',model,agenda:c.agenda,conversation:c.transcript,questions:specs[v]});
const scored=(set,v)=>Object.fromEntries(set.map(c=>[c.id,cache[key(c,v)]]));
const development=cases.filter(c=>c.split!=='test');
const lockPath=`${out}/final-lock.json`;
async function score(c,v){
  const k=key(c,v);
  if(cache[k]?.scores)return {...cache[k],cached:true};
  if(!process.env.AI_GATEWAY_API_KEY)throw new Error('AI_GATEWAY_API_KEY required');
  const bytes=Buffer.byteLength(JSON.stringify({model,state:{agenda:c.agenda,conversation:c.transcript},questions:specs[v]}));
  if(bytes>28000)throw new Error(`Payload exceeds conservative budget bound: ${c.id}`);
  // Reserve $0.005/request, including failures, rather than inventing actual billed tokens.
  if(ledger.attempts>=maxCalls||Math.round(ledger.reservedUsd*1e6)+5000>Math.round(maxUsd*1e6))throw new Error('Budget envelope exhausted');
  ledger.attempts++;ledger.reservedUsd=(Math.round(ledger.reservedUsd*1e6)+5000)/1e6;save(ledgerPath,ledger);
  let result;
  try {result=await requestJevScores(c,{model,questionVersion:v});}
  catch(e){result={error:e.kind??'unknown'};}
  if(['auth','config'].includes(result.error))throw new Error(`Gateway ${result.error}; stop before further paid calls`);
  const row={...result,requestedModel:model,questionVersion:v,inputHash:k,payloadBytes:bytes,measuredAt:new Date().toISOString()};
  appendFileSync(`${out}/attempts.jsonl`,JSON.stringify({caseId:c.id,...row})+'\n');
  if(row.scores){cache[k]=row;save(cachePath,cache);}
  return row;
}
function measure(set,v,p){
  const semantic=evaluate(set,scored(set,v),p);
  const labeled=set.filter(c=>c.gold.action);
  const actions=['SILENCE','WAIT','INTERVENE'];
  const matrix=Object.fromEntries(actions.map(a=>[a,Object.fromEntries(actions.map(b=>[b,0]))]));
  let correct=0,errors=0;
  for(const c of labeled){
    const row=cache[key(c,v)];
    const actual=c.secondsSinceLastIntervention<60?'SILENCE':c.transcript.length<3?'WAIT':row?.scores?decideFromScores(row.scores,p).action:null;
    if(!actual){errors++;continue;}matrix[c.gold.action][actual]++;if(actual===c.gold.action)correct++;
  }
  return {semantic,actions:labeled.length?{n:labeled.length,correct,accuracy:correct/labeled.length,errors,matrix}:null};
}
if(cmd==='validate')console.log(JSON.stringify(manifest,null,2));
else if(cmd==='pilot'){
  if(existsSync(lockPath))throw new Error('Final test locked');
  const chosen=development.filter(c=>c.secondsSinceLastIntervention>=60&&c.transcript.length>=3).slice(0,10);if(chosen.length!==10)throw new Error('Pilot requires 10 development cases');
  const rows=[];for(const c of chosen)rows.push({id:c.id,...await score(c,'v1')});
  const lat=rows.filter(r=>r.scores).map(r=>r.latencyMs).sort((a,b)=>a-b);
  const report={...manifest,count:rows.length,errors:rows.filter(r=>r.error).length,cached:rows.filter(r=>r.cached).length,
    latencyMs:{median:lat[Math.ceil(lat.length*.5)-1]??null,p95:lat[Math.ceil(lat.length*.95)-1]??null},
    cost:{inputTokens:rows.reduce((n,r)=>n+(r.usage?.input_tokens??0),0),estimatedInputUsdAtPublishedRate:rows.every(r=>Number.isFinite(r.usage?.input_tokens))?rows.reduce((n,r)=>n+r.usage.input_tokens,0)*.04/1e6:null,reservedUsd:ledger.reservedUsd,actualBilledUsd:null,usageReturned:rows.filter(r=>r.usage).length,
      assumption:'Jev listed input $0.04/M; reserve $0.005 per bounded request including failures. Envelope is not measured cost.'},rows};
  save(`${out}/pilot.json`,report);writeFileSync(`${out}/PILOT.md`,`# Jev 10-case pilot\n\nModel: ${model}. Development only; test not accessed.\n\n- Cases: ${report.count}; errors: ${report.errors}; cache hits: ${report.cached}\n- Latency median: ${report.latencyMs.median} ms; p95: ${report.latencyMs.p95} ms\n- Upstream usage returned: ${report.cost.usageReturned}/10; input tokens: ${report.cost.inputTokens}; input-price estimate: $${report.cost.estimatedInputUsdAtPublishedRate??'unknown'}; actual invoice cost: unavailable\n- Global reserved envelope (not actual cost): $${ledger.reservedUsd.toFixed(3)}\n- Each payload is capped at 28,000 UTF-8 bytes; reservation $0.005/request, including failures. Verify billing in Vercel before treating estimates as invoice amounts.\n`);
  console.log(JSON.stringify(report,null,2));if(report.errors)process.exitCode=1;
}else if(cmd==='score'){
  if(existsSync(lockPath))throw new Error('Final test locked; development must not change');
  if(!existsSync(`${out}/pilot.json`))throw new Error('Run 10-case pilot first');
  if(read(`${out}/pilot.json`).errors)throw new Error('Pilot contains errors; repair before full run');
  for(const v of versions)for(const c of development){const r=await score(c,v);console.log(`${v} ${c.id} ${r.error??(r.cached?'cached':'ok')}`);}
  save(`${out}/development-scores.json`,Object.fromEntries(versions.map(v=>[v,scored(development,v)])));
}else if(cmd==='tune'){
  if(existsSync(lockPath))throw new Error('Test started; no reselection');
  const scores=Object.fromEntries(versions.map(v=>[v,scored(development,v)]));
  if(development.some(c=>versions.some(v=>!scores[v][c.id]?.scores)))throw new Error('Incomplete development scores');
  const validation=development.filter(c=>c.split==='validation');
  if(!validation.length)throw new Error('Validation split required');
  const best=select(validation,scores,versions);
  const cv=[];
  for(const group of new Set(development.map(c=>c.sourceGroup))){
    const inner=development.filter(c=>c.sourceGroup!==group).map(c=>({...c,split:'validation'}));
    const holdout=development.filter(c=>c.sourceGroup===group);
    const selected=select(inner,scores,versions);
    cv.push({group,policy:selected.policy,metrics:evaluate(holdout,scores[selected.policy.questionVersion],selected.policy)});
  }
  const selection={...manifest,selectedAt:new Date().toISOString(),baseline,selected:best,
    criterion:best.selectionCriterion==='exact-action'?'validation exact-action Macro-F1':'validation semantic Macro-F1',scoresHash:hash(scores),
    before:measure(validation,'v1',baseline),after:measure(validation,best.policy.questionVersion,best.policy),
    cv,productionAdopted:false,testUsed:false};
  save(`${out}/selection.json`,selection);report(selection);console.log(JSON.stringify(selection,null,2));
}else if(cmd==='final'){
  if(existsSync(`${out}/final.json`))throw new Error('Final already completed; do not retune on this test');
  const s=read(`${out}/selection.json`);
  JevPolicySchema.parse(s.selected.policy);
  if(s.datasetHash!==datasetHash||s.specificationHash!==specificationHash||s.model!==model)throw new Error('Selection manifest mismatch');
  const devScores=Object.fromEntries(versions.map(v=>[v,scored(development,v)]));
  if(s.scoresHash!==hash(devScores))throw new Error('Development scores changed');
  const locked={datasetHash,specificationHash,selectionHash:hash(s)};
  if(existsSync(lockPath)&&hash(read(lockPath))!==hash(locked))throw new Error('Selection changed after test access');
  const test=cases.filter(c=>c.split==='test');if(!test.length)throw new Error('No heldout test');
  save(lockPath,locked);
  for(const v of new Set(['v1',s.selected.policy.questionVersion]))for(const c of test){await score(c,v);console.log(`test ${v} ${c.id}`);}
  const final={...locked,measuredAt:new Date().toISOString(),policy:s.selected.policy,before:measure(test,'v1',baseline),after:measure(test,s.selected.policy.questionVersion,s.selected.policy),
    scores:Object.fromEntries([...new Set(['v1',s.selected.policy.questionVersion])].map(v=>[v,scored(test,v)]))};
  const complete=final.before.semantic.errors===0&&final.after.semantic.errors===0;
  save(`${out}/${complete?'final':'final-incomplete'}.json`,final);report(s,final);console.log(JSON.stringify(final,null,2));
  if(!complete)process.exitCode=1;
}else throw new Error(`Unknown command: ${cmd}`);
function report(s,final){
  const pct=x=>x==null?'N/A':(100*x).toFixed(1)+'%';
  const sets=[['Validation baseline',s.before],['Validation selected',s.after]];
  if(final)sets.push(['Test baseline',final.before],['Test selected',final.after]);
  let md=`# Jev tuning experiment\n\n- Dataset SHA256: \`${datasetHash}\`\n- Model: \`${model}\`; prompt SHA256: \`${specificationHash}\`\n- Selection: ${s.criterion}; test ${final?'evaluated after selection freeze':'not evaluated'}.\n- Reference: GPT/agent silver labels, not human-established gold.\n- Default production policy is not automatically changed. UI names and displayed thresholds remain intact.\n\n| Parameter | Baseline | Selected |\n| --- | --- | --- |\n`;
  for(const k of Object.keys(baseline))md+=`| ${k} | ${baseline[k]} | ${s.selected.policy[k]} |\n`;
  md+='\n| Split / setting | n | Semantic accuracy | Macro-F1 | Majority baseline | Action accuracy | API errors |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n';
  for(const [name,r] of sets){const m=r.semantic;md+=`| ${name} | ${m.n} | ${pct(m.accuracy)} | ${m.macroF1.toFixed(3)} | ${pct(m.majorityBaseline)} | ${r.actions?pct(r.actions.accuracy):'not labeled'} | ${m.errors} |\n`;}
  for(const [name,r] of sets){const m=r.semantic;
    md+=`\n## ${name}\n\nCase-level Wilson 95%: ${m.wilson95?.map(pct).join(' – ')??'N/A'}; correlated windows reduce effective sample size.\n\n| Gold / Predicted | Drift intervention | Stalled intervention | OK |\n| --- | ---: | ---: | ---: |\n`;
    for(const [c,row] of Object.entries(m.matrix))md+=`| ${c} | ${Object.values(row).join(' | ')} |\n`;
    md+='\n| Class | Support | Precision | Recall | F1 |\n| --- | ---: | ---: | ---: | ---: |\n';
    for(const [c,v] of Object.entries(m.perClass))md+=`| ${c} | ${v.support} | ${pct(v.precision)} | ${pct(v.recall)} | ${v.f1.toFixed(3)} |\n`;
    md+=`\nFalse intervention rate on OK: ${pct(m.falseInterventionRate)}.\n`;
    if(r.actions){md+='\nAction confusion (existing UI names):\n\n| Gold / Predicted | SILENCE | WAIT | INTERVENE |\n| --- | ---: | ---: | ---: |\n';for(const [c,row] of Object.entries(r.actions.matrix))md+=`| ${c} | ${Object.values(row).join(' | ')} |\n`;}
  }
  md+='\n## Group holdout robustness — development only\n\nPrompt/threshold chosen without the outer group; outer groups are never final test data.\n\n| Heldout series | n | Accuracy | Macro-F1 |\n| --- | ---: | ---: | ---: |\n';
  for(const c of s.cv)md+=`| ${c.group} | ${c.metrics.n} | ${pct(c.metrics.accuracy)} | ${c.metrics.macroF1.toFixed(3)} |\n`;
  md+=`\n## Cost and limitations\n\nGlobal attempts: ${ledger.attempts}; reserved envelope $${ledger.reservedUsd.toFixed(3)}. This is not invoice cost. Cache hits incur no new calls. Optional upstream usage and latency are in attempts.jsonl; transcripts and credentials are not logged there.\n\nLLM agreement is not human accuracy. AMI role-play, English transcripts, inferred agenda, truncated windows, absent minority classes and correlated GPT judgments limit generalization to Japanese live meetings. Absent classes receive F1=0; API failures count as incorrect. WAIT vs SILENCE requires independent action labels; do not infer them from semantic OK. No learning-rate/epoch training is performed. Synthetic examples are never heldout test examples.\n`;
  writeFileSync(`${out}/REPORT.md`,md);
}
