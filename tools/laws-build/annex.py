"""Convert a 附表 PDF into structured blocks (paragraphs + tables with real row/col spans), word for word."""
import re, os, io, hashlib, json, glob, shutil, collections
from PIL import Image
import pdfplumber
import pymupdf
from manual import raster_text

CJK = r'⺀-鿿豈-﫿　-〿＀-￯'
CJK_SP = re.compile(rf'(?<=[{CJK}])[ 　]+(?=[{CJK}])')
FOOTER = re.compile(r'^(-\s*\d+\s*-|第\s*\d+\s*頁(\s*[/，,]?\s*共\s*\d+\s*頁)?|附表[一二三四五六七八九十]+\s*[～~]\s*\d+|\d+)$')
LIST = re.compile(r'^(?:[一二三四五六七八九十百]+、|（[一二三四五六七八九十百]+）|\(?\d+[\.\)）、](?!\d)|[（(]\d+[）)]|備註|註[一二三四五六七八九十\d]*[：:、]|說明[：:]|[A-Za-z]\.|[□■●○◎※＊*•‧])')
SETTINGS = dict(vertical_strategy='lines', horizontal_strategy='lines', snap_tolerance=1.6, join_tolerance=1.6,
                intersection_tolerance=2, edge_min_length=4)


def save_image(image, imgdir, prefix):
    """Reuse a pixel-identical asset, keeping PNG compression changes out of site diffs."""
    rgba = image.convert('RGBA')
    pixels = rgba.tobytes()
    published = os.environ.get('LAWS_IMAGE_CACHE', os.path.abspath(os.path.join(os.path.dirname(__file__),'../../laws/annex/img')))
    candidates = sorted(glob.glob(os.path.join(published,prefix+'*.png'))) + sorted(glob.glob(os.path.join(imgdir,prefix+'*.png')))
    for path in candidates:
        with Image.open(path) as old:
            if old.size == image.size and old.convert('RGBA').tobytes() == pixels:
                target = os.path.join(imgdir,os.path.basename(path))
                if os.path.abspath(target)!=os.path.abspath(path): shutil.copyfile(path,target)
                return os.path.basename(path)
    buf = io.BytesIO()
    image.save(buf, format='PNG')
    data = buf.getvalue()
    name = prefix + hashlib.sha1(data).hexdigest()[:12] + '.png'
    with open(os.path.join(imgdir, name), 'wb') as f:
        f.write(data)
    return name


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


def inked_edge(e, ink, i, threshold=235):
    """Does the line actually print? Lines hidden under a white cover (cut-out gazette frame) do not."""
    pix, k = ink.page(i)
    samples = ink.pixels
    ox, oy = ink.off
    pts = 7
    for n in range(pts):
        t = (n + 0.5) / pts
        x = (e['x0'] - ox + (e['x1'] - e['x0']) * t) * k
        y = (e['top'] - oy + (e['bottom'] - e['top']) * t) * k
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                xi, yi = int(x) + dx, int(y) + dy
                if 0 <= xi < pix.width and 0 <= yi < pix.height and samples[yi * pix.stride + xi] < threshold:
                    return True
    return False


def find_tables(page, ink=None):
    raw_edges = edges = visible_edges(page)
    if ink is not None:
        edges = [e for e in edges if inked_edge(e, ink, page.page_number - 1)]
    V = [e for e in edges if e['orientation'] == 'v']
    H = [e for e in edges if e['orientation'] == 'h']
    if len(V) < 2 or len(H) < 2: return []
    settings = dict(SETTINGS, vertical_strategy='explicit', horizontal_strategy='explicit', explicit_vertical_lines=V, explicit_horizontal_lines=H)
    tables = page.find_tables(settings)
    closing=[]
    for table in tables:
        x0,y0,x1,y1=table.bbox
        buckets={}
        for cell in table.cells:
            for row in range(int((cell[1]-1)//20),int((cell[3]+1)//20)+1):buckets.setdefault(row,[]).append(cell)
        orphan=[c for c in page.chars if c['text'].strip() and x0<(c['x0']+c['x1'])/2<x1 and y0<(c['top']+c['bottom'])/2<y1
                and not any(a-1<=(c['x0']+c['x1'])/2<=b+1 and u-1<=(c['top']+c['bottom'])/2<=v+1
                            for a,u,b,v in buckets.get(int(((c['top']+c['bottom'])/2)//20),[]))]
        if orphan:
            # The last column may continue past the physical page with no
            # bottom rule. Close the temporary frame so its text stays in the
            # spanning cell; page stitching removes this artificial boundary.
            closing.append(dict(x0=x0,x1=x1,top=y1,bottom=y1,orientation='h',object_type='line',width=x1-x0,height=0))
    if closing:
        H=H+closing
        tables=page.find_tables(dict(settings,explicit_horizontal_lines=H))
    # A borderless body row can still have vertical walls: Word emits separate
    # wall segments for every isotope, leaving a gap for the spanning element
    # name. Without the implied row boundaries pdfplumber swallows all columns
    # into one full-width cell. Only subdivide cells containing several such
    # internal walls; retain real spans outside those cells.
    implied=[]
    scientific_grid=bool(re.search(r'[×\uf0b4]\s*10',''.join(c['text'] for c in page.chars)))
    if scientific_grid:
        for table in tables:
            x0,y0,x1,y1=table.bbox
            walls=[e for e in V if x0-2<=e['x0']<=x1+2 and y0-2<=e['top']<e['bottom']<=y1+2]
            ends=[(e['top'],e['x0']) for e in walls]+[(e['bottom'],e['x0']) for e in walls]
            for y in cluster([a for a,_ in ends],1.2):
                columns=cluster([x for a,x in ends if abs(a-y)<1.3],1.2)
                crossing=[c for c in table.cells if c[1]+2<y<c[3]-2]
                if len(columns)>=3 and crossing and min(c[3]-c[1] for c in crossing)>80:
                    protected=[]
                    for a,u,b,v in crossing:
                        text=''.join(c['text'] for c in page.chars if c['text'].strip() and a<(c['x0']+c['x1'])/2<b and u<(c['top']+c['bottom'])/2<v)
                        if 0<len(text)<=4 and b-a<(x1-x0)*.18:protected.append((a,b))
                    segments=[(x0,x1)]
                    for a,b in protected:
                        segments=[part for l,r in segments for part in ((l,min(r,a)),(max(l,b),r)) if part[1]-part[0]>2]
                    for l,r in segments:
                        implied.append(dict(x0=l,x1=r,top=y,bottom=y,orientation='h',object_type='line',width=r-l,height=0))
    for table in tables:
        unresolved=[]
        for x0,y0,x1,y1 in table.cells:
            walls=[e for e in V if x0+3<e['x0']<x1-3 and y0+2<e['top'] and e['bottom']<y1+2 and e['bottom']-e['top']>5]
            if len(cluster([e['x0'] for e in walls],1.2))>=3:unresolved.append(((x0,y0,x1,y1),walls))
        if not unresolved or (len(unresolved)<3 and not scientific_grid):continue
        for (x0,y0,x1,y1),walls in unresolved:
            ends=[(e['top'],e['x0']) for e in walls]+[(e['bottom'],e['x0']) for e in walls]
            for y in cluster([a for a,_ in ends],1.2):
                columns=cluster([x for a,x in ends if abs(a-y)<1.3],1.2)
                if len(columns)>=3 and y0+2<y<y1-2:
                    implied.append(dict(x0=x0,x1=x1,top=y,bottom=y,orientation='h',object_type='line',width=x1-x0,height=0))
    if implied:
        H=H+implied
        tables=page.find_tables(dict(settings,explicit_horizontal_lines=H))
        for table in tables:table._open_grid=True
    # Borderless columns retain their exact Word cell widths in the separate
    # horizontal border strips, even though the vertical borders are omitted.
    # The outer wall's segment endpoints likewise retain the original rows.
    borderless=False
    for k,table in enumerate(tables):
        if len(cluster([c[0] for c in table.cells]+[c[2] for c in table.cells]))!=2:continue
        x0,y0,x1,y1=table.bbox
        strips=[r for r in page.rects if r.get('fill') and not is_white(r.get('non_stroking_color')) and r['bottom']-r['top']<1.3
                and r['x1']-r['x0']>10 and abs(r['top']-y0)<1.5]
        xs=cluster([r['x0'] for r in strips]+[r['x1'] for r in strips],1.2)
        if len(xs)<4 or abs(xs[0]-x0)>2 or abs(xs[-1]-x1)>2:continue
        # Verify these same column seams occur at the header's lower rule.
        confirm=[r for r in page.rects if r.get('fill') and not is_white(r.get('non_stroking_color')) and r['bottom']-r['top']<1.3
                 and 5<r['top']-y0<60 and r['x1']-r['x0']>10]
        if sum(any(abs(r['x1']-x)<1.5 or abs(r['x0']-x)<1.5 for r in confirm) for x in xs)<len(xs):continue
        ys=cluster([y0,y1]+[v for r in page.rects if r['x1']-r['x0']<1.3 and r['bottom']-r['top']>4
                   and (abs(r['x0']-x0)<2 or abs(r['x1']-x1)<2) and y0-2<=r['top']<=r['bottom']<=y1+2 for v in (r['top'],r['bottom'])],1.2)
        cells=[]
        for a,b in zip(ys,ys[1:]):
            chars=[c for c in page.chars if c['text'].strip() and a<(c['top']+c['bottom'])/2<b and x0<c['x0']<x1]
            cuts=[xs[0]]
            for x in xs[1:-1]:
                crosses=any(c['x0']+.4<x<c['x1']-.4 for c in chars)
                if not crosses:cuts.append(x)
            cuts.append(xs[-1]);cells.extend((l,a,r,b) for l,r in zip(cuts,cuts[1:]))
        replacement=pdfplumber.table.Table(page,cells)
        replacement._open_grid=True
        tables[k]=replacement;borderless=True
    if implied or borderless or closing:return tables
    # Legacy Word tables use a bevel made of adjacent light/dark filled strips.
    # At 96 dpi the light strip is faint, and its two walls can be >1.6 pt apart.
    bevels = [e for e in raw_edges if e.get('fill') and not e.get('stroke')
              and isinstance(e.get('non_stroking_color'), (int,float,tuple,list))]
    tones = {tuple(e['non_stroking_color']) if isinstance(e['non_stroking_color'],(tuple,list))
             else (e['non_stroking_color'],) for e in bevels}
    if len(bevels) >= 20 and len(tones) >= 2 and any(min(c) >= 0.75 for c in tones) and any(max(c) <= 0.65 for c in tones):
        recovery = [e for e in raw_edges if ink is None or inked_edge(e, ink, page.page_number-1, threshold=252)]
        V = [e for e in recovery if e['orientation']=='v']
        H = [e for e in recovery if e['orientation']=='h']
        if len(V)>=2 and len(H)>=2:
            recovered = page.find_tables(dict(settings, explicit_vertical_lines=V, explicit_horizontal_lines=H, snap_tolerance=2.5))
            area = lambda t:(t.bbox[2]-t.bbox[0])*(t.bbox[3]-t.bbox[1])
            if recovered and (not tables or (len(tables)>1 and max(map(area,recovered))>1.5*max(map(area,tables)))):
                for table in recovered: table._beveled = True
                return recovered
    return tables


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
            pg = self.doc[i]
            pix = pg.get_pixmap(dpi=96, colorspace=pymupdf.csGRAY)
            # the render shows only the crop box; pdfplumber measures from the full media box
            self.off = (pg.cropbox.x0, pg.cropbox.y0)
            self.cache = {i: (pix, 96 / 72)}
            self.pixels = pix.samples
        return self.cache[i]

    def visible(self, i, c):
        if not c['text'].strip(): return True
        pix, k = self.page(i)
        ox, oy = self.off
        x0, x1 = int((c['x0'] - ox) * k), int((c['x1'] - ox) * k) + 1
        y0, y1 = int((c['top'] - oy) * k), int((c['bottom'] - oy) * k) + 1
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(pix.width, x1), min(pix.height, y1)
        if x1 <= x0 or y1 <= y0: return False
        s = self.pixels
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
        out.append(dict(x0=r[0]['x0'], x1=r[-1]['x1'], top=min(w['top'] for w in r), bottom=max(w['bottom'] for w in r), text=clean(txt), w0=w0,
                        _chars=[c for w in r for c in w.get('chars',[])]))
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
            eq = re.match(r'^([^=＝]{1,40})[=＝]',l['text'])
            repeat_eq = incell and eq and re.match(re.escape(eq[1])+r'[=＝]',p['text'])
            numbered = not incell and re.match(r'^[０-９](?:\s*[０-９])*\s*[一-鿿]',l['text']) and l['x0']<=p['x0']+5
            if full and not LIST.match(l['text']) and not repeat_eq and not numbered and (incell or l['top'] - p['bottom'] < 22):
                p['text'] = join(p['text'], l['text']); p['x1last'] = l['x1']; p['bottom'] = l['bottom']; continue
        paras.append(dict(text=l['text'], x1last=l['x1'], bottom=l['bottom'], x0=l['x0'], top=l['top'], x1=l['x1']))
    return paras


def text_diagrams(lines, words):
    """Retain the geometry of multi-line chemical structures made of text glyphs."""
    diagrams=[]; keep=[]; i=0
    def candidate(line):
        s=re.sub(r'\s+','',line['text'])
        return len(s)<=18 and re.fullmatch(r'[A-Za-z0-9()/\\|—─=／＼︱]+',s) and \
            (re.search(r'[0-9/\\|—─／＼︱]',s) or re.fullmatch(r'[A-Z]{1,2}',s))
    while i<len(lines):
        j=i
        while j<len(lines) and candidate(lines[j]) and (j==i or lines[j]['top']-lines[j-1]['bottom']<22):j+=1
        group=lines[i:j]
        if len(group)>=3 and sum(len(re.findall(r'[/\\|—─／＼︱]',l['text'])) for l in group)>=3:
            x0=min(l['x0'] for l in group);x1=max(l['x1'] for l in group)
            y0=group[0]['top'];y1=group[-1]['bottom']
            chars=[c for w in words for c in w['chars'] if x0-1<=(c['x0']+c['x1'])/2<=x1+1 and y0-1<=(c['top']+c['bottom'])/2<=y1+1]
            chars.sort(key=lambda c:(round(c['top']),c['x0']))
            runs=[dict(text=c['text'],x=round(c['x0']-x0,2),y=round(c['bottom']-y0-(c['bottom']-c['top'])*0.18,2),size=round(c['bottom']-c['top'],2)) for c in chars]
            diagrams.append(dict(t='diagram',w=round(x1-x0+2,2),h=round(y1-y0+2,2),runs=runs,top=y0))
            i=j
        else:
            keep.append(lines[i]);i+=1
    return keep,diagrams


def science_spans(text, words):
    """Mark printed raised exponents without normalizing their printed base."""
    if not re.search(r'[×\uf0b4]\s*\d+',text): return []
    chars=[c for w in words for c in w['chars'] if c['text'].strip()]
    if not chars: return []
    height=max(c['bottom']-c['top'] for c in chars)
    if not any(c['bottom']-c['top'] < height*0.85 for c in chars): return []
    spans=[]
    for m in re.finditer(r'[×\uf0b4]\s*(?:10|[1-9]\d*(?=\s*[+−-]))\s*([+−-]?\s*\d+)',text):
        # Browser string offsets use UTF-16; the rare raster glyph is outside BMP.
        spans.append([len(text[:m.start(1)].encode('utf-16-le'))//2,len(text[:m.end(1)].encode('utf-16-le'))//2])
    return spans


def source_scripts(text,words):
    """Map printed smaller raised/lowered glyphs to unchanged reflowed text."""
    source=[]
    for line in lines_of(words):
        chars=[c for c in line['_chars'] if c['text'].strip()]
        if not chars:continue
        size=lambda c:c.get('size',c['bottom']-c['top'])
        counts=collections.Counter(round(size(c),1) for c in chars)
        normal=counts.most_common(1)[0][0]
        base=lambda c:-c['matrix'][5] if 'matrix' in c else c['bottom']
        bases=sorted(base(c) for c in chars if abs(size(c)-normal)<.6)
        baseline=bases[len(bases)//2]
        for c in chars:
            tag=None
            if size(c)<normal*.88:
                dy=base(c)-baseline
                if dy<-1.2:tag='sup'
                elif dy>1.2:tag='sub'
            source.extend((ch,tag) for ch in c['text'] if not ch.isspace())
    compact=''.join(ch for ch in text if not ch.isspace())
    if compact!=''.join(ch for ch,_ in source):return {}
    marked=[];pos=0;offset=0
    for ch in text:
        n=len(ch.encode('utf-16-le'))//2
        tag=None
        if not ch.isspace():tag=source[pos][1];pos+=1
        marked.append((offset,offset+n,tag));offset+=n
    out={}
    for a,b,tag in marked:
        if not tag:continue
        spans=out.setdefault(tag,[])
        if spans and spans[-1][1]==a:spans[-1][1]=b
        else:spans.append([a,b])
    return out


def positioned(page, words, bbox, ink, drawings=False):
    """Native SVG text and source vector paths for a mathematical expression/plot.
    Character codes, sizes, baselines and rules all come from the PDF, never OCR.
    """
    x0,y0,x1,y1=bbox
    chars=[c for w in take(words,x0,y0,x1,y1,pad=0) for c in w['chars'] if c['text'].strip()]
    if not chars: return None
    x0=min(x0,min(c['x0'] for c in chars)); y0=min(y0,min(c['top'] for c in chars))
    x1=max(x1,max(c['x1'] for c in chars)); y1=max(y1,max(c['bottom'] for c in chars))
    runs=[]
    for c in sorted(chars,key=lambda c:(round(c['top'],1),c['x0'])):
        font=str(c.get('fontname',''))
        baseline=page.height-c['matrix'][5] if 'matrix' in c else c['bottom']-(c['bottom']-c['top'])*.18
        run=dict(text=c['text'],x=round(c['x0']-x0+2,2),y=round(baseline-y0+2,2),size=round(c.get('size',c['bottom']-c['top']),2))
        if 'Symbol' in font: run['font']='Symbol'
        if 'Italic' in font or 'Oblique' in font: run['italic']=True
        runs.append(run)
    paths=[]
    if drawings:
        def point(p): return f'{p.x-x0+2:.3f},{p.y-y0+2:.3f}'
        for d in ink.doc[page.page_number-1].get_drawings():
            r=d['rect']
            if not (x0-2<=r.x0 and r.x1<=x1+2 and y0-2<=r.y0 and r.y1<=y1+2):continue
            if d.get('color') is not None and is_white(d['color']):continue
            stroke=d.get('color') is not None and not is_white(d['color'])
            fill=d.get('fill') is not None and not is_white(d['fill'])
            if not stroke and not fill:continue
            cmds=[]
            for item in d['items']:
                if item[0]=='l':cmds.append('M'+point(item[1])+' L'+point(item[2]))
                elif item[0]=='c':cmds.append('M'+point(item[1])+' C'+' '.join(point(p) for p in item[2:]))
                elif item[0]=='re':
                    a=item[1];cmds.append('M'+point(a.tl)+' L'+point(a.tr)+' L'+point(a.br)+' L'+point(a.bl)+' Z')
                elif item[0]=='qu':
                    a=item[1];cmds.append('M'+point(a.ul)+' L'+point(a.ur)+' L'+point(a.lr)+' L'+point(a.ll)+' Z')
            if cmds:
                path=dict(d=' '.join(cmds),width=round(d.get('width') or .5,3))
                if fill:path['fill']=True
                if not stroke:path['stroke']=False
                dash=re.match(r'\[([^]]*)\]',d.get('dashes') or '')
                if dash and dash[1].strip():path['dash']=dash[1].strip()
                paths.append(path)
    block=dict(t='diagram',w=round(x1-x0+4,2),h=round(y1-y0+4,2),runs=runs,top=y0)
    if paths:block['paths']=paths
    return block


def math_blocks(page, words, ink):
    """Keep isolated multi-level maths together, including its fraction rules."""
    free=[dict(w,chars=[c for c in w['chars'] if not c.get('_u')]) for w in words]
    free=[dict(w,text=''.join(c['text'] for c in w['chars'])) for w in free if w['chars']]
    ls=lines_of(free);bands=[];i=0
    def candidate(l):
        s=l['text'];n=len(re.findall(r'[一-鿿]',s))
        return (n==0 or (n<=8 and re.search(r'[=＝\uf03d∫∑Σ\uf0f2\uf0e5]',s))) and l['top']<page.height-65
    while i<len(ls):
        j=i
        while j<len(ls) and candidate(ls[j]) and (j==i or ls[j]['top']-ls[j-1]['bottom']<20):j+=1
        group=ls[i:j]
        if group and re.search(r'[=＝\uf03d∫∑Σ\uf0f2\uf0e5]',''.join(l['text'] for l in group)):
            bands.append([min(l['top'] for l in group)-1,max(l['bottom'] for l in group)+1])
        i=max(i+1,j)
    for i,l in enumerate(ls):
        if i and len(re.sub(r'\s+','',l['text']))<=5 and l['bottom']-l['top']<10 and l['top']<ls[i-1]['bottom']+2:
            bands.append([ls[i-1]['top']-1,l['bottom']+1])
    # An inline stacked fraction may have Chinese explanatory text on its
    # baseline. Keep that complete short paragraph with the fraction.
    for e in page.lines:
        if abs(e['bottom']-e['top'])<1 and 5<e['x1']-e['x0']<130 and not is_white(e.get('stroking_color')):
            y=e['top']
            if any(abs(y-a)<22 or a<=y<=b for a,b in bands):continue
            near=[l for l in ls if l['top']<y+17 and l['bottom']>y-17]
            if near and any(l['top']<y<l['bottom'] or len(l['text'])<18 for l in near):
                bands.append([min(l['top'] for l in near)-1,max(l['bottom'] for l in near)+1])
    merged=[]
    for a,b in sorted(bands):
        if merged and a<=merged[-1][1]:merged[-1][1]=max(b,merged[-1][1])
        else:merged.append([a,b])
    out=[]
    for a,b in merged:
        selected=[c for w in words for c in w['chars'] if not c.get('_u') and a<=(c['top']+c['bottom'])/2<=b]
        if not selected:continue
        x0=min(c['x0'] for c in selected);x1=max(c['x1'] for c in selected)
        block=positioned(page,words,(x0-1,a,x1+1,b),ink,drawings=True)
        if block:out.append(block)
    return out


def cluster(vals, tol=2.5):
    vals = sorted(vals); out = []
    for v in vals:
        if out and v - out[-1][-1] <= tol: out[-1].append(v)
        else: out.append([v])
    return [sum(c) / len(c) for c in out]


def idx(grid, v):
    return min(range(len(grid)), key=lambda i: abs(grid[i] - v))


def table_struct(page, t, words, images, imgsave, children=(), preserve_vertical=False):
    cells = [c for c in t.cells]
    xs = cluster([c[0] for c in cells] + [c[2] for c in cells])
    ys = cluster([c[1] for c in cells] + [c[3] for c in cells])
    scientific_layout=bool(re.search(r'[×\uf0b4]\s*10',''.join(c['text'] for c in page.chars)))
    pitch=12
    if scientific_layout:
        content=[c for w in words for c in w['chars'] if c['text'].strip() and t.bbox[0]<(c['x0']+c['x1'])/2<t.bbox[2]
                 and t.bbox[1]<(c['top']+c['bottom'])/2<t.bbox[3]]
        sizes=collections.Counter(round(c.get('size',c['bottom']-c['top']),1) for c in content)
        normal=sizes.most_common(1)[0][0] if sizes else 10
        baseline=lambda c:page.height-c['matrix'][5] if 'matrix' in c else c['bottom']
        levels=cluster([baseline(c) for c in content if normal*.9<=c.get('size',c['bottom']-c['top'])<=normal*1.15],1.2)
        gaps=[round((b-a)*2)/2 for a,b in zip(levels,levels[1:]) if normal*.95<=b-a<=normal*2.5]
        if gaps:pitch=collections.Counter(gaps).most_common(1)[0][0]
    def aligned_text(lines):
        result='';previous=None
        for line in lines:
            normal_chars=[c for c in line['_chars'] if c['text'].strip() and c.get('size',c['bottom']-c['top'])>=pitch*.65]
            heights=sorted(page.height-c['matrix'][5] if 'matrix' in c else c['bottom'] for c in normal_chars)
            y=heights[len(heights)//2] if heights else line['bottom']
            if previous is not None:result+='\n'*max(1,round((y-previous)/pitch))
            result+=line['text'];previous=y
        return result
    # slivers (shading a few points narrower than the border) are not real columns
    while len(xs) > 2:
        gaps = [(xs[i + 1] - xs[i], i) for i in range(len(xs) - 1)]
        g, i = min(gaps)
        if g >= 6: break
        xs.pop(i + 1 if i == 0 else i)
    grid = {}; line_cache = {}
    for (x0, y0, x1, y1) in cells:
        r0, r1, c0, c1 = idx(ys, y0), idx(ys, y1), idx(xs, x0), idx(xs, x1)
        if r1 <= r0 or c1 <= c0: continue
        inside = take(words, x0, y0, x1, y1)
        ls = lines_of(inside)
        line_cache[(r0,c0)] = (ls,inside)
        kids = [ch for ch in children if x0 - 2 <= ch['x0'] and ch['x1'] <= x1 + 2 and y0 - 2 <= ch['top'] <= y1 + 2]
        if kids:
            sub = [dict(t='p', text=p['text'], top=p['top']) for p in flow(ls, x1 - 2, incell=True)] + kids
            sub.sort(key=lambda b: b['top'])
            cell = dict(r=r0, c=c0, rs=r1 - r0, cs=c1 - c0, text='', blocks=sub)
            grid[(r0, c0)] = cell
            continue
        # a cell split by a diagonal line (corner header): text above the line goes top-right, below goes bottom-left
        diagonals = [d for d in page.lines + page.curves if abs(d['x1'] - d['x0']) > 8 and abs(d['bottom'] - d['top']) > 8
                     and x0 - 2 <= d['x0'] and d['x1'] <= x1 + 2 and y0 - 2 <= d['top'] and d['bottom'] <= y1 + 2]
        diag = next(iter(diagonals), None)
        if diag and ls:
            if len(diagonals) == 2 and len(ls) == 3:
                # A three-way corner: retain both drawn lines and each label's
                # printed position instead of combining the two left-hand labels.
                xy = lambda x,y: [round((x-x0)/(x1-x0)*100, 2), round((y-y0)/(y1-y0)*100, 2)]
                labels = sorted(ls, key=lambda l:l['top'])
                names = ('tr','mid','bl')
                d = dict(n=2, **{name:l['text'] for name,l in zip(names,labels)})
                d['lines'] = [xy(*line['pts'][0]) + xy(*line['pts'][-1]) for line in diagonals]
                d['positions'] = {name:xy((l['x0']+l['x1'])/2,(l['top']+l['bottom'])/2) for name,l in zip(names,labels)}
                grid[(r0,c0)] = dict(r=r0,c=c0,rs=r1-r0,cs=c1-c0,text='',diag=d)
                continue
            (ax, ay), (bx, by) = sorted(diag['pts'][:1] + diag['pts'][-1:])
            def above(l):
                cx = (l['x0'] + l['x1']) / 2; cy = (l['top'] + l['bottom']) / 2
                yline = ay + (by - ay) * (cx - ax) / max(1e-6, bx - ax)
                return cy < yline if by > ay else cy > yline
            tr = '\n'.join(l['text'] for l in ls if above(l)); bl = '\n'.join(l['text'] for l in ls if not above(l))
            grid[(r0, c0)] = dict(r=r0, c=c0, rs=r1 - r0, cs=c1 - c0, text='', diag=dict(tr=tr, mid='', bl=bl, n=1))
            continue
        if getattr(t,'_open_grid',False) or scientific_layout:
            text=aligned_text(ls)
        # vertical text: every line is 1-2 chars -> join without breaks
        elif len(ls) > 1 and all(len(l['text']) <= 2 for l in ls) and any(re.search(rf'[{CJK}]', l['text']) for l in ls) \
                and max(b['top'] - a['bottom'] for a, b in zip(ls, ls[1:])) < (ls[0]['bottom'] - ls[0]['top']) * 0.9:
            text = ('\n'.join(l['text'] for l in ls) if preserve_vertical and len(ls)>=3 and all(len(l['text'])==2 for l in ls)
                    else ''.join(l['text'] for l in ls))
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
        sup = science_spans(text,inside)
        if sup: cell['sup'] = sup
        if getattr(page,'_native_maths',False):cell.update(source_scripts(text,inside))
        if here: cell['img'] = [imgsave(im) for im in here]
        grid[(r0, c0)] = cell
    # Unruled parallel lists still have printed row alignment. A column of
    # four or more numbers anchors the matching text lines in the other cell.
    for key,cell in list(grid.items()):
        ls,_=line_cache.get(key,([],[]))
        if len(ls)<4 or not all(re.fullmatch(r'[0-9.]+',l['text'].strip()) for l in ls):continue
        peers=[(k,c) for k,c in grid.items() if k[0]==key[0] and c['rs']==cell['rs']]
        for k,c in peers:
            other,source=line_cache.get(k,([],[]))
            if len(other)==len(ls) and not c.get('blocks') and not c.get('diag'):
                c['text']='\n'.join(l['text'] for l in other)
                sup=science_spans(c['text'],source)
                if sup:c['sup']=sup
                if getattr(page,'_native_maths',False):c.update(source_scripts(c['text'],source))
    nrows, ncols = len(ys) - 1, len(xs) - 1
    widths = [round(xs[i + 1] - xs[i], 1) for i in range(ncols)]
    tb = dict(t='table', nrows=nrows, widths=widths, xs=xs, x0=t.bbox[0], x1=t.bbox[2], top=t.bbox[1], bottom=t.bbox[3])
    if re.search(r'[×\uf0b4]\s*10',''.join(c['text'] for c in page.chars)):tb['_scientific']=True
    regroup(tb, list(grid.values()))
    if getattr(t,'_open_grid',False):
        # Empty continuation fields share the preceding printed value when
        # no source rule separates them (e.g. an isotope's F/M/S classes).
        # Keep section-heading rows and actual ruled boundaries intact.
        source_h=[e for e in visible_edges(page) if e['orientation']=='h']
        owner={};remove=[]
        for row in tb['rows']:
            entries=[c for c in row if not blank(c)]
            section=len(entries)==1 and entries[0]['c']==0 and (len(row)==1 or len(entries[0]['text'])>5)
            for c in row:
                p=owner.get(c['c'])
                ruled=any(abs(e['top']-ys[c['r']])<1.5 and e['x0']<=xs[c['c']]+2 and e['x1']>=xs[c['c']+c['cs']]-2 for e in source_h)
                if p and blank(c) and not blank(p) and not section and p['cs']==c['cs'] and p['r']+p['rs']==c['r'] and not ruled:
                    p['rs']+=c['rs'];remove.append(c)
                else:owner[c['c']]=c
        if remove:regroup(tb,[c for r in tb['rows'] for c in r if c not in remove])
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
        for k in ('top', 'x0', 'x1', 'bottom', 'nrows', 'xs', '_scientific'): b.pop(k, None)
        for r in b.get('rows', []):
            for c in r:
                c.pop('r', None)
                if 'blocks' in c: finalize(c['blocks'])


NEWITEM = re.compile(r'^(?:\d+(?:[-.]\d+)+|\d+$|[A-Z][a-z]?\s*[-−]\s*\d+m?(?:\s|$)|[A-Z]$)')


def blank(c):
    return not c['text'] and not c.get('img') and not c.get('blocks') and not c.get('diag')


def same_frame(a, b):
    return abs(a['xs'][0] - b['xs'][0]) < 4 and abs(a['xs'][-1] - b['xs'][-1]) < 4


def remap(tb, U):
    xs = tb['xs']
    for r in tb['rows']:
        for c in r:
            a, b = idx(U, xs[c['c']]), idx(U, xs[c['c'] + c['cs']])
            c['c'], c['cs'] = a, max(1, b - a)
    tb['xs'] = U


def split_leading_nested(prev, it):
    """A nested table cut by the page break shares the next page's top border, so it fuses with the outer grid.
    Columns the outer table never had, used only by the leading rows, belong to that nested table: lift those
    rows out into a nested table inside one outer cell, continuing the nested table on the previous page."""
    known = lambda x: any(abs(x - p) <= 7 for p in prev['xs'])   # a sliver merge may keep either of two close lines
    xs = it['xs']
    minor = [i for i in range(1, len(xs) - 1) if not known(xs[i])]
    if not minor: return
    rows = it['rows']
    users = sorted({c['r'] for r in rows for c in r if c['c'] in minor or (c['c'] + c['cs']) in minor})
    if not users or users != list(range(users[0], users[0] + len(users))) or users[0] != 0: return
    k = len(users)
    # the outer column span that holds them
    lo = max(i for i in range(len(xs)) if known(xs[i]) and i <= min(minor) - 1)
    hi = min(i for i in range(len(xs)) if known(xs[i]) and i >= max(minor) + 1)
    region = [c for r in rows[:k] for c in r if c['c'] >= lo and c['c'] + c['cs'] <= hi]
    # Outside fields can have their own header/body split within these rows.
    # Collapsing them to one outer row would overlap the next full-width field.
    # Keep the complete grid in that case; remapping its columns preserves both.
    if any(0 < c['r'] < k for r in rows[:k] for c in r if c not in region): return
    # empty margins inside the outer cell (left/right of the nested table) are not part of it
    inner = [c for c in region if not (blank(c) and c['rs'] >= k)]
    if not inner: return
    a0 = min(c['c'] for c in inner); a1 = max(c['c'] + c['cs'] for c in inner)
    sub = dict(t='table', xs=xs[a0:a1 + 1], widths=[], head=0, nrows=k)
    for c in inner:
        sub_c = dict(c); sub_c['c'] = c['c'] - a0
        sub.setdefault('_cells', []).append(sub_c)
    regroup(sub, sub.pop('_cells'))
    keep = [c for r in rows for c in r if c not in region]
    holder = dict(r=0, c=lo, rs=1, cs=hi - lo, text='', blocks=[sub])
    for c in keep:      # the k lifted rows become one outer row
        if c['r'] >= k: c['r'] -= k - 1
        else: c['rs'] = max(1, c['rs'] - (k - 1))
    # drop the nested table's column lines from the outer grid
    old_xs = xs
    new_xs = [x for i, x in enumerate(xs) if i not in minor]
    cells = keep + [holder]
    for c in cells:
        a, b = old_xs[c['c']], old_xs[c['c'] + c['cs']]
        c['c'] = idx(new_xs, a); c['cs'] = max(1, idx(new_xs, b) - c['c'])
    it['xs'] = new_xs
    regroup(it, cells)


def join_nested(cell):
    """Two nested tables back to back in one cell (split by a page break) become one table."""
    bl = cell.get('blocks') or []
    i = 0
    while i + 1 < len(bl):
        a, b = bl[i], bl[i + 1]
        if a.get('t') == 'table' and b.get('t') == 'table' and 'xs' in a and 'xs' in b and abs(a['xs'][0] - b['xs'][0]) < 4 and abs(a['xs'][-1] - b['xs'][-1]) < 6:
            U = cluster(a['xs'] + b['xs'], 3)
            remap(a, U); remap(b, U)
            n = a['nrows']
            for r in b['rows']:
                for c in r: c['r'] += n
            ca = [c for r in a['rows'] for c in r]; cb = [c for r in b['rows'] for c in r]
            # a diagonal corner cell cut in half by the page break: top half here, bottom half there
            top = next((c for c in ca if c.get('diag') and not c['diag']['bl'] and c['c'] == 0), None)
            bot = next((c for c in cb if c.get('diag') and not c['diag']['tr'] and c['c'] == 0 and c['r'] == n), None)
            if top and bot:
                top['diag']['bl'] = bot['diag']['bl']; top['rs'] += bot['rs']; cb.remove(bot)
            regroup(a, ca + cb)
            del bl[i + 1]
            continue
        i += 1


def box(t):
    """A cell holding only a check box: a row split by the page break never prints its box twice."""
    return bool(re.fullmatch(r'\s*[□■☐☑]\s*', t or ''))


def item_rows(prev, occ, L, x):
    """A column that holds one numbered item per row (1.… | 2.… each in its own ruled row): the continuation's
    first entry with the next number starts a new row instead of joining the last one."""
    m = re.match(r'^(\d+)[.．、]', x['text'] or '')
    if not m or '\n' in x['text'].strip(): return False
    last, before = occ.get((L, x['c'])), occ.get((L - 1, x['c']))
    width = len(prev['xs']) - 1
    if last is None or last['c'] != x['c'] or last['rs'] != 1 or last['cs'] == width or '\n' in (last['text'] or '').strip(): return False
    n = re.match(r'^(\d+)[.．、]', last['text'] or '')
    if not n or int(n.group(1)) + 1 != int(m.group(1)): return False
    if before is None: return False
    if before['cs'] == width and before['rs'] == 1: return True          # 1. right under a full-width section row
    b = re.match(r'^(\d+)[.．、]', before['text'] or '')
    return bool(b) and before['rs'] == 1 and '\n' not in before['text'].strip() and int(b.group(1)) + 1 == int(n.group(1))


def merge_continued(prev, it, dropped):
    """Append a table continued on the next page; stitch a row/cell that the page break split."""
    split_leading_nested(prev, it)
    if it.get('_scientific'):prev['_scientific']=True
    # the same column line can sit a few points apart on two pages
    # Snap seams one-to-one. Two close nested-table seams must never collapse
    # onto the same outer border when the continuation shifts a few points.
    snaps = {}; used = set()
    for distance, i, p in sorted((abs(p-x), i, p) for i,x in enumerate(it['xs']) for p in prev['xs'] if abs(p-x) <= 7):
        if i not in snaps and p not in used: snaps[i] = p; used.add(p)
    it['xs'] = [snaps.get(i, x) for i,x in enumerate(it['xs'])]
    if len(prev['xs']) != len(it['xs']) or any(abs(a - b) > 3 for a, b in zip(prev['xs'], it['xs'])):
        U = cluster(prev['xs'] + it['xs'], 3)
        remap(prev, U); remap(it, U)
    h = prev['head']
    rows = it['rows']
    while h and h<min(3,len(rows),len(prev['rows'])) and row_texts(it,h+1)==row_texts(prev,h+1) \
            and not any(NEWITEM.match(c['text']) for c in rows[h] if c['text']):
        h+=1
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
        and not any(x.get('diag') for x in first) \
        and all(not blank(occ[(L, x['c'])]) for x in first if not blank(x)) \
        and not any(box(x['text']) and box(occ[(L, x['c'])]['text']) for x in first) \
        and not any(item_rows(prev, occ, L, x) for x in first)
    offset = (L - base) if cont else (L + 1 - base)
    for c in cells: c['r'] += offset

    def absorb(p, x):
        if x['text']:
            p['text'] = (p['text'] + '\n' + x['text']) if LIST.match(x['text']) else join(p['text'], x['text'])
            for tag in ('sup','sub'):
                if x.get(tag):
                    offset=(len(p['text'].encode('utf-16-le'))-len(x['text'].encode('utf-16-le')))//2
                    p.setdefault(tag,[]).extend([[a+offset,b+offset] for a,b in x[tag]])
        if x.get('img'): p.setdefault('img', []).extend(x['img'])
        if x.get('blocks'):
            if not p.get('blocks') and p['text']:
                p['blocks'] = [dict(t='p', text=p['text'])]; p['text'] = ''
            p.setdefault('blocks', []).extend(x['blocks'])
            join_nested(p)
        cells.remove(x)

    if cont:
        for x in first:
            p = occ[(L, x['c'])]
            p['rs'] += x['rs'] - 1
            absorb(p, x)
    else:
        # a new row starts, but tall cells that reach the page bottom may carry on across the break
        if prev.get('_scientific'):
            # A continued blank field can have no closed rectangle on the
            # next physical page. Extend its existing printed owner until
            # the next explicit cell in those columns. Without this, the
            # browser shifts later F/M/S cells into the empty left columns.
            start = base + offset
            end = max(x['r'] + x['rs'] for x in cells)
            for p in {id(c): c for c in occ.values()}.values():
                if p['r'] + p['rs'] != L + 1 or blank(p): continue
                peers = [x for x in cells if x['c'] < p['c'] + p['cs'] and p['c'] < x['c'] + x['cs']]
                stop = min((x['r'] for x in peers), default=end)
                if stop > start: p['rs'] = stop - p['r']
        lead = min(first, key=lambda x: x['c']) if first else None
        new_group = lead is not None and not blank(lead)
        for x in first:
            p = occ.get((L, x['c']))
            if p is None or p['c'] != x['c'] or p['cs'] != x['cs'] or p['r'] == L: continue
            midsentence = x['text'] and not LIST.match(x['text']) and not NEWITEM.match(x['text']) and not re.match(r'^[\d一二三四五六七八九十（(「]', x['text']) \
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
            # Image-only text is checked against the visually verified transcription.
            out.extend(t for im in page.images if (t := raster_text(path, page.page_number, im)))
    return ''.join(out)


def convert(path, annex_id, imgdir, imgprefix):
    blocks = []
    footers = []
    dropped = []
    page_titles = set()
    ink = Ink(path)
    with pdfplumber.open(path) as pdf:
        native_maths = any(c['text'] in ('∫','∑','Σ','\uf0f2','\uf0e5') for p in pdf.pages[:5] for c in p.chars)
        for pno, page in enumerate(pdf.pages):
            page = printed(page.dedupe_chars(tolerance=1), ink)
            page._native_maths=native_maths
            mark_blanks(page)
            words = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False, use_text_flow=False, return_chars=True)
            set_spaces(page)
            images = []
            for im in page.images:
                if im['x1'] - im['x0'] <= 4 or im['bottom'] - im['top'] <= 4: continue
                mask = im['stream'].attrs.get('SMask')
                if mask is not None:
                    stream = mask.resolve()
                    if stream.attrs.get('Decode', [0, 1]) == [0, 1] and not any(stream.get_data()):
                        continue  # completely transparent image, not printed content
                text = raster_text(path, page.page_number, im)
                if text:
                    x0, y0, x1, y1 = im['x0'], im['top'], im['x1'], im['bottom']
                    if mask is not None:
                        pix = pymupdf.Pixmap(ink.doc, mask.objid)
                        box = Image.frombytes('L', (pix.width, pix.height), pix.samples).getbbox()
                        if box:
                            bx0, by0, bx1, by1 = box
                            x0, x1 = x0 + bx0 / pix.width * (x1-x0), x0 + bx1 / pix.width * (x1-x0)
                            y0, y1 = y0 + by0 / pix.height * (y1-y0), y0 + by1 / pix.height * (y1-y0)
                    chars = [dict(text=ch, x0=x0+i*(x1-x0)/len(text), x1=x0+(i+1)*(x1-x0)/len(text), top=y0, bottom=y1)
                             for i,ch in enumerate(text)]
                    words.append(dict(text=text, chars=chars, x0=x0, x1=x1, top=y0, bottom=y1))
                else:
                    images.append(dict(im))

            def imgsave(im, page=page):
                bbox = (max(im['x0'], 0), max(im['top'], 0), min(im['x1'], page.width), min(im['bottom'], page.height))
                pi = page.crop(bbox).to_image(resolution=200)
                name = save_image(pi.original, imgdir, imgprefix)
                return dict(src=name, w=round(im['x1'] - im['x0']), h=round(im['bottom'] - im['top']))

            tables = find_tables(page, ink)
            tables = [t for t in tables if len(t.cells) >= 2]
            # nested tables: build innermost first, then hand them to the table that contains them
            def inside(a, b):
                return a is not b and b.bbox[0] - 2 <= a.bbox[0] and a.bbox[2] <= b.bbox[2] + 2 and b.bbox[1] - 2 <= a.bbox[1] and a.bbox[3] <= b.bbox[3] + 2
            built = {}
            for t in sorted(tables, key=lambda t: (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1])):
                kids = [built.pop(id(k)) for k in tables if id(k) in built and inside(k, t)]
                built[id(t)] = table_struct(page, t, words, images, imgsave, kids, preserve_vertical=getattr(t,'_beveled',False))
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
                ticks=[l for l in page.lines if g[0]-12<=l['x0']<=g[2]+12 and g[1]-12<=l['top']<=g[3]+12
                       and max(l['x1']-l['x0'],l['bottom']-l['top'])<12]
                if native_maths and len(ticks)>=8:
                    # Plot labels lie beyond the curve's own bounding box.
                    # Rebuild the graph from vectors and selectable source text.
                    box=(g[0]-55,g[1]-15,g[2]+15,g[3]+50)
                    figure=positioned(page,words,box,ink,drawings=True)
                    if figure:items.append(figure)
                    continue
                inside = take(words, g[0], g[1], g[2], g[3], pad=0)
                dropped.extend(w['text'] for w in inside)
                fig = dict(x0=g[0] - 2, top=g[1] - 2, x1=g[2] + 2, bottom=g[3] + 2)
                items.append(dict(t='img', img=[imgsave(fig)], top=g[1]))
            if native_maths:items.extend(math_blocks(page,words,ink))
            free = take(words, -1e6, -1e6, 1e6, 1e6)
            ls = lines_of(free)
            ls, diagrams = text_diagrams(ls, free)
            items.extend(diagrams)
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
                block = dict(t='p', text=p['text'], top=p['top'], center=centered)
                sup = science_spans(p['text'],[w for w in free if p['top']-2<=w['top']<=p['bottom']+2])
                if sup: block['sup'] = sup
                if native_maths:block.update(source_scripts(p['text'],[w for w in free if p['top']-2<=w['top']<=p['bottom']+2]))
                items.append(block)
            for im in images:
                if not im.get('_used'):
                    items.append(dict(t='img', img=[imgsave(im)], top=im['top']))
            items.sort(key=lambda it: it['top'])
            # Running captions are page furniture; retain the first occurrence,
            # and let the actual table continue across the removed page break.
            retained=[]
            for it in items:
                if it['t']=='p' and it['top']<150 and re.match(r'^附表[一二三四五六七八九十]+',it['text']):
                    key=re.sub(r'\s+','',it['text'])
                    if key in page_titles:
                        dropped.append(it['text']);continue
                    page_titles.add(key)
                retained.append(it)
            items=retained
            for it in items:
                # A footnote printed below the first physical page belongs
                # below the complete logical table. It must not break a
                # continued scientific grid with identical column headers.
                if it['t']=='table' and it is items[0]:
                    j=len(blocks)-1
                    while j>=0 and blocks[j]['t']=='p' and not re.match(r'^附表',blocks[j]['text']):j-=1
                    if 0<=j<len(blocks)-1 and blocks[j]['t']=='table' and 'xs' in blocks[j] and same_frame(blocks[j],it) \
                            and (it.get('_scientific') or blocks[j].get('_scientific')):
                        headers=lambda t:[tuple(re.sub(r'\s+','',c['text']) for c in r) for r in t['rows'][:max(1,t.get('head',0))]]
                        if headers(blocks[j])==headers(it):
                            merge_continued(blocks[j],it,dropped);continue
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
        elif b['t'] == 'diagram': out.extend(run['text'] for run in b['runs'])
        elif b['t'] == 'table':
            for r in b['rows']:
                for c in r:
                    out.append(c['text'])
                    if 'diag' in c: out.append(c['diag']['tr'] + c['diag']['mid'] + c['diag']['bl'])
                    if 'blocks' in c: out.append(visible_text(dict(blocks=c['blocks'])))
    return ''.join(out)
