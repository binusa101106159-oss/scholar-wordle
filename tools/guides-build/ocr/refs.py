"""OCR reference-list pages (mostly English) into '> N. ...' lines.

Usage: python3 refs.py c088 5 6   (0-based page indices of the guide's scan)
Prints lines to paste after the references heading; check against the scan.
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / 'guides'
gid, idx = sys.argv[1], [int(x) for x in sys.argv[2:]]
doc = json.loads((ROOT / 'text' / f'{gid}.json').read_text(encoding='utf-8'))
pages = doc.get('pages') or doc['blocks']
text = ''
for i in idx:
    src = ROOT / 'attach' / 'img' / pages[i]['img'][0]['src']
    out = subprocess.run(['tesseract', str(src), '-', '-l', 'eng+chi_tra', '--psm', '6'],
                         capture_output=True, text=True).stdout
    lines = [l for l in out.splitlines() if l.strip() and not re.fullmatch(r'[\s\-—_]*\d{2,4}[\s\-—_]*', l.strip())]
    text += '\n'.join(lines) + '\n'
items, cur = [], ''
for line in text.splitlines():
    line = line.strip()
    m = re.match(r'^(\d{1,3})\s*[.、．]\s*(.*)', line)
    if m:
        if cur: items.append(cur)
        cur = f'{m.group(1)}. {m.group(2)}'
    elif cur:
        cur += ('' if cur.endswith('-') else ' ') + line
    else:
        cur = line
if cur: items.append(cur)
for it in items:
    it = re.sub(r'(?<=[一-鿿])\s+(?=[一-鿿])', '', it)
    print('> ' + it)
