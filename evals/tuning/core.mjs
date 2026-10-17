import { createHash } from 'node:crypto';

export const classes = ['INTERVENE_DRIFT', 'INTERVENE_STALLED', 'OK'];
export const baseline = Object.freeze({ questionVersion: 'v1', driftThreshold: .6, stallThreshold: .6, relevanceThreshold: .6, uncertainThreshold: .4 });
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validScores = s => s && ['drifted', 'stalled', 'tangentIsRelevant'].every(k => Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1);

export function classify(scores, policy = baseline) {
  if (!validScores(scores)) return null;
  if (scores.stalled >= policy.stallThreshold) return 'INTERVENE_STALLED';
  if (scores.drifted >= policy.driftThreshold && scores.tangentIsRelevant < policy.relevanceThreshold) return 'INTERVENE_DRIFT';
  return 'OK';
}

export function action(scores, policy = baseline) {
  const status = classify(scores, policy);
  if (status === null) return null;
  if (status !== 'OK') return 'INTERVENE';
  return scores.drifted >= policy.uncertainThreshold || scores.stalled >= policy.uncertainThreshold ? 'WAIT' : 'SILENCE';
}

function calculate(rows, labels) {
  const matrix = Object.fromEntries(labels.map(c => [c, Object.fromEntries(labels.map(d => [d, 0]))]));
  for (const row of rows) {
    if (!labels.includes(row.gold)) throw new Error(`Invalid gold label: ${row.gold}`);
    if (labels.includes(row.actual)) matrix[row.gold][row.actual]++;
  }
  const perClass = Object.fromEntries(labels.map(c => {
    const tp = matrix[c][c], support = rows.filter(r => r.gold === c).length;
    const predicted = rows.filter(r => r.actual === c).length;
    const precision = predicted ? tp / predicted : 0, recall = support ? tp / support : 0;
    return [c, { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, support, predicted }];
  }));
  const n = rows.length, correct = rows.filter(r => r.gold === r.actual).length;
  const accuracy = n ? correct / n : 0, z = 1.96;
  const denominator = 1 + z * z / (n || 1);
  const center = (accuracy + z * z / (2 * (n || 1))) / denominator;
  const half = z * Math.sqrt(accuracy * (1 - accuracy) / (n || 1) + z * z / (4 * (n || 1) ** 2)) / denominator;
  return { n, correct, errors: rows.filter(r => !labels.includes(r.actual)).length, accuracy,
    macroF1: labels.reduce((sum, c) => sum + perClass[c].f1, 0) / labels.length,
    majorityBaseline: n ? Math.max(...labels.map(c => perClass[c].support)) / n : 0,
    wilson95: n ? [Math.max(0, center - half), Math.min(1, center + half)] : null,
    perClass, matrix };
}

export function metrics(rows) {
  const ok = rows.filter(r => r.gold === 'OK');
  return { ...calculate(rows, classes), falseInterventionRate: ok.length
    ? ok.filter(r => ['INTERVENE_DRIFT', 'INTERVENE_STALLED'].includes(r.actual)).length / ok.length : null };
}

export function actionMetrics(rows) { return calculate(rows, ['SILENCE', 'WAIT', 'INTERVENE']); }

// Runtime gates run before model scores, including failed or missing scores.
export function casePrediction(c, scores, policy = baseline) {
  if ((c.secondsSinceLastIntervention ?? 120) < 60) return { status: 'OK', action: 'SILENCE' };
  if (c.transcript.length < 3) return { status: 'OK', action: 'WAIT' };
  return { status: classify(scores, policy), action: action(scores, policy) };
}

export function candidates(version = 'v1') {
  const result = [];
  for (const driftThreshold of [.4, .5, .6, .7, .8, .9])
    for (const stallThreshold of [.4, .5, .6, .7, .8, .9])
      for (const relevanceThreshold of [.4, .5, .6, .7, .8, .9])
        result.push({ ...baseline, questionVersion: version, driftThreshold, stallThreshold, relevanceThreshold });
  return result;
}

export function evaluate(cases, scores = {}, policy = baseline) {
  const prediction = c => casePrediction(c, scores[c.id]?.scores ?? scores[c.id], policy);
  const result = metrics(cases.map(c => ({ gold: c.gold.status, actual: prediction(c).status })));
  const labeled = cases.filter(c => c.gold.action !== undefined);
  return { ...result, exactActionMetrics: labeled.length ? actionMetrics(labeled.map(c => ({ gold: c.gold.action, actual: prediction(c).action }))) : null,
    actionLabelCoverage: cases.length ? labeled.length / cases.length : 0 };
}

const distance = p => Math.abs(p.driftThreshold - baseline.driftThreshold) + Math.abs(p.stallThreshold - baseline.stallThreshold) + Math.abs(p.relevanceThreshold - baseline.relevanceThreshold);

export function select(cases, scores, versions = ['v1', 'v2', 'v3']) {
  const validation = cases.filter(c => c.split === 'validation');
  if (!validation.length) throw new Error('Selection requires validation cases');
  if (!versions.length) throw new Error('Selection requires prompt versions');
  const selectionCriterion = validation.every(c => c.gold.action !== undefined) ? 'exact-action' : 'semantic-status';
  const primary = item => selectionCriterion === 'exact-action' ? item.metrics.exactActionMetrics : item.metrics;
  return versions.flatMap(version => candidates(version).map(policy => ({ policy, metrics: evaluate(validation, scores[version], policy), selectionCriterion })))
    .sort((a, b) => primary(b).macroF1 - primary(a).macroF1 || primary(b).accuracy - primary(a).accuracy || distance(a.policy) - distance(b.policy) || versions.indexOf(a.policy.questionVersion) - versions.indexOf(b.policy.questionVersion))[0];
}

const normalize = text => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
export function validateCases(cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Dataset must contain cases');
  const ids = new Set(), texts = new Set(), groups = new Map();
  for (const c of cases) {
    if (typeof c.id !== 'string' || !c.id.trim() || ids.has(c.id) || typeof c.agenda !== 'string' || !c.agenda.trim() ||
        !Array.isArray(c.transcript) || c.transcript.length < 1 || !c.transcript.every(t => typeof t === 'string' && t.trim()) ||
        !['train', 'validation', 'test'].includes(c.split) || typeof c.sourceGroup !== 'string' || !c.sourceGroup.trim() || !classes.includes(c.gold?.status))
      throw new Error(`Invalid/duplicate case: ${c.id}`);
    if (c.gold.action !== undefined && !['SILENCE', 'WAIT', 'INTERVENE'].includes(c.gold.action)) throw new Error(`Invalid gold action: ${c.id}`);
    if (c.secondsSinceLastIntervention !== undefined && (!Number.isFinite(c.secondsSinceLastIntervention) || c.secondsSinceLastIntervention < 0)) throw new Error(`Invalid cooldown: ${c.id}`);
    ids.add(c.id);
    const fingerprint = hash(normalize(c.transcript.join('')));
    if (texts.has(fingerprint)) throw new Error(`Duplicate transcript: ${c.id}`);
    texts.add(fingerprint);
    if (groups.has(c.sourceGroup) && groups.get(c.sourceGroup) !== c.split) throw new Error(`Source group leakage: ${c.sourceGroup}`);
    groups.set(c.sourceGroup, c.split);
  }
  return true;
}
