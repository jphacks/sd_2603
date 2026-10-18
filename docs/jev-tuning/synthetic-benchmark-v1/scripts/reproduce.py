#!/usr/bin/env python3
"""Re-package versioned authored text/silver labels in a temporary copy. No model calls."""
import hashlib,json,shutil,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 before={f.relative_to(ROOT):hashlib.sha256(f.read_bytes()).hexdigest() for f in [ROOT/n for n in ['cases.json','cases-train.json','cases-validation.json','cases-test.json','progress.json','duplicate-audit.json','case-label-hashes.jsonl','adoption-log.jsonl']]}
 with tempfile.TemporaryDirectory(prefix='synbench-reproduce-') as t:
  dest=Path(t)/'synthetic-benchmark-v1';shutil.copytree(ROOT,dest,ignore=shutil.ignore_patterns('__pycache__'))
  # Legacy Test text is used only by the lexical scanner, not by authors or judges.
  legacy=ROOT.parent/'positive-expansion/data';out=dest.parent/'positive-expansion/data';out.mkdir(parents=True)
  for n in ['positive-test.json','primary-positive-test.json']:
   if (legacy/n).exists():shutil.copyfile(legacy/n,out/n)
  for script in ['package.py','audit.py']:
   r=subprocess.run([sys.executable,str(dest/'scripts'/script)],capture_output=True,text=True)
   if r.returncode:raise RuntimeError(script+' failed: '+r.stdout+'\n'+r.stderr)
  mismatch=[str(rel) for rel,h in before.items() if hashlib.sha256((dest/rel).read_bytes()).hexdigest()!=h]
  if mismatch:raise ValueError('Reproduction differs: '+str(mismatch))
  print('Byte-identical package/audit verified:',len(before),'artifacts. Authored conversations and silver labels are fixed inputs; GPT outputs are not re-generated.')
if __name__=='__main__':main()
