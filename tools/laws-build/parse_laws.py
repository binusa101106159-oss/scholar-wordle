"""Parse MOJ law-database PDF exports into structured JSON, word for word.

Output per law: {id, name, tier, title, date, status, notes, items}
items: {"t":"ch","text":"第 一 章 總則"} | {"t":"art","no":"2","paras":[{"n":1|null,"lines":[{"lv":0..4,"text":...}]}]}
"""
import json, re, subprocess, sys, os
from catalog import LAWS, SRC, source_dir
from boxtables import box_tables, BOX
from formulas import find_formulas, norm

ART = re.compile(r'^第\s*(\d+(?:-\d+)?)\s*條$')
CH = re.compile(r'^第\s+[一二三四五六七八九十百零〇]+\s+[編章節款目]\s+\S')
PARA = re.compile(r'^(\d+)\s(?=\S)')
LEVELS = [
    (1, re.compile(r'^[一二三四五六七八九十百]+、')),
    (2, re.compile(r'^（[一二三四五六七八九十百]+）')),
    (3, re.compile(r'^\d+\.(?!\d)')),
    (4, re.compile(r'^[（(]\d+[）)]')),
]
HEAD = re.compile(r'^(法規名稱|修正日期|發布日期|公布日期|公發布日|生效狀態)：(.*)$')


def raw_text(path):
    out = subprocess.run(['pdftotext', '-raw', path, '-'], capture_output=True, text=True, check=True).stdout
    return [l.rstrip() for l in out.replace('\f', '\n').split('\n')]


def join(a, b):
    if a and b and re.match(r'[A-Za-z0-9]', a[-1]) and re.match(r'[A-Za-z0-9]', b[0]):
        return a + ' ' + b
    return a + b


def parse(law_id, tier, name, stem):
    lines = [l for l in raw_text(os.path.join(source_dir(law_id), stem + '.pdf')) if l.strip()]
    law = {"id": law_id, "name": name, "tier": tier, "title": "", "dateLabel": "", "date": "", "status": "", "notes": [], "items": []}
    i = 0
    # header
    while i < len(lines):
        m = HEAD.match(lines[i])
        if m:
            k, v = m.groups()
            if k == '法規名稱': law['title'] = v
            elif k == '生效狀態': law['status'] = v
            else: law['dateLabel'], law['date'] = k, v
            i += 1; continue
        if ART.match(lines[i]) or CH.match(lines[i]):
            break
        # free note lines (effective-date remarks): join into one paragraph
        if law['notes'] and not lines[i].startswith(('※',)):
            law['notes'][-1] = join(law['notes'][-1], lines[i])
        else:
            law['notes'].append(lines[i])
        i += 1
    art = None
    boxes = None
    inbox = False
    formulas = find_formulas(os.path.join(SRC, stem + '.pdf')) if any(re.search('─{4,}', l) and not re.search('[│┌└├]', l) for l in lines) else []
    fpending = None
    for line in lines[i:]:
        s = line.strip()
        if fpending is not None:
            if norm(s) in fpending['left']:
                fpending['left'].remove(norm(s)); continue
            fpending = None
        if formulas and norm(s) in formulas[0]['lines']:
            fm = formulas.pop(0)
            left = list(fm['lines']); left.remove(norm(s))
            fpending = dict(left=left)
            if not art['paras']: art['paras'].append({"n": None, "lines": []})
            para = art['paras'][-1]
            lv = para['lines'][-1]['lv'] if para['lines'] else 0
            para['lines'].append({"lv": lv, "formula": fm['rows']})
            continue
        if inbox:
            if s.startswith('└'): inbox = False
            continue
        if s.startswith('┌'):
            if boxes is None: boxes = box_tables(os.path.join(SRC, stem + '.pdf'))
            if not boxes: raise ValueError(f'{name}: more box tables in text than found geometrically')
            tbl = boxes.pop(0)
            if not art['paras']: art['paras'].append({"n": None, "lines": []})
            para = art['paras'][-1]
            lv = para['lines'][-1]['lv'] if para['lines'] else 0
            para['lines'].append({"lv": lv, "table": tbl})
            inbox = not s.startswith('└') and not s.endswith('┘')
            continue
        if ART.match(s):
            art = {"t": "art", "no": ART.match(s).group(1), "paras": []}
            law['items'].append(art); continue
        if CH.match(s) and (art is None or art['paras']):
            law['items'].append({"t": "ch", "text": re.sub(r'\s+', ' ', s)}); art = None; continue
        if art is None:
            raise ValueError(f'{name}: text outside article: {s}')
        pm = PARA.match(s)
        expected = len(art['paras']) + 1
        if pm and int(pm.group(1)) == expected and (expected > 1 or True):
            # numbered paragraph (項); the first paragraph may be unnumbered in single-paragraph articles
            art['paras'].append({"n": expected, "lines": []})
            s = s[pm.end():]
            art['paras'][-1]['lines'].append({"lv": 0, "text": s})
            continue
        if not art['paras']:
            art['paras'].append({"n": None, "lines": []})
        para = art['paras'][-1]
        lv = next((lv for lv, rx in LEVELS if rx.match(s)), None)
        notice = s.startswith('（因條文排版')
        last = para['lines'][-1] if para['lines'] else None
        if notice or lv is not None or not last or 'table' in last or 'formula' in last or last.get('notice'):
            if notice:
                para['lines'].append({"lv": 0, "text": s, "notice": True}); continue
            para['lines'].append({"lv": lv or 0, "text": s})
        else:
            para['lines'][-1]['text'] = join(para['lines'][-1]['text'], s)
    # A single numbered paragraph is never printed with a number; drop numbering if only "1" with no 2.
    for it in law['items']:
        if it['t'] == 'art' and len(it['paras']) == 1:
            it['paras'][0]['n'] = None
    return law


def flat(law):
    """All visible text, for QC."""
    parts = [law['title'], law['dateLabel'] + '：' + law['date'] if law['date'] else '', law['status']] + law['notes']
    for it in law['items']:
        if it['t'] == 'ch': parts.append(it['text'])
        else:
            parts.append(f"第{it['no']}條")
            for p in it['paras']:
                if p['n']: parts.append(str(p['n']))
                for l in p['lines']:
                    if 'table' in l: parts += [c['text'] for r in l['table']['rows'] for c in r]
                    elif 'formula' in l: parts += [t if isinstance(t, str) else t['num'] + t['den'] for r in l['formula'] for t in r]
                    else: parts.append(l['text'])
    return ''.join(parts)


if __name__ == '__main__':
    outdir = sys.argv[1]
    only = set(sys.argv[2:])
    os.makedirs(outdir, exist_ok=True)
    for law_id, tier, name, stem in LAWS:
        if only and tier not in only and law_id not in only: continue
        law = parse(law_id, tier, name, stem)
        # QC: every non-space character of the PDF text must appear, in order, in our data
        src = re.sub(r'\s+', '', ''.join(raw_text(os.path.join(source_dir(law_id), stem + '.pdf'))))
        src = ''.join(ch for ch in src if ch not in BOX)
        ntab = sum(1 for it in law['items'] if it['t'] == 'art' for p in it['paras'] for l in p['lines'] if 'table' in l or 'formula' in l)

        src = src.replace('法規名稱：', '').replace('生效狀態：', '')
        ours = re.sub(r'\s+', '', flat(law))
        ours = ours.replace('修正日期：', '修正日期：', 1)
        ok = src == ours
        if not ok and ntab:
            # table cells are read cell by cell, the PDF line by line: compare as character multisets
            import collections
            ok = collections.Counter(src) == collections.Counter(ours)
        if not ok:
            # find first divergence
            k = next((k for k, (a, b) in enumerate(zip(src, ours)) if a != b), min(len(src), len(ours)))
            print(f'MISMATCH {name} at {k}: src={src[k-20:k+30]!r} ours={ours[k-20:k+30]!r}')
        arts = sum(1 for it in law['items'] if it['t'] == 'art')
        print(f'{law_id} {name}: {arts} articles, {ntab} inline tables, {len(src)} chars, {"OK" if ok else "FAIL"}')
        with open(os.path.join(outdir, law_id + '.json'), 'w', encoding='utf-8') as f:
            json.dump(law, f, ensure_ascii=False, separators=(',', ':'))
