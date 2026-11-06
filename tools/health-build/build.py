"""Convert supplied special-health PDFs independently of published guides data."""
import sys, json, os, collections, argparse, re
from pathlib import Path
import pymupdf
from health_manual import apply as apply_manual
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/guides-build'))
import importlib.util
_spec=importlib.util.spec_from_file_location('health_guide_converter',ROOT/'tools/guides-build/build.py')
converter=importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(converter)
_original_printed=converter.printed
def visible_page(page,ink):
 page=_original_printed(page,ink)
 return page.filter(lambda o: o.get('x0',0)<page.width and o.get('x1',page.width)>0 and o.get('top',0)<page.height and o.get('bottom',page.height)>0)
converter.printed=visible_page
# The audiograms include rotated axis labels; retain the complete graph region.
converter.FIGURE_REGIONS[('full02',16)]=[(100,585,530,748)]
SRC=Path(os.environ.get('HEALTH_SRC',r'C:/Users/binus/.codex/attachments/b0888249-b90e-4dbb-8e7a-76ae4fa5d3df'))
CATALOG=[('01','高溫作業',(6,22),(7,8)),('02','噪音作業',(23,47),(9,11)),('03','游離輻射作業',(48,84),(12,13)),('04','異常氣壓作業',(85,110),(14,15)),('05','鉛作業',(111,144),(16,17)),('06','四烷基鉛作業',(145,159),(18,19)),('07','1,1,2,2-四氯乙烷作業',(160,178),(20,21)),('08','四氯化碳作業',(179,197),(22,23)),('09','二硫化碳作業',(198,243),(24,25)),('10','三氯乙烯、四氯乙烯作業',(244,260),(26,28)),('11','二甲基甲醯胺作業',(261,279),(29,30)),('12','正己烷作業',(280,297),(31,32)),('13','聯苯胺及其鹽類、4-胺基聯苯及其鹽類、4-硝基聯苯及其鹽類、β-萘胺及其鹽類、二氯聯苯胺及其鹽類，與α-萘胺及其鹽類作業',(298,320),(33,35)),('14','鈹及其化合物作業',(321,346),(36,37)),('15','氯乙烯作業',(347,380),(38,39)),('16','苯作業',(381,402),(40,41)),('17','二異氰酸甲苯、二異氰酸二苯甲烷、二異氰酸異佛爾酮作業',(403,424),(42,44)),('18','石綿作業',(425,442),(45,46)),('19','砷及其化合物作業',(443,473),(47,49)),('20','錳及其化合物作業',(474,494),(50,51)),('21','黃磷作業',(495,516),(52,53)),('22','聯吡啶或巴拉刈作業',(517,535),(54,55)),('23','粉塵作業',(536,559),(56,57)),('24','鉻酸及其鹽類作業',(560,581),(58,59)),('25','鎘及其化合物作業',(582,601),(60,61)),('26','鎳及其化合物作業',(602,623),(62,64)),('27','乙基汞化合物作業',(624,646),(65,66)),('28','溴丙烷作業',(647,664),(67,68))]
OUT=ROOT/'health';TMP=ROOT/'.local/health-source'

def mark_fractions(blocks):
 # Retain the exact extracted text; only annotate its numerator/denominator
 # boundary. These silica-limit cells have a fraction bar in the source PDFs.
 for b in blocks:
  if b['t']!='table':continue
  for row in b['rows']:
   for cell in row:
    match=re.fullmatch(r'(\d+\s*mg/m3)(%SiO2\s*\+\s*\d+)',cell['text'])
    if match:cell['fraction']=list(match.groups())
    mark_fractions(cell.get('blocks',[]))

def main():
 global OUT
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('ids',nargs='*',help='Only rebuild these fullXX/briefXX documents; keep all other published documents.')
 parser.add_argument('--output',type=Path,default=OUT,help='Stage output independently before installing it.')
 parser.add_argument('--report',type=Path,default=Path(__file__).parent/'report.json')
 args=parser.parse_args();OUT=args.output.resolve();wanted=set(args.ids)
 valid={kind+no for no,*_ in CATALOG for kind in ['full','brief']}
 if wanted-valid:parser.error('Unknown document ids: '+', '.join(sorted(wanted-valid)))
 for p in [OUT/'text',OUT/'attach/img',TMP]:p.mkdir(parents=True,exist_ok=True)
 index=json.loads((OUT/'index.json').read_text(encoding='utf-8'))['guides'] if wanted and (OUT/'index.json').exists() else []
 reports=json.loads(args.report.read_text(encoding='utf-8')) if wanted and args.report.exists() else {}
 for no,name,full,brief in CATALOG:
  for kind,rng,filename in [('full',full,'完整版.pdf'),('brief',brief,'簡明版.pdf')]:
   gid=f'{kind}{no}'
   if wanted and gid not in wanted:continue
   path=TMP/(gid+'.pdf')
   with pymupdf.open(SRC/filename) as original,pymupdf.open() as part:
    part.insert_pdf(original,from_page=rng[0]-1,to_page=rng[1]-1);part.save(path)
   d=converter.document(str(path),gid,name,str(OUT/'attach/img'),with_cover=False)
   reports[gid]={k:d[k] for k in ['ok','running','dropped','page_map','missing','extra']}
   reports[gid]['source_pages']=rng
   manual_check=apply_manual(d,gid,OUT/'attach/img')
   if manual_check:reports[gid]['manual_tables']=[manual_check]
   mark_fractions(d['blocks'])
   # The chapter title ornaments are lettering in vector outlines, not figures.
   # Render their visually verified wording as selectable text instead of a page crop.
   cover_titles={name+suffix for suffix in ('健康管理分級建議指引','健康檢查指引')}
   native_cover=any(b['t']=='table' and d['page_map'][i][0]==0 and converter.visible([b]).replace(' ','') in cover_titles for i,b in enumerate(d['blocks']))
   for i,block in enumerate(d['blocks']):
    if block['t']=='img' and d['page_map'][i][0]==0:
     d['blocks'][i]=dict(t='p',text='' if native_cover else name+'健康管理分級建議指引')
    elif block['t']=='table' and d['page_map'][i][0]==0 and converter.visible([block]).replace(' ','') in cover_titles:
     d['blocks'][i]=dict(t='p',text=converter.visible([block]))
    d['blocks'][i]['pdf_page']=rng[0]+d['page_map'][i][0]
    d['blocks'][i]['pdf_last']=rng[0]+d['page_map'][i][1]
    d['blocks'][i]['source']=filename
   reports[gid]['presentation']='Native chapter title replaces decorative title frame; no page images published.'
   print(gid,name, 'OK' if d['ok'] else 'FAIL', 'missing',sum(d['missing'].values()),'extra',sum(d['extra'].values()),collections.Counter(b['t'] for b in d['blocks']),flush=True)
   covered={k for a in d['atts'] for k in a['span']}
   heading='表格';number=0
   for i,block in enumerate(d['blocks']):
    if block['t']=='h': heading=block['text']
    if block['t']=='table':
     number+=1
     if i not in covered:
      d['atts'].append(dict(id=f'{gid}-quick{number}',label=f'表格 {number}',title=heading,span=[i]))
   atts=[]
   for a in d['atts']:
    data=dict(id=a['id'],guide=gid,label=a['label'],title=a['title'],blocks=[d['blocks'][k] for k in a['span']])
    (OUT/'attach'/(a['id']+'.json')).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    atts.append({k:a[k] for k in ['id','label','title']})
   credit=f'資料來源：使用者提供之「{filename}」，PDF第{rng[0]}–{rng[1]}頁（原書第{rng[0]-(5 if kind=="full" else 6)}–{rng[1]-(5 if kind=="full" else 6)}頁）。民國111年11月版本。'
   (OUT/'text'/(gid+'.json')).write_text(json.dumps(dict(id=gid,name=name,cover=[],credit=credit,blocks=d['blocks']),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
   index=[g for g in index if g['id']!=gid]
   index.append(dict(id=gid,cat=kind,name=name,official=name,no=int(no),pages=d['pages'],attach=atts))
 (OUT/'index.json').write_text(json.dumps(dict(cats=[dict(id='full',name='完整版',total=32),dict(id='brief',name='簡明版速查',total=32)],guides=sorted(index,key=lambda x:(x['cat']!='full',x['no']))),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 live_attachments={a['id'] for g in index for a in g['attach']}
 for file in (OUT/'attach').glob('*.json'):
  if file.stem not in live_attachments:file.unlink()
 used=set()
 def images(value):
  if isinstance(value,dict):
   if 'src' in value:used.add(value['src'])
   for item in value.values():images(item)
  elif isinstance(value,list):
   for item in value:images(item)
 for file in (OUT/'text').glob('*.json'):images(json.loads(file.read_text(encoding='utf-8')))
 for file in (OUT/'attach/img').glob('*.png'):
  if file.name not in used:file.unlink()
 args.report.parent.mkdir(parents=True,exist_ok=True)
 args.report.write_text(json.dumps(reports,ensure_ascii=False,indent=1),encoding='utf-8')
 if not all(d['ok'] for d in reports.values()):sys.exit(1)

if __name__=='__main__':main()
