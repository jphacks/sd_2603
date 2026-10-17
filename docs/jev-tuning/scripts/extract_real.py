#!/usr/bin/env python3
"""Rebuild unlabeled real cases from pinned AMI-ME and verify AMI word support."""
import argparse, hashlib, json, re, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

PIN = 'c04006257be6ba5cfdb570449a1d064d5e609671'
URL = f'https://raw.githubusercontent.com/ku-nlp/AMI-ME/{PIN}/AMI_ME.json'
AMI_ME_SHA256 = '8689d47989414f0c83a03f1c5de85ba09187b8c0238c6a5e0eeaaa09efc1412f'
AMI_ZIP_SHA256 = 'b56e5babb2496b8795deeeda7e71178d7fbc9963f94276cf2a3f4b56ebbc9f9d'
ROOT = Path(__file__).resolve().parents[1]

def sha(b): return hashlib.sha256(b).hexdigest()
def tokens(t): return re.findall(r"[a-z0-9]+", t.lower())
def dump(path, rows):
    path.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in rows))

def main():
    p=argparse.ArgumentParser();p.add_argument('--ami-me',type=Path,required=True);p.add_argument('--manual-zip',type=Path,required=True);a=p.parse_args()
    raw=a.ami_me.read_bytes()
    if sha(raw)!=AMI_ME_SHA256 or sha(a.manual_zip.read_bytes())!=AMI_ZIP_SHA256:
        raise SystemExit('Source SHA256 mismatch: use the pinned releases documented in README.md')
    corpus=json.loads(raw); z=zipfile.ZipFile(a.manual_zip)
    # One meeting per series; deterministic selection without effectiveness scores/topic labels.
    series={}
    for mid,m in sorted(corpus.items(),key=lambda kv:sha(('jev-meeting-v1:'+kv[0]).encode())):
        if not m['meeting_type'].startswith('scenario_'): continue
        group=mid[:-1]
        eligible=[s for s in m['segments'] if len(s['utterances'])>=8]
        if len(eligible)>=5 and group not in series: series[group]=(mid,m,eligible)
    groups=sorted(series,key=lambda g:sha(('jev-split-v1:'+g).encode()))[:20]
    assignment={g:('train' if i<12 else 'validation' if i<16 else 'test') for i,g in enumerate(groups)}
    cases=[];matches=[]
    for g in groups:
        mid,m,segs=series[g]; selected=[segs[round(i*(len(segs)-1)/4)] for i in range(5)]
        words={}
        for sp in 'ABCD':
            path=f'words/{mid}.{sp}.words.xml'
            words[sp]=[(float(w.attrib['starttime']),float(w.attrib['endtime']),w.text or '') for w in ET.fromstring(z.read(path)) if w.tag=='w' and 'starttime' in w.attrib]
        for seg in selected:
            # Contiguous prefix, at most 32 utterances. Do not invent or translate real text.
            us=[dict(u) for u in seg['utterances'][:32]]
            cid=f'ami-{seg["segment_id"]}'
            c={'id':cid,'kind':'real_recorded_roleplay','language':'en','split':assignment[g], 'meeting_series_id':g,'original_meeting_id':mid,'original_segment_id':seg['segment_id'], 'meeting_objectives':m['predefined_objectives'],'start_seconds':min(u['start'] for u in us),'end_seconds':max(u['end'] for u in us),'utterance_index_range':[0,len(us)-1],'utterances':us,'source_url':URL,'source_release':PIN,'license':'CC-BY-4.0','extraction':'contiguous segment prefix; maximum 32 utterances; original text retained','context_limitations':'Meeting objectives supplied; segment topic and effectiveness ratings hidden. Earlier dialogue outside segment unavailable. Timings rounded by AMI-ME; gaps are not proof of silence.'}
            cases.append(c)
            for i,u in enumerate(us):
                ref=[(b,t) for b,e,t in words[u['speaker']] if b>=u['start']-1.1 and b<=u['end']+1.1]
                rt=set(tokens(' '.join(t for _,t in ref))); ts=tokens(u['text']);cov=sum(t in rt for t in ts)/len(ts) if ts else None
                matches.append({'case_id':cid,'utterance_index':i,'official_word_file':f'words/{mid}.{u["speaker"]}.words.xml','window_start':u['start']-1.1,'window_end':u['end']+1.1,'token_membership_coverage':round(cov,4) if cov is not None else None,'note':'punctuation-only utterance' if cov is None else 'lexical membership only; not full alignment'})
    cases.sort(key=lambda c:c['id']);dump(ROOT/'data/real-cases.jsonl',cases)
    dump(ROOT/'sources/word-checks.jsonl',matches)
    manifest={'ami_me_url':URL,'ami_me_sha256':sha(raw),'ami_manual_url':'https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip','ami_manual_sha256':sha(a.manual_zip.read_bytes()),'source_license':'CC-BY-4.0','split_algorithm':'sha256(jev-split-v1:+series); first 20 eligible series; meeting chosen by sha256(jev-meeting-v1:+meeting); 12 train/4 validation/4 test; 5 segments per series','series_splits':assignment,'counts':{s:sum(c['split']==s for c in cases) for s in ['train','validation','test']},'minimum_token_membership_coverage':min(m['token_membership_coverage'] for m in matches if m['token_membership_coverage'] is not None),'warning':'Membership coverage is a coarse cross-check, not an exact textual alignment; manually review low coverage.'}
    (ROOT/'sources/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (ROOT/'sources/AMI-LICENCE.txt').write_bytes(z.read('LICENCE.txt'))
    for name,splits in [('train',{'train'}),('heldout',{'validation','test'})]:
        dump(ROOT/f'data/blind-{name}.jsonl',[{k:c[k] for k in ['id','meeting_objectives','utterances','context_limitations']} for c in cases if c['split'] in splits])
    print(json.dumps(manifest,indent=2))
if __name__=='__main__':main()
