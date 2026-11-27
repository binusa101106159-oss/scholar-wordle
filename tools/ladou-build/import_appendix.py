"""Import the supplied LaDou 6e Appendix A without reusing AMA's data/storage.

Usage: python tools/ladou-build/import_appendix.py <source.pdf>
PyMuPDF is required. Only supplied content and the eight documented repairs are used.
"""
from pathlib import Path
import argparse, hashlib, html, json, re
import pymupdf as pdf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'ladou'
CDC = 'https://stacks.cdc.gov/view/cdc/189249/cdc_189249_DS1.pdf'
TITLE = 'Biostatistics & Epidemiology'
FONTS = {'fj8mlkx-1bte-frz-1krc4ei': 2, 'f2nox2l-km1-fju-3720d38z': 3,
         'f11vycrs-ni1-en2-2wquulm': 4, 'f1iwlhxe-1ci8-eb6-14m9xy': 5,
         'f9mtaua-qaq-fb7-23l14f4s': 6}

def clean(s):
    return s.replace('\xa0', ' ').replace('\xad', '-').replace('\ue92f', '')

def esc(s):
    return html.escape(clean(s), quote=True)

def frac(a, b):
    return f'<span class="ld-frac"><span>{a}</span><span>{b}</span></span>'

def span_html(spans):
    baseline=max(s['size'] for s in spans)
    origin=next(s['origin'][1] for s in spans if s['size']==baseline)
    result=''
    for s in spans:
        t=esc(s['text'])
        if s['size']<baseline*.86 and s['text'].strip() and abs(s['origin'][1]-origin)>1:
            tag='sup' if s['origin'][1]<origin else 'sub';t=f'<{tag}>{t}</{tag}>'
        result+=t
    return result

def note(text, page):
    return f'<details class="ld-source-note"><summary>校勘來源</summary><p>{text} <a href="{CDC}#page={page}" target="_blank" rel="noopener">LaDou 4e，原書 p.{788+page}</a>。第 6 版其餘內容依使用者提供的 PDF 保留。</p></details>'

def repaired_table():
    rows = [
        ('Crude death rate', 'Number of deaths in year (all causes)', 'Total population', '1000',
         'eg, US 1977 = 8.8 ÷ 1000 population or 878.1 ÷ 100,000 population'),
        ('Cause-specific death rate', 'Number of deaths from specific cause in year', 'Total population', '100,000',
         'eg, cancer in US 1977 = 178.7 ÷ 100,000 population'),
        ('Age-specific death rate', 'Number of deaths among persons of specified age group in year', 'Population in specified age group', '100,000',
         'eg, cancer in age group 1–14 years = 4.9 ÷ 100,000'),
        ('Infant mortality rate', 'Number of deaths among children younger than 1 year of age in year', 'Number of births in year', '1000',
         'eg, US 1977 = 14.1 ÷ 100,000 live births (12.3 for whites; 21.7 for blacks and others)')]
    body = ''.join(f'<tr><th scope="row">{a}</th><td>{frac(b,c)} × {d}<p>{e}</p></td></tr>' for a,b,c,d,e in rows)
    return '<table class="ld-table"><tbody>'+body+'</tbody></table>'+note('原 PDF 的四個公式為載入圖示；依同名表 A–2 補回。',13)+'<p class="ld-editor-note">原書疑義：Infant mortality rate 公式乘 1000，但下方原例印為 100,000 live births；保留原例並註明此單位矛盾。</p>'

def visible(rect):
    return rect.is_valid and not rect.is_empty and rect.y0 >= 64 and rect.y1 < 731 and rect.x0 >= 20 and rect.x1 <= 592

def main():
    ap=argparse.ArgumentParser();ap.add_argument('pdf');args=ap.parse_args()
    path=Path(args.pdf);doc=pdf.open(path)
    assert len(doc)==30, 'This importer is specifically reviewed against the 30-page Appendix A.'
    (OUT/'assets').mkdir(parents=True,exist_ok=True)
    pages=[];outline=[];objects=[];audit=[];repairs=0;all_images=[]
    for pi,page in enumerate(doc,1):
        data=page.get_text('dict',clip=pdf.Rect(20,65,592,731))
        lines=[];images=[]
        for block in data['blocks']:
            if block['type']==1:
                r=pdf.Rect(block['bbox'])
                if visible(r):images.append(block)
            else:
                for line in block.get('lines',[]):
                    r=pdf.Rect(line['bbox']);text=clean(''.join(s['text'] for s in line['spans']))
                    if r.y0<65 or r.y1>731 or not text.strip():continue
                    if pi==1 and r.y0<175:continue # one native title, author retained in chapter header
                    lines.append({**line,'rect':r,'text':text})
        tables=page.find_tables(clip=pdf.Rect(20,65,592,731)).tables
        events=[];regions=[]
        for ti,table in enumerate(tables):
            r=pdf.Rect(table.bbox);regions.append(r)
            xs=sorted(set(round(v,2) for row in table.rows for c in row.cells if c for v in (c[0],c[2])))
            ys=sorted(set(round(v,2) for row in table.rows for c in row.cells if c for v in (c[1],c[3])))
            done=set();rows=[]
            for ri,row in enumerate(table.rows):
                cells=[]
                for c in row.cells:
                    if c is None:continue
                    key=tuple(round(v,2) for v in c)
                    if key in done:continue
                    done.add(key);cr=pdf.Rect(c)
                    cell_lines=[l for l in lines if cr.contains((l['rect'].tl+l['rect'].br)/2)]
                    cell_lines.sort(key=lambda l:(round(l['rect'].y0,1),l['rect'].x0))
                    value=' '.join(span_html(l['spans']).strip() for l in cell_lines)
                    cs=xs.index(key[2])-xs.index(key[0]);rs=ys.index(key[3])-ys.index(key[1])
                    tag='th' if ri==0 else 'td'
                    cells.append(f'<{tag}'+(f' colspan="{cs}"' if cs>1 else '')+(f' rowspan="{rs}"' if rs>1 else '')+'>'+value+f'</{tag}>')
                rows.append('<tr>'+''.join(cells)+'</tr>')
            body='<table class="ld-table"><tbody>'+''.join(rows)+'</tbody></table>'
            if pi==24 and ti==0:
                body='<table class="ld-table"><thead><tr><th rowspan="2">Exposure</th><th colspan="2">Disease</th><th rowspan="2"></th></tr><tr><th>Present</th><th>Absent</th></tr></thead><tbody><tr><th scope="row">Yes</th><td>a</td><td>b</td><td>a+b</td></tr><tr><th scope="row">No</th><td>c</td><td>d</td><td>c+d</td></tr></tbody></table>'+note('原 PDF 的 Exposure 分類為載入圖示；依表 A–5 補回 Yes／No。',17)
                repairs+=1
            # Find a printed caption immediately above the grid, if present.
            labels=[l for l in lines if re.fullmatch(r'Table A[–-]\d+\.',l['text'].strip()) and 0<r.y0-l['rect'].y0<100]
            label=labels[-1]['text'].strip() if labels else f'Table · p.{pi}'+(f' ({ti+1})' if len(tables)>1 else '')
            captions=[]
            if labels:
                lr=labels[-1]['rect'];captions=[l for l in lines if lr.y1<l['rect'].y0<r.y0 and l['rect'].x0<80]
            title=' '.join(l['text'].strip() for l in captions)
            ident=f'a-table-p{pi}-{ti+1}'
            obj={'id':ident,'kind':'table','label':label.rstrip('.'),'title':title or '原文表格','page':pi,'html':body}
            objects.append(obj);events.append({'y':r.y0,'end':r.y1,'html':f'<figure id="{ident}" class="ld-object"><figcaption>{esc(obj["label"])} · {esc(obj["title"])}</figcaption><div class="ld-table-wrap">{body}</div><button type="button" data-ld-object="{ident}">放大檢視</button></figure>'})
            if labels:
                regions.extend([labels[-1]['rect'],*(l['rect'] for l in captions)])
        if pi==18:
            r=pdf.Rect(24,112,588,446);regions.append(r);body=repaired_table();repairs+=4
            objects.append({'id':'a-table-a2','kind':'table','label':'Table A–2','title':'Measures of mortality.','page':18,'html':body})
            events.append({'y':r.y0,'end':r.y1,'html':'<figure id="a-table-a2" class="ld-object"><figcaption>Table A–2 · Measures of mortality.</figcaption><div class="ld-table-wrap">'+body+'</div><button type="button" data-ld-object="a-table-a2">放大檢視</button></figure>'})
        def covered(r):return any(rr.contains((r.tl+r.br)/2) for rr in regions)
        # Original figures are kept intact, with native selectable captions.
        for block in images:
            r=pdf.Rect(block['bbox'])
            if covered(r):continue
            if block['width']==block['height']==60:
                assert pi==4, f'Unreviewed missing image at p.{pi}'
                if r.y0<530:replacement='x̄ = '+frac('62.0','10')+' = 6.2';y=501.5
                elif r.y0<600:replacement='½ ([n/2] observation + [n/2 + 1] observation) = ½';y=597.0
                else:replacement='+';y=647.9
                repairs+=1;events.append({'y':y,'end':y+9,'x':r.x0,'html':f'<span class="ld-repaired">{replacement}</span>','inline':True});continue
            digest=hashlib.sha256(block['image']).hexdigest()[:16];name=f'ladou/assets/{digest}.{block["ext"]}'
            target=ROOT/name
            if not target.exists():target.write_bytes(block['image'])
            all_images.append(name)
            if block['width']>=400:
                labels=[l for l in lines if re.fullmatch(r'Figure A[–-]\d+\.',l['text'].strip()) and 0<r.y0-l['rect'].y0<100]
                assert labels, f'Figure without source caption p.{pi}'
                label=labels[-1];cap=[l for l in lines if label['rect'].y1<l['rect'].y0<r.y0]
                title=' '.join(l['text'].strip() for l in cap);ident='a-figure-'+re.search(r'\d+',label['text']).group()
                body=f'<img src="{name}" width="{block["width"]}" height="{block["height"]}" alt="{esc(title)}" loading="lazy" decoding="async">'
                objects.append({'id':ident,'kind':'figure','label':label['text'].rstrip('.'),'title':title,'page':pi,'html':body})
                events.append({'y':r.y0,'end':r.y1,'html':f'<figure id="{ident}" class="ld-object ld-figure"><figcaption>{esc(label["text"].rstrip("."))} · {esc(title)}</figcaption>{body}<button type="button" data-ld-object="{ident}">放大檢視</button></figure>'})
                regions.extend([label['rect'],*(l['rect'] for l in cap)]);continue
            # Inline mean symbols and original equation artwork remain exact images.
            inline=r.height<20
            markup=f'<img class="ld-equation'+(' ld-inline-equation' if inline else '')+f'" src="{name}" width="{block["width"]}" height="{block["height"]}" style="--ld-equation-width:{r.width/8.9:.3f}em" alt="'+('x̄' if block['width']==9 and block['height']==10 else f'原文公式（PDF p.{pi}）')+'" loading="lazy" decoding="async">'
            events.append({'y':r.y0,'end':r.y1,'x':r.x0,'html':markup,'inline':inline})
        for line in lines:
            r=line['rect']
            if covered(r):continue
            spans=line['spans'];font=spans[0]['font'];level=FONTS.get(font)
            # A heading style must occupy the whole line, not just its first word.
            if not all(s['font']==font for s in spans):level=None
            if line['text'].strip() in ('Confidence Intervals, P-values & Statistical Significance','The Case of Two Groups: The t-Test','Paired t-Test'):level=4
            if re.fullmatch(r'(?:Table|Figure) A[–-]\d+\.',line['text'].strip()):level=None
            text=span_html(spans)
            events.append({'y':r.y0,'end':r.y1,'x':r.x0,'html':text,'inline':True,'level':level,'text':line['text']})
        events.sort(key=lambda e:(round(e['y'],1),e.get('x',0)))
        # Join PDF line fragments into normal paragraphs; keep tables/equations separate.
        merged=[]
        for event in events:
            if event.get('inline') and merged and merged[-1].get('inline') and abs(merged[-1]['y']-event['y'])<5:
                prev=merged[-1];prev['html']+=event['html'];prev['end']=max(prev['end'],event['end']);prev['level']=prev.get('level') or event.get('level');prev['text']=prev.get('text','')+event.get('text','')
            else:merged.append(event.copy())
        rendered=[];pending='';last_end=0;serial=0
        def flush():
            nonlocal pending
            if pending:rendered.append('<p>'+pending+'</p>');pending=''
        for e in merged:
            if not e.get('inline'):flush();rendered.append(e['html']);last_end=e['end'];continue
            if e.get('level'):
                flush();serial+=1;ident=f'a-p{pi}-h{serial}';level=e['level'];title=e.get('text','').strip()
                outline.append({'id':ident,'title':title,'page':pi,'level':level})
                rendered.append(f'<h{level} id="{ident}">{e["html"]}</h{level}>')
            else:
                if pi==4 and re.match(r'^(Mean:|Variance =|Standard deviation =|Median:|Mode:|[1-3]\.\s+(?:Order|Median|Therefore))',e.get('text','').strip()):flush()
                if pending and e['y']-last_end>8:flush()
                pending+=(' ' if pending and not pending.endswith('-') else '')+e['html']
            last_end=e['end']
        flush()
        if pi==4:
            rendered.append(note('原 PDF 的 Mean／Median 三處為載入圖示；依同名表 A–1 補回公式與加號。',2))
            # The worked calculations are part of Table A-1, including in quick view.
            obj=next(o for o in objects if o['id']=='a-table-p4-1')
            obj['html']+=''.join(rendered[1:])
            rendered=[f'<figure id="{obj["id"]}" class="ld-object"><figcaption>{esc(obj["label"])} · {esc(obj["title"])}</figcaption><div class="ld-table-wrap">{obj["html"]}</div><button type="button" data-ld-object="{obj["id"]}">放大檢視</button></figure>']
        text=page.get_text(clip=pdf.Rect(20,65,592,731))
        pages.append({'number':pi,'id':f'a-page-{pi}','html':'\n'.join(rendered)})
        audit.append({'page':pi,'sourceTextCharacters':len(text),'tables':len(tables),'visibleImages':len(images)})
    assert repairs==8,repairs
    paired=next(o for o in objects if o['page']==12 and o['kind']=='table')
    continuation=pages[12]['html'].split('<h4',1)[0]
    paired['html']+='<div class="ld-continuation">'+continuation+'</div>'
    assert len([o for o in objects if o['kind']=='figure'])==4
    data={'id':'appendix-a','title':TITLE,'label':'Appendix A','edition':6,'author':'Stephanie M. Holm','pages':pages,'outline':outline,'objects':objects,
          'source':{'filename':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pages':30},
          'repairs':{'count':8,'source':CDC,'edition':4,'sourcePages':[790,801,805],'sourcePdfPages':[2,13,17]}}
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n';digest=hashlib.sha256(raw.encode()).hexdigest()[:16]
    content=f'appendix-a-{digest}.json';(OUT/content).write_text(raw,encoding='utf-8')
    (OUT/'index.json').write_text(json.dumps({'version':1,'chapters':[{'id':'appendix-a','label':'Appendix A','title':TITLE,'pages':30,'file':'ladou/'+content}]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    qa=ROOT/'.local/ladou-audit.json';qa.parent.mkdir(exist_ok=True,parents=True);qa.write_text(json.dumps(audit,indent=2),encoding='utf-8')
    print(f'Imported {len(pages)} pages, {len(outline)} headings, {len(objects)} objects, {repairs} source-cited repairs, {len(set(all_images))} images -> {content}')

if __name__=='__main__':main()
