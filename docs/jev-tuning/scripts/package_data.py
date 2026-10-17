#!/usr/bin/env python3
"""Build final active labels/packets; preserve original blind annotations unchanged."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def rows(p):return [json.loads(x) for x in p.read_text().splitlines() if x]
def dump(p,rs):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rs))
def main():
 data=ROOT/'data'; cases=rows(data/'real-cases.jsonl'); synthetic=rows(data/'synthetic-train.jsonl')
 primary={r['id']:r for name in ['labels-train.jsonl','labels-heldout.jsonl','labels-challenge.jsonl','labels-synthetic.jsonl'] for r in rows(data/name)}
 reviews={r['id']:r for r in rows(data/'review-independent.jsonl')}
 optional=data/'review-boundary.jsonl'
 if optional.exists():reviews.update({r['id']:r for r in rows(optional)})
 temporal=data/'review-temporal.jsonl'
 if temporal.exists():reviews.update({r['id']:r for r in rows(temporal)})
 final=[];adjudications=[]
 for c in cases+synthetic:
  r=dict(primary[c['id']]); rev=reviews.get(c['id']); r['reviewed']=rev is not None
  if 'start' in c['utterances'][0]:
   r['source_timestamp_gap_warnings']=[{'after_local_utterance_index':i,'gap_seconds':v['start']-u['end'],'interpretation':'Not classified as silence or omitted speech; source continuity requires checking'} for i,(u,v) in enumerate(zip(c['utterances'],c['utterances'][1:])) if v['start']-u['end']>120]
  if rev:
   conflict=r['status']!=rev['status'];r['review_status']=rev['status'];r['review_disagrees']=conflict;r['review_annotator']=rev['annotator']
   r['uncertain']=r['uncertain'] or rev['uncertain'] or conflict
   if conflict and r.get('alternative_status') is None:r['alternative_status']=rev['status']
   if conflict:r['confidence']='low'
   adjudications.append({'id':c['id'],'primary_status':r['status'],'second_status':rev['status'],'second_annotator':rev['annotator'],'disagreement':conflict,'decision':'Retain primary as provisional; uncertainty OR of both reviews; disagreement lowers confidence; do not majority-vote two judges. No Jev predictions seen.','primary_reason':r['reason'],'second_reason':rev['reason'],'needs_human_review':r['uncertain']})
  final.append(r)
 final.sort(key=lambda r:r['id']);dump(data/'labels-final.jsonl',final);dump(data/'adjudication.jsonl',adjudications)
 labels={r['id']:r for r in final}
 for split in ['train','validation','test']:
  active=[c for c in cases if c['split']==split]
  dump(data/f'final/real-{split}.jsonl',[dict(c,gold_status=labels[c['id']]['status'],annotation=labels[c['id']]) for c in active])
  dump(data/f'final/blind-real-{split}.jsonl',[{k:c[k] for k in ['id','meeting_objectives','utterances','context_limitations']} for c in active])
 dump(data/'final/synthetic-train.jsonl',[dict(c,gold_status=labels[c['id']]['status'],annotation=labels[c['id']]) for c in synthetic])
 print('Packaged',len(cases),'real +',len(synthetic),'synthetic; labels',len(final))
if __name__=='__main__':main()
