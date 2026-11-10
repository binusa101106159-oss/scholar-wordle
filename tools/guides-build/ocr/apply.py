"""Turn a hand-checked transcription of a scanned guide into text blocks.

Usage: python3 apply.py c090 [c102 ...]

Transcription format (ocr/<id>.txt), one block per line:
  @cover text   line shown under the title (original title, author)
  # text        level-1 heading
  ## text       level-2 heading
  ### text      level-3 heading
  >> text       second-level list item
  > text        list item / indented paragraph
  anything else a body paragraph

The original page pictures stay in the guide as `pages`, so the reader can
switch between the text and the scan. Re-running is safe.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / 'guides'


def parse(src):
    cover, blocks = [], []
    for raw in src.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith('@cover '):
            cover.append(line[7:].strip())
        elif line.startswith('### '):
            blocks.append(dict(t='h', text=line[4:].strip(), lv=3))
        elif line.startswith('## '):
            blocks.append(dict(t='h', text=line[3:].strip(), lv=2))
        elif line.startswith('# '):
            blocks.append(dict(t='h', text=line[2:].strip(), lv=1))
        elif line.startswith('>> '):
            blocks.append(dict(t='p', text=line[3:].strip(), ind=4.0, hang=-1.5))
        elif line.startswith('> '):
            blocks.append(dict(t='p', text=line[2:].strip(), ind=2.0, hang=-1.5))
        else:
            blocks.append(dict(t='p', text=line, hang=2.0))
    return cover, blocks


def apply(gid):
    path = ROOT / 'text' / f'{gid}.json'
    doc = json.loads(path.read_text(encoding='utf-8'))
    pages = doc.get('pages') or [b for b in doc['blocks'] if b.get('scan')]
    if not pages:
        raise SystemExit(f'{gid}: no scan pages found')
    cover, blocks = parse(Path(__file__).with_name(f'{gid}.txt'))
    doc.pop('scan', None)
    doc.update(cover=cover, ocr=True, blocks=blocks, pages=pages)
    path.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    idx_path = ROOT / 'index.json'
    idx = json.loads(idx_path.read_text(encoding='utf-8'))
    for g in idx['guides']:
        if g['id'] == gid:
            g.pop('scan', None)
            g['ocr'] = True
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=0) + '\n', encoding='utf-8')
    print(f'{gid}: {len(blocks)} text blocks, {len(pages)} scan pages kept')


if __name__ == '__main__':
    for gid in sys.argv[1:]:
        apply(gid)
