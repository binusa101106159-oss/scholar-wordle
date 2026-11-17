"""Exercise every farm/fish law and all newly imported annexes."""
from pathlib import Path
import argparse,functools,http.server,json,threading,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def visible(blocks):
 out=[]
 for b in blocks:
  if b['t']=='p':out.append(b['text'])
  elif b['t']=='diagram':out.extend(r['text']for r in b['runs'])
  elif b['t']=='table':
   for row in b['rows']:
    for c in row:
     out.append(c['text'])
     if 'diag'in c:out.extend(c['diag'][k]for k in ['tr','mid','bl'])
     if 'blocks'in c:out.append(visible(c['blocks']))
 return ''.join(out)
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',default='chromium,firefox,webkit');args=parser.parse_args()
 index=json.loads((ROOT/'laws/index.json').read_text(encoding='utf8'));metas={m['id']:m for m in index['laws']};groups={'農保':[m['id']for m in index['laws']if m['tier']=='農保'],'漁保':next(t['laws']for t in index['tiers']if t['id']=='漁保')}
 out=ROOT/'.local/insurance-browser';out.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();url=args.url or f'http://127.0.0.1:{server.server_port}/'
 try:
  with sync_playwright()as p:
   for engine in args.engines.split(','):
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(url.rstrip('/')+'/#laws');page.locator('#lx-doc .lx-art').first.wait_for()
     def choose(group,id):
      if width==390 and 'lx-drawer'not in page.locator('#laws-panel').get_attribute('class'):page.locator('#lx-menu').click()
      button=page.locator('[data-tier="'+group+'"]')
      if button.get_attribute('aria-expanded')!='true':button.click()
      page.locator('#lx-tier-'+group+' [data-law="'+id+'"]').click();page.wait_for_function('name=>document.querySelector("#lx-doc h1")?.textContent===name',arg=metas[id]['name'])
      assert group in page.locator('#lx-doc .sg-eyebrow').inner_text(),(group,id,'lost category context')
     for group,ids in groups.items():
      for id in ids:
       choose(group,id);assert page.locator('#lx-doc .lx-art').count()==metas[id]['articles'],id
       assert page.locator('#lx-doc .lx-meta a').get_attribute('href')==metas[id]['sourceURL'],id
       if id.startswith(('farm','fish')):
        for annex in metas[id]['annexes']:
         print(engine,width,annex['id'],'opening',flush=True)
         aid=annex['id'];page.locator(('#lx-table-rail 'if width==1440 else'#lx-doc .lx-chips ')+'[data-annex="'+aid+'"]').click()
         try:page.wait_for_function('id=>document.querySelector("#lx-annex-body")?.dataset.renderKey?.startsWith(id+"|")',arg=aid)
         except Exception:
          print('OPEN FAILURE',aid,errors,page.evaluate('()=>({open:document.querySelector("#lx-annex").open,title:document.querySelector("#lx-annex-title").textContent,key:document.querySelector("#lx-annex-body").dataset.renderKey,body:document.querySelector("#lx-annex-body").textContent.slice(0,100),focus:document.activeElement.outerHTML.slice(0,300)})'),flush=True);page.screenshot(path=str(out/'failure.png'));raise
         body=page.locator('#lx-annex-body')
         # renderKey may precede WebKit popup visibility; wait for rendered text.
         page.wait_for_function('''() => {
          const body=document.querySelector('#lx-annex-body'),dialog=document.querySelector('#lx-annex');
          return dialog?.open && body?.getBoundingClientRect().height>0 &&
           getComputedStyle(body).visibility==='visible' && body.innerText.replace(/\\s/g,'').length>30;
         }''')
         assert len(re.sub(r'\s','',body.inner_text()))>30,aid
         native=json.loads((ROOT/'laws/annex'/f'{aid}.json').read_text(encoding='utf8'))
         assert re.sub(r'\s','',body.text_content())==re.sub(r'\s','',visible(native['blocks'])),(aid,'rendered text mismatch')
         assert body.locator('img').count()==0,(aid,'unexpected raster text')
         for pos in [0,.5,1]:
          body.evaluate('(e,p)=>e.scrollTo({top:(e.scrollHeight-e.clientHeight)*p,behavior:"instant"})',pos)
          page.wait_for_function('(p)=>{const e=document.querySelector("#lx-annex-body");return Math.abs(e.scrollTop-(e.scrollHeight-e.clientHeight)*p)<3}',arg=pos)
          if engine=='chromium'and width==1440:body.screenshot(path=str(out/f'{aid}-{pos}.png'))
         edge=body.evaluate('e=>e.scrollHeight-e.clientHeight-e.scrollTop');assert edge<3,(aid,'bottom unreachable',edge)
         page.locator('#lx-annex [data-close]').click();page.locator('#lx-annex').wait_for(state='hidden')
     # The same shared law keeps one checkbox state across its two categories.
     choose('漁保','a05');first=page.locator('#lx-doc [data-check-law="a05"]').first;first.check()
     choose('A','a05');assert page.locator('#lx-doc [data-check-law="a05"]').first.is_checked()
     choose('漁保','a05');assert page.locator('#lx-doc [data-check-law="a05"]').first.is_checked()
     page.evaluate("location.hash='calculator'");page.locator('#ca-group-input').wait_for();page.evaluate("location.hash='laws'");page.locator('#lx-doc .lx-art').first.wait_for();assert '漁保'in page.locator('#lx-doc .sg-eyebrow').inner_text()
     assert not errors,errors;print(engine,width,'19 laws / 12 new annexes / category context / source links / shared checks / tab return PASS',flush=True);page.close()
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
