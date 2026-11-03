"""Build compact, content-addressed AMA reader assets without modifying source JSON."""
import asyncio,gzip,hashlib,json,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'ama/fast'
def dump(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf8')
def packed(name,value):
 raw=dump(value);blob=gzip.compress(raw,compresslevel=9,mtime=0);file=name+'-'+hashlib.sha256(blob).hexdigest()[:16]+'.json.gz';(OUT/file).write_bytes(blob);return 'ama/fast/'+file
async def main():
 OUT.mkdir(exist_ok=True);js=(ROOT/'ama/ama.js').read_text(encoding='utf8')
 extract=lambda start,end:js[js.index(start):js.index(end,js.index(start))]
 helpers='const tableCaptions=new Map();'+extract('  function chapterText(','  function textNodes(')+extract('  function tableCaption(','  async function openTableIndex(')
 manifest={'version':1,'chapters':{}};search=[];stats=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch();page=await browser.new_page();await page.goto('http://127.0.0.1:8766/ama/index.json')
  for chapter in json.loads((ROOT/'ama/index.json').read_text(encoding='utf8'))['chapters']:
   if not chapter.get('ready'):continue
   id=chapter['id'];source=(ROOT/'ama'/f'{id}.json').read_bytes();data=json.loads(source)
   derived=await page.evaluate('async id=>{const data=await(await fetch(id+".json")).json();'+helpers+';return {captions:Object.fromEntries(data.attachments.filter(a=>a.kind==="table").map(a=>[a.id,tableCaption(a)])),pages:data.pages.map(p=>{const el=document.createElement("div");el.innerHTML=p.html;return {page:p.page,label:p.label,sourcePages:p.sourcePages,text:chapterText(el).replace(/\\s+/g," ")};})};}',id)
   objects=[]
   for obj in data['attachments']:
    meta={k:v for k,v in obj.items() if k!='html'};meta['file']=packed(obj['id'],obj)
    if obj['kind']=='table':meta['caption']=derived['captions'][obj['id']]
    objects.append(meta)
   reader={**data,'attachments':objects};file=packed(id,reader);manifest['chapters'][id]={'file':file,'sourceSHA256':hashlib.sha256(source.replace(b'\r\n',b'\n')).hexdigest()};search.append({'id':id,'pages':derived['pages']})
   size=(ROOT/file).stat().st_size;stats.append({'id':id,'original':len(source),'initial':size,'pages':len(data['pages']),'attachments':len(objects)})
   print(id,len(source),'->',size,'bytes',flush=True)
  await browser.close()
 manifest['search']=packed('search',search);(OUT/'index.json').write_bytes(dump(manifest)+b'\n');(ROOT/'.local/ama-fast-build.json').write_text(json.dumps(stats,indent=2)+'\n',encoding='utf8')
 print('Total fast assets bytes',sum(p.stat().st_size for p in OUT.iterdir()),flush=True)
if __name__=='__main__':asyncio.run(main())
