"""Reviewed LaDou 6e chapters 26–30: native text/tables, original complete artwork.

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
QA = ROOT / '.local/ladou-batch-06'
EXPECTED = {26:15,27:16,28:18,29:31,30:56}
FIGURES = {26:{1:[(2,0)],2:[(2,1)],3:[(4,0)]},27:{1:[(3,0)],2:[(4,0)]},28:{1:[(3,0)]},29:{},30:{}}
TABLES = {
 26:{1:[(3,107,460)],2:[(7,414,591)],3:[(8,169,423)]},
 27:{1:[(2,276,503)],2:[(4,463,731),(5,65,731),(6,65,110)],3:[(9,74,656)]},
 28:{1:[(2,107,561)],2:[(4,690,716),(5,65,716),(6,65,716),(7,65,687)],3:[(10,117,334)],4:[(11,65,731),(12,67,296)]},
 29:{1:[(6,107,469)],2:[(10,107,307)],3:[(10,367,528)],4:[(14,107,496)],5:[(15,107,376)],6:[(18,107,410)],7:[(28,191,343)],8:[(28,403,696)],9:[(29,392,570)]},30:{}}
LIST_TABLES={(29,10),(29,14),(29,15)}
HEADERLESS={(28,2),(29,3),(29,4),(29,5),(29,8),(29,9)}


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
    duplicates=[l for l in lines if number==30 and l['pn']==29 and l['text']=='synthetic rubber gloves accelerate absorption of nitrate esters so only cotton or cotton-lined gloves should be worn Dermal contact with nitrates']
    for l in duplicates:
        assert any(other['pn']==29 and abs(other['bbox'][1]-l['bbox'][1])<.02 and other['text'].startswith('synthetic rubber gloves accelerate absorption of nitrate esters,') for other in lines)
    consumed.update(l['uid'] for l in fragments+duplicates)
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

    if number==30:
        for pn,index,caption in [
            (12,0,'Aromatic amines'),(30,0,'N-Nitrosamines — general structure'),
            (30,1,'N-Nitrosamines — examples'),(30,2,'Nitrosamines — formation reaction'),
            (38,0,'Polycyclic aromatic hydrocarbons'),(45,0,'Polychlorinated dibenzo-p-dioxins and polychlorinated dibenzofurans')]:
            b=source[pn-1]['images'][index]
            lab=f'Chemical structures (p. {pn})' if not (pn==30 and index==2) else 'Reaction (p. 30)'
            # Distinguish multiple original unnumbered objects on one page.
            if pn==30 and index<2:lab+=f' — {index+1}'
            add('figure',lab,caption,'<div class="ld-figure-panels">'+img(pn,index,caption)+'</div>',
                {'pn':pn,'bbox':b['bbox']},[],[pn])

    def cell_lines(pn, cell):
        r = pdf.Rect(cell)
        return [l for l in at(pn) if r.contains((pdf.Point(l['bbox'][:2]) + pdf.Point(l['bbox'][2:]))/2)]

    def grid(rows, columns):
        widths = ' ld-wide-table' if columns > 3 else ''
        return '<table class="ld-table'+widths+'"><tbody>' + ''.join('<tr>'+''.join(
            f'<{c["tag"]}' + (f' colspan="{c["cs"]}"' if c['cs'] > 1 else '') +
            (f' rowspan="{c["rs"]}"' if c['rs'] > 1 else '')+'>'+c['html']+f'</{c["tag"]}>' for c in r)+'</tr>' for r in rows)+'</tbody></table>'

    # Source vector borders supply row and column geometry. This avoids the
    # PDF detector's spurious margin columns and truncated continuation grids.
    def vector_rows(pn, low, high, header):
        ls=at(pn,low,high); selected=list(ls)
        if (number,pn) in LIST_TABLES and not (number==29 and pn==10 and low<350):
            return [[{'tag':'td','html':'<div class="ld-native-box">'+''.join(
                '<p'+(' class="ld-list-block"' if l['text'].startswith(('\u2003','(a)','(b)','(c)','(d)','(e)','(f)','(g)')) else '')+'>'+span_html(l['spans'])+'</p>' for l in ls)+'</div>','cs':1,'rs':1}]],selected,1
        # Borderless source tables: use verified column starts and each
        # original row baseline, rather than independently wrapping lists.
        if (number,pn) in {(26,3),(26,8),(29,28),(29,29)} and not (number==29 and low<350):
            bounds={(26,3):[40,225,580],(26,8):[40,215,580],(29,28):[40,275,580],(29,29):[40,212,580]}[(number,pn)]
            left=sorted([l for l in ls if l['bbox'][0]<bounds[1]],key=lambda l:l['bbox'][1])
            ys=[l['bbox'][1]-1 for l in left]+[high]
            rows=[]
            for a,b in zip(ys,ys[1:]):
                row=[{'tag':'th' if header and not rows else 'td','html':joined([l for l in ls if a<=l['bbox'][1]<b and x<=l['bbox'][0]<y],breaks=True),'cs':1,'rs':1} for x,y in zip(bounds,bounds[1:])]
                if len(row)==2 and row[0]['html'] and not row[1]['html'] and number==29:
                    row[0]['cs']=2;row=[row[0]]
                rows.append(row)
            return rows,selected,len(bounds)-1
        if number==28 and pn in (4,5,6,7):
            return [[{'tag':'td','html':joined([l]),'cs':1,'rs':1}]for l in sorted(ls,key=lambda l:l['bbox'][1])],selected,1
        if number==28 and pn==10:
            bounds=[40,190,322,416,466,528,580]
            cell=lambda selected,tag='td',cs=1,rs=1:{'tag':tag,'html':joined(selected,breaks=True),'cs':cs,'rs':rs}
            # Source detector merges the first three headings into a single
            # cell. Rebuild these independently at their printed positions.
            first=[cell([l for l in ls if x<=l['bbox'][0]<y and l['bbox'][1]<180],'th',rs=2)for x,y in zip(bounds[:3],bounds[1:4])]
            first.append(cell([l for l in ls if l['text']=='Sample Size Needed'],'th',cs=3))
            second=[cell([l for l in ls if x<=l['bbox'][0]<y and 145<l['bbox'][1]<180],'th')for x,y in zip(bounds[3:],bounds[4:])]
            rows=[first,second]
            starts=[190,228,254,292,318,334]
            for a,b in zip(starts,starts[1:]):rows.append([cell([l for l in ls if x<=l['bbox'][0]<y and a<=l['bbox'][1]<b])for x,y in zip(bounds,bounds[1:])])
            return rows,selected,6
        rects=[pdf.Rect(d['rect']) for d in doc[pn-1].get_drawings()]
        xs=sorted(set(round((r.x0+r.x1)/2,2) for r in rects if r.width<1 and r.height>10 and 40<r.x0<571 and r.y0<high and r.y1>low))
        ys=sorted(set([float(low),float(high)]+[round((r.y0+r.y1)/2,2) for r in rects if r.height<1 and r.width>20 and 40<r.x0<571 and low<(r.y0+r.y1)/2<high]))
        assert len(xs)>1,(number,pn,xs)
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
        # Source group labels span only truly empty value cells.
        for row in rows:
            if count>1 and row and row[0]['html'] and all(not c['html'] for c in row[1:]):
                row[0]['cs']=count;row[:]=[row[0]]
        if number==27 and num==2:
            # p.6 starts with the final word of the p.5 occupation cell.
            assert not rows[-2][0]['html'] and not rows[-2][1]['html']
            rows[-3][2]['html']+=' '+rows[-2][2]['html'];del rows[-2]
        last,low,high=regions[-1]
        notes=[]
        # Only immediately following source/footnote paragraphs belong to a
        # table; never consume the next table's label or caption as a footnote.
        after=sorted(at(last,high,high+65),key=lambda l:l['bbox'][1])
        for l in after:
            if not notes and not (l['text'].startswith(('Source:','APC,','BDs,','BBT,','Compiled from','BLL,','aSource:','aPrevalence','aOSHA','bDOE','aLead-')) or re.match(r'^[ab](?: =|Doses|SI|CGS|Carbon)' ,l['text'])):break
            if max(s['size']for s in l['spans'])>8.1 or re.match(r'^(Table|Figure) ',l['text']):break
            notes.append(l)
        if number==28 and num==2:
            notes.extend(at(8,65,80))
        body=grid(rows,count)+('<div class="ld-table-notes">'+joined(notes)+'</div>' if notes else '')
        add('table',lab['text'].rstrip('.'),Text(joined(caps)).value,body,lab,[lab,*caps,*selected,*notes],[lab['pn'],*(pn for pn,_,_ in regions),*(l['pn']for l in notes)])
    assert len(used_images)==sum(len(p['images'])for p in source),(number,'unassigned artwork')

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
            if level==4:level=3
            # Verify the source fonts for each chapter, including smaller subtitles.
            # Identify the verified source heading fonts, not body-line length.
            subfonts={26:'f3xqmcd-1bym-ezz-267cxut',27:'f169tq9s-12kf-f16-e2p9yh',28:'f1ibjsx1-49z-eh9-37e8fck',29:'f1omho7j-g2r-ex9-2tb2uep',30:'f183lt6z-atk-dlj-31o3b42'}
            numfonts={29:'f1l1gelm-11dw-e5c-378h73',30:'f1hyne54-1ek6-ekm-nyjdyc'}
            if l['bbox'][0]<30:
                if all(s['font']==subfonts[number]for s in ss):level=4
                elif number in numfonts and all(s['font']==numfonts[number]for s in ss):level=5
            # The PDF's small capitals have broken word spacing. Recover only
            # verified heading words, preserving every letter in source order.
            if number==30 and size<6.2 and re.match(r'^[A-Z]\.',t):level=6
            if t=='ESSENTIALS OF DIAGNOSIS':level=5
            markup=span_html(ss)
            if number==30 and level==6:
                words=['SKIN','RESPIRATORY EFFECTS','SYSTEMIC EFFECTS','DENTAL EROSION','CANCER','DERMATITIS','HEMORRHAGIC CYSTITIS','HEPATIC INJURY','METHEMOGLOBINEMIA','EYE','EAR','HEART','NERVOUS SYSTEM','REPRODUCTIVE EFFECTS','CARCINOGENIC EFFECTS','NEUROLOGIC TOXICITY','OTHER','RESPIRATORY','OTHER EFFECTS','EYE, NOSE, AND THROAT','SYSTEMIC INTOXICATION','ACROOSTEOLYSIS','LIVER DISEASE','PULMONARY EFFECTS']
                key=norm(t.split('.',1)[1]);word=next(w for w in words if norm(w)==key)
                t=t[0]+'. '+word;markup=esc(t)

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
            assert pn in moved, (number,pn,'unexpected blank source page')
            if pn not in moved:moved[pn]=[]
            rendered=['<p class="ld-source-blank">'+ ' · '.join(f'<a href="#{o["id"]}" data-ld-object="{o["id"]}">{esc(o["label"])}</a>' for o in moved[pn])+('（圖表已與完整圖說合併）' if moved[pn] else '原 PDF 此頁無正文。')+'</p>']
        pages.append({'number':pn,'id':f'{ident}-page-{pn}','html':'\n'.join(rendered)})

    imported=norm(Text(''.join(p['html'] for p in pages)).value)
    # Normalize only whitespace. Moving complete figures/tables across printed page
    # boundaries is allowed, but each original source line must remain present.
    audited=[l for l in lines if l not in fragments and l not in frontmatter and l not in duplicates]
    missing=[{'page':l['pn'],'text':l['text']} for l in audited if
             (norm(l['text']).rstrip('.') if re.fullmatch(r'(?:Table|Figure) \d+–\d+\.',l['text'].strip()) else norm(l['text'])) not in imported]
    assert not missing, missing
    assert len(used_images)==sum(len(p['images']) for p in source)
    objects.sort(key=lambda o:(o['page'],next(e['y'] for e in events[o['page']] if f'id="{o["id"]}"' in e['html'])))
    data={'id':ident,'title':title,'label':f'Chapter {number}','edition':6,'author':author,'pages':pages,'outline':outline,'objects':objects,
          'source':{'filename':path.name,'pages':len(doc),'sha256':sha},'repairs':{'count':0}}
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n';filename=f'{ident}-{hashlib.sha256(raw.encode()).hexdigest()[:16]}.json';(OUT/filename).write_text(raw,encoding='utf8')
    report={'chapter':ident,'pages':len(pages),'headings':len(outline),'tables':sum(o['kind']=='table' for o in objects),'figures':sum(o['kind']=='figure' for o in objects),
            'imagePanelsAndEquations':len(used_images),'equations':1 if number==30 else 0,'matchedBodyLines':len(audited),'unmatchedBodyLines':len(missing),
            'discardedDuplicateOverlays':[{'page':l['pn'],'text':l['text']}for l in duplicates],
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
