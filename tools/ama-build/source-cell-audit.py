"""Regenerate source regions read-only and compare every logical table cell."""
from pathlib import Path
from html.parser import HTMLParser
import json,re
import pymupdf
import build

ROOT=Path(__file__).resolve().parents[2]
class Cells(HTMLParser):
 def __init__(self):super().__init__();self.values=[];self.active=None
 def handle_starttag(self,tag,attrs):
  if tag in ['td','th']:
   a=dict(attrs);self.active={'rowspan':int(a.get('rowspan',1)),'colspan':int(a.get('colspan',1)),'text':''};self.values.append(self.active)
 def handle_endtag(self,tag):
  if tag in ['td','th']:self.active=None
 def handle_data(self,text):
  if self.active is not None:self.active['text']+=''.join(text.split())
def cells(html):p=Cells();p.feed(html);return p.values
def main():
 out=ROOT/'.local/ama-popup-audit';doc=pymupdf.open(build.DEFAULT_SOURCE);results=[];build.Page.precise_tables=False
 for n in range(1,18):
  current=json.loads((ROOT/f'ama/c{n:02}.json').read_text(encoding='utf8'));fresh={'id':current['id'],'pages':[],'attachments':[]};pages={}
  for number in range(*[build.CHAPTERS[current['id']][0],build.CHAPTERS[current['id']][1]+1]):
   regions=[('table',e)for e in build.TABLES.get(number,[])]+[('figure',e)for e in build.FIGURES.get(number,[])]
   if number in [43,44,45]:regions.append(('appendix',(f'3-{number-42}',(71,93 if number==43 else 70,542,735),None)))
   if number==555:regions.append(('appendix',('16-A',(70,93,542,702),None)))
   parts=[]
   for kind,entry in regions:
    page=build.Page(doc,number);ident,box=entry[:2];selected=page.select(page.chars,box)
    node=page.region(selected,box,kind,ident,entry[3]if kind=='table'else entry[2],entry[2]if kind=='table'else None);fresh['attachments'].extend(page.attachments);parts.append(node['html'])
   fresh['pages'].append({'page':number,'html':''.join(parts)})
  build.join_spreads(fresh);build.join_long_tables(fresh)
  if n==12:
   for base,number in [('12-10',315),('12-11',317)]:
    a=next(a for a in fresh['attachments']if a['id']=='f'+base);b=next(a for a in fresh['attachments']if a['id']==f'f{base}-p{number}');a['html']+=b['html'];fresh['attachments'].remove(b)
  for item in current['attachments']:
   expected=next(a for a in fresh['attachments']if a['id']==item['id']);a=cells(expected['html']);b=cells(item['html']);differences=[]
   if len(a)!=len(b):differences.append({'sourceCells':len(a),'actualCells':len(b)})
   else:
    for i,(x,y)in enumerate(zip(a,b)):
     if x!=y:differences.append({'index':i,'source':x,'actual':y})
   row={'id':item['id'],'cells':len(b),'differences':differences};results.append(row);print(item['id'],len(b),'PASS'if not differences else str(differences)[:1000],flush=True)
  (out/'source-cells.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
 print('TOTAL',len(results),'CELLS',sum(x['cells']for x in results),'ISSUES',sum(bool(x['differences'])for x in results),flush=True)
if __name__=='__main__':main()
