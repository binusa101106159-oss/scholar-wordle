"""Check all three filled example forms in both reading and source modes."""
from pathlib import Path
from collections import Counter
import functools,http.server,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 out=ROOT/'.local/ama-form-reading';out.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright()as p:
   for engine in ['chromium','firefox','webkit']:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1100},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda route:route.abort());page.goto(f'http://127.0.0.1:{server.server_port}/#ama');page.locator('.ax-page').first.wait_for()
     for chapter,ident,name,final in [('c15','f15-31','John Sample','9%WPI'),('c16','f16-13','Jane Doe','10%WPI'),('c17','f17-7','John Smith','6%')]:
      page.locator('#ax-tab-'+chapter).dispatch_event('click');page.locator('#ax-body .ax-page').first.wait_for()
      scope=page.locator('#ax-table-rail'if width==1440 else'#ax-table-shortcuts');scope.get_by_role('tab',name='Figure',exact=True).click()
      shortcut=scope.locator('[data-table-open="'+ident+'"]');shortcut.scroll_into_view_if_needed()
      # Font layout and the chapter's scheduled position restoration must
      # settle before a native pointer click, especially in mobile WebKit.
      page.evaluate('async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));}')
      shortcut.click();page.locator('#ax-dialog[open]').wait_for();body=page.locator('#ax-dialog-body');reader=body.locator('.ax-form-reader');reader.wait_for(state='visible')
      assert body.locator('[data-form-view="reading"]').get_attribute('aria-pressed')=='true';assert reader.evaluate('e=>e.innerText.replace(/\\s/g,"")').find(final)>=0
      assert body.evaluate('e=>e.scrollWidth<=e.clientWidth+3'),'reading mode requires horizontal scrolling'
      # Blank source templates are deferred until opened. Verify every source
      # cell after expansion, including the cells that are not completed.
      reader.locator('details').evaluate_all('nodes=>nodes.forEach(n=>n.open=true)')
      page.wait_for_function('''()=>[...document.querySelectorAll('.ax-form-unused[open] .ax-form-reading-row')].every(n=>n.childElementCount>0)&&[...document.querySelectorAll('.ax-form-reader .ax-form-card-viewport')].every(n=>!n.clientWidth||n.dataset.fitted==='true')''')
      records=reader.locator('.ax-form-card').evaluate_all('nodes=>nodes.map(c=>{const d=c.cloneNode(true);d.querySelectorAll(".ax-form-card-label,svg").forEach(n=>n.remove());return {source:c.dataset.sourceText,actual:d.textContent};})')
      assert len(records)>25
      for item in records:
       source=''.join(item['source'].split());actual=''.join(item['actual'].split());assert Counter(source)==Counter(actual if source else actual.replace('—','')),(ident,item)
      invalid=reader.locator('.ax-form-card-viewport').evaluate_all('''nodes=>nodes.flatMap(frame=>{const r=frame.getBoundingClientRect();if(!r.width)return [];return [...frame.querySelectorAll('.ax-natural-label')].filter(n=>{const b=n.getBoundingClientRect();return b.left<r.left-3||b.right>r.right+3||b.top<r.top-3||b.bottom>r.bottom+3;}).map(n=>{const b=n.getBoundingClientRect();return {text:n.textContent,overflow:[r.left-b.left,b.right-r.right,r.top-b.top,b.bottom-r.bottom],source:[frame.dataset.sourceWidth,frame.dataset.sourceHeight],height:r.height};});})''')
      assert not invalid,(ident,invalid)
      ids=body.locator('[id]').evaluate_all('nodes=>nodes.map(n=>n.id)');assert len(ids)==len(set(ids)),'source/reading views duplicate SVG definitions'
      # Copying the entire dialog must exclude the hidden source and toolbar.
      copied=body.evaluate('''el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);const out={},e=new Event('copy',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{setData:(k,v)=>out[k]=v}});el.dispatchEvent(e);s.removeAllRanges();return out['text/plain'];}''')
      assert copied.count(name)==1,(ident,'duplicated hidden source in clipboard');assert '欄式閱讀'not in copied
      reader.locator('details').evaluate_all('nodes=>nodes.forEach(n=>n.open=false)');body.evaluate('e=>e.scrollTop=0')
      if engine=='chromium':body.screenshot(path=str(out/(ident+'-'+str(width)+'.png')))
      body.locator('[data-form-view="source"]').click();assert body.locator('.ax-form-source').is_visible();assert reader.is_hidden();body.locator('[data-form-view="reading"]').click();assert reader.is_visible()
      page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden')
     assert not errors,errors
     print(engine,width,'3 filled forms: contained columns / complete cell text / source choices / blank templates / unique definitions / copy / mode switching PASS',flush=True);page.close()
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
