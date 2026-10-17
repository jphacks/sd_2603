import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const { jevJudge } = require('../lib/judge/jev.ts');
const cases = JSON.parse(readFileSync(fileURLToPath(new URL('./jev-cases.json', import.meta.url)), 'utf8'));
const actions = ['SILENCE', 'WAIT', 'INTERVENE'];
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : cases.length;
const live = process.argv.includes('--live');

if (!Number.isInteger(limit) || limit < 1 || limit > cases.length) {
  throw new Error(`--limit must be an integer between 1 and ${cases.length}`);
}
if (new Set(cases.map(item => item.id)).size !== cases.length) {
  throw new Error('Case IDs must be unique');
}
for (const item of cases) {
  if (!actions.includes(item.expectedAction) || !Array.isArray(item.transcript) || !item.agenda) {
    throw new Error(`Invalid case: ${item.id}`);
  }
}
if (!live) {
  console.log(`Validated ${cases.length} frozen cases. Add --live to call Jev (up to ${limit} cases).`);
  process.exit(0);
}
if (!process.env.AI_GATEWAY_API_KEY) {
  throw new Error('AI_GATEWAY_API_KEY is required for --live');
}

const rows = [];
for (const item of cases.slice(0, limit)) {
  try {
    const result = await jevJudge(item);
    rows.push({
      id: item.id,
      group: item.group,
      expected: item.expectedAction,
      actual: result.action,
      correct: result.action === item.expectedAction,
      drifted: result.diagnostic?.drifted ?? null,
      stalled: result.diagnostic?.stalled ?? null,
      tangentIsRelevant: result.diagnostic?.tangentIsRelevant ?? null,
      latencyMs: result.diagnostic?.latencyMs ?? null,
      model: result.diagnostic?.model ?? null,
      error: null,
    });
  } catch (error) {
    rows.push({ id: item.id, group: item.group, expected: item.expectedAction, actual: null,
      correct: false, error: error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error' });
  }
}

const completed = rows.filter(row => !row.error);
const matrix = Object.fromEntries(actions.map(expected => [expected,
  Object.fromEntries(actions.map(actual => [actual,
    completed.filter(row => row.expected === expected && row.actual === actual).length]))]));
const tp = completed.filter(row => row.expected === 'INTERVENE' && row.actual === 'INTERVENE').length;
const fp = completed.filter(row => row.expected !== 'INTERVENE' && row.actual === 'INTERVENE').length;
const fn = completed.filter(row => row.expected === 'INTERVENE' && row.actual !== 'INTERVENE').length;
const round = value => value === null ? null : Math.round(value * 1000) / 1000;
const ratio = (numerator, denominator) => denominator ? round(numerator / denominator) : null;
const sortedLatencies = completed.map(row => row.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
const quantile = percentile => sortedLatencies.length ? sortedLatencies[Math.ceil(percentile * sortedLatencies.length) - 1] : null;

console.log(JSON.stringify({
  sampleSize: cases.length,
  evaluated: rows.length,
  gatewayCalls: rows.filter(row => row.model || row.error).length,
  errors: rows.filter(row => row.error).length,
  exactActionAccuracy: ratio(completed.filter(row => row.correct).length, completed.length),
  interventionPrecision: ratio(tp, tp + fp),
  interventionRecall: ratio(tp, tp + fn),
  harmfulInterventions: fp,
  usefulDetourInterventions: completed.filter(row => row.group === 'useful_detour' && row.actual === 'INTERVENE').length,
  matrix,
  latencyMs: { median: quantile(0.5), p95: quantile(0.95) },
  rows,
}, null, 2));
if (rows.some(row => row.error)) process.exitCode = 1;
