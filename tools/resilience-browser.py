"""Bounded stress, interruption and touch-layout checks; no real account or patient data."""
from pathlib import Path
import functools,http.server,threading
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  for engine in ['chromium','firefox','webkit']:
   browser=getattr(p,engine).launch();ctx=browser.new_context(viewport={'width':390,'height':844},has_touch=True,service_workers='block');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());
   if engine=='chromium':ctx.new_cdp_session(page).send('Network.emulateNetworkConditions',{'offline':False,'latency':150,'downloadThroughput':200000,'uploadThroughput':100000})
   page.goto(base+'/#cases');page.locator('#ct-add').wait_for(state='attached');page.wait_for_function('!document.querySelector("#cases-panel").inert')
   page.evaluate("ScholarSync.connect({uid:'fixture'},{commit:async()=>{throw Error('offline test')}});window.dispatchEvent(new StorageEvent('storage',{key:'scholar-cases-v1'}))")
   page.locator('#ct-add').tap();page.locator('#ct-name').fill('Fictional QA');notes=page.locator('#ct-notes');notes.fill('multi-line\n草稿');notes.focus();notes.evaluate('(e)=>e.setSelectionRange(4,4)');page.evaluate("location.hash='calculator'");page.locator('#cl-input').wait_for();page.go_back();page.wait_for_function('document.querySelector("#ct-editor").open');assert notes.input_value()=='multi-line\n草稿';assert notes.evaluate('(e)=>e.selectionStart')==4
   assert notes.evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=16;page.locator('#ct-followupPeriod').select_option('AM');ctx.set_offline(True);page.locator('#ct-save').tap();page.locator('#ct-form-error').filter(has_text='填寫內容仍保留').wait_for();assert notes.input_value()=='multi-line\n草稿';ctx.set_offline(False);page.set_viewport_size({'width':390,'height':400});notes.tap();assert page.locator('#ct-editor').bounding_box()['height']<=400;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.set_viewport_size({'width':390,'height':844});page.locator('#ct-cancel').tap();page.wait_for_timeout(200)
   counts=[];heaps=[];cdp=ctx.new_cdp_session(page) if engine=='chromium' else None
   for cycle in range(15):
    for route,selector in [('forms','#fm-bsrs'),('calculator','#ca-group-input'),('laws','#lx-doc .lx-art'),('ama','#ax-body .ax-page')]:
     page.evaluate('(r)=>location.hash=r',route);page.locator(selector).first.wait_for()
    page.locator('#ax-table-shortcuts button').first.evaluate('(e)=>e.click()');page.wait_for_function('document.querySelector("#ax-dialog").open');page.keyboard.press('Escape');page.wait_for_function('!document.querySelector("#ax-dialog").open');page.wait_for_function('document.querySelectorAll(".pg-glass-plane").length===0')
    if cycle in [3,14]:
     counts.append(page.locator('body *').count())
     if cdp:cdp.send('HeapProfiler.collectGarbage');heaps.append(cdp.send('Runtime.getHeapUsage')['usedSize'])
   assert counts[-1]<=counts[0]+50,(engine,counts);assert page.locator('.pg-glass-plane').count()==0;assert not errors,errors
   if heaps:assert heaps[-1]<heaps[0]*1.3+5000000,heaps
   print(engine,'15 rounds / 60 tab switches + popup cycles; DOM',counts,'heap',heaps,'touch/back/draft/offline save PASS',flush=True);ctx.close();browser.close()
finally:server.shutdown()
