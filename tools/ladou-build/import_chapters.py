"""Import the reviewed first five user-supplied LaDou chapters; no source PDF is published."""
from pathlib import Path
from html.parser import HTMLParser
import argparse,hashlib,json,re
import pymupdf as pdf
from import_appendix import esc,clean,span_html

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'ladou'
EXPECTED={1:6,2:8,3:10,4:6,5:11}

class Text(HTMLParser):
    def __init__(self,value):super().__init__();self.value='';self.feed(value)
    def handle_data(self,value):self.value+=value

def norm(value):return re.sub(r'\s+','',clean(value)).rstrip('.')

def import_chapter(path,number):
    doc=pdf.open(path);assert len(doc)==EXPECTED[number]
    ident=f'c{number:02d}';pages=[];outline=[];objects=[];audit=[];source_lines=[];image_count=0;discarded=[]
    front=doc[0].get_text().splitlines();title=clean(front[1]).split(': ',1)[1];author=clean(front[2])
    # Keep a single complete cross-page figure: the title is on p.1, artwork p.2.
    figure_label='Figure 2–1';figure_title='The initial clinical approach to the recognition of illness caused by occupational exposure.'
    for pn,page in enumerate(doc,1):
        lines=[];images=[];events=[];regions=[];links=page.get_links()
        for block in page.get_text('dict')['blocks']:
            if block['type']==1:
                r=pdf.Rect(block['bbox'])
                if r.is_valid and r.height>0 and 65<=r.y0<731 and r.y1<731:
                    assert not block['width']==block['height']==60, f'Unreviewed loading spinner: {ident} p.{pn}'
                    images.append(block)
                continue
            for line in block.get('lines',[]):
                r=pdf.Rect(line['bbox']);t=clean(''.join(s['text'] for s in line['spans']))
                if r.y0<65 or r.y1>731 or not t.strip() or pn==1 and r.y0<175:continue
                # Printing artifact: ascender/descender fragments from the previous page.
                # Their full sentence is retained on that page; never publish the fragments.
                if r.height<4:
                    discarded.append({'page':pn,'text':t,'height':round(r.height,2)});continue
                lines.append({**line,'rect':r,'text':t})
                source_lines.append((pn,t))
        tables=page.find_tables(clip=pdf.Rect(20,65,592,731)).tables
        for ti,table in enumerate(tables):
            r=pdf.Rect(table.bbox);regions.append(r);rows=[];done=set()
            xs=sorted(set(round(x,2) for row in table.rows for c in row.cells if c for x in (c[0],c[2])))
            ys=sorted(set(round(y,2) for row in table.rows for c in row.cells if c for y in (c[1],c[3])))
            for ri,row in enumerate(table.rows):
                cells=[]
                for cell in row.cells:
                    if cell is None:continue
                    key=tuple(round(v,2) for v in cell)
                    if key in done:continue
                    done.add(key);cr=pdf.Rect(cell);ls=[l for l in lines if cr.contains((l['rect'].tl+l['rect'].br)/2)]
                    ls.sort(key=lambda l:(round(l['rect'].y0,1),l['rect'].x0));cs=xs.index(key[2])-xs.index(key[0]);rs=ys.index(key[3])-ys.index(key[1]);tag='th' if ri==0 else 'td'
                    sep='<br>' if number==5 and ri>0 and cr.x0>400 else ' '
                    body=sep.join(span_html(l['spans']) for l in ls)
                    cells.append(f'<{tag}'+(f' colspan="{cs}"' if cs>1 else '')+(f' rowspan="{rs}"' if rs>1 else '')+'>'+body+f'</{tag}>')
                rows.append('<tr>'+''.join(cells)+'</tr>')
            labels=[l for l in lines if re.fullmatch(r'Table \d+[–-]\d+\.',l['text'].strip()) and 0<r.y0-l['rect'].y0<100]
            assert labels, f'Unlabelled table {ident} p.{pn}'
            label=labels[-1];captions=[l for l in lines if label['rect'].y1<l['rect'].y0<r.y0]
            caption=' '.join(l['text'].strip() for l in captions);oid=f'{ident}-table-{ti+1}-p{pn}';body='<table class="ld-table'+(' ld-workplace-table' if number==5 else '')+'"><tbody>'+''.join(rows)+'</tbody></table>'
            obj={'id':oid,'kind':'table','label':label['text'].rstrip('.'),'title':caption,'page':pn,'html':body};objects.append(obj)
            events.append({'y':r.y0,'end':r.y1,'html':object_html(obj)})
            regions.extend([label['rect'],*(l['rect'] for l in captions)])
        if number==2 and pn==3:
            # Table 2-1 is a one-column questionnaire, not a detected multi-column grid.
            r=pdf.Rect(24,65,588,674);regions.append(r)
            body_lines=[l for l in lines if 100<l['rect'].y0<674]
            paragraphs=[]
            for line in body_lines:
                # These reviewed lowercase starts are wrapped continuations, not new questions.
                if paragraphs and re.match(r'^[a-z]',line['text'].strip()):paragraphs[-1]['html']+=' '+span_html(line['spans'])
                else:paragraphs.append({'html':span_html(line['spans']),'indent':max(0,round((line['rect'].x0-66.4)/17.8))})
            body='<div class="ld-native-box">'+''.join(f'<p style="margin-left:{p["indent"]}em">{p["html"]}</p>' for p in paragraphs)+'</div>'
            obj={'id':'c02-table-2-1','kind':'table','label':'Table 2–1','title':'Essential elements of the comprehensive occupational history and questionnaire.','page':3,'html':body};objects.append(obj);events.append({'y':65,'end':674,'html':object_html(obj)})
        def covered(r):return any(region.contains((r.tl+r.br)/2) for region in regions)
        for block in images:
            r=pdf.Rect(block['bbox'])
            assert number==2 and pn==2 and block['width']==520 and block['height']==296, f'Unreviewed image {ident} p.{pn}'
            digest=hashlib.sha256(block['image']).hexdigest()[:16];name=f'ladou/assets/{digest}.{block["ext"]}';(ROOT/name).write_bytes(block['image']);image_count+=1
            body=f'<img src="{name}" width="{block["width"]}" height="{block["height"]}" alt="{esc(figure_title)}" loading="lazy" decoding="async">'
            obj={'id':'c02-figure-2-1','kind':'figure','label':figure_label,'title':figure_title,'page':1,'sourcePages':[1,2],'html':body};objects.append(obj)
            # Place at the original caption on p.1, rather than a title-only stub.
            pages[0]['html']=pages[0]['html'].replace('<!--figure-2-1-->',object_html(obj))
        for line in lines:
            r=line['rect'];t=line['text'].strip();ss=line['spans']
            if covered(r):continue
            if number==2 and pn==1 and (t=='Figure 2–1.' or t==figure_title):
                if t=='Figure 2–1.':events.append({'y':r.y0,'end':r.y1,'html':'<!--figure-2-1-->'})
                continue
            size=max(s['size'] for s in ss);level=2 if size>12 else 3 if size>10.3 else 4 if 8.8<size<9 and re.match(r'^[A-Z]\. ',t) and len(t)<100 else 5 if 7.2<size<7.4 and len(t)<100 else 6 if 6<size<6.3 and len(t)<100 else None
            markup=span_html(ss)
            # Preserve genuine PDF hyperlink targets, including wrapped URLs and PubMed.
            for link in links:
                uri=link.get('uri','');lr=pdf.Rect(link['from'])
                if uri.startswith(('https://','http://','mailto:')) and lr.contains((r.tl+r.br)/2):markup=f'<a href="{esc(uri)}" target="_blank" rel="noopener">{markup}</a>';break
            events.append({'y':r.y0,'end':r.y1,'x':r.x0,'html':markup,'text':t,'level':level,'inline':True,'list':r.x0>30})
        events.sort(key=lambda e:(round(e['y'],1),e.get('x',0)));rendered=[];pending='';last=0;serial=0;is_list=False
        def flush():
            nonlocal pending
            if pending:rendered.append(('<p class="ld-list-block">' if is_list else '<p>')+pending+'</p>');pending=''
        for e in events:
            if not e.get('inline'):flush();rendered.append(e['html']);last=e['end'];continue
            if e['level']:
                flush();serial+=1;hid=f'{ident}-p{pn}-h{serial}';outline.append({'id':hid,'title':e['text'],'page':pn,'level':e['level']});rendered.append(f'<h{e["level"]} id="{hid}">{e["html"]}</h{e["level"]}>')
            else:
                if pending and (e['y']-last>8 or e['list']!=is_list):flush()
                is_list=e['list'];pending+=(' ' if pending else '')+e['html']
            last=e['end']
        flush()
        blank=not rendered
        pages.append({'number':pn,'id':f'{ident}-page-{pn}','html':'\n'.join(rendered) if rendered else '<p class="ld-source-blank">原 PDF 此頁無正文。</p>','blank':blank})
        audit.append({'page':pn,'tables':len(tables)+(number==2 and pn==3),'images':len(images),'blank':blank})
    assert all('<!--figure' not in p['html'] for p in pages)
    imported={p['number']:norm(Text(p['html']).value) for p in pages};missing=[(pn,t) for pn,t in source_lines if norm(t) not in imported[pn]]
    # Figure caption is intentionally moved together with its original image, but remains on p.1.
    assert not missing,missing
    data={'id':ident,'title':title,'label':f'Chapter {number}','edition':6,'author':author,'pages':pages,'outline':outline,'objects':objects,'source':{'filename':path.name,'pages':len(doc),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()},'repairs':{'count':0}}
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n';digest=hashlib.sha256(raw.encode()).hexdigest()[:16];filename=f'{ident}-{digest}.json';(OUT/filename).write_text(raw,encoding='utf8')
    report={'chapter':ident,'pages':len(pages),'headings':len(outline),'tables':len([o for o in objects if o['kind']=='table']),'figures':image_count,'matchedBodyLines':len(source_lines),'unmatchedBodyLines':len(missing),'discardedPrintFragments':discarded,'sourceBlankPages':[p['number'] for p in pages if p['blank']]}
    print(json.dumps(report,ensure_ascii=False),flush=True)
    return {'id':ident,'label':f'Chapter {number}','title':title,'pages':len(pages),'file':'ladou/'+filename},report

def object_html(obj):
    return f'<figure id="{obj["id"]}" class="ld-object'+(' ld-figure' if obj['kind']=='figure' else '')+f'"><figcaption>{esc(obj["label"])} · {esc(obj["title"])}</figcaption><div class="ld-table-wrap">{obj["html"]}</div><button type="button" data-ld-object="{obj["id"]}">放大檢視</button></figure>'

def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder');args=ap.parse_args();entries=[];audit=[]
    for n in range(1,6):
        matches=list(Path(args.folder).glob(f'Chapter {n:02d} *.pdf'));assert len(matches)==1
        entry,report=import_chapter(matches[0],n);entries.append(entry);audit.append(report)
    index=json.loads((OUT/'index.json').read_text('utf8'));index['chapters']=entries+[c for c in index['chapters'] if c['id'] not in {e['id'] for e in entries}]
    (OUT/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    output=ROOT/'.local/ladou-batch-01';output.mkdir(parents=True,exist_ok=True);(output/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')

if __name__=='__main__':main()
