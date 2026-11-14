"""Check normal AMA figure text across the complete corpus and browser engines.

Source JSON, source characters, artwork and clinical label anchors are unchanged.
Outputs are local QA artifacts, never public assets or patient data.
"""
from pathlib import Path
import functools,http.server,json,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUTPUT=ROOT/'.local/ama-labels-review'
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

CHECK=r'''({html,pages,label,ident})=>{
 const d=document.createElement('section');d.className=pages?'ax-page ax-page-content':'ax-dialog-body';
 d.style.cssText='position:absolute;left:0;top:0;width:'+Math.min(innerWidth,1100)+'px;max-height:none;background:#151b23;overflow:visible;content-visibility:visible';
 d.innerHTML=html;document.querySelector('#ama-panel').append(d);
 const before=d.textContent;showChapterMarks(d);showSourceHeadings(d,label);
 const restored=d.cloneNode(true);restored.querySelectorAll('[data-source-text]').forEach(n=>n.textContent=n.dataset.sourceText);
 if(restored.textContent!==before)throw Error('Source characters changed');
 const labels=[...d.querySelectorAll('.ax-natural-label,.ax-readable-heading,svg .ax-natural-svg')].filter(n=>!n.closest('defs')&&n.textContent.trim()).map(n=>{
  const r=n.getBoundingClientRect();return {text:n.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height};
 });
 const overlaps=[];
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
  const a=labels[i],b=labels[j];
  if(Math.abs(a.y-b.y)>Math.min(a.h,b.h)*.32)continue;
  const x=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
  if(x>2.5&&Math.min(a.w,b.w)>0)overlaps.push({a:a.text,b:b.text,x});
 }
 const result={runs:d.querySelectorAll('.ax-natural-run').length,svg:d.querySelectorAll('.ax-natural-svg').length,
  unhandled:d.querySelectorAll('.ax-source-run:not(.ax-natural-run):not(.ax-readable-heading)').length+d.querySelectorAll('svg text:not(.ax-natural-svg)').length,
  labels:labels.length,overlaps};
 // Exact original per-character coordinates remain in the source assets only.
 for(const run of d.querySelectorAll('.ax-natural-run'))for(const child of run.children)if(child.childElementCount)throw Error('Per-character HTML spans survived');
 for(const text of d.querySelectorAll('.ax-natural-svg'))if(text.hasAttribute('textLength')||text.querySelector('[textLength],[lengthAdjust]'))throw Error('Stretched SVG glyphs survived');
 const copied=readableCopy(d.cloneNode(true)).textContent;
 const tracked=copied.match(/(?<![A-Za-z])(?:[A-Za-z]\s+){4,}[A-Za-z](?![A-Za-z])/g)||[];
 const residual=tracked.filter(s=>!/^([ABCDE])+$/.test(s.replace(/\s/g,'')));
 if(residual.length)throw Error(ident+': residual letter-spaced words in copied text: '+residual.slice(0,3).join(' | '));
 const fits=[...d.querySelectorAll('[data-label-fit]')].filter(n=>n.textContent.trim()).map(n=>+n.dataset.labelFit);
 result.minimumLabelScale=fits.length?Math.min(...fits):1;
 if(result.minimumLabelScale<.75)throw Error(ident+': Label excessively reduced '+JSON.stringify([...d.querySelectorAll('[data-label-fit]')].filter(n=>n.textContent.trim()&&+n.dataset.labelFit<.75).map(n=>[n.textContent,n.dataset.labelFit])));
 d.remove();return result;
}'''

def main():
 OUTPUT.mkdir(parents=True,exist_ok=True)
 chapters=[json.loads((ROOT/'ama'/f'c{i:02}.json').read_text(encoding='utf8'))for i in range(1,18)]
 js=(ROOT/'ama/ama.js').read_text(encoding='utf8');helpers=js[js.index('  const CHAPTER_MARK='):js.index('  function textNodes(')]
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
 threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/'
 results=[]
 try:
  with sync_playwright()as p:
   for engine in ['chromium','firefox','webkit']:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce')
     page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.route('https://www.gstatic.com/firebasejs/**',lambda route:route.abort());page.goto(url+'#ama');page.locator('.ax-page').first.wait_for()
     page.evaluate('()=>{'+helpers+'window.checkAMALabels='+CHECK+';}')
     counts={'objects':0,'pages':0,'sourcePages':0,'runs':0,'svg':0,'labels':0};issues=[];minimumScale=1
     for chapter in chapters:
      items=[('object',a)for a in chapter['attachments']]
      if engine=='chromium':items += [('page',a)for a in chapter['pages']]
      for kind,item in items:
       result=page.evaluate('item=>checkAMALabels(item)',{'html':item['html'],'pages':kind=='page','label':item.get('label'),'ident':chapter['id']+' '+str(item.get('id',item['page']))})
       if result['unhandled']or result['overlaps']:issues.append({'chapter':chapter['id'],'kind':kind,'id':item.get('id',item['page']),**result})
       counts['objects'if kind=='object'else'pages']+=1
       if kind=='page':counts['sourcePages']+=len(item.get('sourcePages',[item['page']]))
       for key in ['runs','svg','labels']:counts[key]+=result[key]
       minimumScale=min(minimumScale,result['minimumLabelScale'])
     assert not issues,(engine,width,issues[:5])
     # Exercise the actual popup and copy handler for the reported figure.
     page.locator('#ax-tab-c15').dispatch_event('click');page.locator('.ax-page[data-page="492"]').wait_for()
     page.locator('#ax-body button[data-open="f15-17"]').first.dispatch_event('click');page.locator('#ax-dialog[open]').wait_for()
     copied=page.locator('#ax-dialog-body').evaluate('''el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);const out={},e=new Event('copy',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{setData:(k,v)=>out[k]=v}});el.dispatchEvent(e);return out['text/plain'];}''')
     assert 'Neutral Position of Thumb'in copied and 'MCP Joint'in copied,copied
     page.evaluate('getSelection().removeAllRanges()')
     if width==1440 and engine=='chromium':
      page.locator('#ax-dialog-body').screenshot(path=str(OUTPUT/'figure15-17.png'))
     page.locator('#ax-dialog-close').dispatch_event('click')
     page.locator('#ax-tab-c12').dispatch_event('click');page.locator('.ax-page[data-page="319"]').wait_for()
     page.locator('#ax-body button[data-open="f12-9"]').first.dispatch_event('click');page.locator('#ax-dialog[open]').wait_for()
     if width==1440 and engine=='chromium':page.locator('#ax-dialog-body').screenshot(path=str(OUTPUT/'figure12-9.png'))
     page.locator('#ax-dialog-close').dispatch_event('click');page.locator('#ax-tab-c15').dispatch_event('click')
     page.locator('#ax-body button[data-open="f15-20"]').first.dispatch_event('click');page.locator('#ax-dialog[open]').wait_for()
     vertical=page.locator('#ax-dialog-body .ax-vertical-label').bounding_box()
     assert vertical and vertical['height']>vertical['width']*4,vertical
     if width==1440 and engine=='chromium':page.locator('#ax-dialog-body').screenshot(path=str(OUTPUT/'figure15-20.png'))
     assert not errors,errors
     results.append({'engine':engine,'width':width,**counts,'overlaps':0,'unhandled':0,'minimumLabelScale':minimumScale,'sourceText':'unchanged','copy':'PASS'})
     print(engine,width,counts,'source text / natural labels / overlaps / actual popup copy PASS',flush=True)
     context.close()
    browser.close()
 finally:server.shutdown()
 (OUTPUT/'results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf8')

if __name__=='__main__':main()
