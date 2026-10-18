import { readFileSync, writeFileSync, renameSync, mkdirSync, openSync, closeSync, unlinkSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { hash, classes, metrics, casePrediction } from './core.mjs';
import { questions } from './load-jev.mjs';
const base='docs/jev-tuning/pr35-text', out='evals/tuning/runs/pr35-text';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const atomic=(p,x)=>{writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');renameSync(p+'.tmp',p);};
export function payload(c,v,q,model){return {model,state:{agenda:c.agenda,conversation:c.transcript},questions:q[v]};}
export function reservation(bytes){return Math.ceil(bytes*.12+640);}
export function validateFreeze(){
 const freeze=read(`${base}/label-freeze.json`);
 for(const [file,expected] of Object.entries(freeze.sha256)) {
  const actual=createHash('sha256').update(readFileSync(`${base}/${file}`)).digest('hex');
  if(actual!==expected)throw Error(`Frozen raw SHA mismatch: ${file}`);
 }
 const q=read(`${base}/questions.json`), live={v3:questions('v3'),v4:questions('v4')};
 const protocol=read(`${base}/protocol.json`);
 if(hash(live)!==protocol.questionHash || hash(q)!==protocol.questionHash)throw Error('Live questions hash mismatch');
 const inputs=read(`${base}/blind-inputs.json`), labels=read(`${base}/primary-labels.json`), sources=read(`${base}/source-map.json`);
 if(inputs.length!==169 || labels.length!==169 || sources.length!==169)throw Error('Incomplete frozen inputs');
 const ids=new Set();
 for(const c of inputs){if(ids.has(c.id))throw Error('Duplicate input');ids.add(c.id);const l=labels.find(x=>x.id===c.id),s=sources.find(x=>x.id===c.id);if(!l||!s||c.inputHash!==hash({agenda:c.agenda,transcript:c.transcript})||l.inputHash!==c.inputHash||s.inputHash!==c.inputHash||!classes.includes(l.status))throw Error(`Input label alignment failed ${c.id}`);}
 return {freeze,q,protocol,inputs,labels,sources};
}
export function binary(rows){const tp=rows.filter(x=>x.gold!=='OK'&&x.actual&&x.actual!=='OK').length,fp=rows.filter(x=>x.gold==='OK'&&x.actual&&x.actual!=='OK').length,fn=rows.filter(x=>x.gold!=='OK'&&x.actual==='OK').length,tn=rows.filter(x=>x.gold==='OK'&&x.actual==='OK').length;return {tp,fp,fn,tn,missing:rows.filter(x=>!x.actual).length,accuracy:(tp+tn)/rows.length,precision:tp/(tp+fp)||0,recall:tp/(tp+fn)||0};}
async function main(){
 const frozen=validateFreeze();mkdirSync(out,{recursive:true});let lock;try{lock=openSync(`${out}/process.lock`,'wx');}catch{throw Error('Exclusive process lock exists');}
 const progress=message=>appendFileSync(`${base}/tester-progress.md`,`${new Date().toISOString()} ${message}\n\n`);
 try{
 const {q,protocol,inputs,labels,sources}=frozen;
 const settings={model:protocol.model,questionHash:protocol.questionHash,endpoint:'https://ai-gateway.vercel.sh/typesafe/v1/systemone',maxAttempts:400,reservationMicroUSD:1000000,maxPayloadBytes:28000,concurrency:3};
 if(existsSync(`${out}/settings.json`)&&hash(read(`${out}/settings.json`))!==hash(settings))throw Error('Settings changed');atomic(`${out}/settings.json`,settings);
 let ledger=existsSync(`${out}/ledger.json`)?read(`${out}/ledger.json`):{attempts:0,reservedMicroUSD:0};
 const cache=existsSync(`${out}/cache.json`)?read(`${out}/cache.json`):{};
 const eligible=inputs.filter(c=>c.transcript.length>=3);let stopped=false;
 progress(`${process.argv.includes('--report-only')?'Offline report: ':''}Validated all frozen raw SHA256 values and live questions. ${eligible.length} eligible, ${inputs.length-eligible.length} runtime-gated; cooldown synthetic 120 seconds. Separate tester, no author labels or earlier metrics read.`);
 async function score(c,v){
  const body=JSON.stringify(payload(c,v,q,protocol.model)),key=hash({endpoint:settings.endpoint,body});if(cache[key])return;
  const bytes=Buffer.byteLength(body),reserve=reservation(bytes);if(bytes>28000)throw Error('Payload cap');if(stopped)return;
  if(ledger.attempts>=400||ledger.reservedMicroUSD+reserve>1000000)throw Error('Attempt/reservation cap');
  if(!process.env.AI_GATEWAY_API_KEY)throw Error('Missing AI_GATEWAY_API_KEY');
  ledger={attempts:ledger.attempts+1,reservedMicroUSD:ledger.reservedMicroUSD+reserve};atomic(`${out}/ledger.json`,ledger);
  const attempt=ledger.attempts,started=Date.now();
  atomic(`${out}/request-${attempt}.json`,{attempt,key,inputId:c.id,questionVersion:v,bytes,reservedMicroUSD:reserve,payload:JSON.parse(body)});
  appendFileSync(`${out}/attempts.jsonl`,JSON.stringify({event:'start',attempt,key,at:new Date().toISOString(),reservedMicroUSD:reserve})+'\n');
  try{
   const response=await fetch(settings.endpoint,{method:'POST',headers:{Authorization:`Bearer ${process.env.AI_GATEWAY_API_KEY}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(15000)});
   if([401,403,429].includes(response.status))stopped=true;
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   const raw=await response.json(),scores=Object.fromEntries(['drifted','stalled','tangentIsRelevant'].map(k=>[k,raw.answers?.[k]?.noul]));
   if(typeof raw.model!=='string'||Object.values(scores).some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('Invalid response');
   if(!['typesafe-ai/jev-1.14.0','jev-1.14.0'].includes(raw.model))throw Error(`Unexpected actual model ${raw.model}`);
   cache[key]={key,inputId:c.id,questionVersion:v,scores,actualModel:raw.model,latencyMs:Date.now()-started,usage:raw.usage??null,raw,reservedMicroUSD:reserve,costEstimateMicroUSD:raw.provider_metadata?.gateway?.cost!==undefined?Number(raw.provider_metadata.gateway.cost)*1000000:null};atomic(`${out}/cache.json`,cache);
   appendFileSync(`${out}/attempts.jsonl`,JSON.stringify({event:'success',attempt,key,latencyMs:Date.now()-started})+'\n');
  }catch(e){appendFileSync(`${out}/attempts.jsonl`,JSON.stringify({event:'failure',attempt,key,error:e.message,latencyMs:Date.now()-started})+'\n');}
 }
 async function batch(items){let next=0;const settled=await Promise.allSettled(Array.from({length:3},async()=>{try{while(next<items.length&&!stopped){const [c,v]=items[next++];await score(c,v);}}catch(e){stopped=true;throw e;}}));const error=settled.find(x=>x.status==='rejected');if(error)throw error.reason;}
 const get=(c,v)=>cache[hash({endpoint:settings.endpoint,body:JSON.stringify(payload(c,v,q,protocol.model))})];
 if(!process.argv.includes('--report-only'))await batch(eligible.slice(0,10).map(c=>[c,'v3']));
 const pilot={n:10,successes:eligible.slice(0,10).filter(c=>get(c,'v3')).length,ledger:{...ledger},stopped,latenciesMs:eligible.slice(0,10).map(c=>get(c,'v3')?.latencyMs??null)};if(!existsSync(`${out}/pilot.json`))atomic(`${out}/pilot.json`,pilot);if(!existsSync(`${out}/pilot-latencies.json`))atomic(`${out}/pilot-latencies.json`,eligible.slice(0,10).map(c=>({inputId:c.id,latencyMs:get(c,'v3')?.latencyMs??null})));if(!process.argv.includes('--report-only')){progress(`Pilot cache verified: ${pilot.successes}/10 successes. Original receipt retained in pilot.json.`);console.log('PILOT',JSON.stringify(read(`${out}/pilot.json`)));}
 if(!process.argv.includes('--report-only')&&(pilot.successes!==10||stopped))throw Error('Pilot incomplete; see attempts journal');
 if(process.argv.includes('--pilot'))return;
 if(!process.argv.includes('--report-only'))await batch(protocol.policies.flatMap(p=>eligible.map(c=>[c,p.questionVersion])));
 const policies=protocol.policies.map(p=>{
  const rows=inputs.map(c=>{const l=labels.find(x=>x.id===c.id),s=sources.find(x=>x.id===c.id),r=get(c,p.questionVersion),pred=casePrediction({...c,secondsSinceLastIntervention:120},r?.scores,p);return {id:c.id,sourceDataset:s.sourceDataset,sourceId:s.sourceId,gold:l.status,uncertain:l.uncertain,alternativeStatus:l.alternativeStatus,gated:c.transcript.length<3,actual:pred.status,action:pred.action,scores:r?.scores??null,error:!pred.status?'Missing successful score':null,actualModel:r?.actualModel??null,latencyMs:r?.latencyMs??null};});
  const slice=xs=>{const m=metrics(xs);delete m.wilson95;return {...m,binaryIntervention:binary(xs)};};
  return {policy:p,overall:slice(rows),byDataset:Object.fromEntries([...new Set(rows.map(r=>r.sourceDataset))].map(d=>[d,slice(rows.filter(r=>r.sourceDataset===d))])),uncertainty:{certain:slice(rows.filter(r=>!r.uncertain)),uncertain:slice(rows.filter(r=>r.uncertain))},runtimeGate:{gated:slice(rows.filter(r=>r.gated)),eligible:slice(rows.filter(r=>!r.gated))},rows};
 });
 for(const r of Object.values(cache)) r.costEstimateMicroUSD=r.raw.provider_metadata?.gateway?.cost!==undefined?Number(r.raw.provider_metadata.gateway.cost)*1000000:null;atomic(`${out}/cache.json`,cache);
 const report={complete:policies.every(p=>p.overall.errors===0),createdAt:new Date().toISOString(),settings,protocol,ledger,successfulScores:Object.keys(cache).length,attemptEvents:readFileSync(`${out}/attempts.jsonl`,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),measurementTimeoutMs:15000,productionTimeoutMs:5000,latency:{maxMs:Math.max(...Object.values(cache).map(r=>r.latencyMs)),overProductionTimeoutCount:Object.values(cache).filter(r=>r.latencyMs>5000).length},usageTotals:Object.values(cache).reduce((a,r)=>{for(const [k,v] of Object.entries(r.usage??{}))if(typeof v==='number')a[k]=(a[k]??0)+v;return a;},{}),majorityBaseline:{status:'OK',correct:124,n:169,accuracy:124/169},costEstimateMicroUSD:Object.values(cache).every(x=>x.costEstimateMicroUSD!==null)?Object.values(cache).reduce((a,x)=>a+x.costEstimateMicroUSD,0):null,limitations:['Synthetic scripts with independent GPT silver references; no human gold.','Agenda and speaker-prefixed text only; no ASR or canvas multimodal assessment.','Correlated prefix/full cases are not 169 independent meetings.','Fixed policies; no fitting on this dataset.','Reservation is conservative budget accounting, not an invoice.','Measurement fetch timeout 15 seconds versus production 5 seconds; this run does not establish deployment latency equivalence.'],policies};
 atomic(`${out}/report.json`,report);atomic(`${out}/predictions.json`,policies.map(({policy,rows})=>({policy,rows})));
 const fmt=x=>(x*100).toFixed(2)+'%';writeFileSync(`${out}/REPORT.md`,`# PR35 text-only Jev evaluation\n\nStatus: ${report.complete?'complete':'INCOMPLETE; missing scores count as errors'}. All 169 cases included, including 24 uncertain labels.\n\n| Policy | Correct | Accuracy | Macro F1 | Majority baseline |\n|---|---:|---:|---:|---:|\n${policies.map(p=>`| ${p.policy.name} | ${p.overall.correct}/169 | ${fmt(p.overall.accuracy)} | ${p.overall.macroF1.toFixed(4)} | ${fmt(p.overall.majorityBaseline)} |`).join('\n')}\n\n${report.limitations.join('\n\n')}\n\n${ledger.attempts} attempts, ${Object.keys(cache).length} cached successful scores. Reserved $${(ledger.reservedMicroUSD/1e6).toFixed(6)}. Usage and raw scores preserved in cache.json; full class precision/recall, confusion matrices, binary intervention and dataset/uncertainty/runtime-gate slices are in report.json. Provider-reported estimated cost (not invoice): $${report.costEstimateMicroUSD===null?'unknown':(report.costEstimateMicroUSD/1e6).toFixed(8)}.\n`);
 for(const p of policies){
  let detail=`\n## ${p.policy.name}\n\n| Class | Precision | Recall | F1 | Support |\n|---|---:|---:|---:|---:|\n`;
  detail+=Object.entries(p.overall.perClass).map(([c,m])=>`| ${c} | ${fmt(m.precision)} | ${fmt(m.recall)} | ${m.f1.toFixed(4)} | ${m.support} |`).join('\n');
  detail+='\n\nConfusion matrix (rows reference; columns prediction):\n\n| Reference | '+classes.join(' | ')+' |\n|---|---:|---:|---:|\n'+classes.map(c=>'| '+c+' | '+classes.map(d=>p.overall.matrix[c][d]).join(' | ')+' |').join('\n');
  detail+='\n\nBinary intervention: `'+JSON.stringify(p.overall.binaryIntervention)+'`\n\n| Slice | N | Correct | Accuracy | Macro F1 |\n|---|---:|---:|---:|---:|\n';
  detail+=Object.entries({...p.byDataset,...p.uncertainty,...p.runtimeGate}).map(([n,m])=>`| ${n} | ${m.n} | ${m.correct} | ${fmt(m.accuracy)} | ${m.macroF1.toFixed(4)} |`).join('\n')+'\n';
  appendFileSync(`${out}/REPORT.md`,detail);
 }
 progress(`${process.argv.includes('--report-only')?'Offline report regenerated; ':''}Full scoring ${report.complete?'complete':'incomplete'}: ${Object.keys(cache).length} successes / ${eligible.length*2}; ${ledger.attempts} attempts; reserved $${(ledger.reservedMicroUSD/1e6).toFixed(6)}. Reports saved.`);console.log(JSON.stringify({complete:report.complete,ledger,policies:policies.map(p=>({name:p.policy.name,...p.overall}))}));
 if(!report.complete)process.exitCode=1;
 }finally{closeSync(lock);unlinkSync(`${out}/process.lock`);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
