#!/usr/bin/env python3
"""Replace ten broad-sample rows with documented, targeted diagnostic windows.
Run after extract_real.py; source screening is separate from independent labels.
"""
import argparse,json,hashlib
from extract_real import AMI_ME_SHA256
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
# Original AMI-ME utterance indices, inclusive. No text is edited.
RANGES=[('IS1006d_008',1,9),('TS3010b_002',0,23),('ES2008b_036',0,20),('ES2003b_008',0,6),('TS3009d_021',0,35),('TS3012b_001',0,7),('TS3005d_017',0,28),('ES2014b_002',0,9),('TS3008c_008',0,109),('TS3003a_015',0,13)]
def dump(p,rows):p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
def main():
 p=argparse.ArgumentParser();p.add_argument('--ami-me',type=Path,required=True);a=p.parse_args();raw=a.ami_me.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=AMI_ME_SHA256:raise SystemExit('AMI-ME source SHA256 mismatch')
 src=json.loads(raw)
 cases=list(map(json.loads,(ROOT/'data/real-cases.jsonl').open()))
 if any('-u' in r['id'] for r in cases):raise SystemExit('Run extract_real.py first; this step must start from baseline 100.')
 # Preserve the 12 already-used Train seeds, even when replacing within their series.
 seed_ids={q for r in map(json.loads,(ROOT/'data/synthetic-train.jsonl').open()) for q in r['source_case_ids']}
 new=[];changes=[]
 for sid,lo,hi in RANGES:
  mid=sid.split('_')[0];g=mid[:-1];m=src[mid];seg=next(s for s in m['segments'] if s['segment_id']==sid)
  candidates=[r for r in cases if r['meeting_series_id']==g and r['id'] not in seed_ids]
  removed=max(candidates,key=lambda r:r['id']);cases.remove(removed)
  us=[dict(u) for u in seg['utterances'][lo:hi+1]]
  c=dict(removed);c.update(id=f'ami-{sid}-u{lo}-{hi}',original_meeting_id=mid,original_segment_id=sid,start_seconds=min(u['start'] for u in us),end_seconds=max(u['end'] for u in us),utterance_index_range=[lo,hi],utterances=us,meeting_objectives=m['predefined_objectives'],extraction='targeted diagnostic contiguous window; source text and order retained',selection_stratum='challenge_candidate',context_limitations='Meeting objectives supplied; source topic/ratings hidden. Cutoff is the last supplied observation; later recovery is deliberately unavailable. Source utterances can overlap or have minor nonchronological ordering. No inference of silence from gaps.')
  new.append(c);changes.append({'removed_case_id':removed['id'],'added_case_id':c['id'],'series':g,'split':c['split'],'source_utterance_index_range':[lo,hi],'selection_reason':'Source topic screening for off-topic banter, technical trouble, or prolonged disagreement; candidate only, not a gold label.'})
 cases+=new;cases.sort(key=lambda r:r['id']);dump(ROOT/'data/real-cases.jsonl',cases)
 dump(ROOT/'data/blind-challenge.jsonl',[{k:c[k] for k in ['id','meeting_objectives','utterances','context_limitations']} for c in new])
 # Retain first-pass packets and labels as historical sampling evidence, not active evaluation inputs.
 (ROOT/'sources/challenge-selection.json').write_text(json.dumps({'changes':changes,'policy':'90 broad + 10 targeted = 100 final real cases. Changes precede independent challenge labels; do not tune these choices to Jev predictions.'},indent=2)+'\n')
 print('Final real cases',len(cases),'; challenge',len(new))
if __name__=='__main__':main()
