import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hash, validateCases } from './core.mjs';
import { assertProvenance } from './data.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../docs/jev-tuning');
const jsonl=name=>readFileSync(`${root}/data/${name}.jsonl`,'utf8').trim().split('\n').map(JSON.parse);
const labels=new Map(jsonl('labels-final').map(row=>[row.id,row]));
const real=['real-train','real-validation','real-test'].flatMap(name=>jsonl('final/'+name));
const synthetic=jsonl('final/synthetic-train');
const dataset=[...real,...synthetic].map(c=>{
  const label=labels.get(c.id);if(!label)throw new Error(`Missing independent label ${c.id}`);
  return {
    id:c.id,agenda:c.meeting_objectives.join('\n'),transcript:c.utterances.map(u=>`${u.speaker}: ${u.text}`),
    split:c.split,sourceGroup:c.meeting_series_id,secondsSinceLastIntervention:120,
    dataKind:c.kind==='synthetic'?'synthetic':'real-roleplay',
    ...(c.kind==='synthetic'?{parentId:c.source_case_ids[0]}:{}),
    gold:{status:label.status,reason:label.reason},
    annotation:{...label,humanReviewed:false},
    provenance:{license:c.license,source:c.source_url,corpus:'AMI / AMI-ME',release:c.source_release??null,
      seriesId:c.meeting_series_id,meeting:c.original_meeting_id??null,segment:c.original_segment_id??null,
      startSeconds:c.start_seconds??null,endSeconds:c.end_seconds??null,utteranceIndexRange:c.utterance_index_range??null,
      limitations:c.context_limitations,extraction:c.extraction??c.generation_method}
  };
});
validateCases(dataset);assertProvenance(dataset);
const output=resolve(process.argv[2]??'evals/tuning/pro-final-cases.json');
if(existsSync(output)&&hash(JSON.parse(readFileSync(output)))!==hash(dataset)&&!process.argv.includes('--replace'))throw new Error('Dataset changed; choose new filename or explicitly --replace before freezing an experiment');
writeFileSync(output,JSON.stringify(dataset,null,2)+'\n');
console.log(JSON.stringify({count:dataset.length,hash:hash(dataset),developmentOnlySupport:Object.fromEntries(['train','validation'].map(s=>[s,Object.fromEntries(['INTERVENE_DRIFT','INTERVENE_STALLED','OK'].map(k=>[k,dataset.filter(c=>c.split===s&&c.gold.status===k).length]))]))},null,2));
