"""Rebuild fractions drawn with ─ bars in law texts (e.g. TWA, noise dose) as structured formulas."""
import re
import pdfplumber
from annex import clean, join, CJK

JUNCTION = set('│┌┐└┘├┤┬┴┼')


def norm(s):
    return re.sub(r'\s+', '', s)


def char_lines(chars, ytol=3):
    chars = sorted(chars, key=lambda c: (round(c['top']), c['x0']))
    rows = []
    for c in chars:
        if rows and abs(rows[-1][0]['top'] - c['top']) <= ytol: rows[-1].append(c)
        else: rows.append([c])
    for r in rows: r.sort(key=lambda c: c['x0'])
    return rows


def text_of(chars):
    out, prev = '', None
    for c in chars:
        if prev is not None and c['x0'] - prev['x1'] > 1.5: out += ' '
        out += c['text']; prev = c
    return clean(out)


def find_formulas(path):
    found = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            chars = [c for c in page.chars if c['text'].strip()]
            lines = char_lines(chars)
            # a denominator pushed to the top of the next page by the page break
            if found and lines:
                last = found[-1]['rows'][-1]
                fr = [t for t in last if isinstance(t, dict)]
                if fr and not fr[-1]['den'] and found[-1].get('_page') == page.page_number - 1:
                    t = text_of(lines[0])
                    fr[-1]['den'] = t
                    found[-1]['lines'].append(norm(t)); found[-1]['src'] += norm(t); found[-1]['picked'] += norm(t)
                    lines = lines[1:]
            bar_rows = []
            for li, row in enumerate(lines):
                bars = [c for c in row if c['text'] == '─']
                if len(bars) < 4: continue
                if any(c['text'] in JUNCTION for c in row): continue
                # split into runs of consecutive ─
                runs, cur = [], []
                for c in row:
                    if c['text'] == '─' and (not cur or c['x0'] - cur[-1]['x1'] < 3): cur.append(c)
                    else:
                        if len(cur) >= 3: runs.append(cur)
                        cur = [c] if c['text'] == '─' else []
                if len(cur) >= 3: runs.append(cur)
                if runs: bar_rows.append((li, runs))
            if not bar_rows: continue
            pitch = min((b[0]['top'] - a[0]['top'] for a, b in zip(lines, lines[1:]) if b[0]['top'] - a[0]['top'] > 4), default=20)
            barline = {li for li, _ in bar_rows}
            # group bar rows that belong to one formula (close together)
            groups = []
            for br in bar_rows:
                if groups and br[0] - groups[-1][-1][0] <= 4: groups[-1].append(br)
                else: groups.append([br])
            for g in groups:
                xmin = min(r[0]['x0'] for _, runs in g for r in runs) - 3
                xmax = max(r[-1]['x1'] for _, runs in g for r in runs) + 3

                def fits(li):
                    row = lines[li]
                    return row[0]['x0'] >= xmin - 1 and row[-1]['x1'] <= xmax + 60 and li not in barline

                first_bar, last_bar = g[0][0], g[-1][0]
                # numerator lines above the first bar
                above = []
                li = first_bar - 1
                while li >= 0 and len(above) < 3 and fits(li) and lines[li + 1][0]['top'] - lines[li][0]['top'] < pitch * 1.6:
                    t = text_of(lines[li])
                    if re.search(r'[：:。]$', t): break
                    above.insert(0, li); li -= 1
                prefix = []
                if above and re.search(r'[＝=]$', text_of(lines[above[0]])):
                    prefix = [above.pop(0)]
                elif li >= 0 and re.search(r'[＝=]$', text_of(lines[li])) and fits(li):
                    prefix = [li]
                # denominator lines below the last bar
                below = []
                li = last_bar + 1
                while li < len(lines) and len(below) < 3 and fits(li) and lines[li][0]['top'] - lines[li - 1][0]['top'] < pitch * 1.6:
                    below.append(li); li += 1
                middle = [k for k in range(first_bar + 1, last_bar) if k not in barline]
                cand = sorted(set(above + below + middle))
                # assign every candidate line to the nearest bar row: above it -> numerator, below -> denominator
                rows_out = []
                if prefix: rows_out.append([text_of(lines[prefix[0]])])
                parts = {}
                for k in cand:
                    nb = min((b for b, _ in g), key=lambda b: (abs(b - k), b < k))
                    parts.setdefault(nb, {'num': [], 'den': []})['num' if k < nb else 'den'].append(k)
                for b, runs in g:
                    p = parts.get(b, {'num': [], 'den': []})
                    tokens = []
                    bar_chars = {id(c) for r in runs for c in r}
                    ops = [c for c in lines[b] if id(c) not in bar_chars]
                    items = [('frac', r[0]['x0'], r) for r in runs] + [('op', c['x0'], c) for c in ops]
                    items.sort(key=lambda it: it[1])
                    for kind, x, obj in items:
                        if kind == 'frac':
                            x0, x1 = obj[0]['x0'] - 4, obj[-1]['x1'] + 4

                            def seg(ks):
                                txt = ''
                                for k in ks:
                                    cs = [c for c in lines[k] if x0 <= (c['x0'] + c['x1']) / 2 <= x1]
                                    if cs: txt = join(txt, text_of(cs))
                                return txt
                            tokens.append({'num': seg(p['num']), 'den': seg(p['den'])})
                        else:
                            if tokens and isinstance(tokens[-1], str) and obj['x0'] - prev_x1 < 2.5: tokens[-1] += obj['text']
                            elif tokens and isinstance(tokens[-1], str): tokens[-1] += ' ' + obj['text'] if not re.match(rf'[{CJK}]', obj['text']) else obj['text']
                            else: tokens.append(obj['text'])
                            prev_x1 = obj['x1']
                    # numerator/denominator characters outside every bar (rare) are kept as plain text rows
                    rows_out.append([clean(t) if isinstance(t, str) else t for t in tokens])
                used = sorted(set(prefix + cand + [b for b, _ in g]))
                covered = {id(c) for k in used for c in lines[k]}
                # characters of the used lines that no fraction/op picked up
                picked = ''.join(t if isinstance(t, str) else t['num'] + t['den'] for r in rows_out for t in r)
                found.append(dict(lines=[norm(text_of(lines[k])) for k in used], rows=rows_out, _page=page.page_number,
                                  src=''.join(norm(text_of(lines[k])) for k in used), picked=norm(picked)))
    return found
