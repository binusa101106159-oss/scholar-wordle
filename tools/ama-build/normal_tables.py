"""Merge PDF-derived flowing tables while retaining existing body corrections.

Run build.py --flow-tables --output <isolated directory> first. This merge never
retypes source wording: matched body nodes and diagram-only objects come from
the existing reader; table cells come from the checked PDF converter output.
"""
import argparse, asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]
MERGE=r'''({old,fresh,headings})=>{
 const parse=html=>{const d=document.createElement('div');d.innerHTML=html;return d;};
 const canon=s=>s.replace(/\s/g,'');
 const merge=(before,after)=>{
  const a=parse(before),b=parse(after);
  // Restore only identical body text. Changed ownership, such as a repaired
  // calculation box absorbing its footnote, must follow the new PDF geometry.
  for(const n of [...b.querySelectorAll('[id]')]){
   if(n.closest('table,.ax-object'))continue;
   const previous=a.querySelector('[id="'+n.id+'"]');
   if(previous&&canon(previous.textContent)===canon(n.textContent))n.replaceWith(previous.cloneNode(true));
  }
  // Pure illustrations retain all original clipping, masks and label fixes.
  for(const n of [...b.querySelectorAll('.ax-object-figure')]){
   const previous=a.querySelector('[id="'+n.id+'"]');
   if(previous&&!n.querySelector('table'))n.replaceWith(previous.cloneNode(true));
  }
  // Decorative heading spacing is explicit, separate from normal cell text.
  for(const p of b.querySelectorAll('p')){
   if(p.closest('table'))continue;
   const h=headings.find(h=>canon(p.textContent).startsWith(canon(h.raw)));
   if(!h)continue;
   const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),nodes=[];let node;
   while(node=walker.nextNode())nodes.push(node);
   const raw=nodes.map(n=>n.textContent).join('');let consumed=0,end=0;
   while(end<raw.length&&consumed<canon(h.raw).length){if(!/\s/.test(raw[end]))consumed++;end++;}
   const range=document.createRange();range.setStart(p,0);let at=end;
   for(const n of nodes){if(at<=n.length){range.setEnd(n,at);break;}at-=n.length;}
   const span=document.createElement('span');span.className='ax-flow-heading';span.dataset.readableTitle=h.expected;span.textContent=raw.slice(0,end);
   range.deleteContents();range.insertNode(span);
  }
  return b.innerHTML;
 };
 const output={...old,pages:fresh.pages.map(p=>({...p,html:merge(old.pages.find(q=>q.page===p.page).html,p.html)})),attachments:fresh.attachments.map(p=>{
  const previous=old.attachments.find(q=>q.id===p.id);
  if(p.kind==='figure'&&!parse(p.html).querySelector('table'))return previous;
  return {...p,html:merge(previous.html,p.html)};
 })};
 if(JSON.stringify(old.sections)!==JSON.stringify(fresh.sections))throw Error('Section anchors changed');
 return output;
}'''

async def main(args):
 fixtures=json.loads((ROOT/'tests/fixtures/ama-heading-glyphs.json').read_text(encoding='utf8'))['cases']
 js=(ROOT/'ama/ama.js').read_text(encoding='utf8');helpers=js[js.index('  const CHAPTER_MARK='):js.index('  function applyMarks(')]
 async with async_playwright() as p:
  browser=await p.chromium.launch();page=await browser.new_page()
  for ident in [f'c{i:02}' for i in range(1,18)]:
   old=json.loads((args.original/(ident+'.json')).read_text(encoding='utf8'))
   fresh=json.loads((args.flow/(ident+'.json')).read_text(encoding='utf8'))
   headings=[dict(raw=''.join(c[0]for c in h['glyphs']),expected=h['expected'])for h in fixtures if h['chapter']==ident]
   headings.sort(key=lambda h:len(''.join(h['raw'].split())),reverse=True)
   merged=await page.evaluate(MERGE,dict(old=old,fresh=fresh,headings=headings))
   await page.evaluate('''({old,merged})=>{const text=h=>{const d=document.createElement('div');d.innerHTML=h;return d.textContent.replace(/\\s/g,'');};const freq=s=>JSON.stringify([...s].reduce((m,c)=>(m[c]=(m[c]||0)+1,m),Object.create(null)),Object.keys([...s].reduce((m,c)=>(m[c]=1,m),{})).sort());for(const p of merged.pages){const before=old.pages.find(q=>q.page===p.page);if(freq(text(before.html))!==freq(text(p.html)))throw Error('Page character mismatch '+p.page);}}''',dict(old=old,merged=merged))
   texts=await page.evaluate('''({old,merged})=>{'''+helpers+''';const text=p=>{const d=document.createElement('div');d.innerHTML=p.html;showChapterMarks(d);showSourceHeadings(d);const tables=[...d.querySelectorAll('table')],cells=[...d.querySelectorAll('td,th')],groups={};let text='';for(const n of textNodes(d)){const cell=n.parentElement.closest('td,th'),anchor=n.parentElement.closest('[id]');const key=cell?'table:'+tables.indexOf(cell.closest('table'))+':'+[...cell.closest('table').querySelectorAll('td,th')].indexOf(cell)+':'+cell.closest('table').querySelectorAll('td,th').length:anchor?'id:'+anchor.id:'outer';(groups[key]||=[]).push([text.length,n.textContent]);text+=n.textContent;}return {text,groups};};return merged.pages.map(p=>[text(old.pages.find(q=>q.page===p.page)),text(p)]);}''',dict(old=old,merged=merged))
   for target,(old_text,new_text) in zip(merged['pages'],texts):
    before,after=old_text['text'],new_text['text']
    if before==after:continue
    blocks=[];matched=0
    for key,old_nodes in old_text['groups'].items():
     new_nodes=new_text['groups'].get(key,[])
     aa=[(offset+i,c)for offset,value in old_nodes for i,c in enumerate(value)if not c.isspace()];bb=[(offset+i,c)for offset,value in new_nodes for i,c in enumerate(value)if not c.isspace()]
     a=''.join(c for _,c in aa);b=''.join(c for _,c in bb)
     # Only exact character correspondence within the same source cell/anchor
     # is safe. Retain unmatched legacy records rather than guess a location.
     if a!=b:continue
     for (start,_),(end,_) in zip(aa,bb):
      matched+=1
      if blocks and blocks[-1][0]+blocks[-1][2]==start and blocks[-1][1]+blocks[-1][2]==end:blocks[-1][2]+=1
      else:blocks.append([start,end,1])
    target['textMigration']=dict(fromLength=len(before),toLength=len(after),blocks=blocks)
    total=sum(not c.isspace()for c in before)
    if matched<total:print(ident,target['page'],'legacy marks: safely mapped',matched,'/',total,flush=True)
   (args.output/(ident+'.json')).write_text(json.dumps(merged,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8',newline='\n')
   print(ident,len(merged['pages']),'pages merged',flush=True)
  await browser.close()

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--original',type=Path,required=True);parser.add_argument('--flow',type=Path,required=True)
 parser.add_argument('--output',type=Path,default=ROOT/'ama')
 asyncio.run(main(parser.parse_args()))
