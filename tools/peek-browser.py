"""Check actual reader popups, intermediate motion, interruption and cleanup."""
from pathlib import Path
import functools,http.server,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}'
READERS=[('laws','#lx-doc .lx-art','#lx-doc [data-annex]','#lx-annex'),('guides','#gx-doc h1','#gx-doc [data-att]','#gx-att'),('health','#hx-doc h1','#hx-doc [data-att]','#hx-att'),('ama','#ax-body .ax-page','#ax-table-shortcuts button[data-table-open]','#ax-dialog')]
FREEZE='''({id,fraction})=>{
 const card=document.querySelector(id),plane=document.querySelector('.pg-glass-plane');
 const moving=el=>el.getAnimations().find(a=>a.effect.target===el&&a.effect.getKeyframes().some(k=>k.transform!==undefined));
 const a=moving(card),b=moving(plane);if(!a||!b)throw Error('Missing synchronized motion');
 for(const m of [a,b]){m.pause();m.currentTime=Number(m.effect.getTiming().duration)*fraction;}
 const r=card.getBoundingClientRect(),s=plane.getBoundingClientRect(),style=getComputedStyle(card);
 return {opacity:+style.opacity,scale:new DOMMatrix(style.transform).a,duration:a.effect.getTiming().duration,
  error:Math.max(...['left','top','width','height'].map(k=>Math.abs(r[k]-s[k]))),
  backdrop:getComputedStyle(card,'::backdrop').animationName,blur:getComputedStyle(plane).backdropFilter||getComputedStyle(plane).webkitBackdropFilter};
}'''
FINISH='''id=>{const d=document.querySelector(id);for(const e of [d,...document.querySelectorAll('.pg-glass-plane')])for(const a of e.getAnimations())if(a.effect.getKeyframes().some(k=>k.transform!==undefined))a.finish();}'''
try:
 with sync_playwright() as p:
  for engine in ['chromium','firefox','webkit']:
   browser=getattr(p,engine).launch()
   for width in [1440,390]:
    context=browser.new_context(viewport={'width':width,'height':900},service_workers='block',reduced_motion='no-preference')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://www.gstatic.com/firebasejs/**',lambda route:route.abort())
    page.goto(URL+'/#laws')
    for route,ready,trigger,ident in READERS:
     page.evaluate('(route)=>location.hash=route',route);page.locator(ready).first.wait_for()
     page.locator(trigger).first.dispatch_event('click');page.locator(ident+'[open]').wait_for()
     assert page.locator(ident).evaluate('(d)=>d.classList.contains("pg-dialog")'),route
     # Warm content through the real opener, then control the same sheet clock.
     page.evaluate('(id)=>{const d=document.querySelector(id);d.close();ScholarGlass.hide(d);}',ident)
     page.wait_for_function('document.querySelectorAll(".pg-glass-plane").length===0')
     page.evaluate('(id)=>ScholarPeek.open(document.querySelector(id))',ident)
     start=page.evaluate(FREEZE,{'id':ident,'fraction':0})
     mid=page.evaluate(FREEZE,{'id':ident,'fraction':.45})
     assert start['opacity']==0 and start['scale']<.98,start
     assert 0<mid['opacity']<1 and start['scale']<mid['scale']<1.02,mid
     assert mid['error']<1.5 and mid['duration']==220 and mid['backdrop']=='pg-glass-in',mid
     if engine=='chromium' and width==1440 and route=='ama':
      out=ROOT/'.local/peek-motion';out.mkdir(parents=True,exist_ok=True)
      page.screenshot(path=str(out/'opening.png'))
     page.evaluate('(id)=>{window.peekClose=ScholarPeek.close(document.querySelector(id));}',ident)
     interrupted=page.evaluate(FREEZE,{'id':ident,'fraction':0})
     assert abs(interrupted['opacity']-mid['opacity'])<.02,(mid,interrupted)
     closing=page.evaluate(FREEZE,{'id':ident,'fraction':.5})
     assert page.locator(ident).evaluate('(d)=>d.open') and 0<closing['opacity']<1,closing
     assert closing['error']<1.5 and closing['duration']==150,closing
     # Reopen halfway through closing: no jump to a zero-opacity start frame.
     before=closing['opacity'];page.evaluate('(id)=>ScholarPeek.open(document.querySelector(id))',ident)
     reopened=page.evaluate(FREEZE,{'id':ident,'fraction':0})
     assert abs(reopened['opacity']-before)<.02,(before,reopened)
     assert reopened['error']<1.5,reopened
     page.evaluate(FINISH,ident)
     if route=='ama':
      page.locator('#ax-peek-expand').click()
      expanded=page.evaluate(FREEZE,{'id':ident,'fraction':.5})
      assert expanded['duration']==200 and expanded['error']<1.5,expanded
      page.evaluate(FINISH,ident)
     page.evaluate('(id)=>{window.peekClose=ScholarPeek.close(document.querySelector(id));}',ident)
     if engine=='chromium' and width==1440 and route=='ama':
      page.evaluate(FREEZE,{'id':ident,'fraction':.5});page.screenshot(path=str(out/'closing.png'))
     page.evaluate(FINISH,ident);page.wait_for_function('(id)=>!document.querySelector(id).open',arg=ident)
     page.wait_for_function('document.querySelectorAll(".pg-glass-plane").length===0')
     # A close immediately followed by reopening must ignore stale native events.
     page.evaluate('''id=>{const d=document.querySelector(id);ScholarPeek.open(d);d.close();ScholarPeek.open(d);}''',ident)
     page.wait_for_timeout(35);assert page.locator(ident).evaluate('(d)=>d.open')
     assert page.locator('.pg-glass-plane').count()==1
     page.evaluate(FINISH,ident);page.keyboard.press('Escape');page.wait_for_function('(id)=>!document.querySelector(id).open',arg=ident)
     page.emulate_media(reduced_motion='reduce')
     page.evaluate('(id)=>ScholarPeek.open(document.querySelector(id))',ident)
     assert page.locator(ident).evaluate('(d)=>d.getAnimations().filter(a=>a.effect.getKeyframes().some(k=>k.transform!==undefined)).length')==0
     page.evaluate('(id)=>ScholarPeek.close(document.querySelector(id))',ident)
     assert page.locator('.pg-glass-plane').count()==0
     page.emulate_media(reduced_motion='no-preference')
    assert not errors,errors
    print(engine,width,'all 4 readers: enter/exit frames, glass alignment, interrupt/reopen, Escape, reduced motion PASS',flush=True)
    context.close()
   browser.close()
finally:server.shutdown()
