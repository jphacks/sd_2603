#!/usr/bin/env python3
"""Select required uncertainty/intent-mismatch cases and blind class/split samples.
Selection reasons stay in a separate manifest; no labels go into reviewer input.
"""
import argparse,hashlib,json
from package import ROOT,write,jsonl

def main():
 p=argparse.ArgumentParser();p.add_argument('--authors',nargs='+',default=['a','b','c']);a=p.parse_args();cases=json.loads((ROOT/'cases.json').read_text());families=json.loads((ROOT/'generation-spec.json').read_text())['families']
 if (ROOT/'extension-spec.json').exists():families+=json.loads((ROOT/'extension-spec.json').read_text())['families']
 intents={s['id']:s['designIntent'] for f in families for s in f['designSlots']};reviewed={c['id'] for c in cases if c['annotation']['reviewed']};old=json.loads((ROOT/'review-selection.json').read_text()) if (ROOT/'review-selection.json').exists() else {};out={}
 route={'a':'c','b':'a','c':'b','d':'f','e':'d','f':'e'}
 for who in a.authors:
  cs=[c for c in cases if c['generation']['author']=='author_'+who];chosen={}
  for c in cs:
   expected={'drift':'INTERVENE_DRIFT','stalled':'INTERVENE_STALLED','borderline_ok':'OK','clear_ok':'OK'}[intents[c['id']]]
   reasons=[]
   if c['annotation']['uncertain']:reasons.append('primary uncertain/boundary')
   if c['annotation']['confidence']=='low':reasons.append('primary low confidence')
   if c['gold']['status']!=expected:reasons.append('intent-primary disagreement; intent hidden from reviewer')
   if reasons and c['id'] not in reviewed:chosen[c['id']]=reasons
  for split in ['train','validation','test']:
   for status in ['INTERVENE_DRIFT','INTERVENE_STALLED','OK']:
    eligible=[c for c in cs if c['split']==split and c['gold']['status']==status]
    if any(c['id'] in reviewed for c in eligible):continue
    remaining=[c for c in eligible if c['id'] not in reviewed]
    if remaining:
     c=min(remaining,key=lambda c:hashlib.sha256(('review-final-v1:'+c['id']).encode()).hexdigest());chosen.setdefault(c['id'],[]).append('stable primary-class/split sample')
  reviewer=route[who];filename=f'review-{reviewer}-final-on-{who}.jsonl';packet=[{k:c[k] for k in ['id','agenda','phase','transcript']} for c in cs if c['id'] in chosen];packet.sort(key=lambda c:hashlib.sha256(c['id'].encode()).hexdigest());target=ROOT/'blind'/filename
  if target.exists():assert target.read_text()==''.join(json.dumps(c,ensure_ascii=False)+'\n' for c in packet),'Do not overwrite a review packet after dispatch'
  else:jsonl(target,packet)
  out[who]={'reviewer':'review_'+reviewer,'packet':'blind/'+filename,'count':len(packet),'selectionReasons':chosen}
 old['finalSelection']=dict(old.get('finalSelection',{}),**out);write(ROOT/'review-selection.json',old);print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
