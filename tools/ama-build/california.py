"""Import a separately supplied, rotated PDRS document as native source text.

Source words and table values are never supplied by layout hints. Run the
accompanying full visual/DOM/clipboard review before publishing the outputs.
"""
from pathlib import Path
from collections import Counter,defaultdict
from types import SimpleNamespace
import argparse,hashlib,html,json,re,xml.etree.ElementTree as ET
import pymupdf as pdf
from build import Page,canon,inside,extent,esc

ROOT=Path(__file__).resolve().parents[2]

def clusters(values,tolerance=1):
    groups=[]
    for value in sorted(values):
        if not groups or value-sum(groups[-1])/len(groups[-1])>tolerance:groups.append([value])
        else:groups[-1].append(value)
    return [sum(g)/len(g) for g in groups]

def edges(centers,low,high):
    return [low]+[(a+b)/2 for a,b in zip(centers,centers[1:])]+[high]

def rectangular(xs,ys):
    rows=[SimpleNamespace(cells=[(a,t,b,u) for a,b in zip(xs,xs[1:])]) for t,u in zip(ys,ys[1:])]
    return SimpleNamespace(bbox=(xs[0],ys[0],xs[-1],ys[-1]),rows=rows)

class DocumentPage(Page):
    def __init__(self,doc,index):
        self.page=doc[index];self.number=index+1;self.chars=[];self.owners={};self.grids=[];self.sections=[]
        for bi,b in enumerate(self.page.get_text('rawdict')['blocks']):
            if b['type']!=0:raise ValueError('Unexpected raster source')
            for li,line in enumerate(b['lines']):
                if abs(line['dir'][1])>.001:raise ValueError('Rotation not normalized')
                for si,s in enumerate(line['spans']):
                    for ci,c in enumerate(s['chars']):
                        if '\ufffd' in c['c']:raise ValueError('Unreadable source character')
                        self.chars.append(dict(c,text=c['c'],font=s['font'],size=s['size'],flags=s['flags'],line=(bi,li),span=(bi,li,si),uid=(bi,li,si,ci),block=bi))
    def svg(self,chars,box,owner):
        raise ValueError('Per-cell source artwork must not be duplicated')
    def positioned_cell(self,chars,box,owner,rules=True,claim=True):
        value=super().positioned_cell(chars,box,owner,rules=rules,claim=claim)
        fonts=iter(dict((c["span"],c["font"]) for c in chars).values())
        value=re.sub('class="ax-source-run"',lambda m: 'class="ax-source-run ax-ca-serif"' if "Times" in next(fonts) else m.group(),value)
        root=ET.fromstring(value)
        starts={1:(5,16),2:(21,7),3:(28,37),4:(65,9),5:(74,3),6:(77,5),7:(82,4),8:(86,4)}
        for run in list(root):
            if 'ax-source-run' not in run.get('class',''):continue
            children=list(run);text=''.join(c.text or '' for c in children)
            for match in reversed(list(re.finditer(r'(?:page|pages)\s+(\d)-(\d+)',text,re.I))):
                section,number=map(int,match.groups())
                if section not in starts or not 1<=number<=starts[section][1]:continue
                anchor=ET.Element('a',{'class':'ax-ref','href':'#ca-page-'+str(starts[section][0]+number-1),'data-open':'ca-page-'+str(starts[section][0]+number-1),'data-chapter':'california'})
                subset=children[match.start():match.end()]
                for child in subset:run.remove(child);anchor.append(child)
                run.insert(match.start(),anchor)
        return ET.tostring(root,encoding='unicode')
    def art(self):
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        root=ET.fromstring(self.page.get_svg_image(text_as_path=False))
        for parent in root.iter():
            for child in list(parent):
                if child.tag.rsplit('}',1)[-1] in ('text','style'):parent.remove(child)
        root.set('class','ax-ca-art');root.set('aria-hidden','true')
        return ET.tostring(root,encoding='unicode')
    def table_specs(self):
        n=self.number;words=self.page.get_text('words');specs=[]
        # Fully ruled source tables; keep physical merged cells.
        if n in (4,11,54,55):
            return list(self.page.find_tables().tables)
        def numeric(box):
            selected=[w for w in words if re.fullmatch(r'\d+',w[4]) and box[0]<=w[0] and w[2]<=box[2] and box[1]<=w[1] and w[3]<=box[3]]
            if not selected:return
            xs=clusters([(w[0]+w[2])/2 for w in selected],3)
            ys=clusters([(w[1]+w[3])/2 for w in selected],2)
            specs.append(rectangular(edges(xs,box[0],box[2]),edges(ys,box[1],box[3])))
        if n==20:
            for a,b in ((74,125),(188,239),(301,352),(415,466)):numeric((a,75,b,535))
        elif n in (26,27):
            heads=[w for w in words if w[4]=='Rank']
            for h in heads:
                y=h[3];row=[w for w in words if re.fullmatch(r'\d+',w[4]) and abs(w[1]-h[1])<18 and w[0]>120]
                # Header numbers sit on the same baseline as Rank.
                row=[w for w in row if abs(w[3]-h[3])<5]
                if len(row)!=20:raise ValueError(('FEC header',n,len(row)))
                centers=[(w[0]+w[2])/2 for w in sorted(row,key=lambda w:w[0])]
                ranks=[w for w in words if w[4] in ('One','Two','Three','Four','Five','Six','Seven','Eight') and y<w[1]<y+120]
                rows=clusters([(w[1]+w[3])/2 for w in ranks],2)
                if len(rows)!=8:raise ValueError(('FEC ranks',n,len(rows)))
                ys=[h[1]-15,(y+rows[0])/2]+[(a+b)/2 for a,b in zip(rows,rows[1:])]+[rows[-1]+8]
                specs.append(rectangular([70,120]+[(a+b)/2 for a,b in zip(centers,centers[1:])]+[720],ys))
        elif 22<=n<=25:
            for left in (57.6,424.8):
                entries=sorted((w for w in words if abs(w[0]-left)<1 and (re.fullmatch(r'\d{2}\.\d{2}\.\d{2}\.\d{2}',w[4]) or re.fullmatch(r'\d{2}',w[4]))),key=lambda w:w[1])
                if not entries:continue
                xs=[left-1,left+57,left+80,left+307];ys=[w[1]-1 for w in entries]+[max(w[3] for w in words if left-1<=w[0]<left+307 and w[1]<550)+1]
                rows=[]
                for k,w in enumerate(entries):
                    cells=[(xs[0],ys[k],xs[-1],ys[k+1])] if re.fullmatch(r'\d{2}',w[4]) else [(a,ys[k],b,ys[k+1]) for a,b in zip(xs,xs[1:])]
                    rows.append(SimpleNamespace(cells=cells))
                specs.append(SimpleNamespace(bbox=(xs[0],ys[0],xs[-1],ys[-1]),rows=rows))
        elif 78<=n<=81:
            numeric((107,103,685,550))
        elif 29<=n<=53:
            for xs in ([70,103,285,388],[420,453,635,725]):
                ids=[w for w in words if re.fullmatch(r'\d{3}',w[4]) and abs(w[0]-(72 if xs[0]==70 else 423))<4 and w[1]>85]
                if not ids:continue
                ys=[min(w[1] for w in ids)-1]+[(w[1]-1) for w in ids[1:]]+[max(w[3] for w in words if xs[0]<=w[0]<xs[-1] and w[1]<550)+1]
                specs.append(rectangular(xs,ys))
        elif 66<=n<=73:
            header=[w for w in words if re.fullmatch(r'\d{3}',w[4]) and w[1]<85]
            centers=sorted((w[0]+w[2])/2 for w in header)
            if len(centers) not in (22,23):raise ValueError(('Variant columns',n,len(centers)))
            codes=[w for w in words if w[0]<75 and re.match(r'\d\d\.',w[4])]
            starts=clusters([w[1] for w in codes],2)
            specs.append(rectangular([70,150,centers[0]-10]+[(a+b)/2 for a,b in zip(centers,centers[1:])]+[725],[65]+[y-1 for y in starts]+[565]))
        elif 56<=n<=64:
            for left in (287.1,643.5):
                labels=sorted((w for w in words if abs(w[0]-left)<1 and w[4] in ('Spine','Shoulder','Elbow','Wrist','Finger','Grip','Leg','Psych')),key=lambda w:w[1])
                groups=[]
                for word in labels:
                    if not groups or word[1]-groups[-1][-1][1]>20:groups.append([word])
                    else:groups[-1].append(word)
                for group in groups:
                    ys=[w[1]-1 for w in group]+[group[-1][3]+1]
                    specs.append(rectangular([left-1,left+90,left+110],ys))
        elif n in (75,76):
            for a,b in ((60,390),(405,738)):numeric((a,120,b,545))
        elif n in (87,88,89):
            nums=[w for w in words if re.fullmatch(r'\d+',w[4]) and w[1]<550]
            last=max(w[1] for w in nums);bottom=[w for w in nums if abs(w[1]-last)<2]
            centers=sorted((w[0]+w[2])/2 for w in bottom)
            rowwords=[w for w in nums if w[0]<65 and w[1]<last-5]
            ys=clusters([(w[1]+w[3])/2 for w in rowwords],2)
            specs.append(rectangular([45,65]+[(a+b)/2 for a,b in zip(centers,centers[1:])]+[max(w[2] for w in nums)+2],edges(ys+[last+4],min(w[1] for w in nums)-1,last+10)))
        return specs
    def build_document(self):
        remaining=list(self.chars);nodes=[]
        for ti,t in enumerate(self.table_specs()):
            body=self.select(remaining,t.bbox);remaining=[c for c in remaining if c not in body]
            content=self.grid(body,t,f'ca-p{self.number}-table{ti+1}',rules=False)
            nodes.append(f'<div class="ax-ca-grid" style="left:{t.bbox[0]*1.8:.3f}px;top:{t.bbox[1]*1.8:.3f}px">{content}</div>')
        # Keep source block/line order and every source character, including notes.
        for bi in sorted(set(c['block'] for c in remaining)):
            chars=[c for c in remaining if c['block']==bi];box=extent(chars)
            body=self.positioned_cell(chars,box,f'ca-p{self.number}-body{bi}',rules=False)
            nodes.append(f'<div class="ax-ca-body" style="position:absolute;left:{box[0]*1.8:.3f}px;top:{box[1]*1.8:.3f}px;width:{(box[2]-box[0])*1.8:.3f}px">{body}</div>')
        assert len(self.owners)==len(self.chars)
        result='<div class="ax-ca-scroll"><div class="ax-ca-sheet" style="width:1425.600px;height:1101.600px">'+self.art()+''.join(nodes)+'</div></div>'
        rendered=html.unescape(re.sub('<[^>]*>','',result))
        assert Counter(canon(rendered))==Counter(canon(''.join(c['text'] for c in self.chars)))
        return result,dict(page=self.number,characters=len(canon(rendered)),cells=sum(len(g['cells']) for g in self.grids),grids=self.grids,status='OK')

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('source',type=Path);ap.add_argument('--output',type=Path,default=ROOT/'ama/california.json');ap.add_argument('--audit',type=Path,default=ROOT/'.local/california/audit.json');args=ap.parse_args()
    doc=pdf.open(args.source);result=dict(id='california',pages=[],attachments=[],sections=[]);audit=[]
    for page in doc:page.remove_rotation()
    for i in range(len(doc)):
        page=DocumentPage(doc,i);markup,record=page.build_document();result['pages'].append(dict(page=i+1,html=markup));audit.append(record);print(f'PDF {i+1}: OK ({record["characters"]} characters, {record["cells"]} cells)',flush=True)
    starts=[(5,1),(21,2),(28,3),(65,4),(74,5),(77,6),(82,7),(86,8)]
    for source in result['pages']:
        n=source['page'];label=next((f'{sec}-{n-first+1}' for first,sec in reversed(starts) if n>=first),f'PDF {n}')
        source['label']=label;ident=f'ca-page-{n}'
        native=source['html'];source['html']=f'<div class="ax-object" id="{ident}"><button class="ax-expand" type="button" data-open="{ident}">放大</button>'+native+'</div>'
        result['attachments'].append(dict(id=ident,label='加州調整 · '+label,page=n,sourcePages=[label],kind='document',html=native))
        if n in (1,2,4,5,21,28,54,56,65,74,77,82,86):
            lines=[x.strip() for x in doc[n-1].get_text().splitlines() if x.strip()]
            title=next((x for x in lines if x.startswith(('SECTION','PART','AUTHORITY','TABLE OF CONTENTS'))),'封面')
            result['sections'].append(dict(id=ident,title=title))
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    args.audit.parent.mkdir(parents=True,exist_ok=True)
    args.audit.write_text(json.dumps(dict(source=str(args.source),sha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),pages=audit),ensure_ascii=False,indent=2),encoding='utf8')
    if args.output.resolve()==(ROOT/'ama/california.json').resolve():
        index_path=ROOT/'ama/index.json';index=json.loads(index_path.read_text(encoding='utf8'))
        chapters=index['chapters']
        chapters[:]=[c for c in chapters if c['id']!='california']
        chapters.append(dict(id='california',no='附',type='supplement',title='加州調整',start=1,end=len(doc),pages=len(doc),ready=True,tables=0,figures=0,description='Permanent Disability Rating Schedule · January 2005 · 原書1-1–8-4頁'))
        index_path.write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
if __name__=='__main__':main()
