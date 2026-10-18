import { casePrediction, evaluate, metrics, select, validateCases } from './core.mjs';

/** Five-fold group CV over training data only. No Gateway calls or external state. */
export function trainingCV(trainCases, scoresByVersion, versions, foldByGroup) {
  if (Array.isArray(trainCases) && trainCases.some(c => c.split !== 'train')) throw new Error('Training CV accepts train cases only; validation/test prohibited');
  validateCases(trainCases);
  if (!(foldByGroup instanceof Map)) throw new Error('foldByGroup must be the approved group-to-fold Map');
  if (!Array.isArray(versions) || versions.length < 2 || new Set(versions).size !== versions.length || versions.some(v => !['v1','v2','v3','v4'].includes(v))) throw new Error('Provide at least two unique approved prompt versions');
  const foldOf = c => foldByGroup.get(c.sourceGroup);
  for (const c of trainCases) {
    const fold = foldOf(c);
    if (!Number.isInteger(fold) || fold < 0 || fold > 4) throw new Error(`Missing/invalid training fold: ${c.sourceGroup}`);
    if (c.fold !== undefined && c.fold !== fold) throw new Error(`Case/group fold mismatch: ${c.id}`);
  }
  if (new Set(trainCases.map(foldOf)).size !== 5) throw new Error('All five outer folds must contain training groups');
  for (const version of versions) if (!scoresByVersion?.[version]) throw new Error(`Missing score version: ${version}`);
  // Benchmark selection is semantic. Action labels, if present, cannot silently
  // change the optimization target in core.select().
  const fit = (cases, version) => select(cases.map(c => ({ ...c, split:'validation', gold:{status:c.gold.status} })), scoresByVersion, [version]).policy;
  const outOfFold = Object.fromEntries(versions.map(v => [v, []]));
  const folds = Array.from({length:5}, (_, fold) => {
    const holdout = trainCases.filter(c => foldOf(c) === fold);
    const inner = trainCases.filter(c => foldOf(c) !== fold);
    const byVersion = versions.map(version => {
      const policy = fit(inner, version);
      for (const c of holdout) {
        const row = scoresByVersion[version][c.id];
        outOfFold[version].push({gold:c.gold.status,actual:casePrediction(c,row?.scores ?? row,policy).status});
      }
      return {version,policy,metrics:evaluate(holdout,scoresByVersion[version],policy)};
    });
    return {fold,n:holdout.length,holdoutGroups:[...new Set(holdout.map(c=>c.sourceGroup))],fitGroups:[...new Set(inner.map(c=>c.sourceGroup))],byVersion};
  });
  const rankedVersions = versions.map(version => ({version,metrics:metrics(outOfFold[version]),policy:fit(trainCases,version)}))
    .sort((a,b)=>b.metrics.macroF1-a.metrics.macroF1||b.metrics.accuracy-a.metrics.accuracy||versions.indexOf(a.version)-versions.indexOf(b.version));
  return {folds,rankedVersions,finalists:rankedVersions.slice(0,2).map(row=>({policy:row.policy,cvMetrics:row.metrics})),criterion:'training-only grouped fivefold semantic Macro-F1'};
}
