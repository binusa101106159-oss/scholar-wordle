"""Convert 職業病認定參考指引 PDFs into the JSON the 指引 tab reads (guides/), word for word.

Tables, page-split tables and pictures reuse the laws converter (../laws-build/annex.py) unchanged; this file
adds what a guide needs on top: running page headers/footers, paragraphs that flow across pages, headings,
the cover block, multi-column lists, captions for 表/圖, and links from the text to them.

    python3 build.py ../..            # all guides in catalog.GUIDES
    python3 build.py ../.. e01 e05    # only these (index.json keeps the others)
"""
import collections, json, os, re, sys, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'laws-build'))
import pdfplumber
from annex import (Ink, printed, find_tables, table_struct, take, lines_of, set_spaces, save_image, is_white,
                   same_frame, merge_continued, finalize, page_chars_text, CJK)
from guides_catalog import CATS, GUIDES, SRC, CREDIT

NUMS = '一二三四五六七八九十'
# a line that starts one of these begins a new paragraph even when the line before it reached the right edge
NEW = re.compile(r'^(?:[一二三四五六七八九十百]+、|[（(][一二三四五六七八九十百]+[)）]|\(?\d+[\.\)）、](?!\d)|[（(]\d+[）)]|\d+\)'
                 r'|\[\d+\]|[A-Za-z][\.\)、](?![A-Za-z])|(?:附)?[表圖]\s*(?:[一二三四五六七八九十]+|\d+)[、：:．.\s]|註[一二三四五六七八九十\d]*[：:、]'
                 r'|備註|說明[：:]|[□■●○◎※＊*•‧])')
CAPTION = re.compile(r'^((?:附)?[表圖])\s*([一二三四五六七八九十]+|\d+)\s*[、：:．.]?\s*(.*)$', re.S)
H1 = re.compile(r'^(?:[一二三四五六七八九十]+、|參考文獻|參考資料|附錄|附件|附表)')
H2 = re.compile(r'^[（(][一二三四五六七八九十]+[)）]')
MENTION = re.compile(r'((?:附)?[表圖])\s*([一二三四五六七八九十]+|\d+)(?![一二三四五六七八九十\d])')
# Wingdings bullets have no Unicode meaning; the PDF draws them as a black dot
GLYPHS = {'': '●'}


def glyphs(s):
    return ''.join(GLYPHS.get(c, c) for c in s)


def label_key(kind, num):
    n = num if num.isdigit() else str(NUMS.index(num) + 1) if len(num) == 1 else \
        str(10 + (NUMS.index(num[1]) + 1 if len(num) == 2 and num[0] == '十' else 0)) if num[0] == '十' else \
        str((NUMS.index(num[0]) + 1) * 10 + (NUMS.index(num[2]) + 1 if len(num) == 3 else 0))
    return ('f' if kind.endswith('圖') else 't') + n


# ── page reading ──
def read_pages(path, imgdir, prefix):
    ink = Ink(path)
    pages = []
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages):
            page = printed(page.dedupe_chars(tolerance=1), ink)
            words = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False, use_text_flow=False, return_chars=True)
            set_spaces(page)
            images = []
            for im in page.images:
                if im['x1'] - im['x0'] <= 4 or im['bottom'] - im['top'] <= 4: continue
                mask = im['stream'].attrs.get('SMask')
                if mask is not None:
                    stream = mask.resolve()
                    if stream.attrs.get('Decode', [0, 1]) == [0, 1] and not any(stream.get_data()): continue
                images.append(dict(im))

            def imgsave(im, page=page):
                bbox = (max(im['x0'], 0), max(im['top'], 0), min(im['x1'], page.width), min(im['bottom'], page.height))
                pi = page.crop(bbox).to_image(resolution=200)
                return dict(src=save_image(pi.original, imgdir, prefix), w=round(im['x1'] - im['x0']), h=round(im['bottom'] - im['top']))

            tables = [t for t in find_tables(page, ink) if len(t.cells) >= 2]
            def inside(a, b):
                return a is not b and b.bbox[0] - 2 <= a.bbox[0] and a.bbox[2] <= b.bbox[2] + 2 and b.bbox[1] - 2 <= a.bbox[1] and a.bbox[3] <= b.bbox[3] + 2
            built = {}
            for t in sorted(tables, key=lambda t: (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1])):
                kids = [built.pop(id(k)) for k in tables if id(k) in built and inside(k, t)]
                built[id(t)] = table_struct(page, t, words, images, imgsave, kids)
            items = [dict(k='table', tb=tb, top=tb['top'], bottom=tb['bottom']) for tb in built.values()]
            dropped = []
            # vector drawings outside tables become a picture of the drawing (same rule as the laws converter)
            boxes = [(it['tb']['x0'], it['top'], it['tb']['x1'], it['bottom']) for it in items]
            curves = [c for c in page.curves if not is_white(c.get('stroking_color')) and not any(
                b[0] - 2 <= c['x0'] and c['x1'] <= b[2] + 2 and b[1] - 2 <= c['top'] and c['bottom'] <= b[3] + 2 for b in boxes)]
            groups = []
            for c in sorted(curves, key=lambda c: (c['top'], c['x0'])):
                box = [c['x0'], c['top'], c['x1'], c['bottom']]
                for g in groups:
                    if box[0] <= g[2] + 12 and g[0] <= box[2] + 12 and box[1] <= g[3] + 12 and g[1] <= box[3] + 12:
                        g[:] = [min(g[0], box[0]), min(g[1], box[1]), max(g[2], box[2]), max(g[3], box[3])]; break
                else: groups.append(box)
            for g in groups:
                if (g[2] - g[0]) * (g[3] - g[1]) < 300: continue
                dropped.extend(w['text'] for w in take(words, g[0], g[1], g[2], g[3], pad=0))
                fig = dict(x0=g[0] - 2, top=g[1] - 2, x1=g[2] + 2, bottom=g[3] + 2)
                items.append(dict(k='img', img=imgsave(fig), top=g[1], bottom=g[3], x0=g[0], x1=g[2], drawing=True))
            for im in images:
                if not im.get('_used'):
                    items.append(dict(k='img', img=imgsave(im), top=im['top'], bottom=im['bottom'], x0=im['x0'], x1=im['x1']))
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
            pages.append(dict(items=items, height=page.height, width=page.width, dropped=dropped))
    return pages


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
def build_blocks(pages):
    lines = [it for p in pages for it in p['items'] if it['k'] == 'line']
    em = statistics.median(round(l['bottom'] - l['top']) for l in lines) or 14
    longs = [round(l['x1']) for l in lines if len(l['text']) > 15]
    right = max(set(longs), key=lambda x: sum(1 for v in longs if abs(v - x) <= 2)) if longs else 500
    margin = statistics.mode(round(l['x0']) for l in lines)
    blocks = []
    cur = None          # open paragraph
    last_kind = None
    for p in pages:
        for it in p['items']:
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
                full = right - cur['x1last'] < max(14, em * 1.6)
                same_page = it['page'] == cur['page_last']
                close = (it['top'] - cur['bottom'] < em * 1.2) if same_page else True
                # justified English wraps early: a lower-case start continues an unfinished sentence
                latin = re.match(r'[a-z]', text) and not re.search(r'[。：:；;]$', cur['text'])
                if (full or latin) and close and not NEW.match(text):
                    sep = ' ' if re.match(r'[A-Za-z0-9,.;:)\]]', cur['text'][-1]) and re.match(r'[A-Za-z0-9(\[]', text[0]) and not cur['text'].endswith('-') else ''
                    cur['text'] += sep + text
                    cur['x1last'] = it['x1']; cur['bottom'] = it['bottom']; cur['page_last'] = it['page']
                    cur['rest'].append(it['x0'])
                    continue
            cur = dict(t='p', text=text, x0=it['x0'], rest=[], x1last=it['x1'], bottom=it['bottom'], page=it['page'], page_last=it['page'], top=it['top'])
            blocks.append(cur); last_kind = 'line'
    # indentation in em, measured from the body margin: wrapped lines give the block indent, the first line its hang
    for b in blocks:
        if b['t'] != 'p': continue
        base = min(b['rest']) if b['rest'] else b['x0']
        lo = min(margin, b['x0'], base)      # a line printed left of the body margin pulls the block left, never off-screen
        ind = round((base - lo) / em * 2) / 2
        hang = round((b['x0'] - base) / em * 2) / 2 if b['rest'] else 0.0
        b['ind'], b['hang'] = ind, hang
        b['text'] = glyphs(b['text'])
        for k in ('x0', 'rest', 'x1last', 'bottom', 'page_last', 'top'): b.pop(k)
    def cells(t):
        for r in t['rows']:
            for c in r:
                # a Wingdings bullet always starts an item, even where the cell's lines were joined
                c['text'] = glyphs(re.sub(r'(?<=\S)\s*\uf06c', '\n\uf06c', c['text']))
                for sb in c.get('blocks', []):
                    if 'text' in sb: sb['text'] = glyphs(sb['text'])
                    if sb.get('t') == 'table': cells(sb)
    for b in blocks:
        if b['t'] == 'cols': b['rows'] = [[glyphs(c) for c in r] for r in b['rows']]
        if b['t'] == 'table': cells(b)
    return blocks, dict(em=em, right=right, margin=margin)


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
        if len(s) <= 40 and H1.match(s) and not re.search(r'[。：:]$', s):
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
        if b['t'] != 'p': continue
        m = CAPTION.match(b['text'])
        if not m or len(b['text']) > 120: continue
        kind, num, title = m.groups()
        key = label_key(kind, num)
        if key in used: continue
        members = []
        if kind.endswith('表'):
            j = i + 1
            while j < len(blocks) and blocks[j]['t'] == 'table': members.append(j); j += 1
        else:
            # picture(s) just above the caption, with any short labels printed between them and the caption
            j = i - 1
            while j >= 0 and (blocks[j]['t'] == 'img' or (blocks[j]['t'] in ('p', 'cols') and len(visible([blocks[j]])) <= 60
                                                           and any(blocks[k]['t'] == 'img' for k in range(max(0, j - 3), j)))):
                members.insert(0, j); j -= 1
            if not any(blocks[k]['t'] == 'img' for k in members):
                members, j = [], i + 1
                while j < len(blocks) and blocks[j]['t'] == 'img': members.append(j); j += 1
        if not members: continue
        used.add(key)
        aid = f'{gid}-{key}'
        b['cap'] = aid
        for k in members: blocks[k]['att'] = aid
        span = sorted(members + [i])
        atts.append(dict(id=aid, label=kind + num, title=title.strip(), span=span))
    return atts


def link_mentions(blocks, atts):
    by_label = {a['label']: a['id'] for a in atts}
    for b in blocks:
        if b['t'] not in ('p', 'h') or b.get('cap'): continue
        links = []
        for m in MENTION.finditer(b['text']):
            aid = by_label.get(m.group(1) + m.group(2))
            if aid: links.append([m.start(), m.end(), aid])
        if links: b['links'] = links


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


def convert(gid, cat, fname, outdir, official):
    path = os.path.join(SRC, dict((c[0], c[2]) for c in CATS)[cat], fname)
    imgdir = os.path.join(outdir, 'attach', 'img')
    pages = read_pages(path, imgdir, gid + '-')
    running = strip_running(pages)
    dropped = [d for p in pages for d in p['dropped']]
    # the cover: page 1 when it holds no section heading
    cover = []
    if not any(it['k'] == 'line' and H1.match(it['text']) for it in pages[0]['items']):
        cover = []
        for it in pages[0]['items']:
            if it['k'] != 'line': continue
            t = glyphs(it['text'])
            if cover and ((cover[-1].startswith('【') and '】' not in cover[-1])
                          or (len(cover) == 1 and official_stem(official).startswith(cover[0] + t))):
                cover[-1] += t
            else: cover.append(t)
        pages[0]['items'] = [it for it in pages[0]['items'] if it['k'] != 'line']
    blocks, geo = build_blocks(pages)
    blocks = merge_tables(blocks, dropped)
    classify(blocks)
    atts = attachments(blocks, gid)
    link_mentions(blocks, atts)
    # QC: the PDF's printed characters vs ours (+ running headers/footers and repeated table headers we left out)
    src = collections.Counter(re.sub(r'\s', '', glyphs(page_chars_text(path))))
    ours = collections.Counter(re.sub(r'\s', '', ''.join(cover) + visible(blocks) + ''.join(running) + ''.join(dropped)))
    missing, extra = src - ours, ours - src
    pages_n = len(pages)
    for b in blocks:
        for k in ('page', 'page_last', 'drawing'): b.pop(k, None)
        if b['t'] == 'cols':
            n = len(b.pop('xs')); b['rows'] = [r + [''] * (n - len(r)) for r in b['rows']]
        if b['t'] == 'p' and not b.get('ind'): b.pop('ind', None)
        if b['t'] == 'p' and not b.get('hang'): b.pop('hang', None)
    finalize([b for b in blocks if b['t'] == 'table'])
    attach = []
    for a in atts:
        data = dict(id=a['id'], guide=gid, label=a['label'], title=a['title'], blocks=[blocks[k] for k in a['span']])
        json.dump(data, open(os.path.join(outdir, 'attach', a['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        attach.append(dict(id=a['id'], label=a['label'], title=a['title']))
    title = cover[0] if cover else os.path.splitext(fname)[0]
    doc = dict(id=gid, name=title, cover=cover[1:] if cover else [], credit=CREDIT, blocks=blocks)
    json.dump(doc, open(os.path.join(outdir, 'text', gid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    stats = collections.Counter(b['t'] for b in blocks)
    ok = not missing and not extra
    print(f'{gid} {title}: {pages_n} pp, {stats["h"]} headings, {stats["p"]} paras, {stats["table"]} tables, {stats["img"]} pictures, '
          f'{stats["cols"]} column lists, {len(atts)} attachments; dropped {len(running)} header/footer lines, {len(dropped)} repeated cells; '
          + ('OK' if ok else f'FAIL missing={"".join(missing.elements())[:80]!r} extra={"".join(extra.elements())[:80]!r}'))
    return dict(id=gid, cat=cat, name=title, pages=pages_n, attach=attach, ok=ok, running=running, dropped=dropped,
                glyphs=sum(page_chars_text(path).count(g) for g in GLYPHS))


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
    order = [g[0] for g in GUIDES]
    guides = sorted(have.values(), key=lambda g: order.index(g['id']))
    for g in guides: g['no'] = [x[0] for x in GUIDES if x[1] == g['cat']].index(g['id']) + 1
    cats = [dict(id=c[0], name=c[1], src=c[3], total=c[4] or sum(1 for x in GUIDES if x[1] == c[0]))
            for c in CATS if any(g['cat'] == c[0] for g in guides)]
    json.dump(dict(cats=cats, guides=guides), open(ipath, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    json.dump({k: dict(ok=v['ok'], running=v['running'], dropped=v['dropped'], glyphs=v['glyphs']) for k, v in report.items()},
              open(os.path.join(HERE, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
