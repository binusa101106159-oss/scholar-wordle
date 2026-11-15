"""Rebuild composite figure forms as one native-text source layout, not a stack.

Only the listed figures are replaced. Existing page text and per-cell highlight
offsets are independently compared before any chapter JSON is written.
"""
from pathlib import Path
from collections import Counter
from html.parser import HTMLParser
import argparse,functools,http.server,json,re,threading
import pymupdf
from playwright.sync_api import sync_playwright
import build

ROOT=Path(__file__).resolve().parents[2]
FORMS={15:['15-2','15-13','15-31'],16:['16-2','16-12','16-13'],17:['17-2','17-7']}
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
class Text(HTMLParser):
 def __init__(self):super().__init__();self.parts=[]
 def handle_data(self,text):self.parts.append(text)
def characters(html):
 p=Text();p.feed(html);return Counter(c for c in ''.join(p.parts)if not c.isspace())

def main(source):
 output=ROOT/'.local/form-repair';output.mkdir(parents=True,exist_ok=True)
 doc=pymupdf.open(source);changes=[]
 for chapter,names in FORMS.items():
  path=ROOT/f'ama/c{chapter:02}.json';old=json.loads(path.read_text(encoding='utf8'));new=json.loads(json.dumps(old));changed=[]
  if not (output/path.name).exists():(output/path.name).write_text(json.dumps(old,ensure_ascii=False),encoding='utf8')
  figures={15:build.FIGURES_15,16:build.FIGURES_16,17:build.FIGURES_17}[chapter]
  for name in names:
   obj=next(a for a in new['attachments']if a['id']=='f'+name);parts=[]
   for part in obj.get('sourceParts',[{'id':obj['id'],'page':obj['page']}]):
    target=next(p for p in new['pages']if p['page']==part['page']);match=re.search(r'<section\b[^>]*\bid="'+re.escape(part['id'])+r'"[^>]*>',target['html']);assert match,(name,'missing inline part')
    end=target['html'].index('<button type="button" class="ax-expand"',match.end());before=target['html'][match.end():end]
    entry=next(e for e in figures[part['page']]if e[0]==part['id'][1:]);page=build.Page(doc,part['page']);page.region(page.select(page.chars,entry[1]),entry[1],'figure',entry[0],entry[2]);after=page.attachments[0]['html']
    assert characters(before)==characters(after),(name,part['page'],'source characters changed',characters(before)-characters(after),characters(after)-characters(before))
    if before!=after:
     target['html']=target['html'][:match.end()]+after+target['html'][end:];changed.append(part['page'])
    parts.append(after)
   obj['html']=''.join(parts)
   print(name,'native source form / source characters PASS',flush=True)
  changes.append((path,old,new,changed))
 if not any(changed for _,_,_,changed in changes):
  print('All source form layouts already match; no files or migrations changed.',flush=True);return
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
 js=(ROOT/'ama/ama.js').read_text(encoding='utf8');helpers=js[js.index('  const CHAPTER_MARK='):js.index('  function applyMarks(')];audits=[]
 try:
  with sync_playwright()as p:
   browser=p.chromium.launch();page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/ama/index.json')
   page.evaluate('()=>{'+helpers+'''window.describeFormText=html=>{const d=document.createElement('div');d.innerHTML=html;showChapterMarks(d);showSourceHeadings(d);const tables=[...d.querySelectorAll('table')],groups={};let text='';for(const n of textNodes(d)){const cell=n.parentElement.closest('td,th'),anchor=n.parentElement.closest('[id]');const key=cell?'table:'+tables.indexOf(cell.closest('table'))+':'+[...cell.closest('table').querySelectorAll('td,th')].indexOf(cell)+':'+cell.closest('table').querySelectorAll('td,th').length:anchor?'id:'+anchor.id:'outer';(groups[key]||=[]).push([text.length,n.textContent]);text+=n.textContent;}return {text,groups};};}''')
   for path,old,new,changed in changes:
    for number in changed:
     target=next(p for p in new['pages']if p['page']==number);before=page.evaluate('h=>describeFormText(h)',next(p for p in old['pages']if p['page']==number)['html']);after=page.evaluate('h=>describeFormText(h)',target['html']);blocks=[];matched=0
     for key,nodes in before['groups'].items():
      aa=[(offset+i,c)for offset,text in nodes for i,c in enumerate(text)if not c.isspace()];bb=[(offset+i,c)for offset,text in after['groups'].get(key,[])for i,c in enumerate(text)if not c.isspace()]
      if ''.join(c for _,c in aa)!=''.join(c for _,c in bb):continue
      for (a,_),(b,_)in zip(aa,bb):
       matched+=1
       if blocks and blocks[-1][0]+blocks[-1][2]==a and blocks[-1][1]+blocks[-1][2]==b:blocks[-1][2]+=1
       else:blocks.append([a,b,1])
     previous=target.get('textMigration');assert not previous or previous.get('toVersion',2)<3,'Use a new migration version for a subsequent geometry change'
     target['textMigration']={'fromVersion':2,'toVersion':3,'fromLength':len(before['text']),'toLength':len(after['text']),'blocks':blocks}
     if previous:target['textMigration']['previous']=previous
     total=sum(not c.isspace()for c in before['text']);audits.append({'chapter':path.stem,'page':number,'matched':matched,'total':total});print(path.stem,number,'safe highlight characters',matched,'/',total,flush=True)
   browser.close()
 finally:server.shutdown()
 for path,old,new,changed in changes:path.write_text(json.dumps(new,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
 (output/'audit.json').write_text(json.dumps(audits,indent=2)+'\n',encoding='utf8')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);main(parser.parse_args().source)
