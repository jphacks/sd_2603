"""Compare frozen blind GPT labels to a pinned PR35 author-label snapshot; no API."""
import argparse, collections, hashlib, json, subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parents[2] / 'docs/jev-tuning/pr35-text'
ROOT = Path(__file__).resolve().parents[2]
CLASSES = ['INTERVENE_DRIFT', 'INTERVENE_STALLED', 'OK']
MAP = {'on_track': 'OK', 'productive_tangent': 'OK', 'drift': 'INTERVENE_DRIFT', 'stalled': 'INTERVENE_STALLED'}

def read(p):
    return json.loads(p.read_text())

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--ref', default='89511efa21568b57f2ac86a8b0e1c019ee830281')
    args = ap.parse_args()
    commit = subprocess.check_output(['git', 'rev-parse', args.ref], cwd=ROOT, text=True).strip()
    out = BASE / 'branch-label-comparison' / commit[:7]
    out.mkdir(parents=True, exist_ok=True)
    for file in ['labels.json', 'EVAL_DATA_GUIDE.md']:
        payload = subprocess.check_output(['git', 'show', f'{commit}:evals/fixtures/meeting/{file}'], cwd=ROOT)
        (out / file).write_bytes(payload)
    author = read(out / 'labels.json')
    freeze = read(BASE / 'label-freeze.json')
    for name, expected in freeze['sha256'].items():
        assert hashlib.sha256((BASE / name).read_bytes()).hexdigest() == expected, name
    manifest = read(BASE / 'source-manifest.json')
    for name, meta in manifest['datasets'].items():
        payload = subprocess.check_output(['git', 'show', f'{commit}:evals/fixtures/meeting/datasets/{name}.json'], cwd=ROOT)
        assert hashlib.sha256(payload).hexdigest() == meta['sha256'], f'Text/metadata changed: {name}; re-label changed inputs before comparing'
    labels = {c['id']: c for c in read(BASE / 'primary-labels.json')}
    refs = {(c['sourceDataset'], c['sourceId']): labels[c['id']] for c in read(BASE / 'source-map.json')}
    def key(c):
        return (Path(c['dataset']).stem, c['id'])
    assert len(author) == 115 and len({key(c) for c in author}) == 115
    assert all(key(c) in refs and (c['label'] in MAP or c['label'] == 'ambiguous') for c in author)
    definite = [c for c in author if c['label'] in MAP]
    ambiguous = [c for c in author if c['label'] == 'ambiguous']
    known = [c for c in author if c['expectedIntervention'] is not None]
    def measure(get):
        rows = [{'dataset': key(c)[0], 'sourceId': c['id'], 'branchLabel': c['label'], 'branchStatus': MAP[c['label']], 'comparedStatus': get(key(c)), 'independentUncertain': refs[key(c)]['uncertain']} for c in definite]
        matrix = {x: {y: 0 for y in CLASSES} for x in CLASSES}
        for r in rows:
            matrix[r['branchStatus']][r['comparedStatus']] += 1
        intervention = [{'dataset': key(c)[0], 'sourceId': c['id'], 'branchExpected': c['expectedIntervention'], 'comparedIntervention': get(key(c)) != 'OK', 'humanAgreement': c.get('humanAgreement'), 'basis': c['interventionExpectationBasis']} for c in known]
        def tally(rs, compare):
            return {'correct': sum(compare(r) for r in rs), 'n': len(rs), 'agreement': sum(compare(r) for r in rs) / len(rs) if rs else None}
        state_ok = lambda r: r['branchStatus'] == r['comparedStatus']
        intervention_ok = lambda r: r['branchExpected'] == r['comparedIntervention']
        return {'state': tally(rows, state_ok), 'byDataset': {d: tally([r for r in rows if r['dataset'] == d], state_ok) for d in ['derail', 'derail-hard', 'derail-multi']}, 'stateMatrix': matrix, 'stateDisagreements': [r for r in rows if not state_ok(r)], 'intervention': tally(intervention, intervention_ok), 'interventionByDeclaredAgreement': {a: tally([r for r in intervention if (r['humanAgreement'] or 'unspecified') == a], intervention_ok) for a in ['clear', 'split', 'unspecified']}, 'interventionDisagreements': [r for r in intervention if not intervention_ok(r)]}
    compared = {'independent-labels': measure(lambda k: refs[k]['status'])}
    for p in read(ROOT / 'evals/tuning/runs/pr35-text/report.json')['policies']:
        predicted = {(r['sourceDataset'], r['sourceId']): r['actual'] for r in p['rows']}
        compared[p['policy']['name']] = measure(lambda k: predicted[k])
    result = {'pr': 'https://github.com/jphacks/sd_2603/pull/35', 'branchCommit': commit, 'priorTextCommit': manifest['commit'], 'allFourDatasetsByteIdentical': True, 'branchLabelsSHA256': hashlib.sha256((out / 'labels.json').read_bytes()).hexdigest(), 'frozenPrimaryLabelsSHA256': freeze['sha256']['primary-labels.json'], 'mapping': MAP, 'branchRows': len(author), 'stateComparable': len(definite), 'stateAmbiguousExcluded': len(ambiguous), 'canvasExcludedDifferentTask': 54, 'interventionComparable': len(known), 'interventionUnspecified': len(author) - len(known), 'newGatewayCalls': 0, 'noRelabelingOrRetuning': True, 'comparisons': compared}
    (out / 'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    pct = lambda x: f"{x['correct']}/{x['n']} ({100*x['agreement']:.2f}%)"
    md = f'''# PR35ブランチの参照ラベルとの比較

- 取得コミット: `{commit}`
- 比較相手: 前回固定した独立GPTラベル（commit9259e22）。再ラベル付けなし。
- 4データセットのバイト列は前回と完全一致。新規Gateway0回。
- `on_track` / `productive_tangent` → OK、`drift` → INTERVENE_DRIFT、`stalled` → INTERVENE_STALLEDへ対応。5分類をそのまま比較した値ではない。
- PR規則に従いCanvas54件（図表提示の別タスク）とambiguous23件を状態分類から除き、92件を比較。前回の169件分母と混ぜない。

| 比較対象 | 状態3分類一致 | 介入期待値一致 |
| --- | ---: | ---: |
'''
    for name, m in compared.items():
        md += f"| {name} | {pct(m['state'])} | {pct(m['intervention'])} |\n"
    md += '\n主たるラベル間比較はindependent-labels行。v3/v4行は保存済み予測を新しいPR参照へ再集計した補助値で、再実測や新たな設定選択ではない。\n\n## 独立ラベルとの状態比較\n\n| Dataset | 一致 |\n| --- | ---: |\n'
    for name, m in compared['independent-labels']['byDataset'].items():
        md += f'| {name} | {pct(m)} |\n'
    md += '\n### 不一致\n\n'
    for row in compared['independent-labels']['stateDisagreements']:
        l = refs[(row['dataset'], row['sourceId'])]
        md += f"- `{row['dataset']}/{row['sourceId']}`: PR={row['branchLabel']}（{row['branchStatus']}）、独立ラベル={row['comparedStatus']}。独立側uncertain={l['uncertain']}、代替={l['alternativeStatus']}。固定済み理由：{l['reason']}\n"
    md += '\n## 介入の一致は状態の一致と別\n\nexpectedInterventionが指定された100件で比較し、nullの15件は別扱い。expectedNudgeを優先するPRの規則をそのまま使用。状態がon_trackでも介入を期待する指定があり、stateの一致率と分母も意味も異なる。\n\n| 原本humanAgreement注釈 | 独立ラベルから導く介入との一致 |\n| --- | ---: |\n'
    for name, m in compared['independent-labels']['interventionByDeclaredAgreement'].items():
        md += f'| {name} | {pct(m)} |\n'
    md += '\n介入側の不一致はcomparison.jsonへ全件保存。独立ラベルは介入期待値を別判定していないため、OK以外を介入とする写像での一致である。humanAgreementはPR作者の見込み注釈で実測の人間一致率ではない。PRラベルと独立GPTラベルの一致は、真の正解や実会議での精度の証明ではない。ambiguousを除くのは今回PRの比較規約であり、前回169件評価の分母や結果は変更しない。\n\n再現: `python3 evals/tuning/compare-pr35-labels.py --ref=' + commit + '`\n'
    (out / 'REPORT.md').write_text(md)
    print(json.dumps({name: {'state': m['state'], 'intervention': m['intervention']} for name, m in compared.items()}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
