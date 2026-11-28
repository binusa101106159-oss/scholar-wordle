"""Reviewed LaDou 6e chapters 6–10: native text/tables, original complete artwork.

No external content or source PDFs are published. Cache is private, SHA-checked.
"""
from pathlib import Path
from html.parser import HTMLParser
import argparse, hashlib, json, re
import pymupdf as pdf
from import_appendix import clean, esc, span_html
from import_chapters import object_html

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'ladou'
QA = ROOT / '.local/ladou-batch-02'
EXPECTED = {6: 41, 7: 3, 8: 35, 9: 37, 10: 17}
# Each tuple identifies complete displayed panels, not the zero-height PDF shadows.
FIGURES = {
    6: {1: [(2, 0)], 2: [(2, 1)], 3: [(3, 0), (3, 1)], 4: [(4, 0)],
        5: [(8, 0)], 6: [(9, 0)], 7: [(11, 0)], 8: [(12, 0)],
        9: [(15, 0)], 10: [(17, 0), (18, 0)], 11: [(19, 0)],
        12: [(23, 0)], 13: [(24, 0)], 14: [(25, 0)], 15: [(26, 0)],
        16: [(27, 0)], 17: [(29, 0)], 18: [(33, 0)], 19: [(35, 0)],
        20: [(38, 0)], 21: [(39, 0)]},
    8: {1: [(2, 0), (2, 1)], 2: [(10, 0), (10, 1), (11, 0), (11, 1)],
        3: [(13, 0)], 4: [(16, 0)], 5: [(21, 0)], 6: [(22, 0)],
        7: [(24, 0), (25, 0)], 8: [(32, 0)]},
    10: {1: [(2, 0)], 2: [(6, 0)], 3: [(7, 0), (8, 0)]}}


class Text(HTMLParser):
    def __init__(self, value):
        super().__init__(); self.value = ''; self.feed(value)
    def handle_data(self, value): self.value += value


def norm(s): return re.sub(r'\s+', '', clean(s))


def joined(lines, breaks=False):
    result = ''
    for l in sorted(lines, key=lambda l: (l['pn'], round(l['bbox'][1], 1), l['bbox'][0])):
        t = span_html(l['spans']).strip()
        result += (('<br>' if breaks else '' if result.endswith('-') else ' ') if result else '') + t
    return result.replace('heightwhen', 'height when').replace('Efficacy I n', 'Efficacy In')


def load_source(path, number):
    doc = pdf.open(path); assert len(doc) == EXPECTED[number]
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    cache = QA / f'c{number:02d}-cache.json'
    if cache.exists():
        data = json.loads(cache.read_text('utf8'))
        if data['sha256'] == sha: return doc, data['pages'], sha
    pages = []
    for pn, page in enumerate(doc, 1):
        lines, images = [], []
        for b in page.get_text('dict')['blocks']:
            if b['type'] == 1:
                r = pdf.Rect(b['bbox'])
                if r.is_valid and r.height > 4 and r.y0 >= 64.9 and r.y1 <= 731:
                    assert not b['width'] == b['height'] == 60, f'Spinner: c{number} p{pn}'
                    raw = b['image']
                    # p.33 repeats a cropped 526px tile after a 6px strip of the
                    # intact 532px original; export the intact artwork once.
                    if number == 6 and pn == 33 and b['width'] == 895:
                        original = next(x for x in page.get_text('dict')['blocks']
                                        if x['type'] == 1 and x['width'] == 895 and x['height'] == 532)
                        raw = original['image']; b = original
                    name = f'ladou/assets/{hashlib.sha256(raw).hexdigest()[:16]}.{b["ext"]}'
                    (ROOT / name).write_bytes(raw)
                    images.append({'bbox': list(r), 'width': b['width'], 'height': b['height'], 'file': name})
                continue
            for l in b.get('lines', []):
                r = pdf.Rect(l['bbox']); t = clean(''.join(s['text'] for s in l['spans']))
                if r.y0 >= 64.9 and r.y1 <= 731 and t.strip():
                    lines.append({**l, 'pn': pn, 'text': t, 'uid': f'{pn}:{len(lines)}'})
        tables = page.find_tables(clip=pdf.Rect(20, 65, 592, 731)).tables
        pages.append({'lines': lines, 'images': images, 'links': page.get_links(),
                      'tables': [{'bbox': list(t.bbox), 'rows': [r.cells for r in t.rows]} for t in tables]})
    # Links contain PyMuPDF Rects; JSON stores their four coordinates.
    cache.write_text(json.dumps({'sha256': sha, 'pages': pages}, ensure_ascii=False,
                               default=lambda o: list(o)), encoding='utf8')
    return doc, pages, sha


def import_chapter(path, number):
    doc, source, sha = load_source(path, number)
    ident = f'c{number:02d}'; consumed = set(); used_images = set(); objects = []; events = {}; moved = {}
    lines = [l for p in source for l in p['lines']]
    # Report and omit clipped printer fragments, not their full valid sentences.
    fragments = [l for l in lines if l['bbox'][3] - l['bbox'][1] < 5 or
                 max(s['size'] for s in l['spans']) < 5]
    # Ch.9 p.30 paints sparse duplicate glyphs at exactly the same baseline as
    # the intact "restore function..." sentence. The complete sentence remains.
    if number == 9:
        intact = next(l for l in lines if l['pn']==30 and l['text'].startswith('restore function'))
        fragments += [l for l in lines if l['pn']==30 and l is not intact and
                      abs(l['bbox'][1]-intact['bbox'][1])<.01 and len(l['text'])<25]
    consumed.update(l['uid'] for l in fragments)
    front = doc[0].get_text().splitlines()
    title = clean(front[1]).split(': ', 1)[1]; author = clean(front[2])
    frontmatter = [l for l in lines if l['pn'] == 1 and l['bbox'][1] < 175]
    consumed.update(l['uid'] for l in frontmatter)

    def consume(ls): consumed.update(l['uid'] for l in ls)
    def at(pn, low=0, high=1000, xlow=0, xhigh=1000):
        return [l for l in source[pn-1]['lines'] if low <= l['bbox'][1] < high
                and xlow <= l['bbox'][0] < xhigh and l['uid'] not in consumed]
    def label(kind, num):
        return next(l for l in lines if l['text'].strip() == f'{kind} {number}–{num}.')
    def img(pn, i, alt):
        b = source[pn-1]['images'][i]; used_images.add((pn, i))
        return (f'<img src="{b["file"]}" width="{b["width"]}" height="{b["height"]}"'
                f' alt="{esc(alt)}" loading="lazy" decoding="async">')
    def add(kind, lab, title, body, start, covered, pages):
        oid = f'{ident}-{kind}-' + re.sub(r'[^a-z0-9]+', '-', lab.lower()).strip('-')
        obj = {'id': oid, 'kind': kind, 'label': lab, 'title': title, 'html': body,
               'page': start['pn'], 'sourcePages': sorted(set(pages))}
        objects.append(obj); consume(covered)
        events.setdefault(start['pn'], []).append({'y': start['bbox'][1], 'end': start['bbox'][3], 'html': object_html(obj)})
        for pn in pages:
            if pn != start['pn']: moved.setdefault(pn, []).append(obj)
        return obj

    # Full figure captions may cross a page boundary before the first panel.
    for num, positions in FIGURES.get(number, {}).items():
        lab = label('Figure', num); pn, index = positions[0]
        start = lab['pn'] * 1000 + lab['bbox'][1]
        end = pn * 1000 + source[pn-1]['images'][index]['bbox'][1]
        caption = [l for l in lines if start < l['pn'] * 1000 + l['bbox'][1] < end
                   and l['uid'] not in consumed]
        cap = Text(joined(caption)).value; assert cap, (number, num)
        body = '<div class="ld-figure-panels">' + ''.join(img(p, i, cap) for p, i in positions) + '</div>'
        add('figure', lab['text'].rstrip('.'), cap, body, lab, [lab, *caption],
            [lab['pn'], *(l['pn'] for l in caption), *(p for p, i in positions)])

    def cell_lines(pn, cell):
        r = pdf.Rect(cell)
        return [l for l in at(pn) if r.contains((pdf.Point(l['bbox'][:2]) + pdf.Point(l['bbox'][2:]))/2)]

    def table_rows(pn, table, header=True, breaks=False):
        cells_done = set(); result = []; selected = []
        xs = sorted(set(round(x, 2) for row in table['rows'] for c in row if c for x in (c[0], c[2])))
        ys = sorted(set(round(y, 2) for row in table['rows'] for c in row if c for y in (c[1], c[3])))
        for ri, row in enumerate(table['rows']):
            rr = []
            for c in row:
                if c is None: continue
                key = tuple(round(v, 2) for v in c)
                if key in cells_done: continue
                cells_done.add(key); ls = cell_lines(pn, c); selected.extend(ls)
                cs = xs.index(key[2])-xs.index(key[0]); rs = ys.index(key[3])-ys.index(key[1])
                tag = 'th' if header and ri == 0 else 'td'
                rr.append({'tag': tag, 'html': joined(ls, breaks), 'cs': cs, 'rs': rs})
            result.append(rr)
        return result, selected

    def grid(rows, columns):
        widths = ' ld-wide-table' if columns > 3 else ''
        return '<table class="ld-table'+widths+'"><tbody>' + ''.join('<tr>'+''.join(
            f'<{c["tag"]}' + (f' colspan="{c["cs"]}"' if c['cs'] > 1 else '') +
            (f' rowspan="{c["rs"]}"' if c['rs'] > 1 else '')+'>'+c['html']+f'</{c["tag"]}>' for c in r)+'</tr>' for r in rows)+'</tbody></table>'

    # Ordinary numbered grids, with the original multi-row headers and footnotes.
    for pn, page in enumerate(source, 1):
        if number == 10: continue  # both tables need reviewed page/row joins below
        for ti, table in enumerate(page['tables']):
            r = pdf.Rect(table['bbox']); rows, ls = table_rows(pn, table, breaks=number == 6)
            labels = [l for l in at(pn) if re.fullmatch(r'Table \d+–\d+\.', l['text'].strip()) and 0 < r.y0-l['bbox'][1] < 100]
            lab = labels[-1] if labels else None
            caps = at(pn, lab['bbox'][3], r.y0) if lab else []
            notes = [l for l in at(pn, r.y1, r.y1+58) if max(s['size'] for s in l['spans']) < 8]
            body = grid(rows, len(table['rows'][0])) + ('<div class="ld-table-notes">'+joined(notes)+'</div>' if notes else '')
            start = lab or {'pn': pn, 'bbox': list(r)}
            add('table', lab['text'].rstrip('.') if lab else f'Table · p.{pn}',
                Text(joined(caps)).value if lab else 'Disorders · Key Element of Diagnosis', body,
                start, [*ls, *caps, *notes, *([lab] if lab else [])], [pn])

    # One-column diagnostic lists: keep every item and its original indentation.
    if number == 9:
        for num, pn, low, high in [(3, 4, 110, 345), (6, 15, 110, 315), (7, 15, 380, 705), (9, 28, 340, 650)]:
            lab = label('Table', num); cap = at(pn, lab['bbox'][3], low)
            ls = at(pn, low, high)
            # Table 9-9 ends before Clinical Findings; do not absorb that heading.
            ls = [l for l in ls if not (number == 9 and num == 9 and l['bbox'][0] < 40)]
            body = '<div class="ld-native-box">'+''.join('<p'+(' class="ld-list-block"' if l['text'].startswith('\u2003') else '')+'>'+span_html(l['spans'])+'</p>' for l in ls)+'</div>'
            notes = at(pn, 365, 380) if num == 3 else []
            body += '<div class="ld-table-notes">'+joined(notes)+'</div>' if notes else ''
            add('table', lab['text'].rstrip('.'), Text(joined(cap)).value, body, lab, [lab, *cap, *ls, *notes], [pn])

        # Table 9-8: all 18 content/group rows, eight illustrations, four pages. Each continuation
        # is joined into the same semantic cell; no independent fragment figures.
        starts = [(17, 106.5), (17, 145), (17, 197), (17, 372.9), (17, 398.1),
                  (17, 423.2), (17, 574), (17, 715.9), (18, 349), (18, 642.9),
                  (19, 289.3), (19, 341.2), (19, 433.4), (19, 458.5), (19, 564.1),
                  (20, 294.9), (20, 575.8), (20, 601)]
        bounds = [p*1000+y-.15 for p,y in starts] + [20640]
        selected = []; rows = []
        header = at(17, 75, 95); selected.extend(header)
        rows.append([{'tag':'th','html':'Maneuver','cs':1,'rs':1}, {'tag':'th','html':'Description','cs':1,'rs':1}])
        for a,b in zip(bounds,bounds[1:]):
            ls = [l for l in lines if a <= l['pn']*1000+l['bbox'][1] < b and l['uid'] not in consumed]
            left = [l for l in ls if l['bbox'][0] < 299]; right = [l for l in ls if l['bbox'][0] >= 299]
            assert left, (a,b)
            panels = []
            for pn in range(17,21):
                for i,im in enumerate(source[pn-1]['images']):
                    if a <= pn*1000+im['bbox'][1] < b: panels.append(img(pn, i, Text(joined(left)).value))
            rows.append([{'tag':'th','html':joined(left)+''.join(panels),'cs':1,'rs':1},
                         {'tag':'td','html':joined(right),'cs':1,'rs':1}]); selected.extend(ls)
        lab = label('Table', 8); caps = at(16, lab['bbox'][3], 731); notes = at(20, 650, 665)
        body = grid(rows, 2).replace('class="ld-table"', 'class="ld-table ld-exam-table"')
        body += '<div class="ld-table-notes">'+joined(notes)+'</div>'
        add('table', lab['text'].rstrip('.'), Text(joined(caps)).value, body, lab, [lab, *caps, *selected, *notes], [16,17,18,19,20])

    if number == 10:
        for num, first, second in [(1,9,10),(2,15,16)]:
            a, b = source[first-1]['tables'][0], source[second-1]['tables'][0]
            rows, ls = table_rows(first, a); more, ls2 = table_rows(second, b, header=False)
            if num == 2:
                # Fish oil continues in the first row of p.16, in the same columns.
                for cell, continuation in zip(rows[-1], more.pop(0)):
                    if continuation['html']: cell['html'] += ' '+continuation['html']
            rows.extend(more); lab = label('Table', num)
            caps = [l for l in lines if lab['pn']*1000+lab['bbox'][3] <= l['pn']*1000+l['bbox'][1] < first*1000+a['bbox'][1] and l['uid'] not in consumed]
            add('table', lab['text'].rstrip('.'), Text(joined(caps)).value, grid(rows, 5), lab, [lab,*caps,*ls,*ls2], [lab['pn'],first,second])

    # Remaining artwork is source equation art; all figure/table panels were assigned.
    equations = []
    for pn, page in enumerate(source, 1):
        for i, im in enumerate(page['images']):
            if (pn,i) in used_images: continue
            assert number == 6 and (pn == 21 or pn == 22 or pn == 33), (number,pn,i)
            r = pdf.Rect(im['bbox']); equations.append((pn,i))
            body = img(pn,i,f'原文公式（Chapter {number}, PDF p.{pn}）').replace('<img ', '<img class="ld-equation" ')
            events.setdefault(pn,[]).append({'y':r.y0,'end':r.y1,'html':body})

    # Render ordinary reading paragraphs and semantic headings after object extraction.
    outline=[]; pages=[]
    for pn,page in enumerate(source,1):
        ev=events.get(pn,[])
        for l in page['lines']:
            if l['uid'] in consumed: continue
            ss=l['spans'];t=l['text'].strip();size=max(s['size'] for s in ss)
            # Bold chapter subsections (diagnosis numbers) form a level between
            # anatomic areas and Clinical Findings/Prevention/Treatment.
            level = 2 if size>12 else (3 if re.match(r'^\d+\. ',t) and size>10.3 else 4 if size>10.3 else 5 if 8.8<size<9 and re.match(r'^[A-Z]\. ',t) and len(t)<120 else None)
            if number not in (8,9) and level==4:level=3
            if t=='ESSENTIALS OF DIAGNOSIS':level=5
            markup=span_html(ss)
            for link in page['links']:
                uri=link.get('uri','');r=pdf.Rect(link['from'])
                if uri.startswith(('http://','https://','mailto:')) and r.contains((pdf.Point(l['bbox'][:2])+pdf.Point(l['bbox'][2:]))/2):
                    markup=f'<a href="{esc(uri)}" target="_blank" rel="noopener">{markup}</a>';break
            ev.append({'y':l['bbox'][1],'end':l['bbox'][3],'x':l['bbox'][0],'html':markup,'text':t,'level':level,'inline':True,'list':l['bbox'][0]>35})
        ev.sort(key=lambda e:(round(e['y'],1),e.get('x',0)))
        rendered=[];pending='';last=0;serial=0;is_list=False
        def flush():
            nonlocal pending
            if pending:rendered.append(('<p class="ld-list-block">' if is_list else '<p>')+pending+'</p>');pending=''
        for e in ev:
            if not e.get('inline'):flush();rendered.append(e['html']);last=e['end'];continue
            if e['level']:
                flush();serial+=1;hid=f'{ident}-p{pn}-h{serial}';outline.append({'id':hid,'title':e['text'],'page':pn,'level':e['level']});rendered.append(f'<h{e["level"]} id="{hid}">{e["html"]}</h{e["level"]}>')
            else:
                if pending and (e['y']-last>8 or e['list']!=is_list):flush()
                is_list=e['list'];pending+=('' if pending.endswith('-') else ' ' if pending else '')+e['html']
            last=e['end']
        flush()
        if not rendered:
            assert pn in moved, (number,pn,'unexpected blank source page')
            rendered=['<p class="ld-source-blank">'+ ' · '.join(f'<a href="#{o["id"]}" data-ld-object="{o["id"]}">{esc(o["label"])}</a>' for o in moved[pn])+'（圖表已與完整圖說合併）</p>']
        pages.append({'number':pn,'id':f'{ident}-page-{pn}','html':'\n'.join(rendered)})

    imported=norm(Text(''.join(p['html'] for p in pages)).value)
    # Normalize only whitespace. Moving complete figures/tables across printed page
    # boundaries is allowed, but each original source line must remain present.
    audited=[l for l in lines if l not in fragments and l not in frontmatter]
    missing=[{'page':l['pn'],'text':l['text']} for l in audited if
             (norm(l['text']).rstrip('.') if re.fullmatch(r'(?:Table|Figure) \d+–\d+\.',l['text'].strip()) else norm(l['text'])) not in imported]
    assert not missing, missing
    assert len(used_images)==sum(len(p['images']) for p in source)
    objects.sort(key=lambda o:(o['page'],next(e['y'] for e in events[o['page']] if f'id="{o["id"]}"' in e['html'])))
    data={'id':ident,'title':title,'label':f'Chapter {number}','edition':6,'author':author,'pages':pages,'outline':outline,'objects':objects,
          'source':{'filename':path.name,'pages':len(doc),'sha256':sha},'repairs':{'count':0}}
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n';filename=f'{ident}-{hashlib.sha256(raw.encode()).hexdigest()[:16]}.json';(OUT/filename).write_text(raw,encoding='utf8')
    report={'chapter':ident,'pages':len(pages),'headings':len(outline),'tables':sum(o['kind']=='table' for o in objects),'figures':sum(o['kind']=='figure' for o in objects),
            'imagePanelsAndEquations':len(used_images),'equations':len(equations),'matchedBodyLines':len(audited),'unmatchedBodyLines':len(missing),
            'discardedPrintFragments':[{'page':l['pn'],'text':l['text']} for l in fragments]}
    print(json.dumps(report,ensure_ascii=False),flush=True)
    return {'id':ident,'label':f'Chapter {number}','title':title,'pages':len(doc),'file':'ladou/'+filename},report


def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder');args=ap.parse_args();QA.mkdir(parents=True,exist_ok=True)
    entries=[];reports=[]
    for n in EXPECTED:
        paths=list(Path(args.folder).glob(f'Chapter {n:02d} *.pdf'));assert len(paths)==1
        e,r=import_chapter(paths[0],n);entries.append(e);reports.append(r)
    index=json.loads((OUT/'index.json').read_text('utf8'));ids={e['id'] for e in entries}
    chapters=[c for c in index['chapters'] if c['id'] not in ids]+entries
    index['chapters']=sorted(chapters,key=lambda c: int(c['id'][1:]) if re.fullmatch(r'c\d+',c['id']) else 999)
    (OUT/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (QA/'audit.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')


if __name__=='__main__':main()
