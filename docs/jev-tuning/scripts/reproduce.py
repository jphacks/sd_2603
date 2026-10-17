#!/usr/bin/env python3
"""Rebuild in a temporary copy and compare bytes; never overwrite the frozen corpus.
Human/LLM authored labels and dialogues are versioned inputs, not rerun model calls.
"""
import argparse,hashlib,shutil,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--ami-me',type=Path,required=True);p.add_argument('--manual-zip',type=Path,required=True);a=p.parse_args();src=a.ami_me.resolve();manual=a.manual_zip.resolve()
 with tempfile.TemporaryDirectory(prefix='jev-reproduce-') as t:
  dest=Path(t)/'jev-tuning';shutil.copytree(ROOT,dest,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
  commands=[['extract_real.py','--ami-me',str(src),'--manual-zip',str(manual)],['author_synthetic.py'],['add_challenge.py','--ami-me',str(src)],['package_data.py'],['audit.py','--ami-me',str(src),'--manual-zip',str(manual)]]
  for cmd in commands:
   result=subprocess.run([sys.executable,str(dest/'scripts'/cmd[0]),*cmd[1:]],capture_output=True,text=True)
   if result.returncode:raise RuntimeError(cmd[0]+' failed\n'+result.stdout+'\n'+result.stderr)
  compare=[f.relative_to(ROOT) for f in (ROOT/'data').rglob('*.jsonl')]+[Path(s) for s in ['sources/manifest.json','sources/challenge-selection.json','sources/word-checks-baseline.jsonl','sources/word-checks-final.jsonl','audit-report.json']]
  changed=[str(rel) for rel in sorted(compare) if not (dest/rel).exists() or sha(ROOT/rel)!=sha(dest/rel)]
  if changed:raise ValueError('Reproduction differs: '+', '.join(changed))
  print('Byte-identical rebuild verified for',len(compare),'frozen data/manifest/audit files. No Gateway or model calls.')
if __name__=='__main__':main()
