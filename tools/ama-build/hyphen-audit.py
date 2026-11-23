"""Inventory visible word hyphens, including inline tags and adjacent fragments."""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter,defaultdict
import argparse,json,re
ROOT=Path(__file__).resolve().parents[2]
class Reader(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.stack=[]
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if tag not in ('br','hr','img','input','col','meta','link'):self.stack.append((tag,tag in ('button','script','style')or'ax-soft-break'in attrs.get('class','')))
  if tag in ('p','td','th','tr','div','br'):self.parts.append(' ')
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,-1,-1):
   if self.stack[i][0]==tag:self.stack=self.stack[:i];break
  if tag in ('p','td','th','tr','div'):self.parts.append(' ')
 def handle_data(self,text):
  if not any(skip for _,skip in self.stack):self.parts.append(text)
def main():
 from build import DEFAULT_SOURCE
 parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE);args=parser.parse_args()
 words=Counter();pairs=defaultdict(list)
 for file in sorted((ROOT/'ama').glob('c*.json')):
  data=json.loads(file.read_text(encoding='utf8'))
  for kind,objects in [('page',data['pages']),('object',data['attachments'])]:
   for obj in objects:
    reader=Reader();reader.feed(obj['html']);text=''.join(reader.parts)
    if kind=='page':words.update(w.lower()for w in re.findall(r'(?<![A-Za-z-])[A-Za-z]{2,}(?![A-Za-z-])',text))
    for match in re.finditer(r'(?<![A-Za-z])(?=([A-Za-z]+)[-\u2010\u2011\u00ad]\s*([A-Za-z]+))',text):
     pair=(match[1].lower(),match[2].lower());pairs[pair].append({'chapter':data['id'],'kind':kind,'id':obj.get('id',obj['page']),'page':obj['page'],'context':text[max(0,match.start()-40):match.start()+len(match[1])+len(match[2])+65]})
 rows=[{'split':'-'.join(pair),'joined':''.join(pair),'unsplit':words[''.join(pair)],'count':len(locations),'locations':locations}for pair,locations in sorted(pairs.items())]
 # A complete word elsewhere is supporting evidence, not permission to erase
 # a genuine compound. Retain the original line-ending evidence for review.
 if args.source.is_file():
  import pymupdf
  endings=Counter();source_pairs=Counter()
  with pymupdf.open(args.source)as source:
   for page in source:
    for block in page.get_text('dict')['blocks']:
     lines=[''.join(span['text']for span in line['spans'])for line in block.get('lines',[])]
     for i,line in enumerate(lines):
      left=re.search(r'([A-Za-z]+)-\s*$',line)
      if not left:continue
      endings[left[1].lower()]+=1
      right=re.match(r'\s*([A-Za-z]+)',lines[i+1])if i+1<len(lines)else None
      if right:source_pairs[left[1].lower()+'-'+right[1].lower()]+=1
  for row in rows:row.update(sourceBreaks=source_pairs[row['split']],sourcePrefixEnds=endings[row['split'].split('-')[0]])
 out=ROOT/'.local/ama-hyphen-current';out.mkdir(exist_ok=True);(out/'candidates.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
 (out/'review.txt').write_text('\n'.join(f"{r['split']:38} joined={r['unsplit']:4} n={r['count']:3}"for r in rows),encoding='utf8')
 print('UNIQUE',len(rows),'OCCURRENCES',sum(r['count']for r in rows))
if __name__=='__main__':main()
