"""Extract unit conversions from the imported AMA 6e source tables."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[1]
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=[];self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr':self.row=[]
  if tag in ('td','th'):self.cell=''
 def handle_data(self,text):
  if self.cell is not None:self.cell+=text
 def handle_endtag(self,tag):
  if tag in ('td','th')and self.cell is not None:self.row.append(self.cell.strip());self.cell=None
  if tag=='tr':self.rows.append(self.row)
def table(chapter,ident):
 source=json.loads((ROOT/f'ama/c{chapter:02}.json').read_text(encoding='utf8'))
 obj=next(a for a in source['attachments']if a['id']==ident);parser=Rows();parser.feed(obj['html'])
 return parser.rows,hashlib.sha256(obj['html'].encode()).hexdigest()
def main():
 upper,upperhash=table(15,'t15-11');digit,digithash=table(15,'t15-12');lower,lowerhash=table(16,'t16-10')
 uei={};lei={};di={0:[0]*9};duplicates=[]
 for rows,width,key,out in [(upper,6,1,uei),(lower,5,1,lei)]:
  for row in rows:
   if len(row)!=width or not all(not c or re.fullmatch(r'\d+',c)for c in row)or not row[key]:continue
   k,v=int(row[key]),int(row[0]);assert k not in out or out[k]==v,(k,'conflicting source rows');out[k]=v
 for row in digit:
  if len(row)!=10 or not all(re.fullmatch(r'\d+',c)for c in row):continue
  k=int(row[0]);value=list(map(int,row[1:]));
  if k in di:assert di[k]==value,(k,'conflicting repeated digit row');duplicates.append(k)
  di[k]=value
 assert set(uei)==set(range(101));assert set(lei)==set(range(101))
 assert set(range(101))-set(di)=={32}and duplicates==[21]
 data={'version':1,'edition':'AMA Guides Sixth Edition, supplied source','sourceTables':{'t15-11':{'pages':[420],'htmlSHA256':upperhash},'t15-12':{'pages':[421,422,423],'htmlSHA256':digithash},'t16-10':{'pages':[531],'htmlSHA256':lowerhash}},'digitMissingRows':[32],'digitRepeatedRows':duplicates,'digit':[di.get(n)for n in range(101)],'ueiToWpi':[uei[n]for n in range(101)],'leiToWpi':[lei[n]for n in range(101)]}
 (ROOT/'calculator/impairment.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
 print('UEI 101 / LEI 101 source values; DI missing 32 and repeated 21 preserved')
if __name__=='__main__':main()
