"""Recheck pinned official exports against the published native law data.

Downloads are optional. Source changes fail verification instead of silently
overwriting law text, highlight offsets or approved table layouts.
"""
from pathlib import Path
import argparse,collections,hashlib,json,re,urllib.request
import pymupdf
import parse_laws
from annex import visible_text,page_chars_text
ROOT=Path(__file__).resolve().parents[2]
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source-dir',type=Path,default=ROOT/'.local/farm-fish/src');parser.add_argument('--download',action='store_true');args=parser.parse_args()
 manifest=json.loads((Path(__file__).parent/'official-insurance-sources.json').read_text(encoding='utf8'));folder=args.source_dir;folder.mkdir(parents=True,exist_ok=True)
 parse_laws.SRC=str(folder);parse_laws.source_dir=lambda id:str(folder)
 norm=lambda s:re.sub(r'\s+','',s);counts=lambda s:collections.Counter(re.sub(r'[\s＿]','',s));inventory=[]
 def source(url,file,digest):
  path=folder/file
  if not path.exists()and args.download:path.write_bytes(urllib.request.urlopen(url,timeout=60).read())
  assert path.exists(),str(path)+' missing; use --download to fetch official originals'
  assert hashlib.sha256(path.read_bytes()).hexdigest()==digest,str(path)+' changed; review the new official version before importing'
  doc=pymupdf.open(path);pages=[page.get_text()for page in doc];assert all(t.strip()for t in pages),file+' unreadable page'
  lines=[line.strip()for text in pages for line in text.splitlines()if line.strip()]
  return path,{'file':file,'pages':len(pages),'first':lines[0],'last':lines[-1]}
 for row in manifest['laws']:
  id=row['id'];path,record=source(row['pdfURL'],row['name']+'.pdf',row['sha256']);fresh=parse_laws.parse(id,row['tier'],row['name'],row['name'])
  raw=norm(''.join(parse_laws.raw_text(str(path))));raw=''.join(c for c in raw if c not in parse_laws.BOX).replace('法規名稱：','').replace('生效狀態：','')
  assert raw==norm(parse_laws.flat(fresh)),id+' PDF conversion mismatch'
  native=json.loads((ROOT/'laws/text'/f'{id}.json').read_text(encoding='utf8'));native.setdefault('title',native['name'])
  assert norm(parse_laws.flat(native))==norm(parse_laws.flat(fresh)),id+' native law differs from official source'
  record.update(id=id,date=fresh['date'],headings=[it['text']for it in fresh['items']if it['t']=='ch'],articles=sum(it['t']=='art'for it in fresh['items']),check='PASS');inventory.append(record)
  for a in row['attachments']:
   path,record=source(a['url'],a['file'],a['sha256']);data=json.loads((ROOT/'laws/annex'/f"{a['annexId']}.json").read_text(encoding='utf8'))
   actual=visible_text(data)+''.join(data.get('footers',[]))+''.join(data.get('dropped',[]))+a.get('omittedPrintedPageFooters','')
   assert counts(page_chars_text(str(path)))==counts(actual),a['annexId']+' annex character mismatch'
   record.update(id=a['annexId'],check='PASS');inventory.append(record)
  print(id,'official law and attachments PASS',flush=True)
 out=ROOT/'.local/farm-fish/verified-inventory.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print('TOTAL',len(manifest['laws']),'laws',sum(len(r['attachments'])for r in manifest['laws']),'official attachments PASS',flush=True)
if __name__=='__main__':main()
