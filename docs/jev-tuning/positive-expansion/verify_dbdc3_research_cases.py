#!/usr/bin/env python3
"""Verify source selection, votes, and verbatim extents. No model calls."""
import argparse
import collections
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

URL = 'https://dbd-challenge.github.io/dbdc3/data/DBDC3.zip'
SHA256 = '736229795dc3732f8e6bb421f094dc820ef944fef9d9d320d4110ef992b60e85'
p = argparse.ArgumentParser()
p.add_argument('--archive', type=Path, help='Local DBDC3.zip; omitted means download the MIT main archive')
a = p.parse_args()
blob = a.archive.read_bytes() if a.archive else urllib.request.urlopen(URL).read()
assert hashlib.sha256(blob).hexdigest() == SHA256, 'Archive changed; review before updating pin'
z = zipfile.ZipFile(io.BytesIO(blob))
rows = [json.loads(line) for line in Path(__file__).with_name('research-dbdc3-real-breakdown-cases.jsonl').read_text().splitlines()]
expected = {}
for member in sorted(z.namelist()):
    if not (member.startswith('DBDC3/dbdc3_revised/ja/') and member.endswith('.json')):
        continue
    d = json.loads(z.read(member))
    hits = []
    for i, t in enumerate(d['turns']):
        votes = collections.Counter(x['breakdown'] for x in t.get('annotations', []))
        n = sum(votes.values())
        if t['speaker'] == 'S' and t['turn-index'] != 0 and n and votes['X'] / n >= 2/3:
            hits.append((votes['X'] / n, i, t, votes))
    if hits:
        expected[member] = max(hits, key=lambda h: (h[0], -h[1]))
assert len(rows) == len(expected) == 125
assert len({r['dialogue_id'] for r in rows}) == 125
assert len({r['archive_member'] for r in rows}) == 125
for r in rows:
    raw = z.read(r['archive_member'])
    d = json.loads(raw)
    ratio, i, t, votes = expected[r['archive_member']]
    excerpt = [{'turn_index': x['turn-index'], 'speaker': x['speaker'], 'text': x['utterance']} for x in d['turns'][max(0, i-6):i+1]]
    assert r['member_sha256'] == hashlib.sha256(raw).hexdigest()
    assert r['turns'] == excerpt
    assert r['label_votes'] == dict(votes)
    assert r['n_annotators'] == sum(votes.values()) == 30
    assert r['source_breakdown_ratio'] == ratio
    assert r['source_extent']['target_turn_index'] == t['turn-index']
    assert r['jev_gold_label'] is None
    assert r['eligible_for_primary_meeting_validation_test'] is False
print(json.dumps({'verified_cases': len(rows), 'unique_dialogues': len({r['dialogue_id'] for r in rows}), 'families': dict(collections.Counter(r['system_family'] for r in rows)), 'archive_sha256': SHA256}, ensure_ascii=False))
