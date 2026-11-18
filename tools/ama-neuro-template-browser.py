"""Verify the chapter-13 chart template copies the user's exact plain text."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
EXPECTED='\n'.join([
 '13-4 Consciousness and Awareness:',
 '13-5 Episodic Loss of Consciousness and Awareness:',
 '13-6 Sleep and Arousal Disorders:',
 '13-8 Alteration in MSCHIF:',
 '13-9 Aphasia or Dysphasia',
 '13-11 Upper Extremity:',
 '13-12 Station and Gait:',
 '13-13 Neurogenic Bowel:',
 '13-14 Neurogenic Bladder:',
 '13-15 Neurogenic Sexual Dysfunction:',
 '13-16 Neurogenic Respiratory Dysfunction:',
 '13-17 Dysesthetic Pain:',
 '13-18 Migraine Headache:',
 '13-19 Trigeminal or Glossopharyngeal Neuralgia:',
 '13-20 Miscellaneous Peripheral Nerves:'])
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);args=parser.parse_args();server=None
 if args.url:base=args.url.rstrip('/')+'/'
 else:
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 output=ROOT/'.local/ama-neuro-template';output.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort())
     page.goto(base+'#ama');page.locator('.ax-page').first.wait_for();assert page.locator('[data-neuro-template-copy]:visible').count()==0
     page.locator('#ax-tab-c13').dispatch_event('click');scope=page.locator('#ax-table-rail'if width==1440 else'#ax-table-shortcuts');button=scope.get_by_role('button',name='複製病歷模板',exact=True);button.wait_for();assert button.count()==1
     chapter_text=page.locator('#ax-body').text_content()
     if engine=='chromium':context.grant_permissions(['clipboard-read','clipboard-write'])
     else:page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedTemplate=text}}})")
     button.click();page.wait_for_function('document.querySelector("#ax-status").textContent.includes("已複製第13章")')
     if engine=='chromium':assert page.evaluate('navigator.clipboard.readText()').replace('\r\n','\n')==EXPECTED
     else:assert page.evaluate('window.copiedTemplate')==EXPECTED
     for kind in ['Figure','Table']:
      scope.get_by_role('tab',name=kind,exact=True).click();assert button.count()==1 and button.is_visible()
     assert page.locator('#ax-body').text_content()==chapter_text
     # Fallback failure is reported honestly, and a successful legacy copy is exact.
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}});document.execCommand=()=>false")
     button.click();page.wait_for_function('document.querySelector("#ax-status").textContent.includes("複製未成功")');assert button.is_enabled()
     page.evaluate("document.execCommand=command=>{window.fallbackTemplate=document.activeElement.value;return command==='copy'}")
     button.focus();button.press('Enter');page.wait_for_function('document.querySelector("#ax-status").textContent.includes("已複製第13章")');assert page.evaluate('window.fallbackTemplate')==EXPECTED
     assert page.locator('#ama-panel textarea').count()==0
     assert button.evaluate('n=>n.getBoundingClientRect().right<=innerWidth+1')
     if engine=='chromium':
      page.locator('#ax-scroll').evaluate('n=>n.scrollTop=0');page.screenshot(path=str(output/f'chapter13-{width}.png'))
     page.locator('#ax-tab-c12').dispatch_event('click');page.locator('#ax-tab-c12[aria-selected=true]').wait_for(state='attached');assert page.locator('[data-neuro-template-copy]:visible').count()==0
     page.locator('#ax-tab-c13').dispatch_event('click');button.wait_for();assert button.count()==1
     assert not errors,errors;print(engine,width,'exact clipboard / chapter-only visibility / Table-Figure switching / keyboard / fallback PASS',flush=True);context.close()
    browser.close()
 finally:
  if server:server.shutdown()
if __name__=='__main__':main()
