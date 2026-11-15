"""Compare every attachment's characters with its source-PDF region, read-only."""
from pathlib import Path
from collections import Counter
from functools import lru_cache
from html.parser import HTMLParser
import json,re
import pymupdf
import build

ROOT=Path(__file__).resolve().parents[2]
class Text(HTMLParser):
 def __init__(self):super().__init__();self.parts=[]
 def handle_data(self,data):self.parts.append(data)
def chars(s):return Counter(c for c in s if not c.isspace())
def main():
 out=ROOT/'.local/ama-popup-audit';out.mkdir(parents=True,exist_ok=True);doc=pymupdf.open(build.DEFAULT_SOURCE);results=[]
 @lru_cache(maxsize=8)
 def page(n):return build.Page(doc,n)
 for n in range(1,18):
  chapter=json.loads((ROOT/f'ama/c{n:02}.json').read_text(encoding='utf8'))
  for item in chapter['attachments']:
   expected='';parts=[]
   source_parts=item.get('sourceParts')
   if not source_parts:
    source_parts=[{'id':item['id'],'page':item['page']}]
    base=re.sub(r'^(?:ap|[tf])','',item['id']);prefix='t'if item['kind']=='table'else'f'
    for number,entries in (build.TABLES if item['kind']=='table'else build.FIGURES).items():
     for entry in entries:
      if re.fullmatch(re.escape(base)+r'(?:-p\d+|-next)',entry[0]):source_parts.append({'id':prefix+entry[0],'page':number})
   for part in sorted(source_parts,key=lambda p:p['page']):
    number=part['page'];kind=item['kind'];ident=re.sub(r'^(?:ap|[tf])','',part['id'])
    entries=(build.TABLES if kind=='table'else build.FIGURES).get(number,[])
    match=next((e for e in entries if e[0]==ident),None)
    if match:box=match[1]
    elif kind=='appendix':box=(71,93 if number==43 else 70,542,735)if number<100 else(70,93,542,702)
    else:raise ValueError((part,'missing source bounds'))
    selected=page(number).select(page(number).chars,box);expected+=''.join(c['text']for c in selected);parts.append({'page':number,'box':box,'characters':sum(not c['text'].isspace()for c in selected)})
   parser=Text();parser.feed(item['html']);actual=''.join(parser.parts)
   missing=chars(expected)-chars(actual);extra=chars(actual)-chars(expected)
   row={'id':item['id'],'kind':item['kind'],'parts':parts,'sourceCharacters':sum(chars(expected).values()),'htmlCharacters':sum(chars(actual).values()),'missing':dict(missing),'extra':dict(extra)}
   results.append(row);print(item['id'],'PASS'if not missing and not extra else row,flush=True)
 (out/'source-characters.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
 print('TOTAL',len(results),'ISSUES',sum(bool(r['missing']or r['extra'])for r in results),flush=True)
if __name__=='__main__':main()
