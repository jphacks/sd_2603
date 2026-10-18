#!/usr/bin/env python3
"""Assemble only individually revised v2 scripts; no v1 labels may leak into final."""
import collections,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
def rows(p):return [json.loads(s) for s in p.read_text().splitlines() if s]
def digest(s):return hashlib.sha256(s.encode()).hexdigest()
def dump(p,rs):p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rs))
def normalized(s):return re.sub(r'\s+','',s)
def blind(c):return {k:c[k] for k in ['id','agenda','phase','transcript','secondsSinceLastIntervention','observation_policy']}
def main():
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--prepare-blind',action='store_true');args=ap.parse_args()
 old={r['id']:r for r in rows(DATA/'authored-cases.jsonl')}
 rs=rows(DATA/'authored-v2-a.jsonl')+rows(DATA/'authored-v2-b.jsonl');rs.sort(key=lambda r:r['id'])
 assert len(rs)==len({r['id'] for r in rs})==112 and {r['id'] for r in rs}==set(old)
 full=set();bodies=set()
 for c in rs:
  assert 'gold' not in c and 'intended_status' not in c
  assert c['dataKind']=='synthetic' and c['kind']=='research_authored' and c['split'] in ['validation','test']
  assert c['sourceGroup']==old[c['id']]['sourceGroup'] and c['split']==old[c['id']]['split']
  assert 7<=len(c['transcript'])<=12 and c['secondsSinceLastIntervention']>=60
  assert c['research_source_ids']==old[c['id']]['research_source_ids']
  text=normalized('\n'.join(c['transcript']));body=normalized('\n'.join(c['transcript'][1:]))
  assert text not in full and body not in bodies,'Duplicated revised body '+c['id'];full.add(text);bodies.add(body)
  assert body!=normalized('\n'.join(old[c['id']]['transcript'][1:])),'Unrevised body '+c['id']
  c['version']='positive-authored-v2';c['provenance']['creator']='GPT author agent; independent label by different agent'
  c['provenance'].update(source=c['source_urls'][0],seriesId=c['sourceGroup'],meeting=None,license='CC-BY-4.0 (new authored dialogue)')
 packet=[blind(c) for c in rs];dump(DATA/'blind-authored-v2.jsonl',packet);dump(DATA/'authored-v2.jsonl',rs)
 if args.prepare_blind:
  print('Prepared frozen blind inputs:',len(packet),'distinct full conversations and nonopening bodies.');return
 labels=rows(DATA/'labels-authored-v2.jsonl');bylabel={r['id']:r for r in labels};assert set(bylabel)==set(old) and len(labels)==112
 source_records=[];alias={};canonical={}
 for name in ['research-drift.jsonl','research-stalled.jsonl']:
  for r in rows(ROOT/name):
   key=r['url'].lower().rstrip('/')
   if key in canonical:alias[r['source_id']]=canonical[key]['source_id'];continue
   canonical[key]=r;source_records.append(r)
 real=rows(ROOT/'research-dbdc3-real-breakdown-cases.jsonl');casino=rows(ROOT/'research-casino-stall-candidates.jsonl')
 barriers=rows(ROOT/'research-barriers-a.jsonl')+rows(ROOT/'research-barriers-b.jsonl');bybarrier={r['case_id']:r for r in barriers}
 assert len(barriers)==len(bybarrier)==len(real) and set(bybarrier)=={r['case_id'] for r in real}
 for r in real:
  b=bybarrier[r['case_id']];assert b['meeting_gold_inferred'] is False
  assert b['reason_ja'] and b['evidence_turn_indices'] and set(b['evidence_turn_indices'])<={u['turn_index'] for u in r['turns']}
 dump(ROOT/'research-barriers-final.jsonl',sorted(barriers,key=lambda r:r['case_id']))
 ledger=[{'research_id':r['source_id'],'record_type':'publication_or_dataset','url':r['url'],'title':r['title'],'evidence_directness':r.get('directness'),'direct_meeting_obstruction_definition':r['source_id'] in {'DR01','DR02','DR03','DR13','ST15','ST16','ST17'},'counting_note':'Publication counted once after URL deduplication; not a dialogue gold label.'} for r in source_records]
 ledger += [{'research_id':r['case_id'],'record_type':'real_human_chatbot_breakdown_case','url':r['source_url'],'dialogue_id':r['dialogue_id'],'target_turn_index':r['source_extent']['target_turn_index'],'human_label':r['source_label'],'votes':r['label_votes'],'observed_barrier':bybarrier[r['case_id']]['barrier_type'],'observation_reason_ja':bybarrier[r['case_id']]['reason_ja'],'meeting_direct':False,'counting_note':'Unique real dialogue case. DBDC-X is NOT a meeting drift/stall gold.'} for r in real]
 ledger += [{'research_id':r['case_id'],'record_type':'real_human_negotiation_stall_candidate','url':r['source_url'],'dialogue_id':r['dialogue_id'],'meeting_direct':False,'counting_note':'Separate candidate, not confirmed Jev gold.'} for r in casino]
 assert len(real)>=100 and len({r['dialogue_id'] for r in real})==len(real)
 assert len(ledger)==len({r['research_id'] for r in ledger})
 dump(ROOT/'research-ledger.jsonl',ledger)
 index=['# 調査記録インデックス','', '論文の重複はURLで除去。DBDC事例は会議goldではなく別領域の観測記録。','', '| ID | Type | Source / item |','|---|---|---|']
 for r in ledger:index.append('| '+r['research_id']+' | '+r['record_type']+' | ['+r.get('title',str(r.get('dialogue_id','')))+']('+r['url']+') |')
 (ROOT/'research-index.md').write_text('\n'.join(index)+'\n')
 out=[]
 for c in rs:
  lab=bylabel[c['id']];assert lab['status'] in ['INTERVENE_DRIFT','INTERVENE_STALLED','OK']
  assert isinstance(lab['uncertain'],bool) and lab['confidence'] in ['high','medium','low']
  ev=lab.get('evidence_turn_indices',lab.get('evidence_turn_indices0based',lab.get('evidence_utterance_indices')));assert ev and all(type(i)==int and 0<=i<len(c['transcript']) for i in ev)
  assert lab.get('reason_ja',lab.get('reason'))
  expected=digest(json.dumps(blind(c),ensure_ascii=False,sort_keys=True,separators=(',',':')))
  assert lab['input_sha256']==expected,'Label input hash mismatch '+c['id']
  out.append(dict(c,gold={'status':lab['status'],**({'action':'INTERVENE'} if lab['status']!='OK' else {}),'reason':lab.get('reason_ja',lab.get('reason'))},annotation=lab))
 primary=[c for c in out if c['gold']['status']!='OK' and not c['annotation']['uncertain']]
 assert len(primary)>=100,'Fewer than100 unambiguous independently judged positives'
 dump(DATA/'primary-positive-cases.jsonl',primary)
 dump(DATA/'uncertain-cases.jsonl',[c for c in out if c['annotation']['uncertain']])
 for split in ['validation','test']:
  strict=[c for c in primary if c['split']==split]
  dump(DATA/f'primary-positive-{split}.jsonl',strict)
  (DATA/f'primary-positive-{split}.json').write_text(json.dumps(strict,ensure_ascii=False,indent=2)+'\n')
  selected=[c for c in out if c['split']==split];assert len(selected)==56
  dump(DATA/f'positive-{split}.jsonl',selected)
  (DATA/f'positive-{split}.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2)+'\n')
  md=['# '+split+' — research-authored positive meetings','', '新規創作の会議例。実録・人手gold・Jev実測ではない。','']
  for c in selected:
   md.extend(['## '+c['id'],'', '- Source group: `'+c['sourceGroup']+'`','- Label: `'+c['gold']['status']+'`; uncertainty='+str(c['annotation']['uncertain']),'- Research: '+', '.join(c['research_source_ids']),'','議題: '+c['agenda'],''])
   md.extend([str(i)+'. '+t for i,t in enumerate(c['transcript'],1)])
   md.extend(['','判断根拠: '+c['gold']['reason'],''])
  (DATA/f'positive-{split}.md').write_text('\n'.join(md).rstrip()+'\n')
 dump(DATA/'positive-cases.jsonl',out)
 family_splits=collections.defaultdict(set)
 for c in out:family_splits[c['sourceGroup']].add(c['split'])
 assert len(family_splits)==28 and all(len(s)==1 for s in family_splits.values())
 assert all(r['jev_gold_label'] is None and not r['eligible_for_primary_meeting_validation_test'] for r in real)
 original=[]
 for file in (ROOT.parent/'data/final').glob('*.jsonl'):
  if file.name.startswith('blind'):continue
  for r in rows(file):original.append('\n'.join(u['speaker']+': '+u['text'] for u in r['utterances']))
 assert all(normalized(''.join(c['transcript'])) not in set(map(normalized,original)) for c in out),'Prior data exact duplicate'
 grams=lambda t:set(t[i:i+5] for i in range(max(0,len(t)-4)))
 bodies5={c['id']:grams(normalized('\n'.join(c['transcript'][1:]))) for c in out}
 near=[]
 for i,c in enumerate(out):
  for q in out[i+1:]:
   a,b=bodies5[c['id']],bodies5[q['id']];score=len(a&b)/max(1,len(a|b))
   if score>=.65:near.append({'ids':[c['id'],q['id']],'body_5gram_jaccard':round(score,4),'same_split':c['split']==q['split'],'same_family':c['sourceGroup']==q['sourceGroup']})
 assert not any(not r['same_split'] and r['body_5gram_jaccard']>=.85 for r in near),'High body similarity crosses split'
 support={s:dict(collections.Counter(c['gold']['status'] for c in out if c['split']==s)) for s in ['validation','test']}
 positive=sum(c['gold']['status']!='OK' for c in out);assert positive>=100,'Fewer than100 independently judged positives'
 manifest={'version':'positive-authored-v2','research_total_records':len(ledger),'unique_publications_or_datasets':len(source_records),'duplicate_publication_aliases':alias,'actual_human_chatbot_breakdown_cases':len(real),'observed_cross_domain_barrier_support':dict(collections.Counter(r['barrier_type'] for r in barriers)),'negotiation_candidates':len(casino),'authored_scripts':len(out),'independently_positive_scripts':positive,'unambiguous_primary_positive_scripts':len(primary),'primary_split_support':{s:dict(collections.Counter(c['gold']['status'] for c in primary if c['split']==s)) for s in ['validation','test']},'generation_families':28,'body_exact_duplicates':0,'body_5gram_pairs_above_065':near,'prior_dataset_normalized_exact_matches':0,'split_support':support,'uncertain':sum(c['annotation']['uncertain'] for c in out),'real_meeting_transcript_claim':False,'importer_status':'Existing integration assertProvenance intentionally rejects synthetic holdouts; needs explicit authored evaluation support. Not bypassed.','Jev_accuracy_measured':False,'research_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(ROOT.glob('research-*.jsonl'))},'data_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(DATA.glob('*.jsonl'))}}
 (ROOT/'positive-audit.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in manifest.items() if k!='data_sha256'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
