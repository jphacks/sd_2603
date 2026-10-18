#!/usr/bin/env python3
"""Assemble authored text and blind primary annotations. Never create semantic labels."""
import argparse,collections,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(p):return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]
def canonical(o):return json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def sha(o):return hashlib.sha256(canonical(o)).hexdigest()
def write(p,o):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
def jsonl(p,rs):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rs))
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--expect',type=int);a=ap.parse_args();spec=json.loads((ROOT/'generation-spec.json').read_text());planned={s['id']:(f,s) for f in spec['families'] for s in f['designSlots']}
 raw={};intents={};labels={};reviews={}
 for p in sorted((ROOT/'raw').glob('*.jsonl')):
  target=intents if p.stem.endswith('-intents') else raw
  for r in read(p):
   assert r['id'] not in target,'duplicate raw ID '+r['id'];target[r['id']]=r
 for p in sorted((ROOT/'annotations').glob('primary-*.jsonl')):
  for r in read(p):assert r['id'] not in labels,'duplicate primary ID';labels[r['id']]=r
 for p in sorted((ROOT/'annotations').glob('review-*.jsonl')):
  for r in read(p):assert r['id'] not in reviews,'duplicate secondary ID';reviews[r['id']]=r
 for id,c in raw.items():
  assert id in planned and id in intents,(id,'plan/intent missing');f,s=planned[id];assert c['familyId']==f['familyId'];assert c['author']==f['author'];assert 6<=len(c['transcript'])<=12;assert all(isinstance(t,str) and re.match(r'[^:：]{1,20}[:：].+',t) for t in c['transcript']);assert c['agenda'] and c['phase'];assert intents[id]['designIntent']==s['designIntent']
 for p in sorted((ROOT/'raw').glob('*.jsonl')):
  if p.stem.endswith('-intents'):continue
  records=read(p);blind=[{k:r[k] for k in ['id','agenda','phase','transcript']} for r in records];blind.sort(key=lambda r:hashlib.sha256(('blind-v1:'+r['id']).encode()).hexdigest());jsonl(ROOT/'blind'/p.name,blind)
 cases=[];links=[];adoptions=[]
 for id,c in sorted(raw.items()):
  if id not in labels:continue
  f,s=planned[id];l=labels[id];assert l['annotator']=={'author_a':'judge_b','author_b':'judge_c','author_c':'judge_a'}[c['author']],'wrong judge route';assert l['labelSource']=='independent_gpt_silver' and l['humanReviewed'] is False;assert l['status'] in ['OK','INTERVENE_DRIFT','INTERVENE_STALLED'];assert l['reason'];assert l['confidence'] in ['high','medium','low'];assert isinstance(l['uncertain'],bool);assert l['evidenceTurns'] and all(type(i)==int and 0<=i<len(c['transcript']) for i in l['evidenceTurns']);assert 'action' not in l
  ann={'annotator':l['annotator'],'confidence':l['confidence'],'uncertain':l['uncertain'],'humanReviewed':False,'labelSource':l['labelSource'],'evidenceTurns':l['evidenceTurns'],'alternativeStatus':l.get('alternativeStatus'),'reviewed':False}
  status=l['status'];reason=l['reason'];review=reviews.get(id)
  if review:
   assert review['annotator'] not in [c['author'],l['annotator']];assert review['status'] in ['OK','INTERVENE_DRIFT','INTERVENE_STALLED'];assert review['evidenceTurns'] and all(0<=i<len(c['transcript']) for i in review['evidenceTurns'])
   conflict=review['status']!=status;ann.update(reviewed=True,reviewStatus=review['status'],reviewDisagreement=conflict);ann['uncertain']=ann['uncertain'] or review['uncertain'] or conflict
   if conflict:ann['confidence']='low';ann['alternativeStatus']=review['status']
   adoptions.append({'id':id,'primaryStatus':status,'reviewStatus':review['status'],'primaryReason':reason,'reviewReason':review['reason'],'disagreement':conflict,'adoption':'retain primary provisional silver; preserve alternative and uncertainty; no Jev predictions or target-accuracy alignment'})
  case={'id':id,'agenda':c['agenda'],'phase':c['phase'],'transcript':c['transcript'],'secondsSinceLastIntervention':120,'split':f['split'],'sourceGroup':f['familyId'],'cvFold':f['fold'],'dataKind':'synthetic','generation':{'version':'synthetic-benchmark-v1','familyId':f['familyId'],'author':c['author'],'researchReferences':f['researchReferences']},'gold':{'status':status,'reason':reason},'annotation':ann};cases.append(case);links.append({'id':id,'textHash':sha({k:case[k] for k in ['agenda','phase','transcript']}),'primaryLabelHash':sha(l),'adoptedLabelHash':sha({'gold':case['gold'],'annotation':ann}),'caseHash':sha(case)})
 if a.expect is not None:assert len(cases)==a.expect,(len(cases),a.expect)
 write(ROOT/'cases.json',cases)
 for split in ['train','validation','test']:write(ROOT/f'cases-{split}.json',[r for r in cases if r['split']==split])
 jsonl(ROOT/'case-label-hashes.jsonl',links);jsonl(ROOT/'adoption-log.jsonl',adoptions)
 actual=collections.Counter(c['gold']['status'] for c in cases);design=collections.Counter(planned[c['id']][1]['designIntent'] for c in cases);mismatch=[]
 for c in cases:
  intent=planned[c['id']][1]['designIntent'];expected={'drift':'INTERVENE_DRIFT','stalled':'INTERVENE_STALLED','borderline_ok':'OK','clear_ok':'OK'}[intent]
  if c['gold']['status']!=expected:mismatch.append({'id':c['id'],'designIntent':intent,'actualStatus':c['gold']['status']})
 stats={'state':'complete_core500' if len(cases)==500 else 'incomplete','generated':len(raw),'primaryLabeled':len(labels),'packaged':len(cases),'reviewed':sum(c['annotation']['reviewed'] for c in cases),'uncertain':sum(c['annotation']['uncertain'] for c in cases),'designCountsForPackaged':dict(design),'actualLabels':dict(actual),'intentLabelDifferences':mismatch,'splits':{s:{'n':sum(c['split']==s for c in cases),'labels':dict(collections.Counter(c['gold']['status'] for c in cases if c['split']==s))} for s in ['train','validation','test']},'warnings':['Synthetic evaluation only; not real meetings, human gold or measured Jev accuracy.','secondsSinceLastIntervention=120 is a fixed synthetic input, not a measured time.','Primary judges received no author intent or Jev predictions.']};write(ROOT/'progress.json',stats);print(json.dumps(stats,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
