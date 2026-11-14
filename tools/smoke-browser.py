"""Read-only browser release checks. All records used here are fictional."""
from pathlib import Path
import functools,http.server,threading
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  for engine in ['chromium','firefox','webkit']:
   browser=getattr(p,engine).launch()
   for width in [1440,390]:
    context=browser.new_context(viewport={'width':width,'height':900},service_workers='block');page=context.new_page();errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort())
    page.goto(url+'/#laws');page.locator('#lx-doc .lx-art').first.wait_for();assert not any('/ama/ama.js' in r or '/calculator/california.js' in r for r in requests)
    for route,selector in [('guides','#gx-doc h1'),('health','#hx-doc h1'),('ama','#ax-body .ax-page'),('forms','#fm-bsrs'),('calculator','#ca-group-input'),('calendar','#cal-days button'),('cases','#ct-add')]:
     page.evaluate('(r)=>location.hash=r',route);page.locator(selector).first.wait_for(timeout=30000)
    assert page.locator('#ct-add').is_disabled()
    page.evaluate("ScholarSync.connect({uid:'test'},{commit:async()=>{throw Error('offline test')}});window.dispatchEvent(new StorageEvent('storage',{key:'scholar-cases-v1'}))")
    page.locator('#ct-add').click();page.locator('#ct-name').fill('Fictional QA');page.locator('#ct-notes').fill('draft retained');page.evaluate('ScholarSync.connect({uid:"test"},ScholarSync.transport,new Map())');assert page.locator('#ct-notes').input_value()=='draft retained';page.locator('#ct-cancel').click();page.wait_for_timeout(250)
    assert not errors,errors
    print(engine,width,'lazy routes/public startup/private guard/draft PASS',flush=True);context.close()
   browser.close()
finally:server.shutdown()
