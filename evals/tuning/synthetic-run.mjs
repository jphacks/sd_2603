/** Synthetic-only campaign: train CV -> bounded validation selection -> one frozen test. */
import {readFileSync,writeFileSync,appendFileSync,existsSync,mkdirSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,validateCases,evaluate,casePrediction} from './core.mjs';
import {adaptCases,assertProvenance,validateSplitManifest} from './data.mjs';
import {trainingCV} from './synthetic-cv.mjs';
import {questions,requestJevScores,JevPolicySchema} from './load-jev.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const arg=(k,d)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3)??d;
const command=process.argv[2]??'validate';
const dataPath=resolve(arg('data','docs/jev-tuning/synthetic-benchmark-v1/cases.json'));
const splitPath=resolve(arg('split-manifest','docs/jev-tuning/synthetic-benchmark-v1/split-manifest.json'));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,x)=>{const tmp=`${p}.tmp-${process.pid}`;writeFileSync(tmp,JSON.stringify(x,null,2)+'\n');renameSync(tmp,p);};
const expectedSplitHash=arg('expected-split-sha256',splitPath===resolve(root,'../../docs/jev-tuning/synthetic-benchmark-v1/split-manifest.json')?'22e6dc4a51a95556aba7c65431682d3127a3089e3e6e8f0de0f749f8c8a0aa31':undefined);
if(expectedSplitHash&&createHash('sha256').update(readFileSync(splitPath)).digest('hex')!==expectedSplitHash)throw new Error('Predeclared split bytes changed; verify a new immutable source commit before using a different expected hash');
const raw=read(dataPath),cases=adaptCases(raw),split=read(splitPath);
validateCases(cases);assertProvenance(cases,{allowAuthoredEvaluation:true,splitManifest:split});
if(cases.some(c=>c.dataKind!=='synthetic'||!c.generation))throw new Error('Synthetic campaign accepts only explicitly authored synthetic cases');
for(const c of cases)if(typeof c.phase!=='string'||!c.phase.trim()||c.transcript.length<6||c.transcript.length>12||c.secondsSinceLastIntervention!==120)throw new Error(`Synthetic protocol requires phase,6-12 turns and120s cooldown: ${c.id}`);
const {groups,assignments}=validateSplitManifest(split);
const versions=['v2','v3','v4'];
const baseline={questionVersion:'v3',driftThreshold:.6,stallThreshold:.6,relevanceThreshold:.6,uncertainThreshold:.4};
const model='typesafe-ai/jev-1.14.0';
const specs=Object.fromEntries(versions.map(v=>[v,questions(v)]));
const protocol={version:'synthetic-campaign-v1',model,versions,baseline,questionHash:hash(specs),trainMetric:'fivefold group OOF semantic Macro-F1',validationRule:'choose among two Train-CV finalists and unchanged v3 baseline by semantic Macro-F1, then accuracy, then baseline proximity',inputComposition:'agenda plus explicit phase supplied to model; annotation/intents excluded',testRule:'baseline and selected policy only; never reselect',minimumCases:500};
const out=resolve(arg('out',`${root}/runs/synthetic-v1/${hash(cases).slice(0,12)}`));mkdirSync(out,{recursive:true});
const manifest={datasetHash:hash(cases),splitManifestHash:hash(split),protocolHash:hash(protocol),inputLabelHash:hash(cases.map(c=>({id:c.id,agenda:c.agenda,phase:c.phase??null,transcript:c.transcript,gold:c.gold,annotation:c.annotation}))),count:cases.length,splits:Object.fromEntries(['train','validation','test'].map(s=>[s,cases.filter(c=>c.split===s).length]))};
const mp=`${out}/manifest.json`;
if(existsSync(mp)&&hash(read(mp))!==hash(manifest))throw new Error('Dataset/protocol changed: new output directory required');
if(!existsSync(mp)){save(mp,manifest);save(`${out}/protocol.json`,protocol);save(`${out}/questions.json`,specs);save(`${out}/dataset.json`,cases);}
if(!existsSync(`${out}/questions.json`))save(`${out}/questions.json`,specs);
if(!existsSync(`${out}/dataset.json`))save(`${out}/dataset.json`,cases);
const campaign=resolve(arg('campaign',`${root}/runs/synthetic-v1`));mkdirSync(campaign,{recursive:true});
const campaignLock=`${campaign}/.runner.lock`,owner=randomUUID();
try{const fd=openSync(campaignLock,'wx');writeFileSync(fd,JSON.stringify({owner,pid:process.pid,startedAt:new Date().toISOString(),out}));closeSync(fd);}
catch(e){if(e.code==='EEXIST')throw new Error('Campaign already locked by another process. If a prior process was killed, verify it has stopped before removing .runner.lock.');throw e;}
process.once('exit',()=>{try{if(read(campaignLock).owner===owner)unlinkSync(campaignLock);}catch{}});
process.once('SIGINT',()=>process.exit(130));process.once('SIGTERM',()=>process.exit(143));
const cp=`${campaign}/cache.json`,lp=`${campaign}/spend.json`;
const cache=existsSync(cp)?read(cp):{},ledger=existsSync(lp)?read(lp):{attempts:0,reservedMicrousd:0};
const maxCalls=Number(arg('max-calls','4000')),budget=Number(arg('budget-usd','4')),concurrency=Number(arg('concurrency','3'));
if(!Number.isInteger(maxCalls)||maxCalls<1||!Number.isFinite(budget)||budget<=0||budget>5||!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new Error('Invalid request/budget/concurrency bounds');
const modelAgenda=c=>c.phase?`${c.agenda}\n会議フェーズ: ${c.phase}`:c.agenda;
const key=(c,v)=>hash({schema:'jev-noul-v1',model,agenda:modelAgenda(c),conversation:c.transcript,questions:specs[v]});
const scored=(set,v)=>Object.fromEntries(set.map(c=>[c.id,cache[key(c,v)]]));
// Recover successful requests persisted before an interrupted cache checkpoint.
const ap=`${out}/attempts.jsonl`;
if(existsSync(ap))for(const line of readFileSync(ap,'utf8').trim().split('\n').filter(Boolean)){
  const r=JSON.parse(line);if(r.scores&&r.inputHash)cache[r.inputHash]=r;
}
const train=cases.filter(c=>c.split==='train'),validation=cases.filter(c=>c.split==='validation'),test=cases.filter(c=>c.split==='test');
const lock=`${out}/test-lock.json`;
function assertComplete(){
  if(raw.incomplete===true||cases.length<500||cases.length!==assignments.size||[...assignments.keys()].some(id=>!cases.some(c=>c.id===id)))throw new Error('Complete independently labeled declared dataset (>=500) required');
  if(!train.length||!validation.length||!test.length)throw new Error('All three splits required');
}
function beforeTest(){if(existsSync(lock))throw new Error('Test locked: training and selection cannot change');}
let active=0,cacheHits=0,dirty=0;
async function score(c,v){
  const k=key(c,v);if(cache[k]?.scores){cacheHits++;return cache[k];}
  if(!process.env.AI_GATEWAY_API_KEY)throw new Error('AI_GATEWAY_API_KEY required');
  const bytes=Buffer.byteLength(JSON.stringify({model,state:{agenda:modelAgenda(c),conversation:c.transcript},questions:specs[v]}));
  if(bytes>28000)throw new Error(`Payload exceeds bounded size: ${c.id}`);
  const reserve=Math.ceil(bytes*.12+640);
  if(ledger.attempts>=maxCalls||ledger.reservedMicrousd+reserve>Math.round(budget*1e6))throw new Error('Budget envelope exhausted');
  ledger.attempts++;ledger.reservedMicrousd+=reserve;save(lp,ledger);
  let result;try{result=await requestJevScores({...c,agenda:modelAgenda(c)},{model,questionVersion:v});}catch(e){result={error:e.kind??'unknown'};}
  const row={...result,caseId:c.id,inputHash:k,requestedModel:model,questionVersion:v,payloadBytes:bytes,reservationMicrousd:reserve,measuredAt:new Date().toISOString()};
  appendFileSync(ap,JSON.stringify(row)+'\n');
  if(row.scores){cache[k]=row;if(++dirty%10===0)save(cp,cache);}
  if(['auth','config','rate_limit'].includes(row.error))throw new Error(`Gateway ${row.error}: stop and preserve cache`);
  active++;if(active%25===0)console.log(`completed ${active}; cache hits ${cacheHits}; reserved $${(ledger.reservedMicrousd/1e6).toFixed(3)}`);
  return row;
}
async function batch(tasks){
  let cursor=0,failed=null;
  const workers=Array.from({length:concurrency},async()=>{
    while(cursor<tasks.length&&!failed){const task=tasks[cursor++];try{await score(task.c,task.v);}catch(e){failed=e;}}
  });
  await Promise.allSettled(workers);save(cp,cache);if(failed)throw failed;
}
function requireScores(set,vs){if(set.some(c=>vs.some(v=>!cache[key(c,v)]?.scores)))throw new Error('Incomplete scores: rerun the same scoring stage to retry failed requests');}
const allScores=(set,vs=versions)=>Object.fromEntries(vs.map(v=>[v,scored(set,v)]));
const measure=(set,p)=>evaluate(set,scored(set,p.questionVersion),p);
const distance=p=>Math.abs(p.driftThreshold-.6)+Math.abs(p.stallThreshold-.6)+Math.abs(p.relevanceThreshold-.6);
function winner(rows){return rows.slice().sort((a,b)=>b.metrics.macroF1-a.metrics.macroF1||b.metrics.accuracy-a.metrics.accuracy||distance(a.policy)-distance(b.policy)||versions.indexOf(a.policy.questionVersion)-versions.indexOf(b.policy.questionVersion))[0];}
function groupBootstrap(set,p){
  const ids=[...new Set(set.map(c=>c.sourceGroup))];let seed=20261018;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const values=[];
  for(let i=0;i<1000;i++){const sampled=Array.from({length:ids.length},()=>ids[Math.floor(rand()*ids.length)]).flatMap(id=>set.filter(c=>c.sourceGroup===id));values.push(measure(sampled,p).accuracy);}
  values.sort((a,b)=>a-b);return {replicates:1000,seed:20261018,series:ids.length,accuracy95:[values[24],values[974]]};
}
if(command==='validate')console.log(JSON.stringify({...manifest,complete:cases.length===assignments.size&&cases.length>=500,protocol},null,2));
else if(command==='pilot'){
  beforeTest();if(train.length<10)throw new Error('Ten labeled Train cases required');
  await batch(train.slice(0,10).map(c=>({c,v:'v3'})));
  const rows=train.slice(0,10).map(c=>cache[key(c,'v3')]);
  const lat=rows.filter(Boolean).map(r=>r.latencyMs).sort((a,b)=>a-b);
  const p={cases:10,errors:rows.filter(r=>!r?.scores).length,latencyMs:{median:lat[4]??null,p95:lat[9]??null},model,cacheHits,attempts:ledger.attempts};
  save(`${out}/pilot.json`,p);console.log(JSON.stringify(p));if(p.errors)process.exitCode=1;
}else if(command==='score-train'){
  beforeTest();if(!existsSync(`${out}/pilot.json`)||read(`${out}/pilot.json`).errors)throw new Error('Successful ten-case pilot required');
  await batch(versions.flatMap(v=>train.map(c=>({c,v}))));requireScores(train,versions);
  save(`${out}/train-scores.json`,allScores(train));console.log(`Train scored: ${train.length}, versions ${versions.join(',')}`);
}else if(command==='cross-validate'){
  beforeTest();assertComplete();requireScores(train,versions);
  const folds=new Map([...groups.entries()].filter(([,g])=>g.split==='train').map(([id,g])=>[id,g.fold]));
  const cv=trainingCV(train,allScores(train),versions,folds);
  const frozen={...manifest,createdAt:new Date().toISOString(),protocol,cv,trainScoresHash:hash(allScores(train)),finalists:cv.finalists};
  save(`${out}/train-selection.json`,frozen);render(frozen);console.log(JSON.stringify({finalists:frozen.finalists,ranking:cv.rankedVersions.map(r=>({version:r.version,metrics:r.metrics}))},null,2));
}else if(command==='score-validation'){
  beforeTest();assertComplete();const t=read(`${out}/train-selection.json`);
  if(t.trainScoresHash!==hash(allScores(train)))throw new Error('Train scores changed');
  const vs=[...new Set(['v3',...t.finalists.map(c=>c.policy.questionVersion)])];
  // Persist shortlist before accessing any validation model scores.
  const shortlist={manifestHash:hash(manifest),trainSelectionHash:hash(t),versions:vs};
  const vp=`${out}/validation-lock.json`;
  if(existsSync(vp)&&hash(read(vp))!==hash(shortlist))throw new Error('Training shortlist changed after validation access');
  save(vp,shortlist);await batch(vs.flatMap(v=>validation.map(c=>({c,v}))));requireScores(validation,vs);
  save(`${out}/validation-scores.json`,allScores(validation,vs));
}else if(command==='select'){
  beforeTest();assertComplete();const t=read(`${out}/train-selection.json`),vl=read(`${out}/validation-lock.json`);
  if(vl.trainSelectionHash!==hash(t)||t.trainScoresHash!==hash(allScores(train)))throw new Error('Frozen training artifact changed');
  const policies=[baseline,...t.finalists.map(c=>c.policy)];
  const vs=[...new Set(policies.map(p=>p.questionVersion))];requireScores(validation,vs);
  const compared=policies.map(policy=>({policy,metrics:measure(validation,policy)}));
  const selected=winner(compared);
  const selection={...manifest,selectedAt:new Date().toISOString(),trainSelectionHash:hash(t),validationScoresHash:hash(allScores(validation,vs)),baseline,compared,selected,testUsed:false,protocol};
  save(`${out}/selection.json`,selection);render(t,selection);console.log(JSON.stringify({selected,compared},null,2));
}else if(command==='final'){
  assertComplete();if(existsSync(`${out}/final.json`))throw new Error('Final already completed; no test-informed reselection');
  const s=read(`${out}/selection.json`),t=read(`${out}/train-selection.json`);
  if(s.datasetHash!==manifest.datasetHash||s.protocolHash!==manifest.protocolHash||s.splitManifestHash!==manifest.splitManifestHash||s.trainSelectionHash!==hash(t)||t.trainScoresHash!==hash(allScores(train)))throw new Error('Frozen selection/training mismatch');
  const valVersions=[...new Set(s.compared.map(c=>c.policy.questionVersion))];
  if(s.validationScoresHash!==hash(allScores(validation,valVersions)))throw new Error('Validation scores changed');
  JevPolicySchema.parse(s.selected.policy);
  const locked={manifestHash:hash(manifest),selectionHash:hash(s)};
  if(existsSync(lock)&&hash(read(lock))!==hash(locked))throw new Error('Selection changed after Test access');
  save(lock,locked);
  const vs=[...new Set(['v3',s.selected.policy.questionVersion])];
  await batch(vs.flatMap(v=>test.map(c=>({c,v}))));
  const before=measure(test,baseline),after=measure(test,s.selected.policy);
  const result={...locked,measuredAt:new Date().toISOString(),policy:s.selected.policy,before,after,syntheticOnly:true,labels:'independent GPT silver',bootstrap:groupBootstrap(test,s.selected.policy),
    rows:test.map(c=>({id:c.id,sourceGroup:c.sourceGroup,gold:c.gold.status,actual:casePrediction(c,cache[key(c,s.selected.policy.questionVersion)]?.scores,s.selected.policy).status,uncertain:c.annotation?.uncertain??false})),scores:allScores(test,vs)};
  const complete=before.errors===0&&after.errors===0;save(`${out}/${complete?'final':'final-incomplete'}.json`,result);render(t,s,result);console.log(JSON.stringify({before,after,bootstrap:result.bootstrap},null,2));if(!complete)process.exitCode=1;
}else if(command==='report')render(read(`${out}/train-selection.json`),existsSync(`${out}/selection.json`)?read(`${out}/selection.json`):undefined,existsSync(`${out}/final.json`)?read(`${out}/final.json`):undefined);
else throw new Error(`Unknown command: ${command}`);
function render(t,s,f){
  const pct=x=>(100*x).toFixed(1)+'%';
  let md=`# 日本語合成会議ベンチマーク — Jev tuning\n\n- Dataset SHA256: \`${manifest.datasetHash}\`\n- Split manifest SHA256: \`${manifest.splitManifestHash}\`\n- Protocol SHA256: \`${manifest.protocolHash}\`\n- Model: ${model}; cases ${cases.length}; Train/Validation/Test ${train.length}/${validation.length}/${test.length}\n- 生成系列単位の分離。参照ラベルは独立したGPT作業によるsilverで、人間gold・実会議精度ではない。\n- 生成意図に合わせたラベル修正・不一致例の都合のよい除外を行わない。独立したWAIT/SILENCEラベルはないため意味3分類のみ評価。\n\n## Train-only fivefold group cross-validation\n\n閾値は各foldで残り4foldから選択し、除外foldに評価。表はOOF予測の集計で、Validation/Testは未使用。\n\n| Prompt | n | OOF accuracy | OOF Macro-F1 |\n| --- | ---: | ---: | ---: |\n`;
  for(const r of t.cv.rankedVersions)md+=`| ${r.version} | ${r.metrics.n} | ${pct(r.metrics.accuracy)} | ${r.metrics.macroF1.toFixed(3)} |\n`;
  md+='\n| Fold | Fit groups | Heldout groups | Cases |\n| --- | ---: | ---: | ---: |\n';
  for(const r of t.cv.folds)md+=`| ${r.fold} | ${r.fitGroups.length} | ${r.holdoutGroups.length} | ${r.n} |\n`;
  md+='\n| Fold | Prompt | Fitted thresholds | Heldout accuracy | Heldout Macro-F1 |\n| --- | --- | --- | ---: | ---: |\n';
  for(const r of t.cv.folds)for(const v of r.byVersion)md+=`| ${r.fold} | ${v.version} | ${JSON.stringify(v.policy)} | ${pct(v.metrics.accuracy)} | ${v.metrics.macroF1.toFixed(3)} |\n`;
  if(s){md+=`\n## Validation selection\n\n上位2つのTrain-CV候補と従来v3のみを比較し、Macro-F1→Accuracy→従来閾値への近さで選択。Testは選択に使わない。\n\n| Policy | Accuracy | Macro-F1 |\n| --- | ---: | ---: |\n`;
    for(const r of s.compared)md+=`| ${JSON.stringify(r.policy)} | ${pct(r.metrics.accuracy)} | ${r.metrics.macroF1.toFixed(3)} |\n`;
    md+=`\nSelected: \`${JSON.stringify(s.selected.policy)}\`\n`;
  }
  if(f){md+='\n## Frozen final Test — synthetic only\n\n| Setting | Correct / n | Accuracy | Macro-F1 | Majority | OKへの誤介入 |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';
    for(const [name,m]of [['Baseline v3',f.before],['Selected',f.after]])md+=`| ${name} | ${m.correct}/${m.n} | ${pct(m.accuracy)} | ${m.macroF1.toFixed(3)} | ${pct(m.majorityBaseline)} | ${m.falseInterventionRate==null?'N/A':pct(m.falseInterventionRate)} |\n`;
    md+=`\nFamily bootstrap95% accuracy interval: ${f.bootstrap.accuracy95.map(pct).join('–')} (${f.bootstrap.series} groups;1000 replicates; seed20261018).\n`;
    for(const [name,m]of [['Baseline',f.before],['Selected',f.after]]){
      md+=`\n### ${name} confusion\n\n| Gold / Predicted | Drift | Stalled | OK |\n| --- | ---: | ---: | ---: |\n`;
      for(const [c,row]of Object.entries(m.matrix))md+=`| ${c} | ${Object.values(row).join(' | ')} |\n`;
      md+='\n| Class | Support | Precision | Recall | F1 |\n| --- | ---: | ---: | ---: | ---: |\n';
      for(const [c,r]of Object.entries(m.perClass))md+=`| ${c} | ${r.support} | ${r.predicted?pct(r.precision):'N/A'} | ${r.support?pct(r.recall):'N/A'} | ${r.f1.toFixed(3)} |\n`;
    }
    const certain=test.filter(c=>!c.annotation?.uncertain),uncertain=test.filter(c=>c.annotation?.uncertain);
    md+='\nUncertain cases remain in primary denominator. Secondary slices (not used for selection):\n\n| Slice | n | Accuracy |\n| --- | ---: | ---: |\n';
    for(const [name,set]of [['Not flagged uncertain',certain],['Flagged uncertain',uncertain]]){const m=measure(set,f.policy);md+=`| ${name} | ${m.n} | ${m.n?pct(m.accuracy):'N/A'} |\n`;}
  }
  const rows=Object.values(cache),input=rows.reduce((a,r)=>a+(r.usage?.input_tokens??0),0);
  md+=`\n## Cost and scope\n\nCampaign attempts ${ledger.attempts}; successful cached requests ${rows.length}; input tokens ${input}; published input-price estimate $${(input*.04/1e6).toFixed(6)}; reserved envelope $${(ledger.reservedMicrousd/1e6).toFixed(6)}. Invoice total is not measured.\n\n500/1000 cases are correlated authored scenarios, not independent real meetings. Authors span splits, and GPT judges share model-family biases. Benchmark-specific80% does not establish Japanese real-meeting80%. Source research supports mechanisms, not these synthetic gold labels. No Test-result-driven reselection. UI/runtime policy adoption is separate and must preserve truthful threshold display.\n`;
  writeFileSync(`${out}/REPORT.md`,md);
}
