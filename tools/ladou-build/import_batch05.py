"""Reviewed LaDou 6e chapters 21–25: native text/tables, original complete artwork.

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
QA = ROOT / '.local/ladou-batch-05'
EXPECTED = {21:29,22:12,23:17,24:20,25:41}
FIGURES = {21:{},22:{},23:{},24:{1:[(1,0)],2:[(2,0)],3:[(3,0)],4:[(7,0)]},25:{1:[(3,0)]}}
TABLES = {
 21:{1:[(2,107,675)],2:[(5,107,264)],3:[(7,142,404)],4:[(8,107,335)],5:[(13,155,307)],6:[(22,117,478)]},
 22:{1:[(6,107,574)]},
 23:{1:[(4,107,536)],2:[(6,107,510)],3:[(10,155,461)]},
 24:{1:[(3,355,633)],2:[(4,300,427)],3:[(8,128,381)],4:[(12,107,313)],5:[(20,107,334)]},
 25:{1:[(4,107,336)],2:[(8,107,513)]}}

LIST_TABLES={(21,8),(21,22),(23,6),(25,8)}
HEADERLESS={(21,5),(21,6),(23,2),(25,2)}




class Text(HTMLParser):
    def __init__(self, value):
        super().__init__(); self.value = ''; self.feed(value)
    def handle_data(self, value): self.value += value


def norm(s): return re.sub(r'\s+', '', clean(s))


def joined(lines, breaks=False):
    result = ''
    for l in sorted(lines, key=lambda l: (l['pn'], round(l['bbox'][1], 1), l['bbox'][0])):
        t = span_html(l['spans']).strip()
        result += ((' <br>' if breaks else '' if result.endswith('-') else ' ') if result else '') + t
    return result


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

    # Source vector borders supply row and column geometry. This avoids the
    # PDF detector's spurious margin columns and truncated continuation grids.
    def vector_rows(pn, low, high, header):
        ls=at(pn,low,high); selected=list(ls)
        if (number,pn) in LIST_TABLES:
            return [[{'tag':'td','html':'<div class="ld-native-box">'+''.join(
                '<p'+(' class="ld-list-block"' if l['text'].startswith(('\u2003','(a)','(b)','(c)','(d)','(e)','(f)','(g)')) else '')+'>'+span_html(l['spans'])+'</p>' for l in ls)+'</div>','cs':1,'rs':1}]],selected,1
        rects=[pdf.Rect(d['rect']) for d in doc[pn-1].get_drawings()]
        xs=sorted(set(round((r.x0+r.x1)/2,2) for r in rects if r.width<1 and r.height>10 and 40<r.x0<571 and r.y0<high and r.y1>low))
        ys=sorted(set([float(low),float(high)]+[round((r.y0+r.y1)/2,2) for r in rects if r.height<1 and r.width>20 and 40<r.x0<571 and low<(r.y0+r.y1)/2<high]))
        assert len(xs)>1,(number,pn,xs)
        if number==21 and pn in (5,7):
            # Printed baselines define nested category rows. Keep every value
            # aligned with its original category after mobile text wrapping.
            left=sorted([l for l in ls if l['bbox'][0]<xs[1]],key=lambda l:l['bbox'][1])
            ys=sorted(set([low]+[l['bbox'][1]-1 for l in left[1:]]+[high]))
        rows=[]
        for a,b in zip(ys,ys[1:]):
            row=[]
            for x,y in zip(xs,xs[1:]):
                cell=[l for l in ls if a <= (l['bbox'][1]+l['bbox'][3])/2 < b and x-.5 <= l['bbox'][0] < y-.5]
                row.append({'tag':'th' if header and not rows else 'td','html':joined(cell,breaks=True),'cs':1,'rs':1})
            if any(c['html'] for c in row):rows.append(row)
        return rows,selected,len(xs)-1

    for num,regions in TABLES[number].items():
        lab=label('Table',num); rows=[];selected=[];count=0
        first,low,high=regions[0]
        caps=[l for l in lines if lab['pn']*1000+lab['bbox'][3] <= l['pn']*1000+l['bbox'][1] < first*1000+low and l['uid'] not in consumed]
        for i,(pn,low,high) in enumerate(regions):
            more,ls,cols=vector_rows(pn,low,high,i==0 and (number,num) not in HEADERLESS)
            rows.extend(more);selected.extend(ls);count=max(count,cols)
        if number==21 and num in (2,3):
            # Group labels carry no values of their own, not an entire PDF
            # cell of independently wrapping category/value lists.
            groups=[1,3,6] if num==2 else [1,2,3,9]
            for ri in groups:
                assert not any(c['html'] for c in rows[ri][1:]), (number,num,ri)
                rows[ri][0]['cs']=count;rows[ri]=[rows[ri][0]]
        if number==22:
            for ri in (4,7):
                assert not any(c['html']for c in rows[ri][1:])
                rows[ri][0]['cs']=4;rows[ri]=[rows[ri][0]]
        last,low,high=regions[-1]
        notes=[]
        # Only immediately following source/footnote paragraphs belong to a
        # table; never consume the next table's label or caption as a footnote.
        after=sorted(at(last,high,high+65),key=lambda l:l['bbox'][1])
        for l in after:
            if not notes and not (l['text'].startswith(('Source:','*NSAIDs')) or re.match(r'^[ab](?: =|Doses|SI|CGS|Carbon)' ,l['text'])):break
            if max(s['size']for s in l['spans'])>8.1 or re.match(r'^(Table|Figure) ',l['text']):break
            notes.append(l)
        body=grid(rows,count)+('<div class="ld-table-notes">'+joined(notes)+'</div>' if notes else '')
        add('table',lab['text'].rstrip('.'),Text(joined(caps)).value,body,lab,[lab,*caps,*selected,*notes],[lab['pn'],*(pn for pn,_,_ in regions)])
    assert len(used_images)==sum(len(p['images'])for p in source),(number,'unassigned artwork')
    equations=[]

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
            # These two PDFs use smaller headings than the earlier printouts.
            # Identify the verified source heading fonts, not body-line length.
            subfonts={24:'fdbjkbi-kkz-d0k-269x5vtz',25:'f6mfjj5-lor-dmq-2v0dypq9'}
            alphafonts={24:'fhpbvhu-72m-ffm-6ha2kt8z',25:'f4xgz74-b01-f13-3s8wne4d'}
            if number in subfonts and l['bbox'][0]<30:
                if all(s['font']==subfonts[number]for s in ss):level=4
                elif all(s['font']==alphafonts[number]for s in ss) and re.match(r'^[A-Z]\. ',t):level=5
            if t=='ESSENTIALS OF DIAGNOSIS':level=5
            markup=span_html(ss)
            for link in page['links']:
                uri=link.get('uri','');r=pdf.Rect(link['from'])
                if uri.startswith(('http://','https://','mailto:')) and r.contains((pdf.Point(l['bbox'][:2])+pdf.Point(l['bbox'][2:]))/2):
                    markup=f'<a href="{esc(uri)}" target="_blank" rel="noopener">{markup}</a>';break
            ev.append({'y':l['bbox'][1],'end':l['bbox'][3],'x':l['bbox'][0],'html':markup,'text':t,'level':level,'inline':True,'list':l['bbox'][0]>35})
        ev.sort(key=lambda e:(round(e['y'],1),e.get('x',0)))
        merged=[]
        for e in ev:
            if merged and e.get('level') and e.get('level')==merged[-1].get('level') and 0<=e['y']-merged[-1]['end']<5:
                merged[-1]['html']+=' '+e['html'];merged[-1]['text']+=' '+e['text'];merged[-1]['end']=e['end']
            else:merged.append(e)
        ev=merged
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
            assert pn in moved or (number==22 and pn==12), (number,pn,'unexpected blank source page')
            if pn not in moved:moved[pn]=[]
            rendered=['<p class="ld-source-blank">'+ ' · '.join(f'<a href="#{o["id"]}" data-ld-object="{o["id"]}">{esc(o["label"])}</a>' for o in moved[pn])+('（圖表已與完整圖說合併）' if moved[pn] else '原 PDF 此頁無正文。')+'</p>']
        pages.append({'number':pn,'id':f'{ident}-page-{pn}','html':'\n'.join(rendered),**({'blank':True} if number==22 and pn==12 else {})})

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
