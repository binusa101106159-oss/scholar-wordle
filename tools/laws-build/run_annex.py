import json, os, re, sys, subprocess, collections, glob
from annex import convert, visible_text, page_chars_text
from catalog import LAWS, SRC

NUM = '一二三四五六七八九十'
def label_of(stem, lawstem):
    rest = stem[len(lawstem):].strip()
    m = re.match(r'^((?:附)?表[一二三四五六七八九十]*)[\s：、]*(.*)$', rest)
    return (m.group(1), m.group(2).strip()) if m else (rest, '')

def annex_files(lawstem):
    out = []
    for f in sorted(os.listdir(SRC)):
        if f.upper().endswith('.PDF') and f.startswith(lawstem + ' ') and not f.lower().endswith('.pdf') or (f.endswith('.PDF') and f.startswith(lawstem + ' ')):
            out.append(f)
    return out

def order(label):
    t = label.replace('附表', '').replace('表', '')
    if not t: return 0
    v = 0
    if t == '十': return 10
    if t.startswith('十'): return 10 + NUM.index(t[1]) + 1
    if len(t) == 2 and t[1] == '十': return (NUM.index(t[0]) + 1) * 10
    return NUM.index(t[0]) + 1

def qc(path, annex):
    src = page_chars_text(path)
    a = collections.Counter(re.sub(r'[\s＿]', '', src))
    b = collections.Counter(re.sub(r'[\s＿]', '', visible_text(annex) + ''.join(annex['footers']) + ''.join(annex['dropped'])))
    return a - b, b - a

if __name__ == '__main__':
    outdir = sys.argv[1]; tiers = set(sys.argv[2:])
    os.makedirs(os.path.join(outdir, 'img'), exist_ok=True)
    index = {}
    for law_id, tier, name, stem in LAWS:
        if tiers and tier not in tiers: continue
        annexes = []
        for f in annex_files(stem):
            label, title = label_of(f[:-4], stem)
            if not label.startswith(('附表', '表')): continue
            aid = f'{law_id}-{order(label)}'
            path = os.path.join(SRC, f)
            data = convert(path, aid, os.path.join(outdir, 'img'), aid + '-')
            data.update(law=law_id, label=label, title=title)
            missing, extra = qc(path, data)
            status = 'OK' if not missing and not extra else f'missing={"".join(missing.elements())[:60]!r} extra={"".join(extra.elements())[:60]!r}'
            ntab = sum(1 for b in data['blocks'] if b['t'] == 'table')
            print(f'{aid} {label} {title[:20]}: {len(data["blocks"])} blocks, {ntab} tables, {status}')
            data.pop('footers'); data.pop('dropped')
            json.dump(data, open(os.path.join(outdir, aid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
            annexes.append(dict(id=aid, label=label, title=title))
        annexes.sort(key=lambda a: int(a['id'].split('-')[1]))
        index[law_id] = annexes
    json.dump(index, open(os.path.join(outdir, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
