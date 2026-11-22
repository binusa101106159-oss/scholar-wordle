"""Source-verified repairs for split reading-table notes and cross-page figures."""
from pathlib import Path
from collections import Counter
import json,re,html
import pymupdf
ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path(r'A:\職醫\AMA\AMA Guides to the Evaluation of Permanent Impairment, 6e.pdf')
def plain(value):return html.unescape(re.sub('<[^>]+>','',value))
def chars(value):return Counter(c for c in plain(value)if not c.isspace())
def repair_chapter(data,doc):
 if data['id']=='c12':
  pages={p['page']:p for p in data['pages']};objects={a['id']:a for a in data['attachments']}
  # The first range-column letter was assigned to the numeric column and
  # vertical bounds merged two rows. Confirm every existing character remains.
  rowdata=[('100 ± 10','Range of normal','Normal functioning, with reserve capacity'),('80 ± 10','Mild loss','Normal functioning, but loss of reserve capacity'),('60 ± 10','Moderate loss','Normal functioning, but need for some aids'),('40 ± 10','Severe loss','Restricted functioning, slower than normal, even with aids'),('20 ± 10','Profound loss','Restricted functioning, marginal performance, even with aids'),('0 ± 10','Near-total or total loss','Cannot perform; needs substitution skills')]
  table='<table class="ax-table ax-visual-ranges"><colgroup><col style="width:20%"><col style="width:30%"><col style="width:50%"></colgroup><tbody>'+''.join('<tr>'+''.join('<td><p>'+html.escape(cell)+'</p></td>'for cell in row)+'</tr>'for row in rowdata)+'</tbody></table>'
  match=next(t for t in re.finditer(r'<table\b.*?</table>',pages[289]['html'],re.S)if '100 ± 10'in plain(t[0]))
  assert chars(match[0])==chars(table),'Reading range repair must retain all source characters'
  pages[289]['html']=pages[289]['html'][:match.start()]+table+pages[289]['html'][match.end():]
  # Read the full footnote from its actual source lines, beyond the old x=542 cutoff.
  raw=doc[334].get_text();note=raw[raw.index('a Columns indicate reading distances.'):raw.index('b indicates inches.')];note=' '.join(note.replace('\x02','−').split());first,second=note.split('box represents',1);notes={'p310-b431-0':first.strip(),'p310-b432-0':'box represents'+second}
  def restore_notes(value):
   for ident,text in notes.items():
    count=0
    def replace(match):
     nonlocal count
     count+=1;return '<p id="'+ident+'">'+html.escape(text)+'</p>'if count==1 else ''
    value=re.sub(r'<p\b[^>]*\bid="'+ident+r'"[^>]*>.*?</p>',replace,value,flags=re.S)
   return value
  pages[310]['html']=restore_notes(pages[310]['html']);objects['t12-11']['html']=restore_notes(objects['t12-11']['html'])
  for number,title,artpage in [('12-10','Overlay Grid for Goldman Fields',315),('12-11','Overlay Grids for Humphrey Field Plots',317)]:
   ident='f'+number;obj=objects[ident];svgs=re.findall(r'<svg\b.*?</svg>',obj['html'],re.S);svg=next(s for s in svgs if 'ax-source-overlay'in s)
   svg=svg.replace('class="ax-vector ax-source-overlay"','class="ax-vector ax-source-overlay ax-reader-overlay"')
   svg=re.sub(r'<svg\b', '<svg data-source-figure="'+number+'"', svg, count=1)if 'data-source-figure='not in svg else svg
   if number=='12-10':svg=re.sub(r'viewBox="[^"]+"','viewBox="108.5 258.5 359.5 372"',svg,count=1)
   caption='<p id="p'+str(artpage-1)+'-b'+('20'if number=='12-10'else'24')+'-0"><strong>Opposite Page</strong></p><p id="p'+str(artpage-1)+'-b'+('21'if number=='12-10'else'25')+'-0" class="ax-restored-figure-caption"><span class="ax-flow-heading" data-readable-title="Figure '+number+'">F I G U R E '+ ' '.join(number)+'</span> '+title+'</p>'
   obj['html']=caption+svg
   # Keep source caption text on its original page, as a compact reference.
   reference='<div class="ax-figure-cross-reference" id="'+ident+'">'+caption+'<button type="button" class="ax-expand" data-open="'+ident+'">放大檢視</button></div>'
   before=pages[artpage-1]['html'];pages[artpage-1]['html']=re.sub(r'<(?:section|div)\b[^>]*\bid="'+ident+r'"[^>]*>.*?</(?:section|div)>',lambda _:reference,before,flags=re.S)
   part=pages[artpage]['html'];part=re.sub(r'<svg\b.*?</svg>',lambda _:svg,part,count=1,flags=re.S);part=part.replace('data-attachment="'+ident+'-p'+str(artpage)+'"','data-attachment="'+ident+'"');pages[artpage]['html']=part
 elif data['id']=='c13':
  def unique_caption(value):
   count=0
   def replace(match):
    nonlocal count
    count+=1;return match[0]if count==1 else match[0].replace('p326-b21-0','p326-b21-0-continuation')
   return re.sub(r'<p\b[^>]*\bid="p326-b21-0"[^>]*>',replace,value)
  for p in data['pages']:
   if p['page']==326:p['html']=unique_caption(p['html'])
  for obj in data['attachments']:
   if obj['id']=='t13-3':obj['html']=unique_caption(obj['html'])
 return data
if __name__=='__main__':
 doc=pymupdf.open(SOURCE);backup=ROOT/'.local/ama-current-repair/before';backup.mkdir(exist_ok=True)
 for ident in ['c12','c13']:
  path=ROOT/'ama'/(ident+'.json');raw=path.read_text(encoding='utf8');
  if not(backup/path.name).exists():(backup/path.name).write_text(raw,encoding='utf8')
  data=repair_chapter(json.loads(raw),doc);path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8');print(ident,'source-verified residual fixes applied')
