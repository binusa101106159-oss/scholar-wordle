"""Build compact calendar exceptions from official DGPA CSV files, retaining source hashes."""
import calendar,csv,datetime,hashlib,json,sys
from pathlib import Path
source=Path(sys.argv[1]);root=Path(__file__).resolve().parents[1]
manifest=json.loads((source/'sources.json').read_text(encoding='utf-8-sig')) if (source/'sources.json').exists() else json.loads((root/'calculator/taiwan-calendar.json').read_text(encoding='utf8'))['sources']
output={'source':'https://data.gov.tw/dataset/14718','authority':'行政院人事行政總處政府行政機關辦公日曆表','years':[],'sources':[],'dates':{}}
for entry in sorted(manifest,key=lambda x:x['year']):
 year=entry['year'];raw=(source/f'{year}.csv').read_bytes()
 try:text=raw.decode('utf-8-sig')
 except UnicodeDecodeError:text=raw.decode('cp950')
 rows=list(csv.DictReader(text.splitlines()));expected=366 if calendar.isleap(year) else 365
 assert len(rows)==expected,(year,len(rows));first=datetime.date(year,1,1)
 for i,row in enumerate(rows):
  date=datetime.datetime.strptime(row['西元日期'],'%Y%m%d').date();assert date==first+datetime.timedelta(days=i)
  assert row['星期']=='一二三四五六日'[date.weekday()];assert row['是否放假'] in ['0','2'];off=row['是否放假']=='2';note=row['備註'].strip();weekend=date.weekday()>=5
  if note or off!=weekend:output['dates'][date.isoformat()]=[off,note]
 output['years'].append(year);output['sources'].append({'year':year,'url':entry['url'],'sha256':hashlib.sha256(raw).hexdigest(),'rows':len(rows)})
path=root/'calculator/taiwan-calendar.json';path.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
print('Official DGPA calendar:',output['years'],'exceptions',len(output['dates']),'bytes',path.stat().st_size)
