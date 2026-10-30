"""Convert a 附表 PDF into structured blocks (paragraphs + tables with real row/col spans), word for word."""
import re, os, io, hashlib, json
import pdfplumber
import pymupdf

CJK = r'⺀-鿿豈-﫿　-〿＀-￯'
CJK_SP = re.compile(rf'(?<=[{CJK}])[ 　]+(?=[{CJK}])')
FOOTER = re.compile(r'^(-\s*\d+\s*-|第\s*\d+\s*頁(\s*[/，,]?\s*共\s*\d+\s*頁)?|\d+)$')
LIST = re.compile(r'^(?:[一二三四五六七八九十百]+、|（[一二三四五六七八九十百]+）|\(?\d+[\.\)）、](?!\d)|[（(]\d+[）)]|備註|註[一二三四五六七八九十\d]*[：:、]|說明[：:]|[A-Za-z]\.|[□■●○◎※＊*•‧])')
SETTINGS = dict(vertical_strategy='lines', horizontal_strategy='lines', snap_tolerance=3, join_tolerance=3,
                intersection_tolerance=3, edge_min_length=4)


def is_white(col):
    if col is None: return False
    if isinstance(col, (int, float)): col = (col,)
    col = tuple(col)
    if len(col) == 4: return all(v <= 0.02 for v in col)      # CMYK white
    return all(v >= 0.98 for v in col)                          # gray / RGB white


def visible_edges(page):
    """Edges that are drawn as visible lines: skip white fills behind text (they are not cell borders)."""
    out = []
    for e in page.edges:
        if e.get('object_type') == 'rect_edge' or e.get('object_type') == 'rect':
            stroke, fill = e.get('stroke'), e.get('fill')
            if fill and not stroke and is_white(e.get('non_stroking_color')): continue
            if stroke and not fill and is_white(e.get('stroking_color')): continue
        elif is_white(e.get('stroking_color')):
            continue
        out.append(e)
    # text underlines are not cell borders: they touch the text above them and stop short of the cell walls
    xs = [e['x0'] for e in out if e['orientation'] == 'v' and e['bottom'] - e['top'] > 3]
    chars = [c for c in page.chars if c['text'].strip()]

    def walled(x):
        return any(abs(x - v) < 0.8 for v in xs)

    def underline(e):
        if e['orientation'] != 'h' or (walled(e['x0']) and walled(e['x1'])): return False
        y, L = e['top'], e['x1'] - e['x0']
        above = [c for c in chars if e['x0'] - 1 <= (c['x0'] + c['x1']) / 2 <= e['x1'] + 1 and -1 <= y - c['bottom'] <= 1.0]
        return L > 0 and sum(c['x1'] - c['x0'] for c in above) / L > 0.5
    # drop specks (the short sides of thin underline boxes) and underlines
    return [e for e in out if not underline(e) and (e['x1'] - e['x0'] if e['orientation'] == 'h' else e['bottom'] - e['top']) >= 2]


def inked_edge(e, ink, i):
    """Does the line actually print? Lines hidden under a white cover (cut-out gazette frame) do not."""
    pix, k = ink.page(i)
    pts = 7
    for n in range(pts):
        t = (n + 0.5) / pts
        x = (e['x0'] + (e['x1'] - e['x0']) * t) * k
        y = (e['top'] + (e['bottom'] - e['top']) * t) * k
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                xi, yi = int(x) + dx, int(y) + dy
                if 0 <= xi < pix.width and 0 <= yi < pix.height and pix.samples[yi * pix.stride + xi] < 235:
                    return True
    return False


def find_tables(page, ink=None):
    edges = visible_edges(page)
    if ink is not None:
        edges = [e for e in edges if inked_edge(e, ink, page.page_number - 1)]
    V = [e for e in edges if e['orientation'] == 'v']
    H = [e for e in edges if e['orientation'] == 'h']
    if len(V) < 2 or len(H) < 2: return []
    settings = dict(SETTINGS, vertical_strategy='explicit', horizontal_strategy='explicit', explicit_vertical_lines=V, explicit_horizontal_lines=H)
    return page.find_tables(settings)


def clean(s):
    s = s.replace(' ', ' ')
    # keep the PDF's own space characters; spaces are never invented between Chinese characters
    return re.sub(r'[ \t]+', ' ', s).strip()


def join(a, b):
    if a and b and re.match(r'[A-Za-z0-9,.;:)\]]', a[-1]) and re.match(r'[A-Za-z0-9(\[]', b[0]) and not a.endswith('-'):
        return a + ' ' + b
    return a + b


_SPACES = []


class Ink:
    """Which characters actually print: text hidden under a white box (e.g. a cut-out gazette header) is dropped."""
    def __init__(self, path):
        self.doc = pymupdf.open(path)
        self.cache = {}

    def page(self, i):
        if i not in self.cache:
            pix = self.doc[i].get_pixmap(dpi=96, colorspace=pymupdf.csGRAY)
            self.cache = {i: (pix, 96 / 72)}
        return self.cache[i]

    def visible(self, i, c):
        if not c['text'].strip(): return True
        pix, k = self.page(i)
        x0, x1 = int(c['x0'] * k), int(c['x1'] * k) + 1
        y0, y1 = int(c['top'] * k), int(c['bottom'] * k) + 1
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(pix.width, x1), min(pix.height, y1)
        if x1 <= x0 or y1 <= y0: return False
        s = pix.samples
        for y in range(y0, y1):
            row = s[y * pix.stride + x0: y * pix.stride + x1]
            if min(row) < 235: return True
        return False


def printed(page, ink):
    i = page.page_number - 1
    return page.filter(lambda o: o.get('object_type') != 'char' or ink.visible(i, o))


def mark_blanks(page):
    """Form blanks are underlined spaces: show them as a blank line (＿) instead of dropping them."""
    spaces = [c for c in page.chars if c['text'] in (' ', '\u3000')]
    lines = [e for e in page.edges if e['orientation'] == 'h' and e['x1'] - e['x0'] > 3
             and not is_white(e.get('non_stroking_color') if e.get('fill') else e.get('stroking_color'))]
    marked = []
    for e in lines:
        over = [c for c in spaces if e['x0'] - 0.5 <= (c['x0'] + c['x1']) / 2 <= e['x1'] + 0.5 and -1.5 <= e['top'] - c['bottom'] <= 0.8]
        # a blank's underline sits under spaces along most of its length; a cell border runs far past them
        if over and sum(c['x1'] - c['x0'] for c in over) >= 0.6 * (e['x1'] - e['x0']):
            for c in over:
                if c['text'] != '＿': c['text'] = '＿'; marked.append(c)
    # a run of underlined spaces becomes a shorter run of ＿ (about one per 11pt of line)
    marked.sort(key=lambda c: (round(c['top']), c['x0']))
    run = []
    def flush():
        if not run: return
        width = run[-1]['x1'] - run[0]['x0']
        keep = max(2, round(width / 11))
        for k, c in enumerate(run): c['text'] = '＿' if k < keep else ''
        run.clear()
    for c in marked:
        if run and (abs(c['top'] - run[-1]['top']) > 2 or c['x0'] - run[-1]['x1'] > 2): flush()
        run.append(c)
    flush()


def set_spaces(page):
    """Remember where the page has real space characters, so spaces are kept exactly where the PDF has them."""
    global _SPACES
    _SPACES = [c for c in page.chars if c['text'] in (' ', '\u3000')]


def has_space(prev, w):
    lo, hi = prev['x1'] - 1.5, w['x0'] + 1.5
    mid = (w['top'] + w['bottom']) / 2
    return any(lo <= (c['x0'] + c['x1']) / 2 <= hi and c['top'] - 2 <= mid <= c['bottom'] + 2 for c in _SPACES)


def take(words, x0, y0, x1, y1, pad=1):
    """Pull the not-yet-used characters whose centre lies in the box, as word fragments.
    A word that straddles a cell border is split at the border instead of being moved whole."""
    out = []
    for w in words:
        sub = [c for c in w['chars'] if not c.get('_u') and x0 - pad <= (c['x0'] + c['x1']) / 2 <= x1 + pad
               and y0 - pad <= (c['top'] + c['bottom']) / 2 <= y1 + pad]
        if not sub: continue
        for c in sub: c['_u'] = True
        out.append(dict(text=''.join(c['text'] for c in sub), x0=min(c['x0'] for c in sub), x1=max(c['x1'] for c in sub),
                        top=min(c['top'] for c in sub), bottom=max(c['bottom'] for c in sub), chars=sub))
    return out


def lines_of(words, ytol=3):
    """Group words into text lines (top-sorted), each = (x0, x1, top, bottom, text)."""
    # group by vertical overlap, so sub- and superscripts (FEV1.0) stay on their line
    words = sorted(words, key=lambda w: (w['bottom'] - w['top'] < 6, round(w['top']), w['x0']))
    cores, rows = [], []
    for w in words:
        h = max(0.1, w['bottom'] - w['top'])
        best = None
        for k, (ct, cb) in enumerate(cores):
            ov = min(cb, w['bottom']) - max(ct, w['top'])
            if ov >= 0.5 * min(h, cb - ct) and (best is None or ov > best[1]): best = (k, ov)
        if best: rows[best[0]].append(w)
        else:
            cores.append((w['top'], w['bottom'])); rows.append([w])
    order = sorted(range(len(rows)), key=lambda k: cores[k][0])
    rows = [rows[k] for k in order]
    out = []
    for r in rows:
        r.sort(key=lambda w: w['x0'])
        txt = ''
        prev = None
        for w in r:
            if prev is not None and w['x0'] - prev['x1'] > 1.0:
                cjk_both = re.search(rf'[{CJK}]$', prev['text']) and re.match(rf'[{CJK}]', w['text'])
                if not cjk_both or has_space(prev, w):
                    txt += ' '
            txt += w['text']; prev = w
        w = r[0]; t0 = w['text']
        if re.match(rf'[{CJK}]', t0): w0 = (w['x1'] - w['x0']) / max(1, len(t0))
        else:
            m = re.match(rf'[^{CJK}]+', t0)
            w0 = (w['x1'] - w['x0']) * len(m.group()) / max(1, len(t0))
        out.append(dict(x0=r[0]['x0'], x1=r[-1]['x1'], top=min(w['top'] for w in r), bottom=max(w['bottom'] for w in r), text=clean(txt), w0=w0))
    return [l for l in out if l['text']]


def flow(lines, right, left=None, size=None, incell=False):
    """Join wrapped lines into paragraphs. A line continues the previous one when the previous reached the right edge
    and the current line does not start with a list/notes marker."""
    paras = []
    for l in lines:
        if paras:
            p = paras[-1]
            gap = right - p['x1last']
            full = gap < max(14, (size or 10) * 1.6) or gap < l.get('w0', 0) + 4
            if full and not LIST.match(l['text']) and (incell or l['top'] - p['bottom'] < 22):
                p['text'] = join(p['text'], l['text']); p['x1last'] = l['x1']; p['bottom'] = l['bottom']; continue
        paras.append(dict(text=l['text'], x1last=l['x1'], bottom=l['bottom'], x0=l['x0'], top=l['top'], x1=l['x1']))
    return paras


def cluster(vals, tol=2.5):
    vals = sorted(vals); out = []
    for v in vals:
        if out and v - out[-1][-1] <= tol: out[-1].append(v)
        else: out.append([v])
    return [sum(c) / len(c) for c in out]


def idx(grid, v):
    return min(range(len(grid)), key=lambda i: abs(grid[i] - v))


def table_struct(page, t, words, images, imgsave, children=()):
    cells = [c for c in t.cells]
    xs = cluster([c[0] for c in cells] + [c[2] for c in cells])
    ys = cluster([c[1] for c in cells] + [c[3] for c in cells])
    # slivers (shading a few points narrower than the border) are not real columns
    while len(xs) > 2:
        gaps = [(xs[i + 1] - xs[i], i) for i in range(len(xs) - 1)]
        g, i = min(gaps)
        if g >= 6: break
        xs.pop(i + 1 if i == 0 else i)
    grid = {}
    for (x0, y0, x1, y1) in cells:
        r0, r1, c0, c1 = idx(ys, y0), idx(ys, y1), idx(xs, x0), idx(xs, x1)
        if r1 <= r0 or c1 <= c0: continue
        inside = take(words, x0, y0, x1, y1)
        ls = lines_of(inside)
        kids = [ch for ch in children if x0 - 2 <= ch['x0'] and ch['x1'] <= x1 + 2 and y0 - 2 <= ch['top'] <= y1 + 2]
        if kids:
            sub = [dict(t='p', text=p['text'], top=p['top']) for p in flow(ls, x1 - 2, incell=True)] + kids
            sub.sort(key=lambda b: b['top'])
            cell = dict(r=r0, c=c0, rs=r1 - r0, cs=c1 - c0, text='', blocks=sub)
            grid[(r0, c0)] = cell
            continue
        # vertical text: every line is 1-2 chars -> join without breaks
        if len(ls) > 1 and all(len(l['text']) <= 2 for l in ls) and any(re.search(rf'[{CJK}]', l['text']) for l in ls) \
                and max(b['top'] - a['bottom'] for a, b in zip(ls, ls[1:])) < (ls[0]['bottom'] - ls[0]['top']) * 0.9:
            text = ''.join(l['text'] for l in ls)
        else:
            text = '\n'.join(p['text'] for p in flow(ls, x1 - 2, incell=True))
        here = [im for im in images if not im.get('_used') and x0 - 2 <= (im['x0'] + im['x1']) / 2 <= x1 + 2 and y0 - 2 <= (im['top'] + im['bottom']) / 2 <= y1 + 2]
        for im in here: im['_used'] = True
        if here and text:
            # text and pictures in one cell: keep them in their printed order
            sub = [dict(t='p', text=p['text'], top=p['top']) for p in flow(ls, x1 - 2, incell=True)]
            sub += [dict(t='img', img=[imgsave(im)], top=im['top']) for im in here]
            sub.sort(key=lambda b: b['top'])
            grid[(r0, c0)] = dict(r=r0, c=c0, rs=r1 - r0, cs=c1 - c0, text='', blocks=sub)
            continue
        cell = dict(r=r0, c=c0, rs=r1 - r0, cs=c1 - c0, text=text)
        if here: cell['img'] = [imgsave(im) for im in here]
        grid[(r0, c0)] = cell
    nrows, ncols = len(ys) - 1, len(xs) - 1
    widths = [round(xs[i + 1] - xs[i], 1) for i in range(ncols)]
    tb = dict(t='table', nrows=nrows, widths=widths, xs=xs, x0=t.bbox[0], x1=t.bbox[2], top=t.bbox[1], bottom=t.bbox[3])
    regroup(tb, list(grid.values()))
    # header rows: the span of the tallest cell in row 0
    first = tb['rows'][0] if tb['rows'] else []
    if not first or (len(first) == 1 and first[0]['cs'] == ncols) or ncols == 1:
        tb['head'] = 0          # a full-width title row or a one-column form is not a column header
    else:
        tb['head'] = min(3, max(c['rs'] for c in first))
    return tb


def regroup(tb, cells):
    tb['nrows'] = max([c['r'] + c['rs'] for c in cells] + [0])
    by = {}
    for c in cells: by.setdefault(c['r'], []).append(c)
    tb['rows'] = [sorted(by.get(r, []), key=lambda c: c['c']) for r in range(tb['nrows'])]


def finalize(bl):
    for b in bl:
        if 'xs' in b: b['widths'] = [round(b['xs'][i + 1] - b['xs'][i], 1) for i in range(len(b['xs']) - 1)]
        for k in ('top', 'x0', 'x1', 'bottom', 'nrows', 'xs'): b.pop(k, None)
        for r in b.get('rows', []):
            for c in r:
                c.pop('r', None)
                if 'blocks' in c: finalize(c['blocks'])


NEWITEM = re.compile(r'^\d+(?:[-.]\d+)+')


def blank(c):
    return not c['text'] and not c.get('img') and not c.get('blocks')


def same_frame(a, b):
    return abs(a['xs'][0] - b['xs'][0]) < 4 and abs(a['xs'][-1] - b['xs'][-1]) < 4


def remap(tb, U):
    xs = tb['xs']
    for r in tb['rows']:
        for c in r:
            a, b = idx(U, xs[c['c']]), idx(U, xs[c['c'] + c['cs']])
            c['c'], c['cs'] = a, max(1, b - a)
    tb['xs'] = U


def merge_continued(prev, it, dropped):
    """Append a table continued on the next page; stitch a row/cell that the page break split."""
    if len(prev['xs']) != len(it['xs']) or any(abs(a - b) > 3 for a, b in zip(prev['xs'], it['xs'])):
        U = cluster(prev['xs'] + it['xs'], 3)
        remap(prev, U); remap(it, U)
    h = prev['head']
    rows = it['rows']
    if h and row_texts(it, h) == row_texts(prev, h):
        dropped.extend(c['text'] for r in rows[:h] for c in r)
        rows = rows[h:]
    cells = [c for r in rows for c in r]
    if not cells: return
    base = min(c['r'] for c in cells)
    pcells = [c for r in prev['rows'] for c in r]
    L = prev['nrows'] - 1
    occ = {}
    for c in pcells:
        for rr in range(c['r'], c['r'] + c['rs']):
            for cc in range(c['c'], c['c'] + c['cs']): occ[(rr, cc)] = c
    first = [c for c in cells if c['r'] == base]
    cont = bool(first) and all(occ.get((L, x['c'])) is not None and occ[(L, x['c'])]['c'] == x['c'] and occ[(L, x['c'])]['cs'] == x['cs'] for x in first) \
        and any(blank(x) for x in first) and not any(NEWITEM.match(x['text']) for x in first if x['text']) \
        and all(not blank(occ[(L, x['c'])]) for x in first if not blank(x))
    offset = (L - base) if cont else (L + 1 - base)
    for c in cells: c['r'] += offset

    def absorb(p, x):
        if x['text']:
            p['text'] = (p['text'] + '\n' + x['text']) if LIST.match(x['text']) else join(p['text'], x['text'])
        if x.get('img'): p.setdefault('img', []).extend(x['img'])
        if x.get('blocks'): p.setdefault('blocks', []).extend(x['blocks'])
        cells.remove(x)

    if cont:
        for x in first:
            p = occ[(L, x['c'])]
            p['rs'] += x['rs'] - 1
            absorb(p, x)
    else:
        # a new row starts, but tall cells that reach the page bottom may carry on across the break
        lead = min(first, key=lambda x: x['c']) if first else None
        new_group = lead is not None and not blank(lead)
        for x in first:
            p = occ.get((L, x['c']))
            if p is None or p['c'] != x['c'] or p['cs'] != x['cs'] or p['r'] == L: continue
            midsentence = x['text'] and not LIST.match(x['text']) and not re.match(r'^[\d一二三四五六七八九十（(「]', x['text']) \
                and not blank(p) and not re.search(r'[。」]$', p['text'])
            if blank(x) or (not new_group and midsentence):
                p['rs'] = (x['r'] + x['rs']) - p['r']
                absorb(p, x)
    regroup(prev, pcells + cells)


def row_texts(table, n):
    return [tuple(c['text'] for c in r) for r in table['rows'][:n]]


def page_chars_text(path):
    out = []
    ink = Ink(path)
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            out.append(''.join(c['text'] for c in printed(page.dedupe_chars(tolerance=1), ink).chars))
    return ''.join(out)


def convert(path, annex_id, imgdir, imgprefix):
    blocks = []
    footers = []
    dropped = []
    ink = Ink(path)
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages):
            page = printed(page.dedupe_chars(tolerance=1), ink)
            mark_blanks(page)
            words = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False, use_text_flow=False, return_chars=True)
            set_spaces(page)
            images = [dict(im) for im in page.images if (im['x1'] - im['x0']) > 4 and (im['bottom'] - im['top']) > 4]

            def imgsave(im, page=page):
                bbox = (max(im['x0'], 0), max(im['top'], 0), min(im['x1'], page.width), min(im['bottom'], page.height))
                pi = page.crop(bbox).to_image(resolution=200)
                buf = io.BytesIO(); pi.original.save(buf, format='PNG'); data = buf.getvalue()
                name = imgprefix + hashlib.sha1(data).hexdigest()[:12] + '.png'
                with open(os.path.join(imgdir, name), 'wb') as f: f.write(data)
                return dict(src=name, w=round(im['x1'] - im['x0']), h=round(im['bottom'] - im['top']))

            tables = find_tables(page, ink)
            tables = [t for t in tables if len(t.cells) >= 2]
            # nested tables: build innermost first, then hand them to the table that contains them
            def inside(a, b):
                return a is not b and b.bbox[0] - 2 <= a.bbox[0] and a.bbox[2] <= b.bbox[2] + 2 and b.bbox[1] - 2 <= a.bbox[1] and a.bbox[3] <= b.bbox[3] + 2
            built = {}
            for t in sorted(tables, key=lambda t: (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1])):
                kids = [built.pop(id(k)) for k in tables if id(k) in built and inside(k, t)]
                built[id(t)] = table_struct(page, t, words, images, imgsave, kids)
            items = list(built.values())
            # vector figures outside tables (e.g. hazard-label diamonds): keep them as a picture of that drawing
            tb_boxes = [(it['x0'], it['top'], it['x1'], it['bottom']) for it in items if it['t'] == 'table']
            curves = [c for c in page.curves if not is_white(c.get('stroking_color')) and not any(
                b[0] - 2 <= c['x0'] and c['x1'] <= b[2] + 2 and b[1] - 2 <= c['top'] and c['bottom'] <= b[3] + 2 for b in tb_boxes)]
            groups = []
            for c in sorted(curves, key=lambda c: (c['top'], c['x0'])):
                box = [c['x0'], c['top'], c['x1'], c['bottom']]
                for g in groups:
                    if box[0] <= g[2] + 12 and g[0] <= box[2] + 12 and box[1] <= g[3] + 12 and g[1] <= box[3] + 12:
                        g[:] = [min(g[0], box[0]), min(g[1], box[1]), max(g[2], box[2]), max(g[3], box[3])]; break
                else:
                    groups.append(box)
            for g in groups:
                if (g[2] - g[0]) * (g[3] - g[1]) < 300: continue
                inside = take(words, g[0], g[1], g[2], g[3], pad=0)
                dropped.extend(w['text'] for w in inside)
                fig = dict(x0=g[0] - 2, top=g[1] - 2, x1=g[2] + 2, bottom=g[3] + 2)
                items.append(dict(t='img', img=[imgsave(fig)], top=g[1]))
            free = take(words, -1e6, -1e6, 1e6, 1e6)
            ls = lines_of(free)
            # footer: last line near page bottom that is just a page number
            ls2 = []
            for l in ls:
                if l['top'] > page.height - 90 and FOOTER.match(l['text']):
                    footers.append(l['text']); continue
                ls2.append(l)
            right = max([l['x1'] for l in ls2] + [it['x1'] for it in items if it['t'] == 'table'] + [0])
            # paragraphs, split around tables
            for p in flow(ls2, right):
                centered = abs(((p['x0'] + p['x1last']) / 2) - page.width / 2) < 25 and p['x0'] > 90
                items.append(dict(t='p', text=p['text'], top=p['top'], center=centered))
            for im in images:
                if not im.get('_used'):
                    items.append(dict(t='img', img=[imgsave(im)], top=im['top']))
            items.sort(key=lambda it: it['top'])
            for it in items:
                if it['t'] == 'table' and blocks and blocks[-1]['t'] == 'table' and 'xs' in blocks[-1] and same_frame(blocks[-1], it) \
                        and it is items[0]:
                    merge_continued(blocks[-1], it, dropped)
                    continue
                blocks.append(it)
    finalize(blocks)
    return dict(id=annex_id, blocks=blocks, footers=footers, dropped=dropped)


def visible_text(annex):
    out = []
    for b in annex['blocks']:
        if b['t'] == 'p': out.append(b['text'])
        elif b['t'] == 'table':
            for r in b['rows']:
                for c in r:
                    out.append(c['text'])
                    if 'blocks' in c: out.append(visible_text(dict(blocks=c['blocks'])))
    return ''.join(out)
