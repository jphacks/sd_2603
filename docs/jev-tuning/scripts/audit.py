#!/usr/bin/env python3
"""Offline audit of provenance, split/seed leakage, annotations and frozen artifacts.
No model calls. This is data quality/annotation evidence, never Jev accuracy.
"""
import argparse,collections,hashlib,json,re,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from extract_real import AMI_ME_SHA256,AMI_ZIP_SHA256,PIN
ROOT=Path(__file__).resolve().parents[1]
def rows(p):return [json.loads(x) for x in p.read_text().splitlines() if x]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(ok,message):
 if not ok:raise ValueError(message)
def main():
 p=argparse.ArgumentParser();p.add_argument('--ami-me',type=Path,required=True);p.add_argument('--manual-zip',type=Path,required=True);a=p.parse_args()
 check(sha(a.ami_me)==AMI_ME_SHA256,'AMI-ME source hash');check(sha(a.manual_zip)==AMI_ZIP_SHA256,'AMI ZIP source hash')
 source=json.loads(a.ami_me.read_bytes());z=zipfile.ZipFile(a.manual_zip)
 d=ROOT/'data';real=rows(d/'real-cases.jsonl');syn=rows(d/'synthetic-train.jsonl');allcases=real+syn;byid={r['id']:r for r in allcases};labels=rows(d/'labels-final.jsonl');bylabel={r['id']:r for r in labels}
 check(len(real)==100 and len(syn)==36,'expected corpus sizes');check(len(byid)==len(allcases),'duplicate case IDs');check(set(bylabel)==set(byid) and len(labels)==len(bylabel),'label exact coverage')
 group_splits=collections.defaultdict(set);hash_splits=collections.defaultdict(set);word_cache={};word_checks=[];backward=[]
 for c in real:
  check(c['license']=='CC-BY-4.0' and c['source_release']==PIN,'license/version');mid=c['original_meeting_id'];g=c['meeting_series_id'];check(g==mid[:-1],'series derivation');group_splits[g].add(c['split'])
  check('scores' not in c and 'topic' not in c and 'objectives' not in c,'source evaluation leak')
  seg=next(s for s in source[mid]['segments'] if s['segment_id']==c['original_segment_id']);lo,hi=c['utterance_index_range']
  check(c['utterances']==seg['utterances'][lo:hi+1],'exact original range '+c['id']);check(c['meeting_objectives']==source[mid]['predefined_objectives'],'objective provenance')
  check(c['start_seconds']==min(u['start'] for u in c['utterances']) and c['end_seconds']==max(u['end'] for u in c['utterances']),'case timestamps')
  text='\n'.join(u['text'] for u in c['utterances']);hash_splits[hashlib.sha256(text.encode()).hexdigest()].add(c['split'])
  if any(v['start']<u['start'] for u,v in zip(c['utterances'],c['utterances'][1:])):backward.append(c['id'])
  for i,u in enumerate(c['utterances']):
   key=(mid,u['speaker']);path='words/%s.%s.words.xml'%key
   if key not in word_cache:word_cache[key]=[(float(w.attrib['starttime']),w.text or '') for w in ET.fromstring(z.read(path)) if w.tag=='w' and 'starttime' in w.attrib]
   ts=re.findall('[a-z0-9]+',u['text'].lower());ref=set(re.findall('[a-z0-9]+',' '.join(t for b,t in word_cache[key] if u['start']-1.1<=b<=u['end']+1.1).lower()));missing=[t for t in ts if t not in ref]
   check(not missing,'official word support '+c['id']+':'+str(i))
   word_checks.append({'case_id':c['id'],'utterance_index':i,'official_word_file':path,'window_start':u['start']-1.1,'window_end':u['end']+1.1,'lexical_token_count':len(ts),'missing_token_count':len(missing),'note':'membership check only; source text/order equality checked separately; punctuation-only not lexical evidence'})
 check(all(len(s)==1 for s in group_splits.values()),'series leakage');check(all(len(s)==1 for s in hash_splits.values()),'exact text split leakage')
 check(dict(collections.Counter(c['split'] for c in real))=={'train':60,'validation':20,'test':20},'split counts')
 for c in syn:
  check(c['kind']=='synthetic' and c['language']=='ja' and c['split']=='train','synthetic metadata')
  for sid in c['source_case_ids']:check(sid in byid and byid[sid]['kind']=='real_recorded_roleplay' and byid[sid]['split']=='train' and byid[sid]['meeting_series_id']==c['meeting_series_id'],'synthetic ancestry leakage')
 for r in labels:
  check(not r['uncertain'] or r['reviewed'],'uncertain case missing second review')
  check(r['status'] in ['OK','INTERVENE_DRIFT','INTERVENE_STALLED'],'unknown status');check(r['confidence'] in ['low','medium','high'] and isinstance(r['uncertain'],bool),'uncertainty schema')
  check(bool(r['reason']) and bool(r['evidence_utterance_indices']),'annotation evidence missing')
  check(all(type(i)==int and 0<=i<len(byid[r['id']]['utterances']) for i in r['evidence_utterance_indices']),'annotation index')
  for k in ['drifted','stalled','tangentIsRelevant']:check(r[k] is None or 0<=r[k]<=1,'score domain')
  check(r['drifted'] is not None and r['stalled'] is not None,'required scores')
 rubric=(ROOT/'rubric.md').read_text();criteria={s:len(re.findall(r'\| '+s+r'\d\d \|',rubric)) for s in 'DST'};check(all(n>=30 for n in criteria.values()),'rubric counts')
 overlap=[]
 for i,c in enumerate(real):
  for q in real[i+1:]:
   if c['original_segment_id']==q['original_segment_id'] and max(c['utterance_index_range'][0],q['utterance_index_range'][0])<=min(c['utterance_index_range'][1],q['utterance_index_range'][1]):
    check(c['split']==q['split'],'overlap leakage');overlap.append([c['id'],q['id']])
 subsets={}
 for name,cs in [('real_all',real)]+[(f'real_{s}',[c for c in real if c['split']==s]) for s in ['train','validation','test']]+[('real_broad',[c for c in real if c.get('selection_stratum')!='challenge_candidate']),('real_targeted',[c for c in real if c.get('selection_stratum')=='challenge_candidate']),('synthetic_train',syn)]:
  counts=collections.Counter(bylabel[c['id']]['status'] for c in cs);subsets[name]={'n':len(cs),'label_counts':dict(counts),'uncertain':sum(bylabel[c['id']]['uncertain'] for c in cs),'majority_baseline_label_rate':max(counts.values())/len(cs),'missing_classes':sorted(set(['OK','INTERVENE_DRIFT','INTERVENE_STALLED'])-set(counts))}
 review=rows(d/'review-independent.jsonl');adjudications=rows(d/'adjudication.jsonl'); disagreements=[r['id'] for r in adjudications if r['disagreement']]
 (ROOT/'sources/word-checks-final.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in word_checks))
 inventory={str(f.relative_to(ROOT)):sha(f) for f in sorted(d.rglob('*.jsonl'))}
 report={'type':'data_audit_not_model_evaluation','real_windows':len(real),'independent_series':len(group_splits),'distinct_original_segments':len({c['original_segment_id'] for c in real}),'synthetic_train':len(syn),'rubric_counts':criteria,'source_json_exact_range_checks':len(real),'official_lexical_utterances':sum(r['lexical_token_count']>0 for r in word_checks),'official_punctuation_only_utterances':sum(r['lexical_token_count']==0 for r in word_checks),'official_membership_mismatches':0,'series_split_leaks':0,'exact_text_split_leaks':0,'synthetic_heldout_ancestor_count':0,'same_split_overlapping_windows':overlap,'source_order_backward_start_cases':backward,'timestamp_gap_over_120s_case_ids':[r['id'] for r in labels if r.get('source_timestamp_gap_warnings')],'subsets':subsets,'second_pass_independent_cases':len(review),'total_re_reviewed_cases':len(adjudications),'review_disagreement_ids':disagreements,'data_file_sha256':inventory,'limitations':['Labels are provisional LLM judgments; no human adjudication or Jev accuracy measured.','Targeted windows were selected after initial OK-only labels; this is dataset construction, not a pristine confirmatory benchmark. Freeze now before model selection.','Shared speakers across different AMI series were not audited; split guarantees series separation only.','100 windows are clustered into 20 series and include two same-split overlapping pairs; do not claim 100 independent meetings.','English recorded role-play and Japanese synthetic conversations do not establish Japanese live meeting performance.','Source utterance order retained even where start times go backwards; no silence inference from metadata gaps.']}
 (ROOT/'audit-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['data_file_sha256','source_order_backward_start_cases']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
