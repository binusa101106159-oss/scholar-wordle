"""Convert 職業病認定參考指引 PDFs into the JSON the 指引 tab reads (guides/), word for word.

Tables, page-split tables and pictures reuse the laws converter (../laws-build/annex.py) unchanged; this file
adds what a guide needs on top: running page headers/footers, paragraphs that flow across pages, headings,
the cover block, multi-column lists, captions for 表/圖, and links from the text to them.

    python3 build.py ../..            # all guides in catalog.GUIDES
    python3 build.py ../.. e01 e05    # only these (index.json keeps the others)
    python3 build.py ../.. -          # rewrite index.json only
"""
import collections, json, os, re, sys, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'laws-build'))
import pdfplumber
from annex import (Ink, visible_edges, cluster, printed, find_tables, table_struct, take, lines_of, set_spaces, save_image, is_white,
                   same_frame, merge_continued, finalize, page_chars_text, CJK)
from guides_catalog import CATS, GUIDES, SRC, CREDIT, EXTRAS, CAT_PARENTS, source_path, source_credit
from manual_tables import MANUAL_TABLES, table_text

NUMS = '一二三四五六七八九十'
# a line that starts one of these begins a new paragraph even when the line before it reached the right edge
NEW = re.compile(r'^(?:[一二三四五六七八九十百]+、|[（(][一二三四五六七八九十百]+[)）]|\(?\d+[\.\)）、](?!\d)|[（(]\d+[）)]|\d+\)'
                 r'|\[\d+\](?![。，、；：.,;:)）])|[A-Za-z][\.\)、](?![A-Za-z])|(?:附)?[表圖]\s*(?:[一二三四五六七八九十]+|\d+)[、：:．.\s]|註[一二三四五六七八九十\d]*[：:、]'
                 r'|[壹貳參肆伍陸柒捌玖拾]+、|第[一二三四五六七八九十]+章|附[錄件]|備註|說明[：:]|[□■●○◎※＊*•‧\uf06c\uf06e\uf0fc])')
CAPTION = re.compile(r'^((?:附)?[表圖])\s*([一二三四五六七八九十]+|\d+)\s*[、：:．.]?\s*(.*)$', re.S)
H1 = re.compile(r'^(?:[一二三四五六七八九十壹貳參肆伍陸柒捌玖拾]+、|第[一二三四五六七八九十]+章|參考文獻|參考資料|附錄|附件|附表)')
APPX = re.compile(r'^(附錄|附件)\s*([一二三四五六七八九十ㄧ]*|[IVX]+|\d*)\s*[、：:．.]?')
H2 = re.compile(r'^[（(][一二三四五六七八九十]+[)）]')
MENTION = re.compile(r'(?<![發代外報])((?:附)?[表圖])\s*([一二三四五六七八九十]+|\d+)(?![一二三四五六七八九十\d])')
# Wingdings bullets have no Unicode meaning; the PDF draws them as a black dot
# Section numbers that a PDF prints as small pictures instead of text, read by eye (picture file -> its text).
IMAGE_LABELS = {
    # 職業因素感染新型A型流感認定參考指引
    'b04-e77347c7985c.png': '一、',
    'b04-1ad02b9f0540.png': '二、',
    'b04-d43d152e946a.png': '(一)',
    'b04-dcac9e9739d3.png': '(二)',
    'b04-123acfc59ae0.png': '(三)',
    'b04-8e698786d00e.png': '(四)',
    'b04-352b5c4dedf0.png': '(五)',
    'b04-7b88e8d0a862.png': '(六)',
    'b04-7b072d58eb74.png': '(七)',
    'b04-e8e7a3925172.png': '三、',
    'b04-818463aae73c.png': '1.',
    'b04-676ba9f1069b.png': '2.',
    'b04-9ef9ac3109c1.png': '(二)',
    'b04-8f9e73f28603.png': '2.',
    'b04-6f26937d17d3.png': '3.',
    'b04-13ef39461f82.png': '(三)',
    'b04-beb12ffe50f0.png': '3.',
    'b04-5f902d6aae43.png': '4.',
    'b04-fc928f3af6c4.png': '(四)',
    'b04-3ab9e9503182.png': '1.',
    'b04-deb23df74d53.png': '(六)',
    'b04-fb79da833003.png': '3.',
    'b04-b9aacc40b8f0.png': '4.',
    'b04-0a1af78b4544.png': '5.',
    'b04-c4a7762a2c08.png': '四、',
    'b04-b82b216cd42d.png': '五、',
    'b04-229847b4908d.png': '(一)',
    'b04-badccde94eea.png': '(二)',
    'b04-7f64fc58635d.png': '六、',
    'b04-a29679e84210.png': '(一)',
}

# Tables whose ruled header row gives the columns but whose body has no inner rules (one open box under the header).
# Registered per guide because the rule is only checked against these PDFs: guide id -> PDF page numbers (1-based).
OPEN_BODY = {
    'farm-c02': {4},    # 有機磷化合物中毒之認定基準 表二：中毒分級 | 症狀及膽鹼酶變化 | 預後
}

# Tables drawn with horizontal rules only whose first column names a category for several records (分類 | 工具 | …):
# every printed line with entries beyond the second column is one record; guide id -> PDF page numbers
CATEGORY_BANDS = {
    'plans01': {30},    # 表 4 常見肌肉骨骼傷病分析工具：上肢 / 下背部 / 全身
}
# A chart made of small pictures with labels printed in columns under them: kept as one picture of the page region
# (like a flowchart), its label text counted as printed in the picture; (guide id, PDF page) -> boxes in PDF points
FIGURE_REGIONS = {
    ('plans01', 32): [(125, 236, 466, 484)],    # 附錄一：身體活動容忍尺度與關節活動範圍的圖示
}

GLYPHS = {'\uf06c': '●', '\uf06e': '■', '\uf0fc': '✓', '\uf0b3': '≥', '\uf06d': 'μ', '\uf07e': '∼', '\uf02d': '−', '\uf061': 'α', '\uf0a0': '▪', '\uf0d8': '➢', '\uf0b0': '°'}   # Wingdings ● ■ ✓; Symbol ≥ μ ∼
# Visually checked against the supplied four-plan PDFs at 240 dpi.
GLYPHS.update({'\uf0a1': '○', '\uf0b2': '✧', '\uf081': '①', '\uf082': '②', '\uf083': '③'})


def glyphs(s):
    return ''.join(GLYPHS.get(c, c) for c in s)


def label_key(kind, num):
    n = num if num.isdigit() else str(NUMS.index(num) + 1) if len(num) == 1 else \
        str(10 + (NUMS.index(num[1]) + 1 if len(num) == 2 and num[0] == '十' else 0)) if num[0] == '十' else \
        str((NUMS.index(num[0]) + 1) * 10 + (NUMS.index(num[2]) + 1 if len(num) == 3 else 0))
    return ('a' if kind.startswith('附') else '') + ('f' if kind.endswith('圖') else 't') + n


# ── page reading ──
def highlight(t, words):
    """Highlighted words (a coloured box behind a word or two inside a sentence) are not a one-column table:
    the sentence carries on to the left or right of the box on the same line."""
    # boxes shaded behind each printed line: one left edge, a different right edge per line (where the text ends)
    lefts = cluster([c[0] for c in t.cells]); rights = cluster([c[2] for c in t.cells])
    if len(lefts) == 1 and len(rights) == len(t.cells) >= 2: return True
    xs = cluster([c[0] for c in t.cells] + [c[2] for c in t.cells])
    if len(xs) > 2: return False
    x0, top, x1, bottom = t.bbox
    for c in t.cells:
        mid = (c[1] + c[3]) / 2
        if any(w['top'] <= mid <= w['bottom'] and (w['x1'] < x0 - 0.5 or w['x0'] > x1 + 0.5) for w in words): return True
    return False


def rule_tables(page, words, taken, keep=()):
    """Tables drawn with horizontal rules only (Word tables with hidden side borders, booktabs style).
    Each rule's segment ends mark the columns; each printed line between two rules is a row; a cell that the
    rule above does not close off continues the cell above it (row span)."""
    segs = [e for e in visible_edges(page) if e['orientation'] == 'h' and e['x1'] - e['x0'] > 8
            and 50 < e['top'] < page.height - 80
            and (any(abs(e['top'] - y) <= 1 and abs(e['x0'] - a) <= 1.5 and abs(e['x1'] - b) <= 1.5 for y, a, b in keep)   # a dark rule stays a rule on a shaded row's edge
                 or not any(b[0] - 3 <= e['x0'] and e['x1'] <= b[2] + 3 and b[1] - 3 <= e['top'] <= b[3] + 3 for b in taken))]
    if not segs: return []
    rules = []
    for e in sorted(segs, key=lambda e: e['top']):
        if rules and e['top'] - rules[-1]['y'] <= 1.5: rules[-1]['segs'].append((e['x0'], e['x1'])); continue
        rules.append(dict(y=e['top'], segs=[(e['x0'], e['x1'])]))
    for r in rules:
        r['segs'] = sorted(set((round(a, 1), round(b, 1)) for a, b in r['segs']))
        r['x0'] = min(a for a, b in r['segs']); r['x1'] = max(b for a, b in r['segs'])
    rules = [r for r in rules if r['x1'] - r['x0'] >= 40]
    # group rules into tables: neighbouring rules whose text in between stays inside the rules' width
    out = []
    i = 0
    while i < len(rules):
        g = [rules[i]]; j = i + 1
        while j < len(rules):
            gx0 = min(r['x0'] for r in g + [rules[j]]); gx1 = max(r['x1'] for r in g + [rules[j]])
            between = [w for w in words if g[-1]['y'] < (w['top'] + w['bottom']) / 2 < rules[j]['y']]
            if rules[j]['y'] - g[-1]['y'] > 420 or any(w['x0'] < gx0 - 4 or w['x1'] > gx1 + 4 for w in between): break
            g.append(rules[j]); j += 1
        i = j
        if len(g) < 3 or not any(len(r['segs']) >= 2 for r in g): continue
        x0 = min(r['x0'] for r in g); x1 = max(r['x1'] for r in g)
        # boxes with drawn sides (a flowchart, a framed note) are not a rules-only table
        sides = [e for e in visible_edges(page) if e['orientation'] == 'v' and e['bottom'] - e['top'] > 8
                 and x0 - 3 <= e['x0'] <= x1 + 3 and g[0]['y'] - 3 <= e['top'] and e['bottom'] <= g[-1]['y'] + 3
                 and not any(b[0] - 3 <= e['x0'] <= b[2] + 3 and b[1] - 3 <= e['top'] <= b[3] + 3 for b in taken)]
        if len(sides) >= 4: continue
        # arrows drawn between the rules: a chart (a scale with arrows under it), not a table
        arrows = [c for c in page.curves if c.get('fill') and not is_white(c.get('non_stroking_color'))
                  and x0 - 3 <= c['x0'] and c['x1'] <= x1 + 3 and g[0]['y'] - 3 <= c['top'] and c['bottom'] <= g[-1]['y'] + 3]
        if len(arrows) >= 2: continue
        marks = cluster([v for r in g for s in r['segs'] for v in s] + [x0, x1], 2.5)
        def ends(r):          # column marks this rule draws
            return {k for k, m in enumerate(marks) if any(abs(m - v) <= 2.5 for s in r['segs'] for v in s)}
        def covered(r, a, b):  # does rule r run along the whole interval a..b?
            return any(s[0] - 2.5 <= a and b <= s[1] + 2.5 for s in r['segs'])
        def col_of(x): return max(0, min(len(marks) - 2, next((k for k in range(len(marks) - 1) if x < marks[k + 1]), len(marks) - 2)))
        def splits(a, b):      # a column line runs through the gap between two words
            return any(a['x1'] - 1 <= m <= b['x0'] + 1 for m in marks[1:-1])
        def seg_of(r, x): return next((s for s in r['segs'] if s[0] - 2.5 <= x <= s[1] + 2.5), None)
        cells, nrow, head = [], 0, 0
        prev_row = {}
        mine = []                              # words this attempt took, to give back if it is not a grid
        for bi in range(len(g) - 1):
            top, bot = g[bi], g[bi + 1]
            band = take(words, x0, top['y'], x1, bot['y'], pad=0)
            mine.extend(band)
            blines = lines_of(band)
            # every word belongs to exactly one printed line: the one nearest its middle
            owner = [min(range(len(blines)), key=lambda k: abs((w['top'] + w['bottom']) / 2 - (blines[k]['top'] + blines[k]['bottom']) / 2))
                     if blines else 0 for w in band]
            mid = lambda ln: (ln['top'] + ln['bottom']) / 2
            # records whose first-column entry (a case number, a heading) is centred on several printed lines:
            # every line belongs to the nearest such entry, so one record stays one row
            anchors = [li for li in range(len(blines))
                       if any(o == li and col_of((w['x0'] + w['x1']) / 2) == 0 for w, o in zip(band, owner))]
            # a first-column cell printed on several lines (line spacing within 1.5 line heights) is one entry
            groups = []
            for a in anchors:
                ln = blines[a]
                if groups and mid(ln) - mid(blines[groups[-1][-1]]) <= 1.5 * (ln['bottom'] - ln['top']): groups[-1].append(a)
                else: groups.append([a])
            # every column but the first holds at most one entry: the whole band is one record
            def entries(k): return sum(1 for li in range(len(blines)) if any(o == li and col_of((w['x0'] + w['x1']) / 2) == k for w, o in zip(band, owner)))
            single = len(blines) > 1 and anchors and all(entries(k) <= 1 for k in range(1, len(marks) - 1))
            recs = None
            if single or (groups and groups[0][0] > 0 and len(blines) > len(groups) and len(blines) <= 8 * len(groups)):
                recs = {}
                for li in range(len(blines)):
                    if single: near = 0
                    else:
                        dist = lambda gr: max(0, mid(blines[gr[0]]) - mid(blines[li]), mid(blines[li]) - mid(blines[gr[-1]]))
                        near = min(range(len(groups)), key=lambda k: (dist(groups[k]), k))
                    recs.setdefault(near, []).append(li)
            elif bi == len(g) - 2 and len(blines) > 1:
                # body rows whose first cell wraps onto a line of its own, with the other cells centred on the pair:
                # the first-column-only line joins the nearest line that has the other cells (within one line height)
                cols = [{col_of((w['x0'] + w['x1']) / 2) for w, o in zip(band, owner) if o == li} for li in range(len(blines))]
                join = {}
                for li, cs in enumerate(cols):
                    if cs != {0}: continue
                    h = blines[li]['bottom'] - blines[li]['top']
                    cand = [lj for lj in range(len(blines)) if cols[lj] - {0} and abs(mid(blines[lj]) - mid(blines[li])) <= h]
                    if cand: join[li] = min(cand, key=lambda lj: abs(mid(blines[lj]) - mid(blines[li])))
                if join:
                    recs = {}
                    for li in range(len(blines)): recs.setdefault(join.get(li, li), []).append(li)
                    recs = {min(v): sorted(v) for v in recs.values()}
            if recs is not None:
                for a in sorted(recs):
                    row = {}
                    for li in recs[a]:
                        lw = sorted([w for w, o in zip(band, owner) if o == li], key=lambda w: w['x0'])
                        pieces = []
                        for w in lw:
                            if pieces and w['x0'] - pieces[-1][-1]['x1'] <= 6 and not splits(pieces[-1][-1], w): pieces[-1].append(w)
                            else: pieces.append([w])
                        for pc in pieces:
                            k = col_of((pc[0]['x0'] + pc[-1]['x1']) / 2)
                            text = lines_of(pc)[0]['text']
                            if k in row: row[k]['text'] += ('\n' if row[k]['_li'] != li else ' ') + text; row[k]['_li'] = li
                            else:
                                row[k] = dict(r=nrow, c=k, rs=1, cs=1, text=text, _li=li); cells.append(row[k])
                    for k in range(len(marks) - 1):
                        if k not in row: row[k] = dict(r=nrow, c=k, rs=1, cs=1, text=''); cells.append(row[k])
                    for c in row.values(): c.pop('_li', None)
                    prev_row = row; nrow += 1
                if bi < len(g) - 2: head = nrow
                continue
            for li, ln in enumerate(blines):
                ws = sorted([w for w, o in zip(band, owner) if o == li], key=lambda w: w['x0'])
                pieces = []                      # words closer than 6pt belong together
                for w in ws:
                    if pieces and w['x0'] - pieces[-1][-1]['x1'] <= 6 and not splits(pieces[-1][-1], w): pieces[-1].append(w)
                    else: pieces.append([w])
                row = {}
                for pc in pieces:
                    cx = (pc[0]['x0'] + pc[-1]['x1']) / 2
                    text = lines_of(pc)[0]['text']
                    s = seg_of(top, cx) if li == 0 else None
                    if s is not None:        # the first line of a band is centred over the rule above it: span that rule
                        a, b = col_of(s[0] + 2.5), col_of(s[1] - 2.5) + 1
                    else:
                        a = col_of(cx); b = a + 1
                    if a in row: row[a]['text'] += ' ' + text; continue
                    above = prev_row.get(a)
                    if li == 0 and 0 < bi < len(g) - 2 and above is not None and seg_of(top, (marks[a] + marks[a + 1]) / 2) is None:
                        above['text'] = (above['text'] + '\n' + text) if above['text'] else text
                        if above['r'] + above['rs'] == nrow: above['rs'] += 1
                        row[a] = above; continue
                    c = dict(r=nrow, c=a, rs=1, cs=b - a, text=text)
                    cells.append(c)
                    for k in range(a, b): row[k] = c
                for k in range(len(marks) - 1):
                    if k in row: continue
                    above = prev_row.get(k)
                    span = range(above['c'], above['c'] + above['cs']) if above is not None else ()
                    if li == 0 and 0 < bi < len(g) - 2 and above is not None and seg_of(top, (marks[k] + marks[k + 1]) / 2) is None \
                            and all(row.get(kk) in (None, above) for kk in span):   # a wide cell only grows down where the row is free
                        if above['r'] + above['rs'] == nrow: above['rs'] += 1
                        for kk in span: row[kk] = above
                        continue
                    c = dict(r=nrow, c=k, rs=1, cs=1, text=''); cells.append(c); row[k] = c
                prev_row = row; nrow += 1
            if bi < len(g) - 2: head = nrow
        if not any(c['text'] for c in cells): continue
        # columns that never hold text are spacing: fold them into their left neighbour
        used = sorted({k for c in cells for k in range(c['c'], c['c'] + c['cs']) if c['text']})
        keep = [k for k in range(len(marks) - 1) if any(c['c'] <= k < c['c'] + c['cs'] and c['text'] for c in cells)]
        newx = [marks[k] for k in keep] + [marks[-1]]
        def remap(k): return max(i for i, kk in enumerate(keep) if kk <= k) if any(kk <= k for kk in keep) else 0
        for c in cells:
            a = remap(c['c']); b = remap(c['c'] + c['cs'] - 1) + 1
            c['c'], c['cs'] = a, max(1, b - a)
        # cells that collapsed onto the same slot: keep the one with text
        seen = {}
        for c in sorted(cells, key=lambda c: (c['r'], c['c'], not c['text'])):
            seen.setdefault((c['r'], c['c']), c)
        cells, occ, clash = [], set(), False
        for c in sorted(seen.values(), key=lambda c: (not c['text'], c['r'], c['c'])):
            slots = {(r, k) for r in range(c['r'], c['r'] + c['rs']) for k in range(c['c'], c['c'] + c['cs'])}
            if slots & occ:
                if c['text']: clash = True
                continue                       # an empty spacer cell under a spanning one
            occ |= slots; cells.append(c)
        if clash:                              # the rules do not describe a grid: leave the text as text
            for w in mine:
                for ch in w['chars']: ch['_u'] = False
            continue
        rows = [sorted([c for c in cells if c['r'] == r], key=lambda c: c['c']) for r in range(nrow)]
        rows = [r for r in rows]
        tb = dict(t='table', nrows=nrow, xs=newx, widths=[round(newx[k + 1] - newx[k], 1) for k in range(len(newx) - 1)],
                  x0=x0, x1=x1, top=g[0]['y'], bottom=g[-1]['y'], rows=rows, head=min(head, 3) if head < nrow else 0)
        out.append(tb)
    return out


def read_pages(path, imgdir, prefix):
    ink = Ink(path)
    pages = []
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages):
            page = printed(page.dedupe_chars(tolerance=1), ink)
            # white text on a white page (a hidden copy of a heading for the bookmarks) does not print; text on a
            # coloured fill stays. QC counts it with the dropped lines.
            fills = [r for r in page.rects if r.get('fill') and not is_white(r.get('non_stroking_color')) and min(r['x1'] - r['x0'], r['bottom'] - r['top']) > 3]   # rules and box edges are not a background
            def hidden(o):
                if o.get('object_type') != 'char' or not o['text'].strip() or not is_white(o.get('non_stroking_color')): return False
                cx, cy = (o['x0'] + o['x1']) / 2, (o['top'] + o['bottom']) / 2
                return not any(r['x0'] <= cx <= r['x1'] and r['top'] <= cy <= r['bottom'] for r in fills)
            unseen = ''.join(c['text'] for c in page.chars if hidden(c))
            if unseen: page = page.filter(lambda o: not hidden(o))
            # Word's text highlighting is a filled rectangle around each line,
            # not a cell border. Its edges can overlap the real shaded cell and
            # overwrite that cell after grid coordinates are snapped together.
            def background(obj):
                if obj.get('object_type') != 'rect' or obj.get('stroke') or not obj.get('fill'): return False
                if min(obj['x1'] - obj['x0'], obj['bottom'] - obj['top']) <= 1.5: return False
                color = obj.get('non_stroking_color')
                if color is None: return False
                color = (color,) if isinstance(color, (int, float)) else tuple(color)
                return (len(color) in (1, 3) and min(color) >= .75) or (len(color) == 4 and max(color) <= .15)
            page = page.filter(lambda obj: not background(obj))
            # letter-spaced text (Latin letters set ~1.5pt apart): split words only at gaps clearly wider than the tracking
            ch = sorted((c for c in page.chars if c['text'].isascii() and c['text'].isalpha()), key=lambda c: (round(c['top']), c['x0']))
            gaps = [b['x0'] - a['x1'] for a, b in zip(ch, ch[1:]) if abs(a['top'] - b['top']) < 1 and -0.5 < b['x0'] - a['x1'] < 4]
            track = statistics.median(gaps) if len(gaps) >= 20 else 0
            xt = min(3.0, track + 0.45) if track >= 1.3 else 1.5
            words = page.extract_words(x_tolerance=xt, y_tolerance=2, keep_blank_chars=False, use_text_flow=False, return_chars=True)
            set_spaces(page)
            def imgsave(im, page=page):
                bbox = (max(im['x0'], 0), max(im['top'], 0), min(im['x1'], page.width), min(im['bottom'], page.height))
                pi = page.crop(bbox).to_image(resolution=200)
                return dict(src=save_image(pi.original, imgdir, prefix), w=round(im['x1'] - im['x0']), h=round(im['bottom'] - im['top']))

            images, labels = [], []
            known = any(k.startswith(prefix) for k in IMAGE_LABELS)
            for im in page.images:
                # section numbers printed as little pictures (一、 (一) 1.): put the number back in front of its line, as text
                if known and im['x1'] - im['x0'] <= 40 and im['bottom'] - im['top'] <= 20:
                    src = imgsave(im)['src']
                    if src in IMAGE_LABELS:
                        text = IMAGE_LABELS[src]
                        cy = (im['top'] + im['bottom']) / 2
                        nxt = [w for w in words if w['x0'] >= im['x1'] - 2 and w['top'] - 4 <= cy <= w['bottom'] + 4]
                        top, bottom = (min(nxt, key=lambda w: w['x0'])['top'], min(nxt, key=lambda w: w['x0'])['bottom']) if nxt else (im['top'], im['bottom'])
                        step = (im['x1'] - im['x0']) / len(text)
                        chars = [dict(text=ch, x0=im['x0'] + k * step, x1=im['x0'] + (k + 1) * step, top=top, bottom=bottom) for k, ch in enumerate(text)]
                        words.append(dict(text=text, x0=im['x0'], x1=im['x1'], top=top, bottom=bottom, chars=chars))
                        labels.append(text)
                        continue
                    print('  unlabelled small picture', src, round(im['x0']), round(im['top']), file=sys.stderr)
                if im['x1'] - im['x0'] <= 4 or im['bottom'] - im['top'] <= 4: continue
                mask = im['stream'].attrs.get('SMask')
                if mask is not None:
                    stream = mask.resolve()
                    if stream.attrs.get('Decode', [0, 1]) == [0, 1] and not any(stream.get_data()): continue
                images.append(dict(im))
            # A single printed illustration can be tiled into adjacent PDF
            # image objects. Join touching tiles before placing the picture so
            # the reader does not add gaps or wrap one tile to another line.
            joined = True
            while joined:
                joined = False
                for a in images:
                    for b in images:
                        if a is b: continue
                        vertical = abs(a['bottom'] - b['top']) < .8 and min(a['x1'],b['x1'])-max(a['x0'],b['x0']) >= .9*min(a['x1']-a['x0'],b['x1']-b['x0'])
                        horizontal = abs(a['x1'] - b['x0']) < .8 and min(a['bottom'],b['bottom'])-max(a['top'],b['top']) >= .9*min(a['bottom']-a['top'],b['bottom']-b['top'])
                        if not (vertical or horizontal): continue
                        a.update(x0=min(a['x0'],b['x0']),x1=max(a['x1'],b['x1']),top=min(a['top'],b['top']),bottom=max(a['bottom'],b['bottom']))
                        images.remove(b); joined = True; break
                    if joined: break

            found = [t for t in find_tables(page, ink) if len(t.cells) >= 2]
            # a ruled area with no words in it is a shape (a flowchart arrow), not a table
            def has_words(t):
                return any(t.bbox[0] <= (w['x0'] + w['x1']) / 2 <= t.bbox[2] and t.bbox[1] <= (w['top'] + w['bottom']) / 2 <= t.bbox[3] for w in words)
            found = [t for t in found if has_words(t) or page.crop(t.bbox).images]
            # a ruled strip that is mostly empty with arrows drawn across it is a chart (a scale with arrows), not a table
            def chart(t):
                cells = [c for c in t.cells if c]
                full = sum(1 for c in cells if any(c[0] <= (w['x0'] + w['x1']) / 2 <= c[2] and c[1] <= (w['top'] + w['bottom']) / 2 <= c[3] for w in words))
                arrows = [c for c in page.curves if c.get('fill') and t.bbox[0] - 2 <= c['x0'] and c['x1'] <= t.bbox[2] + 2
                          and t.bbox[1] - 2 <= c['top'] and c['bottom'] <= t.bbox[3] + 2]
                return len(arrows) >= 2 and full <= len(cells) * 0.4
            found = [t for t in found if not chart(t)]
            # zebra shading: a single shaded row (light fill, no border) between two dark rules is the row's background,
            # the rules make the table
            def light(c):
                if c is None: return False
                c = (c,) if isinstance(c, (int, float)) else tuple(c)
                return (len(c) == 4 and max(c) <= 0.15) or (len(c) in (1, 3) and min(c) >= 0.8)
            def zebra(t):
                if len(t.rows) != 1: return False
                filled = [c for c in t.cells if c and any(c[0] <= (w['x0'] + w['x1']) / 2 <= c[2] and c[1] <= (w['top'] + w['bottom']) / 2 <= c[3] for w in words)]
                if len(filled) < 2: return False       # a shaded heading bar keeps its box
                inside = [r for r in page.rects if t.bbox[0] - 1 <= r['x0'] and r['x1'] <= t.bbox[2] + 1 and t.bbox[1] - 1 <= r['top'] and r['bottom'] <= t.bbox[3] + 1
                          and min(r['x1'] - r['x0'], r['bottom'] - r['top']) > 1.5]
                if not inside or any(r.get('stroke') or not light(r.get('non_stroking_color')) for r in inside): return False
                w = t.bbox[2] - t.bbox[0]
                def rule(r, below):
                    return (r['bottom'] - r['top'] <= 1.5 and not light(r.get('non_stroking_color')) and r['x0'] <= t.bbox[0] + 8 and r['x1'] >= t.bbox[2] - 8
                            and (0 <= r['top'] - t.bbox[3] <= 150 if below else 0 <= t.bbox[1] - r['bottom'] <= 150))
                def covers(below):
                    segs = sorted((r['x0'], r['x1']) for r in page.rects if r['bottom'] - r['top'] <= 1.5 and not light(r.get('non_stroking_color'))
                                  and (-2 <= r['top'] - t.bbox[3] <= 150 if below else -2 <= t.bbox[1] - r['bottom'] <= 150))
                    reach = t.bbox[0] + 8
                    for a, b in segs:
                        if a <= reach + 2: reach = max(reach, b)
                    return reach >= t.bbox[2] - 8
                return covers(False) and covers(True)
            zebras = [t for t in found if zebra(t)]
            found = [t for t in found if t not in zebras]
            tables = [t for t in found if not highlight(t, words)]
            opened = []
            if pno + 1 in OPEN_BODY.get(prefix.rstrip('-'), ()):
                for t in list(tables):
                    tb = open_body(t, words)
                    if tb: tables.remove(t); opened.append(tb)
            shaded = [t.bbox for t in found if highlight(t, words)] + [t.bbox for t in zebras]     # their edges are not table rules either
            def inside(a, b):
                return a is not b and b.bbox[0] - 2 <= a.bbox[0] and a.bbox[2] <= b.bbox[2] + 2 and b.bbox[1] - 2 <= a.bbox[1] and a.bbox[3] <= b.bbox[3] + 2
            built = {}
            for t in sorted(tables, key=lambda t: (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1])):
                kids = [built.pop(id(k)) for k in tables if id(k) in built and inside(k, t)]
                built[id(t)] = table_struct(page, t, words, images, imgsave, kids)
            items = [dict(k='table', tb=tb, top=tb['top'], bottom=tb['bottom']) for tb in list(built.values()) + opened]
            # A two-column list can have only an outer frame, open at the
            # physical page break. Rebuild its aligned labels/descriptions
            # from word positions instead of flattening both columns.
            frames = framed_columns(page, words, [t.bbox for t in tables] + [(tb['x0'], tb['top'], tb['x1'], tb['bottom']) for tb in opened])
            items.extend(dict(k='table', tb=tb, top=tb['top'], bottom=tb['bottom']) for tb in frames)
            dark = [(y, r['x0'], r['x1']) for r in page.rects if r['bottom'] - r['top'] <= 1.5 and r['x1'] - r['x0'] > 8 and r.get('fill')
                    and not light(r.get('non_stroking_color')) for y in (r['top'], r['bottom'])] if zebras else []
            for tb in rule_tables(page, words, [(t['x0'], t['top'], t['x1'], t['bottom']) for t in list(built.values()) + opened] + shaded, dark):
                if pno + 1 in CATEGORY_BANDS.get(prefix.rstrip('-'), ()): tb = category_bands(page, tb)
                items.append(dict(k='table', tb=tb, top=tb['top'], bottom=tb['bottom']))
            dropped = [unseen] if unseen else []
            for x0, y0, x1, y1 in FIGURE_REGIONS.get((prefix.rstrip('-'), pno + 1), ()):
                dropped.extend(w['text'] for w in take(words, x0, y0, x1, y1, pad=0))
                for im in images:
                    if x0 - 2 <= im['x0'] and im['x1'] <= x1 + 2 and y0 - 2 <= im['top'] and im['bottom'] <= y1 + 2: im['_used'] = True
                items.append(dict(k='img', img=imgsave(dict(x0=x0, top=y0, x1=x1, bottom=y1)), top=y0, bottom=y1, x0=x0, x1=x1, drawing=True))
            # vector drawings outside tables become a picture of the drawing (same rule as the laws converter)
            boxes = [(it['tb']['x0'], it['top'], it['tb']['x1'], it['bottom']) if it['k'] == 'table' else (it['x0'], it['top'], it['x1'], it['bottom']) for it in items]
            # a drawing is its curves plus the stroked lines and boxes joined to them (flowcharts: boxes, diamonds, arrows)
            strokes = [c for c in page.curves if not is_white(c.get('stroking_color'))]
            if strokes:
                strokes += [l for l in page.lines if not is_white(l.get('stroking_color'))]
                strokes += [r for r in page.rects if r.get('stroke') and not is_white(r.get('stroking_color'))]
                # arrow shafts: short thin bars filled dark
                strokes += [r for r in page.rects if r.get('fill') and not r.get('stroke') and r.get('non_stroking_color') is not None
                            and not is_white(r.get('non_stroking_color')) and min(r['width'], r['height']) <= 6 and max(r['width'], r['height']) <= 80]
            curves = [c for c in strokes if not any(
                b[0] - 2 <= c['x0'] and c['x1'] <= b[2] + 2 and b[1] - 2 <= c['top'] and c['bottom'] <= b[3] + 2 for b in boxes)]
            groups = [[c['x0'], c['top'], c['x1'], c['bottom']] for c in curves]
            merged = True
            tol = 40 if len(groups) >= 3 else 12
            while merged:                      # join touching pieces until nothing changes
                merged = False
                out = []
                for box in sorted(groups, key=lambda g: (g[1], g[0])):
                    for g in out:
                        if box[0] <= g[2] + tol and g[0] <= box[2] + tol and box[1] <= g[3] + tol and g[1] <= box[3] + tol:
                            g[:] = [min(g[0], box[0]), min(g[1], box[1]), max(g[2], box[2]), max(g[3], box[3])]; merged = True; break
                    else: out.append(list(box))
                groups = out
            small = [g for g in groups if (g[2] - g[0]) * (g[3] - g[1]) < 300]
            for g in groups:
                if (g[2] - g[0]) * (g[3] - g[1]) < 300: continue
                # labels that the drawing's edge cuts through belong to the drawing: grow it until no word straddles the edge;
                # a small stroke piece (an arrow) the grown drawing now reaches joins it too
                grown = True
                while grown:
                    grown = False
                    for w in words:
                        if all(c.get('_u') for c in w['chars']): continue
                        cuts = w['x0'] < g[2] + 3 and w['x1'] > g[0] - 3 and w['top'] < g[3] + 3 and w['bottom'] > g[1] - 3
                        if cuts and not (g[0] <= w['x0'] and w['x1'] <= g[2] and g[1] <= w['top'] and w['bottom'] <= g[3]):
                            g[:] = [min(g[0], w['x0']), min(g[1], w['top']), max(g[2], w['x1']), max(g[3], w['bottom'])]; grown = True
                    for sg in [sg for sg in small if sg[0] <= g[2] + 8 and g[0] <= sg[2] + 8 and sg[1] <= g[3] + 8 and g[1] <= sg[3] + 8]:
                        small.remove(sg)
                        g[:] = [min(g[0], sg[0]), min(g[1], sg[1]), max(g[2], sg[2]), max(g[3], sg[3])]; grown = True
                dropped.extend(w['text'] for w in take(words, g[0], g[1], g[2], g[3], pad=0))
                fig = dict(x0=g[0] - 2, top=g[1] - 2, x1=g[2] + 2, bottom=g[3] + 2)
                items.append(dict(k='img', img=imgsave(fig), top=g[1], bottom=g[3], x0=g[0], x1=g[2], drawing=True))
            manual = MANUAL_TABLES.get((prefix.rstrip('-'), pno + 1))
            for im in images:
                if im.get('_used'): continue
                if manual and (im['x1'] - im['x0']) * (im['bottom'] - im['top']) > 20000:
                    # a table printed only as a picture: its transcription (manual_tables.py) stands in its place
                    tb = dict(manual(), x0=im['x0'], x1=im['x1'], top=im['top'], bottom=im['bottom'])
                    items.append(dict(k='table', tb=tb, top=im['top'], bottom=im['bottom']))
                    labels.append(table_text(tb)); manual = None
                    continue
                items.append(dict(k='img', img=imgsave(im), top=im['top'], bottom=im['bottom'], x0=im['x0'], x1=im['x1']))
            assert manual is None, ('no picture for the manual table on page', pno + 1)
            free = take(words, -1e6, -1e6, 1e6, 1e6)
            for l in lines_of(free):
                # column gaps inside the line (lists printed in 2-3 columns)
                ws = sorted([w for w in free if l['top'] - 1 <= (w['top'] + w['bottom']) / 2 <= l['bottom'] + 1], key=lambda w: w['x0'])
                segs, prev = [], None
                for w in ws:
                    gap = w['x0'] - prev if prev is not None else 0
                    if prev is None or gap > 30 or (gap > 8 and re.match(r'^(?:\d+[\.\)、]|[（(]\d+[)）])', w['text'])): segs.append([w['x0'], w['text']])
                    else: segs[-1][1] += (' ' if not (re.search(rf'[{CJK}]$', segs[-1][1]) and re.match(rf'[{CJK}]', w['text'])) and w['x0'] - prev > 1 else '') + w['text']
                    prev = w['x1']
                items.append(dict(k='line', text=l['text'], x0=l['x0'], x1=l['x1'], top=l['top'], bottom=l['bottom'], segs=segs))
            items.sort(key=lambda it: it['top'])
            for it in items: it['page'] = pno
            pages.append(dict(items=items, height=page.height, width=page.width, dropped=dropped, labels=labels))
    return pages


def category_bands(page, tb):
    """CATEGORY_BANDS: rebuild a rules-only table from its rules and the words' positions. The rules' segment ends give
    the columns; the first band is the header. In every later band, a printed line with entries past the second column
    starts a record, a line with only a second-column entry continues the record above (a wrapped name), and the
    first-column text is the band's category, one cell spanning its records."""
    hs = [e for e in visible_edges(page) if e['orientation'] == 'h' and e['x0'] >= tb['x0'] - 3 and e['x1'] <= tb['x1'] + 3
          and tb['top'] - 3 <= e['top'] <= tb['bottom'] + 3]
    xs = cluster([v for e in hs for v in (e['x0'], e['x1'])], 1.0)
    ys = cluster([e['top'] for e in hs], 1.5)
    words = page.crop((tb['x0'] - 1, tb['top'] - 1, tb['x1'] + 1, tb['bottom'] + 1)).extract_words(
        x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False, use_text_flow=False, return_chars=True)
    def col_of(x): return max(0, min(len(xs) - 2, next((k for k in range(len(xs) - 1) if x < xs[k + 1]), len(xs) - 2)))
    def join(a, b): return a + (' ' if a and b and a[-1].isascii() and b[0].isascii() else '') + b
    rows = []
    for bi, (y0, y1) in enumerate(zip(ys, ys[1:])):
        band = [w for w in words if y0 < (w['top'] + w['bottom']) / 2 < y1]
        cat, recs = '', []
        for ln in lines_of(band):
            ws = [w for w in band if ln['top'] - 1 <= (w['top'] + w['bottom']) / 2 <= ln['bottom'] + 1]
            parts = ['' for _ in range(len(xs) - 1)]
            for k in range(len(parts)):
                parts[k] = ''.join(l['text'] for l in lines_of([w for w in ws if col_of((w['x0'] + w['x1']) / 2) == k]))
            if bi == 0: rows.append([dict(c=k, rs=1, cs=1, text=t) for k, t in enumerate(parts)]); continue
            cat = join(cat, parts[0])
            if any(parts[2:]) or not recs: recs.append(parts[1:])
            elif parts[1]: recs[-1][0] = join(recs[-1][0], parts[1])
        if bi == 0: continue
        for i, rec in enumerate(recs):
            row = [dict(c=0, rs=len(recs), cs=1, text=cat)] if i == 0 else []
            rows.append(row + [dict(c=k + 1, rs=1, cs=1, text=t) for k, t in enumerate(rec)])
    return dict(t='table', nrows=len(rows), rows=rows, widths=[round(b - a, 1) for a, b in zip(xs, xs[1:])], xs=xs,
                x0=tb['x0'], x1=tb['x1'], top=tb['top'], bottom=tb['bottom'], head=1)


def open_body(t, words):
    """A framed table (OPEN_BODY) whose header rows are ruled cells and whose body is one open box: the body's printed
    lines are split at the header's column lines, and every line with a first-column entry starts a new row; the lines
    under it, and the other columns' entries printed beside them, belong to that row."""
    cells = [c for c in t.cells if c]
    xs = cluster([c[0] for c in cells] + [c[2] for c in cells])
    body = [c for c in cells if c[0] <= xs[0] + 2 and c[2] >= xs[-1] - 2 and c[3] - c[1] > 60]
    if len(xs) < 4 or len(body) != 1: return None
    bx0, btop, bx1, bbot = body[0]
    def col_of(x): return max(0, min(len(xs) - 2, next((k for k in range(len(xs) - 1) if x < xs[k + 1]), len(xs) - 2)))
    rows = []
    def cell(text, c, cs=1): return dict(r=len(rows), c=c, rs=1, cs=cs, text=text)
    for top in sorted({round(c[1], 1) for c in cells if c[3] <= btop + 1}):          # ruled rows above the body
        band = sorted((c for c in cells if abs(c[1] - top) <= 1 and c[3] <= btop + 1), key=lambda c: c[0])
        row = []
        for c in band:
            k0 = min(range(len(xs)), key=lambda k: abs(xs[k] - c[0])); k1 = min(range(len(xs)), key=lambda k: abs(xs[k] - c[2]))
            text = '\n'.join(l['text'] for l in lines_of(take(words, c[0], c[1], c[2], c[3], pad=0)))
            row.append(cell(text, k0, max(1, k1 - k0)))
        rows.append(row)
    found = take(words, bx0, btop, bx1, bbot, pad=0)
    lines = lines_of(found)
    if not lines: return None
    recs = []
    for ln in lines:
        ws = sorted((w for w in found if ln['top'] - 1 <= (w['top'] + w['bottom']) / 2 <= ln['bottom'] + 1), key=lambda w: w['x0'])
        parts = [[] for _ in range(len(xs) - 1)]
        for w in ws: parts[col_of((w['x0'] + w['x1']) / 2)].append(w)
        parts = [''.join(l['text'] for l in lines_of(p)) for p in parts]
        if parts[0] or not recs: recs.append([[] for _ in parts])
        for k, p in enumerate(parts):
            if p: recs[-1][k].append(p)
    if len(recs) < 2: return None
    start = len(rows)
    for rec in recs:
        rows.append([cell('\n'.join(p), k) for k, p in enumerate(rec)])
    return dict(t='table', nrows=len(rows), rows=rows, widths=[round(b - a, 1) for a, b in zip(xs, xs[1:])], xs=xs,
                x0=t.bbox[0], x1=t.bbox[2], top=t.bbox[1], bottom=t.bbox[3], head=0)


def framed_columns(page, words, taken):
    edges = visible_edges(page)
    vertical = []
    walls = [e for e in edges if e['orientation'] == 'v']
    for x in cluster([e['x0'] for e in walls], .8):
        spans = sorted((e['top'],e['bottom']) for e in walls if abs(e['x0']-x) <= .8)
        joined = []
        for a,b in spans:
            if joined and a <= joined[-1][1]+2: joined[-1][1] = max(joined[-1][1],b)
            else: joined.append([a,b])
        vertical.extend(dict(x0=x,top=a,bottom=b) for a,b in joined if b-a > 45)
    horizontal = [e for e in edges if e['orientation'] == 'h']
    out = []
    for left in vertical:
        for right in vertical:
            x0, x1 = left['x0'], right['x0']
            top, bottom = max(left['top'],right['top']), min(left['bottom'],right['bottom'])
            if x1-x0 < 180 or bottom-top < 45: continue
            if abs(left['top']-right['top']) > 2 or abs(left['bottom']-right['bottom']) > 2: continue
            if not any(e['x0'] <= x0+2 and e['x1'] >= x1-2 and min(abs(e['top']-top),abs(e['top']-bottom)) < 2 for e in horizontal): continue
            if any(min(x1,b[2])-max(x0,b[0]) > 20 and min(bottom,b[3])-max(top,b[1]) > 20 for b in taken): continue
            # a frame with curves drawn inside it (boxes, arrows) is a flowchart, kept as a picture of the drawing
            if any(x0 <= (c['x0']+c['x1'])/2 <= x1 and top <= (c['top']+c['bottom'])/2 <= bottom for c in page.curves
                   if not is_white(c.get('stroking_color')) or (c.get('fill') and not is_white(c.get('non_stroking_color')))): continue
            source = [w for w in words if not all(c.get('_u') for c in w['chars']) and x0 <= (w['x0']+w['x1'])/2 <= x1 and top <= (w['top']+w['bottom'])/2 <= bottom]
            lines = lines_of(source)
            bands = [[w for w in source if abs((w['top']+w['bottom'])/2-(ln['top']+ln['bottom'])/2) < max(3,(ln['bottom']-ln['top'])/2)] for ln in lines]
            gaps = []
            for band in bands:
                band = sorted(band,key=lambda w:w['x0'])
                gaps += [round(b['x0']) for a,b in zip(band,band[1:]) if b['x0']-a['x1'] > 25 and x0+30 < b['x0'] < x1-50]
            if not gaps: continue
            seam, count = collections.Counter(gaps).most_common(1)[0]
            if count < 3: continue
            seam -= 3
            rows, records = [], 0
            def cell(text,c,cs=1): return dict(r=len(rows),c=c,rs=1,cs=cs,text=text)
            short = False                      # the line before stopped well short of the frame: it was not wrapped
            for ln,band in zip(lines,bands):
                ended, short = short, ln['x1'] < x1 - 40
                a = lines_of([w for w in band if (w['x0']+w['x1'])/2 < seam])
                b = lines_of([w for w in band if (w['x0']+w['x1'])/2 >= seam])
                a = ' '.join(l['text'] for l in a); b = ' '.join(l['text'] for l in b)
                if a and b and len(a) <= 14 and not NEW.match(ln['text']):
                    rows.append([cell(a,0),cell(b,1)]); records += 1
                elif not a and b and rows and len(rows[-1]) == 2:
                    rows[-1][1]['text'] = join_text(rows[-1][1]['text'],b)
                elif rows and len(rows[-1]) == 1 and not ended and not NEW.match(ln['text']) and not CAPTION.match(ln['text']):
                    rows[-1][0]['text'] = join_text(rows[-1][0]['text'],ln['text'])
                else: rows.append([cell(ln['text'],0,2)])
            if records < 3: continue
            take(words,x0,top,x1,bottom,pad=0)
            tb = dict(t='table',nrows=len(rows),rows=rows,widths=[round(seam-x0,1),round(x1-seam,1)],xs=[x0,seam,x1],x0=x0,x1=x1,top=top,bottom=bottom,head=0)
            out.append(tb);taken.append((x0,top,x1,bottom))
    return out


def join_text(a, b):
    return a + (' ' if a and b and a[-1].isascii() and b[0].isascii() else '') + b


def strip_running(pages):
    """Running headers/footers: short lines in the top/bottom band whose text (digits aside) repeats on many pages."""
    def key(t): return re.sub(r'[\s\d]+', '', t)
    seen = collections.Counter()
    for p in pages:
        for it in p['items']:
            if it['k'] == 'line' and (it['top'] < 70 or it['top'] > p['height'] - 80):
                seen[key(it['text'])] += 1
    common = {k for k, n in seen.items() if n >= max(2, len(pages) * 0.4)}
    removed = []
    for p in pages:
        keep = []
        for it in p['items']:
            if it['k'] == 'line' and (it['top'] < 70 or it['top'] > p['height'] - 80) and key(it['text']) in common:
                removed.append(it['text']); continue
            keep.append(it)
        p['items'] = keep
    return removed


# ── paragraphs ──
def figure_table(tb):
    """A grid used only to lay out pictures with their 圖 captions is not a table: give back pictures and captions
    in reading order (None when it is a real table)."""
    out, ok = [], [True]
    def walk(rows):
        for r in rows:
            for c in r:
                for im in c.get('img', []): out.append(dict(t='img', img=[im]))
                if c.get('text'):
                    if not CAPTION.match(c['text']) or not c['text'].startswith('圖'): ok[0] = False
                    out.append(dict(t='p', text=c['text'].replace('\n', ''), ind=0, hang=0))
                for b in c.get('blocks', []):
                    if b['t'] == 'img': out.append(dict(t='img', img=b['img']))
                    elif b['t'] == 'p':
                        if not CAPTION.match(b['text']) or not b['text'].startswith('圖'): ok[0] = False
                        out.append(dict(t='p', text=b['text'], ind=0, hang=0))
                    elif b['t'] == 'table': walk(b['rows'])
    walk(tb['rows'])
    return out if ok[0] and any(b['t'] == 'img' for b in out) and any(b['t'] == 'p' for b in out) else None


def build_blocks(pages, spaced=False):
    """spaced: the paragraph rules for the 農保 / 四大計畫 PDFs (double line spacing, CJK lines that stop a character or
    two short of the margin). The official guides were built and checked against their PDFs with the original rules,
    so they keep them until they are re-checked."""
    lines = [it for p in pages for it in p['items'] if it['k'] == 'line']
    em = (statistics.median(round(l['bottom'] - l['top']) for l in lines) if lines else 14) or 14
    longs = [round(l['x1']) for l in lines if len(l['text']) > 15]
    right = max(set(longs), key=lambda x: sum(1 for v in longs if abs(v - x) <= 2)) if longs else 500
    margin = statistics.mode(round(l['x0']) for l in lines) if lines else 0
    # the usual gap between a line that runs to the right edge and the line printed under it: double-spaced
    # documents (the 農保 guides) wrap with gaps wider than the 1.2 em that suits single spacing
    wraps = collections.Counter()
    for p in pages:
        ls = [it for it in p['items'] if it['k'] == 'line']
        for a, b in zip(ls, ls[1:]):
            gap = b['top'] - a['bottom']
            if right - a['x1'] < max(14, em * 1.6) and 0 < gap < em * 3: wraps[round(gap)] += 1
    usual = wraps.most_common(1)[0][0] if wraps else 0
    near = max(em * 1.2, usual * 1.35) if spaced else em * 1.2
    blocks = []
    cur = None          # open paragraph
    last_kind = None
    for p in pages:
        for it in p['items']:
            if it['k'] == 'table' and figure_table(it['tb']):
                blocks.extend(dict(b, page=it['page']) for b in figure_table(it['tb']))
                cur = None; last_kind = 'img'; continue
            if it['k'] == 'table':
                blocks.append(dict(t='table', **{k: v for k, v in it['tb'].items() if k != 't'}, page=it['page']))
                cur = None; last_kind = 'table'; continue
            if it['k'] == 'img':
                blocks.append(dict(t='img', img=[it['img']], page=it['page'], drawing=it.get('drawing', False)))
                cur = None; last_kind = 'img'; continue
            text = it['text']
            segs = it['segs']
            marker = r'^(?:\d+[.)、](?!\d)|[（(]\d+[)）])'
            multi = len(segs) >= 2 and all(len(s[1]) <= 40 and re.match(marker, s[1]) for s in segs)
            run = blocks[-1] if blocks and blocks[-1]['t'] == 'cols' and last_kind == 'cols' else None
            # inside a column list, a line whose pieces all sit on the list's columns is one more row
            # (e.g. the second line of an item that wrapped inside its column)
            fits = run is not None and len(segs) >= 2 and all(len(s[1]) <= 40 and any(abs(s[0] - x) <= 8 for x in run['xs']) for s in segs)
            if multi or fits:
                if run is None and multi:
                    run = dict(t='cols', rows=[], xs=[s[0] for s in segs], page=it['page']); blocks.append(run)
                for s in segs:
                    if not any(abs(s[0] - x) <= 8 for x in run['xs']): run['xs'].append(s[0])
                run['xs'].sort()
                row = [''] * len(run['xs'])
                for s in segs: row[min(range(len(run['xs'])), key=lambda k: abs(run['xs'][k] - s[0]))] = s[1]
                run['rows'].append(row)
                cur = None; last_kind = 'cols'; continue
            if cur is not None and last_kind == 'line':
                short = right - cur['x1last']
                # a CJK line can stop up to two characters early (a comma may not start the next line):
                # it still wraps unless it ends a sentence
                full = short < max(14, em * 1.6) or (spaced and short < em * 2.3 and re.search(rf'[{CJK}]$', cur['text']) is not None
                                                    and not re.search(r'[。：；！？」』）]$', cur['text']))
                same_page = it['page'] == cur['page_last']
                close = (it['top'] - cur['bottom'] < near) if same_page else True
                # justified English wraps early: a lower-case start continues an unfinished sentence
                latin = re.match(r'[（(]?[a-z]', text) and not re.search(r'[。：:；;]$', cur['text'])
                # a form's blank (____) ends its line; the next page's first line is not its continuation
                blank_end = spaced and re.search(r'_{3,}[)）]?$', cur['text']) is not None and not same_page
                blank_end = blank_end or (spaced and re.search(r'https?://\S+$', cur['text']) is not None and re.match(rf'[{CJK}]', text) is not None)
                if (full or latin) and close and not NEW.match(text) and not blank_end:
                    sep = ' ' if re.match(r'[A-Za-z0-9,.;:)\]]', cur['text'][-1]) and re.match(r'[A-Za-z0-9(\[]', text[0]) and not cur['text'].endswith('-') else ''
                    cur['text'] += sep + text
                    cur['x1last'] = it['x1']; cur['bottom'] = it['bottom']; cur['page_last'] = it['page']
                    cur['rest'].append(it['x0'])
                    continue
            cur = dict(t='p', text=text, x0=it['x0'], rest=[], x1last=it['x1'], bottom=it['bottom'], page=it['page'], page_last=it['page'], top=it['top'])
            blocks.append(cur); last_kind = 'line'
    # indentation in em, measured from the body margin: wrapped lines give the block indent, the first line its hang
    for b in blocks:
        if b['t'] != 'p' or 'rest' not in b: continue
        base = min(b['rest']) if b['rest'] else b['x0']
        lo = min(margin, b['x0'], base)      # a line printed left of the body margin pulls the block left, never off-screen
        ind = round((base - lo) / em * 2) / 2
        hang = round((b['x0'] - base) / em * 2) / 2 if b['rest'] else 0.0
        b['ind'], b['hang'] = ind, hang
        b['text'] = glyphs(b['text'])
        for k in ('x0', 'rest', 'x1last', 'bottom', 'page_last', 'top'): b.pop(k)
    for b in blocks:
        if b['t'] == 'p': b['text'] = glyphs(b['text'])
    def cells(t):
        for r in t['rows']:
            for c in r:
                # a Wingdings bullet always starts an item, even where the cell's lines were joined
                c['text'] = glyphs(re.sub(r'(?<=\S)\s*([\uf06c\uf06e\uf0fc⚫])', r'\n\1', c['text']))
                for sb in c.get('blocks', []):
                    if 'text' in sb: sb['text'] = glyphs(sb['text'])
                    if sb.get('t') == 'table': cells(sb)
    for b in blocks:
        if b['t'] == 'cols': b['rows'] = [[glyphs(c) for c in r] for r in b['rows']]
        if b['t'] == 'table': cells(b)
    return blocks, dict(em=em, right=right, margin=margin)


def tidy(tb):
    """An empty cell left on a slot that a cell with text also claims (after stitching a page break) is dropped."""
    occ = {}
    for r, row in enumerate(tb['rows']):
        for c in sorted(row, key=lambda c: not (c.get('text') or c.get('blocks') or c.get('img'))):
            slots = [(r + i, c['c'] + j) for i in range(c['rs']) for j in range(c['cs'])]
            if any(s in occ for s in slots):
                if c.get('text') and not (c.get('blocks') or c.get('img')):
                    # two text pieces read into one slot (a cell the grid split in two): one cell, text in printed order
                    host = occ[next(s for s in slots if s in occ)]
                    first = host in row and row.index(c) < row.index(host)
                    host['text'] = c['text'] + host['text'] if first else host['text'] + c['text']
                    if host['c'] == c['c']:
                        host['cs'] = max(host['cs'], c['cs']); host['rs'] = max(host['rs'], c['rs'])
                    row.remove(c); continue
                if not (c.get('text') or c.get('blocks') or c.get('img')):
                    row.remove(c); continue
            for s_ in slots: occ[s_] = c


def merge_tables(blocks, dropped):
    """A table that carries on at the top of the next page (same frame, nothing in between) is one table."""
    out = []
    for b in blocks:
        prev = out[-1] if out else None
        if b['t'] == 'table' and prev and prev['t'] == 'table' and b['page'] == prev['page_last'] + 1 and same_frame(prev, b):
            merge_continued(prev, b, dropped)
            prev['page_last'] = b['page']; continue
        if b['t'] == 'table': b['page_last'] = b['page']
        out.append(b)
    for b in out:
        if b['t'] == 'table': tidy(b)
    return out


def cn(num):
    """一..九十九 -> int"""
    if num.isdigit(): return int(num)
    if num == '十': return 10
    if num.startswith('十'): return 10 + NUMS.index(num[1]) + 1
    if len(num) >= 2 and num[1] == '十': return (NUMS.index(num[0]) + 1) * 10 + (NUMS.index(num[2]) + 1 if len(num) == 3 else 0)
    return NUMS.index(num[0]) + 1


def classify(blocks):
    """一、… is a section heading. (一)… is a sub-heading only when it is short and not one item of a list:
    a list item has a neighbouring paragraph that carries the next or previous number."""
    def h2num(b):
        if b is None or b['t'] != 'p': return None
        m = re.match(r'^[（(]([一二三四五六七八九十]+)[)）]', b['text'])
        return cn(m.group(1)) if m else None
    for i, b in enumerate(blocks):
        if b['t'] != 'p': continue
        s = b['text']
        if (len(s) <= 40 or (APPX.match(s) and len(s) <= 90)) and H1.match(s) and (not re.search(r'[。：:]$', s) or APPX.match(s)
                                                                                 or (len(s) <= 30 and re.search(r'[：:]$', s))):
            b['t'] = 'h'; b['lv'] = 1
        elif len(s) <= 30 and H2.match(s) and not re.search(r'[。；，：:]$', s):
            n = h2num(b)
            near = [h2num(blocks[k]) for k in range(max(0, i - 2), i)]
            after = [h2num(blocks[k]) for k in range(i + 1, min(len(blocks), i + 3))]
            if n - 1 in near or n + 1 in after: continue
            b['t'] = 'h'; b['lv'] = 2
    return blocks


def attachments(blocks, gid):
    """表/圖 with a caption become attachments: the caption, the table(s) or picture(s) it names."""
    atts = []
    used = set()
    for i, b in enumerate(blocks):
        if b['t'] not in ('p', 'h'): continue
        m = CAPTION.match(b['text'])
        if not m or len(b['text']) > 120: continue
        kind, num, title = m.groups()
        key = label_key(kind, num)
        if key in used: continue
        members = []
        if kind.endswith('表'):
            j = i + 1
            # the table(s) under the caption, with short sub-titles printed between parts of it
            while j < len(blocks) and (blocks[j]['t'] == 'table' or (blocks[j]['t'] == 'p' and (len(blocks[j]['text']) <= 40 or re.fullmatch(r'[（(].{1,150}[）)]',blocks[j]['text']))
                                                                    and not CAPTION.match(blocks[j]['text'])
                                                                    and j + 1 < len(blocks) and blocks[j + 1]['t'] == 'table')):
                members.append(j); j += 1
            if not members:                    # a table printed as a picture
                while j < len(blocks) and blocks[j]['t'] == 'img': members.append(j); j += 1
        else:
            # picture(s) just above the caption, with any short labels printed between them and the caption
            j = i - 1
            while j >= 0 and 'att' not in blocks[j] and (blocks[j]['t'] == 'img' or (blocks[j]['t'] in ('p', 'cols') and len(visible([blocks[j]])) <= (120 if re.match(r'[*＊※]|註', visible([blocks[j]])) else 60)
                                                           and not (blocks[j]['t'] == 'p' and CAPTION.match(blocks[j]['text']))
                                                           and any(blocks[k]['t'] == 'img' for k in range(max(0, j - 3), j)))):
                members.insert(0, j); j -= 1
            # pictures already taken by the caption above them, or none before: the caption sits above its picture
            if not any(blocks[k]['t'] == 'img' for k in members):
                members, j = [], i + 1
                while j < len(blocks) and blocks[j]['t'] == 'img': members.append(j); j += 1
            # Some figures are a native form/grid containing picture examples;
            # its printed 圖 caption follows the whole table.
            if not members and i and blocks[i-1]['t'] == 'table' and '"img"' in json.dumps(blocks[i-1]):
                members = [i-1]
        if not members: continue
        if kind.endswith('表'):
            j = max(members) + 1
            while j < len(blocks) and blocks[j]['t'] == 'p' and re.match(r'^(?:註|※|備註|□|執行日期)', blocks[j]['text']):
                members.append(j); j += 1
        used.add(key)
        aid = f'{gid}-{key}'
        b['cap'] = aid
        for k in members: blocks[k]['att'] = aid
        span = sorted(members + [i])
        atts.append(dict(id=aid, label=kind + num, title=title.strip(), span=span))
    return atts


def link_mentions(blocks, atts):
    by_label = {label_key(*CAPTION.match(a['label']).groups()[:2]): a['id'] for a in atts}
    # 附錄一 / 附件ㄧ sections of the guide itself: a mention jumps to the heading ('#' + block number)
    appx = {}
    for k, b in enumerate(blocks):
        m = APPX.match(b['text']) if b['t'] == 'h' else None
        if m: appx[m.group(1) + m.group(2).replace('ㄧ', '一')] = '#' + str(k)
    # an appendix that captions its own 表1 … (a template with the same numbers as the body's tables): inside that
    # appendix, 表1 means its own table, so those mentions get no link to the body's 表1
    section, own, cur = [], collections.defaultdict(set), None
    for k, b in enumerate(blocks):
        if b['t'] == 'h' and APPX.match(b['text']): cur = k
        section.append(cur)
        m = CAPTION.match(b['text']) if b['t'] == 'p' and not b.get('cap') and cur is not None else None
        if m: own[cur].add(label_key(*m.groups()[:2]))
    for k, b in enumerate(blocks):
        if b['t'] not in ('p', 'h') or b.get('cap'): continue
        links = []
        for m in MENTION.finditer(b['text']):
            key = label_key(m.group(1), m.group(2))
            aid = by_label.get(key)
            if aid and key not in own.get(section[k], ()): links.append([m.start(), m.end(), aid])
        if appx and b['t'] == 'p':
            for m in re.finditer(r'(附錄|附件)\s*([一二三四五六七八九十ㄧ]+|[IVX]+|\d+)?', b['text']):
                key = m.group(1) + (m.group(2) or '').replace('ㄧ', '一')
                target = appx.get(key) or (appx.get(m.group(1)) if not m.group(2) else None)
                if target: links.append([m.start(), m.end(), target])
        if links: b['links'] = sorted(links)


def visible(blocks):
    out = []
    for b in blocks:
        if b['t'] in ('p', 'h'): out.append(b['text'])
        elif b['t'] == 'cols': out.extend(c for r in b['rows'] for c in r)
        elif b['t'] == 'table':
            def cells(t):
                for r in t['rows']:
                    for c in r:
                        out.append(c['text'])
                        if 'diag' in c: out.append(c['diag']['tr'] + c['diag']['mid'] + c['diag']['bl'])
                        for sb in c.get('blocks', []):
                            if sb['t'] == 'p': out.append(sb['text'])
                            elif sb['t'] == 'table': cells(sb)
            cells(b)
    return ''.join(out)


def official_stem(t):
    return re.sub(r'（.*?）', '', t)


def document(path, gid, official, imgdir, with_cover=True):
    """One PDF -> cover lines, blocks, attachments and the character check."""
    pages = read_pages(path, imgdir, gid + '-')
    running = strip_running(pages)
    dropped = [d for p in pages for d in p['dropped']]
    # the cover: page 1 when it holds no section heading
    cover = []
    if with_cover and not any(it['k'] == 'line' and H1.match(it['text']) for it in pages[0]['items']):
        for it in pages[0]['items']:
            if it['k'] != 'line': continue
            t = glyphs(it['text'])
            if cover and ((cover[-1].startswith('【') and '】' not in cover[-1])
                          or (len(cover) == 1 and (cover[0].endswith('：') or official_stem(official).startswith(cover[0] + t)
                                                   or ((cover[0] + t).startswith(official_stem(official)) and not cover[0].startswith(official_stem(official)))))):
                cover[-1] += t
            else: cover.append(t)
        pages[0]['items'] = [it for it in pages[0]['items'] if it['k'] != 'line']
    blocks, geo = build_blocks(pages, spaced=gid.startswith(('farm-', 'plans')))
    blocks = merge_tables(blocks, dropped)
    # A caption printed inside a full-width first row is still a caption.
    # Lift it without changing its text, so both the body and the pop-up can
    # address the same table (including a framed list split over two pages).
    lifted = []
    for block in blocks:
        if block['t'] == 'table' and block['rows'] and len(block['rows'][0]) == 1:
            c = block['rows'][0][0]
            if c['rs'] == 1 and c['cs'] == len(block['widths']) and CAPTION.match(c['text']) and len(c['text']) <= 120:
                lifted.append(dict(t='p',text=c['text'],page=block['page']))
                block['rows'] = block['rows'][1:]; block['nrows'] -= 1
                for row in block['rows']:
                    for cell in row: cell['r'] -= 1
                block['head'] = max(0,block.get('head',0)-1)
        lifted.append(block)
    blocks = lifted
    classify(blocks)
    atts = attachments(blocks, gid)
    link_mentions(blocks, atts)
    # QC: the PDF's printed characters vs ours (+ running headers/footers and repeated table headers we left out)
    raw = page_chars_text(path)
    read = ''.join(t for p in pages for t in p.get('labels', []))     # section numbers read from pictures
    src = collections.Counter(re.sub(r'\s', '', glyphs(raw) + read))
    ours = collections.Counter(re.sub(r'\s', '', glyphs(''.join(cover) + visible(blocks) + ''.join(running) + ''.join(dropped))))
    missing, extra = src - ours, ours - src
    page_map = [[b.get('page', 0), b.get('page_last', b.get('page', 0))] for b in blocks]
    for b in blocks:
        for k in ('page', 'page_last', 'drawing'): b.pop(k, None)
        if b['t'] == 'cols':
            n = len(b.pop('xs')); b['rows'] = [r + [''] * (n - len(r)) for r in b['rows']]
        if b['t'] == 'p' and not b.get('ind'): b.pop('ind', None)
        if b['t'] == 'p' and not b.get('hang'): b.pop('hang', None)
    finalize([b for b in blocks if b['t'] == 'table'])
    return dict(cover=cover, blocks=blocks, atts=atts, running=running, dropped=dropped, pages=len(pages),
                ok=not missing and not extra, missing=missing, extra=extra, glyphs=sum(raw.count(g) for g in GLYPHS), page_map=page_map)


def scanned(path):
    """A PDF with no text layer at all (a scan)."""
    return not re.sub(r'\s', '', page_chars_text(path))


def scan_pages(path, gid, imgdir):
    """The original is only pictures of pages: show each page picture (white margins trimmed), nothing retyped."""
    import pymupdf
    from PIL import Image, ImageOps
    doc = pymupdf.open(path)
    out = []
    for pg in doc:
        pix = pg.get_pixmap(dpi=150, colorspace=pymupdf.csGRAY)
        im = Image.frombytes('L', (pix.width, pix.height), pix.samples)
        box = ImageOps.invert(im).point(lambda v: 255 if v > 40 else 0).getbbox()
        if box:
            pad = 12
            im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
        w, h = round(im.width * 72 / 150), round(im.height * 72 / 150)
        im = im.quantize(colors=16, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)   # 16 greys: same to the eye, half the bytes
        out.append(dict(t='img', img=[dict(src=save_image(im, imgdir, gid + '-'), w=w, h=h)], scan=True))
    return out


def label_text(t): return re.sub(r'（.*?）|\(.*?\)$', '', t).strip()


def convert(gid, cat, fname, outdir, official):
    folder = dict((c[0], c[2]) for c in CATS)[cat]
    path = source_path(cat, fname)
    credit = source_credit(cat, fname)
    imgdir = os.path.join(outdir, 'attach', 'img')
    if scanned(path):
        blocks = scan_pages(path, gid, imgdir)
        title = re.sub(r'\(\d+.*?\)$', '', official)
        doc = dict(id=gid, name=title, cover=[], credit=credit, scan=True, blocks=blocks)
        json.dump(doc, open(os.path.join(outdir, 'text', gid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(f'{gid} {title}: {len(blocks)} pp, scanned PDF without a text layer -> page pictures; SCAN')
        return dict(id=gid, cat=cat, name=title, pages=len(blocks), attach=[], ok=True, scan=True, running=[], dropped=[], glyphs=0)
    d = document(path, gid, official, imgdir)
    cover, blocks, atts = d['cover'], d['blocks'], d['atts']
    attach = []
    for a in atts:
        data = dict(id=a['id'], guide=gid, label=a['label'], title=a['title'], blocks=[blocks[k] for k in a['span']])
        json.dump(data, open(os.path.join(outdir, 'attach', a['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        attach.append(dict(id=a['id'], label=a['label'], title=a['title']))
    oks, notes = [d['ok']], []
    # whole documents published with the guide (Q&A, 修正對照表): attachments holding the full converted document
    for key, label, efile in EXTRAS.get(gid, []):
        aid = f'{gid}-{key}'
        e = document(os.path.join(SRC, folder, efile), aid, official, imgdir, with_cover=False)   # the text starts on page 1
        for b in e['blocks']:
            b.pop('cap', None); b.pop('att', None); b.pop('links', None)
        etitle = ''
        data = dict(id=aid, guide=gid, label=label, title=etitle, doc=True, cover=e['cover'][1:], blocks=e['blocks'])
        json.dump(data, open(os.path.join(outdir, 'attach', aid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        attach.append(dict(id=aid, label=label, title=etitle, doc=True))
        oks.append(e['ok'])
        notes.append(f'{label}: {e["pages"]} pp ' + ('OK' if e['ok'] else f'FAIL missing={"".join(e["missing"].elements())[:60]!r} extra={"".join(e["extra"].elements())[:60]!r}'))
        d['running'] += e['running']; d['dropped'] += e['dropped']; d['glyphs'] += e['glyphs']
    title = cover[0] if cover else re.sub(r'(\(.*?\))+$', '', official)
    doc = dict(id=gid, name=title, cover=cover[1:] if cover else [], credit=credit, blocks=blocks)
    json.dump(doc, open(os.path.join(outdir, 'text', gid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    stats = collections.Counter(b['t'] for b in blocks)
    print(f'{gid} {title}: {d["pages"]} pp, {stats["h"]} headings, {stats["p"]} paras, {stats["table"]} tables, {stats["img"]} pictures, '
          f'{stats["cols"]} column lists, {len(attach)} attachments; dropped {len(d["running"])} header/footer lines, {len(d["dropped"])} repeated cells; '
          + ('OK' if d['ok'] else f'FAIL missing={"".join(d["missing"].elements())[:80]!r} extra={"".join(d["extra"].elements())[:80]!r}')
          + ''.join('; ' + n for n in notes))
    return dict(id=gid, cat=cat, name=title, pages=d['pages'], attach=attach, ok=all(oks), running=d['running'], dropped=d['dropped'],
                glyphs=d['glyphs'], page_map=d['page_map'])


if __name__ == '__main__':
    root = os.path.abspath(sys.argv[1]); only = set(sys.argv[2:])
    outdir = os.path.join(root, 'guides')
    for d in ('text', 'attach', os.path.join('attach', 'img')): os.makedirs(os.path.join(outdir, d), exist_ok=True)
    ipath = os.path.join(outdir, 'index.json')
    old = json.load(open(ipath, encoding='utf-8')) if os.path.exists(ipath) else dict(guides=[])
    have = {g['id']: g for g in old['guides']}
    report = {}
    for gid, cat, official, fname in GUIDES:
        if only and gid not in only and cat not in only: continue
        r = convert(gid, cat, fname, outdir, official)
        report[gid] = r
        have[gid] = dict(id=gid, cat=cat, name=r['name'], official=official, pages=r['pages'], attach=r['attach'])
        if r.get('scan'): have[gid]['scan'] = True
    order = [g[0] for g in GUIDES]
    guides = sorted(have.values(), key=lambda g: order.index(g['id']))
    for g in guides: g['no'] = [x[0] for x in GUIDES if x[1] == g['cat']].index(g['id']) + 1
    # every category is listed, also before any of its guides are converted
    cats = [dict(id=c[0], name=c[1], src=c[3], total=c[4] or sum(1 for x in GUIDES if x[1] == c[0])) for c in CATS]
    for c in cats:
        if c['id'] in CAT_PARENTS: c['parent'] = CAT_PARENTS[c['id']]
    json.dump(dict(cats=cats, guides=guides), open(ipath, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    report_path = os.path.join(HERE, 'report.json')
    previous = json.load(open(report_path, encoding='utf-8')) if os.path.exists(report_path) else {}
    previous.update({k: dict(ok=v['ok'], running=v['running'], dropped=v['dropped'], glyphs=v['glyphs'], page_map=v.get('page_map')) for k, v in report.items()})
    json.dump(previous, open(report_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
