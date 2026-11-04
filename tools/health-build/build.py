"""Convert supplied special-health PDFs independently of published guides data."""
import sys, json, os, collections
from pathlib import Path
import pymupdf
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
CATALOG=[('01','高溫作業',(6,22),(7,8)),('02','噪音作業',(23,47),(9,11)),('03','游離輻射作業',(48,84),(12,13)),('04','異常氣壓作業',(85,110),(14,15))]
OUT=ROOT/'health';TMP=ROOT/'.local/health-source'
def main():
 for p in [OUT/'text',OUT/'attach/img',TMP]:p.mkdir(parents=True,exist_ok=True)
 index=[];reports={}
 for no,name,full,brief in CATALOG:
  for kind,rng,filename in [('full',full,'完整版.pdf'),('brief',brief,'簡明版.pdf')]:
   gid=f'{kind}{no}';path=TMP/(gid+'.pdf')
   with pymupdf.open(SRC/filename) as original,pymupdf.open() as part:
    part.insert_pdf(original,from_page=rng[0]-1,to_page=rng[1]-1);part.save(path)
   d=converter.document(str(path),gid,name,str(OUT/'attach/img'),with_cover=False)
   reports[gid]={k:d[k] for k in ['ok','running','dropped','page_map','missing','extra']}
   reports[gid]['source_pages']=rng
   # The four chapter title ornaments are lettering in vector outlines, not figures.
   # Render their visually verified wording as selectable text instead of a page crop.
   native_cover=any(b['t']=='table' and d['page_map'][i][0]==0 and converter.visible([b]).replace(' ','')==name+'健康管理分級建議指引' for i,b in enumerate(d['blocks']))
   for i,block in enumerate(d['blocks']):
    if block['t']=='img' and d['page_map'][i][0]==0:
     d['blocks'][i]=dict(t='p',text='' if native_cover else name+'健康管理分級建議指引')
    elif block['t']=='table' and d['page_map'][i][0]==0 and converter.visible([block]).replace(' ','')==name+'健康管理分級建議指引':
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
 (Path(__file__).parent/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=1),encoding='utf-8')
 if not all(d['ok'] for d in reports.values()):sys.exit(1)

if __name__=='__main__':main()
