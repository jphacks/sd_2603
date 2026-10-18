#!/usr/bin/env python3
"""Create immutable release snapshots. Existing snapshots must match, never overwrite."""
import argparse,collections,datetime,json,subprocess
from pathlib import Path
from package import ROOT,sha,canonical

def main():
 p=argparse.ArgumentParser();p.add_argument('--release',choices=['core500','full1000'],required=True);a=p.parse_args();cases=json.loads((ROOT/'cases.json').read_text());count=500 if a.release=='core500' else 1000
 if a.release=='core500':cases=[c for c in cases if int(c['sourceGroup'].rsplit('-',1)[1])<=100]
 spec=json.loads((ROOT/'generation-spec.json').read_text());families=list(spec['families'])
 ext=ROOT/'extension-spec.json'
 if ext.exists():families+=json.loads(ext.read_text())['families']
 intent={v['id']:v['designIntent'] for f in families for v in f['designSlots']}
 for c in cases:
  target={'drift':'INTERVENE_DRIFT','stalled':'INTERVENE_STALLED','borderline_ok':'OK','clear_ok':'OK'}[intent[c['id']]]
  if c['annotation']['uncertain'] or c['annotation']['confidence']=='low' or c['gold']['status']!=target:assert c['annotation']['reviewed'],'Required review missing: '+c['id']
 for split in ['train','validation','test']:
  for status in {c['gold']['status'] for c in cases if c['split']==split}:assert any(c['split']==split and c['gold']['status']==status and c['annotation']['reviewed'] for c in cases),'Missing class/split review sample'
 assert len(cases)==count,(len(cases),count);assert len({c['sourceGroup'] for c in cases})==count//5
 expected={'train':count*6//10,'validation':count//5,'test':count//5};assert dict(collections.Counter(c['split'] for c in cases))==expected
 folder=ROOT/'releases'/a.release;folder.mkdir(parents=True,exist_ok=True)
 payloads={'cases.json':cases,**{f'cases-{s}.json':[c for c in cases if c['split']==s] for s in expected}}
 for name,rs in payloads.items():
  out=folder/name;text=json.dumps(rs,ensure_ascii=False,indent=2)+'\n'
  if out.exists():assert out.read_text()==text,'Frozen release differs; publish an explicit new version instead: '+name
  else:out.write_text(text)
 manifest={'release':a.release,'version':'synthetic-benchmark-v1','frozenAtJST':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(),'gitBaseBeforeFreeze':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'count':len(cases),'dataKind':'synthetic','labelSource':'independent_gpt_silver','humanGold':False,'splitCounts':expected,'actualLabelCounts':dict(collections.Counter(c['gold']['status'] for c in cases)),'caseHashes':{c['id']:sha(c) for c in cases},'casesHash':sha(cases),'warning':'Not Jev accuracy, real recordings or human-certified gold.'}
 dest=folder/'manifest.json'
 if dest.exists():old=json.loads(dest.read_text());assert old['caseHashes']==manifest['caseHashes'],'frozen manifest case changes';manifest=old
 else:dest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in manifest.items() if k!='caseHashes'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
