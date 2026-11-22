"""Compare all reader pages with source characters and detect residual structure."""
from pathlib import Path
from collections import Counter
from html.parser import HTMLParser
import json,re
import pymupdf
import build
from california import DocumentPage
ROOT=Path(__file__).resolve().parents[2]
class Text(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.skip=0
 def handle_starttag(self,tag,attrs):
  if tag in ['button','style','script']:self.skip+=1
 def handle_endtag(self,tag):
  if tag in ['button','style','script']:self.skip-=1
 def handle_data(self,text):
  if not self.skip:self.parts.append(text)
def main():
 doc=pymupdf.open(build.DEFAULT_SOURCE);ca=pymupdf.open(ROOT/'.local/california/normalized.pdf');results=[]
 for file in sorted((ROOT/'ama').glob('c*.json')):
  data=json.loads(file.read_text(encoding='utf8'));issues=0
  for page in data['pages']:
   parser=Text();parser.feed(page['html']);actual=Counter(build.canon(''.join(parser.parts)))
   originals=[DocumentPage(ca,page['page']-1)]if data['id']=='california'else[build.Page(doc,n)for n in page.get('sourcePages',[page['page']])]
   expected=Counter(build.canon(''.join(c['text']for p in originals for c in p.chars)))
   counts=Counter(re.findall(r'\bid="([^"]+)"',page['html']));duplicates={k:v for k,v in counts.items()if v>1}
   missing=expected-actual;extra=actual-expected
   row={'chapter':data['id'],'page':page['page'],'sourceCharacters':sum(expected.values()),'readerCharacters':sum(actual.values()),'missing':dict(missing),'extra':dict(extra),'duplicateIds':duplicates};results.append(row)
   if missing or extra or duplicates:issues+=1;print('ISSUE',json.dumps(row,ensure_ascii=False),flush=True)
  print(data['id'],len(data['pages']),'pages',issues,'issues',flush=True)
 output=ROOT/'.local/ama-current-repair/full-page-audit.json';output.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print('TOTAL',len(results),'ISSUES',sum(bool(r['missing']or r['extra']or r['duplicateIds'])for r in results),flush=True)
if __name__=='__main__':main()
