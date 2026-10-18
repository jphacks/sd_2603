#!/usr/bin/env python3
"""Audit synthetic case integrity, frozen splits/folds and lexical neighbors. No model calls."""
import argparse,collections,difflib,hashlib,json,re
from pathlib import Path
from package import ROOT,canonical,sha,write

def norm(c):return re.sub(r'[\W_0-9０-９A-Za-z]+','', ''.join(c['transcript']))
def grams(s,n=4):return {s[i:i+n] for i in range(max(0,len(s)-n+1))}
def main():
 p=argparse.ArgumentParser();p.add_argument('--expect',type=int);a=p.parse_args();cases=json.loads((ROOT/'cases.json').read_text());spec=json.loads((ROOT/'generation-spec.json').read_text());assign={r['id']:r for r in json.loads((ROOT/'split-manifest.json').read_text())['caseAssignments']};expected=json.loads((ROOT/'spec-hashes.json').read_text())
 for f,h in expected.items():assert hashlib.sha256((ROOT/f).read_bytes()).hexdigest()==h,'frozen spec changed '+f
 if a.expect is not None:assert len(cases)==a.expect
 ids=[r['id'] for r in cases];assert len(ids)==len(set(ids));group=collections.defaultdict(set);fold=collections.defaultdict(set)
 for c in cases:
  x=assign[c['id']];assert c['sourceGroup']==x['sourceGroup'] and c['split']==x['split'] and c['cvFold']==x['fold'];group[c['sourceGroup']].add(c['split']);fold[c['sourceGroup']].add(c['cvFold']);assert c['dataKind']=='synthetic';assert c['annotation']['humanReviewed'] is False;assert c['generation']['author']!=c['annotation']['annotator'];assert 'action' not in c['gold'];assert 6<=len(c['transcript'])<=12
 assert all(len(s)==1 for s in group.values()) and all(len(s)==1 for s in fold.values());norms=[norm(c) for c in cases];gs=[grams(s) for s in norms];pairs=[];bad=[];exact=[]
 for i,c in enumerate(cases):
  for j in range(i):
   q=cases[j];union=gs[i]|gs[j];jac=len(gs[i]&gs[j])/max(1,len(union));ratio=None
   if norms[i]==norms[j]:exact.append([c['id'],q['id']])
   if jac>=.30:ratio=difflib.SequenceMatcher(None,norms[i],norms[j],autojunk=False).ratio()
   if norms[i]==norms[j] or jac>=.55 or ratio is not None and ratio>=.80:
    rec={'a':q['id'],'b':c['id'],'char4Jaccard':round(jac,4),'sequenceRatio':round(ratio,4) if ratio is not None else None,'sameGroup':q['sourceGroup']==c['sourceGroup'],'sameSplit':q['split']==c['split']};pairs.append(rec)
    if not rec['sameGroup']:bad.append(rec)
 assert not exact,'exact normalized transcript duplicates '+str(exact[:3]);assert not bad,'near duplicates cross fixed families '+str(bad[:3])
 # Existing Test text is used only by this lexical scanner, never given to authors as generation input.
 legacy=[];old=ROOT.parent/'positive-expansion/data'
 for name in ['primary-positive-test.json','positive-test.json']:
  f=old/name
  if f.exists():
   z=json.loads(f.read_text());z=z if isinstance(z,list) else z.get('cases',[]);legacy.extend(c for c in z if 'transcript' in c)
 legacy={c.get('id',sha(c)):c for c in legacy};legacy=list(legacy.values());legacy_norm={norm(c) for c in legacy};assert all(s not in legacy_norm for s in norms),'exact reused old Test text'
 legacy_near=[]
 for c,text,ng in zip(cases,norms,gs):
  for oldcase in legacy:
   oldtext=norm(oldcase);og=grams(oldtext);jac=len(ng&og)/max(1,len(ng|og))
   if jac>=.30:
    ratio=difflib.SequenceMatcher(None,text,oldtext,autojunk=False).ratio()
    if jac>=.55 or ratio>=.80:legacy_near.append({'newId':c['id'],'oldId':oldcase.get('id'),'split':c['split'],'char4Jaccard':round(jac,4),'sequenceRatio':round(ratio,4)})
 assert not legacy_near,'near reuse of legacy Test requires investigation '+str(legacy_near[:3])
 design=collections.Counter()
 for f in spec['families']:
  for s in f['designSlots']:design[s['designIntent']]+=1
 report={'state':'complete_core500' if len(cases)==500 else 'incomplete','cases':len(cases),'independentScenarioGroups':len(group),'splitCounts':dict(collections.Counter(c['split'] for c in cases)),'trainFoldCounts':dict(collections.Counter(c['cvFold'] for c in cases if c['split']=='train')),'plannedDesignCounts':dict(design),'sourceGroupSplitLeaks':0,'sourceGroupFoldLeaks':0,'exactNormalizedDuplicates':0,'nearPairsWithinGroup':pairs,'nearCrossGroupDuplicates':0,'legacyTestExactReuse':0,'legacyTestNearReuse':0,'legacyTestRecordsScanned':len(legacy),'nearThresholds':{'char4Jaccard':.55,'sequenceRatio':.80,'sequenceCandidateJaccard':.30},'limitations':['Lexical neighborhoods do not prove semantic/template independence; author instructions and manual sampling also matter.','This scan checks exact reuse against legacy Test; no legacy labels or Jev predictions are used.'],'casesHash':sha(cases),'specHashes':expected}
 write(ROOT/'duplicate-audit.json',report);print(json.dumps({k:v for k,v in report.items() if k!='nearPairsWithinGroup'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
