#!/usr/bin/env python3
"""Rebuild frozen authored evaluation packaging in a temporary copy, not a new model run."""
import hashlib,shutil,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='jev-positive-reproduction-') as t:
 dest=Path(t)/'jev-tuning';shutil.copytree(ROOT.parent,dest,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
 expansion=dest/'positive-expansion'
 r=subprocess.run([sys.executable,str(expansion/'scripts/package_positive.py')],capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stdout+'\n'+r.stderr)
 paths=[Path('positive-audit.json'),Path('research-ledger.jsonl'),Path('research-index.md')]
 paths += [f.relative_to(ROOT) for f in sorted((ROOT/'data').glob('*positive-*'))]
 paths += [Path('data/authored-v2.jsonl'),Path('data/blind-authored-v2.jsonl')]
 bad=[str(p) for p in paths if sha(ROOT/p)!=sha(expansion/p)]
 if bad:raise AssertionError('Non-reproducible files: '+', '.join(bad))
 print('Byte-identical positive package reproduction:',len(paths),'files; no model/API calls.')
