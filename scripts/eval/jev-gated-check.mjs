/** Fixed-label check of the actual staging four-question implementation; no fitting. */
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {requestJevScores,decideFromScores,questions} from '../../lib/judge/jev.ts';
import policy from '../../lib/judge/jev-policy.json' with {type:'json'};
const arg=(k,d)=>process.argv.find(s=>s.startsWith(`--${k}=`))?.slice(k.length+3)??d;
const read=p=>JSON.parse(readFileSync(p,'utf8')),sha=x=>createHash('sha256').update(x).digest('hex');
const inputsPath=arg('inputs'),labelsPath=arg('labels'),out=arg('out','/tmp/jev-staging-gated');
if(!inputsPath||!labelsPath)throw Error('--inputs and --labels required');
mkdirSync(out,{recursive:true});
const save=(p,x)=>{writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');renameSync(p+'.tmp',p);};
const inputs=read(inputsPath),labels=read(labelsPath),by=new Map(labels.map(l=>[l.id,l]));
const settings={inputSHA:sha(readFileSync(inputsPath)),labelSHA:sha(readFileSync(labelsPath)),questions:questions(),policy,model:'typesafe-ai/jev-1.14.0'};
if(existsSync(out+'/settings.json')&&JSON.stringify(read(out+'/settings.json'))!==JSON.stringify(settings))throw Error('Frozen settings changed');
save(out+'/settings.json',settings);
const cache=existsSync(out+'/scores.json')?read(out+'/scores.json'):{};
const ledger=existsSync(out+'/ledger.json')?read(out+'/ledger.json'):{attempts:0,reservedMicroUSD:0};
for(const c of inputs)if(!by.has(c.id)||c.inputHash!==by.get(c.id).inputHash)throw Error('Label/input alignment');
const eligible=inputs.filter(c=>c.transcript.length>=3);
async function score(c){
 if(cache[c.id]?.scores)return;
 const bytes=Buffer.byteLength(JSON.stringify({model:settings.model,state:{agenda:c.agenda,conversation:c.transcript},questions:settings.questions}));
 const reserve=Math.ceil(bytes*.16+900);
 if(bytes>28000||ledger.attempts>=200||ledger.reservedMicroUSD+reserve>1e6)throw Error('Request/budget bound');
 ledger.attempts++;ledger.reservedMicroUSD+=reserve;save(out+'/ledger.json',ledger);
 try{const result=await requestJevScores({...c,secondsSinceLastIntervention:120},{model:settings.model});
 cache[c.id]={...result,id:c.id,at:new Date().toISOString()};save(out+'/scores.json',cache);appendFileSync(out+'/attempts.jsonl',JSON.stringify({id:c.id,success:true})+'\n');
 }catch(e){appendFileSync(out+'/attempts.jsonl',JSON.stringify({id:c.id,success:false,error:e.kind??'unknown'})+'\n');if(['auth','rate_limit','config'].includes(e.kind))throw e;}
}
async function batch(cs){let i=0,failed;const results=await Promise.allSettled(Array.from({length:3},async()=>{while(i<cs.length&&!failed){try{await score(cs[i++]);}catch(e){failed=e;}}}));if(failed)throw failed;for(const r of results)if(r.status==='rejected')throw r.reason;}
await batch(eligible.slice(0,10));if(eligible.slice(0,10).some(c=>!cache[c.id]?.scores))throw Error('Pilot incomplete; rerun fixed command');
if(!existsSync(out+'/pilot.json'))save(out+'/pilot.json',{n:10,ledger:{...ledger},latenciesMs:eligible.slice(0,10).map(c=>cache[c.id].latencyMs)});
await batch(eligible);
const rows=inputs.map(c=>{const l=by.get(c.id),s=cache[c.id]?.scores;const d=c.transcript.length<3?{action:'WAIT'}:s?decideFromScores(s):null;const actual=!d?null:d.action!=='INTERVENE'?'OK':d.reason==='Discussion appears stalled'?'INTERVENE_STALLED':'INTERVENE_DRIFT';return{id:c.id,gold:l.status,actual,uncertain:l.uncertain,action:d?.action??null,scores:s??null};});
const classes=['INTERVENE_DRIFT','INTERVENE_STALLED','OK'];
const matrix=Object.fromEntries(classes.map(c=>[c,Object.fromEntries(classes.map(d=>[d,0]))]));for(const r of rows)if(r.actual)matrix[r.gold][r.actual]++;
const perClass=Object.fromEntries(classes.map(c=>{const tp=matrix[c][c],support=rows.filter(r=>r.gold===c).length,predicted=rows.filter(r=>r.actual===c).length;return[c,{support,predicted,precision:predicted?tp/predicted:0,recall:support?tp/support:0,f1:support+predicted?2*tp/(support+predicted):0}];}));
const report={measuredAt:new Date().toISOString(),settings,ledger,n:rows.length,correct:rows.filter(r=>r.gold===r.actual).length,accuracy:rows.filter(r=>r.gold===r.actual).length/rows.length,errors:rows.filter(r=>!r.actual).length,macroF1:Object.values(perClass).reduce((n,x)=>n+x.f1,0)/3,matrix,perClass,rows};save(out+'/report.json',report);
console.log(JSON.stringify({n:report.n,correct:report.correct,accuracy:report.accuracy,errors:report.errors,macroF1:report.macroF1,ledger}));if(report.errors)process.exitCode=1;
