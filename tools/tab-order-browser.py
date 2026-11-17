"""Native pointer/touch checks for persistent top-tab ordering."""
from pathlib import Path
import argparse,functools,http.server,json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
KEY='scholar-tab-order-v1'
ORDER="()=>[...document.querySelectorAll('#scholar-game-tabs>.sg-tab')].filter(n=>!n.hidden).map(n=>n.id)"
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',default='chromium,firefox,webkit');args=parser.parse_args()
 out=ROOT/'.local/tab-order';out.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();url=(args.url or f'http://127.0.0.1:{server.server_port}/').rstrip('/')+'/'
 def start(browser,width=1440,height=1000):
  context=browser.new_context(viewport={'width':width,'height':height},has_touch=True,service_workers='block',reduced_motion='reduce');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(url+'#calculator');page.locator('#ca-group-input').wait_for();return context,page,errors
 def drag(page,id,target):
  source=page.locator('#'+id);source.scroll_into_view_if_needed();r=source.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down();page.mouse.move(target,r['y']+r['height']/2,steps=12);page.wait_for_timeout(100);page.mouse.up();page.wait_for_function('!document.querySelector(".sg-tab-drag-ghost")')
 try:
  with sync_playwright()as p:
   for engine in args.engines.split(','):
    browser=getattr(p,engine).launch();context,page,errors=start(browser)
    original=page.evaluate(ORDER);assert len(original)>=11 and original[-1]=='game-group-button'
    assert 'game-tab-checkup'in original and 'game-tab-maternal'in original,'new feature tabs must remain available'
    page.locator('#ca-group-input').fill('software draft');body=page.locator('body').get_attribute('data-game')
    target=page.locator('#game-tab-calendar').bounding_box();drag(page,'game-tab-forms',target['x']+target['width']+15)
    changed=page.evaluate(ORDER);assert changed!=original and changed[0]=='game-tab-calculator',(engine,changed)
    assert page.locator('body').get_attribute('data-game')==body and page.locator('#ca-group-input').input_value()=='software draft','drag changed the page or draft'
    assert json.loads(page.evaluate('key=>localStorage.getItem(key)',KEY))==changed
    # Escape must restore both order and the previously saved preference.
    r=page.locator('#game-tab-calendar').bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down();page.mouse.move(r['x']+350,r['y']+r['height']/2,steps=10);page.wait_for_timeout(80);assert page.locator('.sg-tab-drag-ghost').count()==1;page.keyboard.press('Escape');page.mouse.up();assert page.evaluate(ORDER)==changed;assert json.loads(page.evaluate('key=>localStorage.getItem(key)',KEY))==changed
    # The active glass indicator follows an active button moved by another tab.
    page.wait_for_timeout(260);page.locator('#game-tab-calculator').focus();page.keyboard.press('Alt+Shift+ArrowRight');page.wait_for_timeout(220)
    geometry=page.evaluate('''()=>{const n=document.querySelector('#game-tab-calculator').getBoundingClientRect(),l=document.querySelector('#scholar-game-tabs>.lg-tab-lens').getBoundingClientRect();return Math.abs(n.left-l.left)+Math.abs(n.width-l.width);}''');assert geometry<3,(engine,'glass indicator detached',geometry)
    # The games menu remains attached to its button after that button is moved.
    r=page.locator('#game-tab-calendar').bounding_box();drag(page,'game-group-button',r['x'])
    group=page.locator('#game-group-button');group.click();menu=page.locator('#game-group-menu');assert menu.is_visible();a=group.bounding_box();b=menu.bounding_box();assert abs(a['x']-b['x'])<30,(engine,'menu left behind after reorder',a,b)
    page.keyboard.press('Escape');saved=page.evaluate(ORDER);page.reload();page.locator('#ca-group-input').wait_for();assert page.evaluate(ORDER)==saved
    page.locator('#game-tab-forms').click();page.locator('#fm-bsrs').wait_for();assert page.locator('body').get_attribute('data-game')=='forms','normal click stopped working'
    page.set_viewport_size({'width':390,'height':900});assert page.evaluate(ORDER)==saved;assert not errors,errors
    # Invalid or outdated saved IDs cannot duplicate or remove destinations.
    page.evaluate('(key)=>localStorage.setItem(key,JSON.stringify(["missing","game-tab-ama","game-tab-ama"]))',KEY);page.reload();page.locator('#fm-bsrs').wait_for();restored=page.evaluate(ORDER);assert restored[0]=='game-tab-ama'and len(restored)==len(original)and set(restored)==set(original)
    print(engine,'native mouse / cancellation / draft / keyboard / glass / moved menu / reload / resize / stale preferences PASS',flush=True);context.close()
    # Touch handlers in each engine: quick swipe stays native, hold reorders.
    context,page,errors=start(browser,390,900);initial=page.evaluate(ORDER)
    page.evaluate('''()=>{window.sendTouch=(type,x,y)=>{const tab=document.querySelector('#game-tab-forms'),value={identifier:1,target:tab,clientX:x,clientY:y,pageX:x,pageY:y};let t,e;try{t=new Touch(value);e=new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],targetTouches:type==='touchend'?[]:[t],changedTouches:[t]});}catch(_){t=value;e=new Event(type,{bubbles:true,cancelable:true});for(const [k,v]of Object.entries({touches:type==='touchend'?[]:[t],targetTouches:type==='touchend'?[]:[t],changedTouches:[t]}))Object.defineProperty(e,k,{value:v});}tab.dispatchEvent(e);};}''')
    r=page.locator('#game-tab-forms').bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2
    page.evaluate('([x,y])=>sendTouch("touchstart",x,y)',[x,y]);page.evaluate('([x,y])=>sendTouch("touchmove",x+50,y)',[x,y]);page.wait_for_timeout(350);assert page.locator('.sg-tab-drag-ghost').count()==0;page.evaluate('([x,y])=>sendTouch("touchend",x+50,y)',[x,y]);assert page.evaluate(ORDER)==initial
    page.evaluate('([x,y])=>sendTouch("touchstart",x,y)',[x,y]);page.wait_for_timeout(340);assert page.locator('.sg-tab-drag-ghost').count()==1
    page.evaluate('([x,y])=>sendTouch("touchmove",270,y)',[x,y]);page.wait_for_timeout(120);page.evaluate('([x,y])=>sendTouch("touchend",270,y)',[x,y]);assert page.evaluate(ORDER)!=initial;assert page.locator('body').get_attribute('data-game')=='calculator';assert not errors,errors
    print(engine,'touch long-press handlers / swipe intent / no accidental navigation PASS',flush=True);context.close()
    context,page,errors=start(browser);page.emulate_media(reduced_motion='no-preference');initial=page.evaluate(ORDER)
    page.evaluate('''key=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k===key)throw new DOMException('blocked','SecurityError');return get.call(this,k);};Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('blocked','SecurityError');return set.call(this,k,v);};}''',KEY)
    r=page.locator('#game-tab-calendar').bounding_box();drag(page,'game-tab-forms',r['x']+r['width']+15);assert page.evaluate(ORDER)!=initial;assert page.locator('.sg-tab-drag-ghost').count()==0;assert not errors,errors
    print(engine,'animated drop / blocked preference storage remains usable PASS',flush=True);context.close()
    if engine=='chromium':
     # Trusted touch input through the browser, including real native scrolling.
     context,page,errors=start(browser,390,900);cdp=context.new_cdp_session(page);initial=page.evaluate(ORDER)
     def touch(kind,x=0,y=0):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[]if kind=='touchEnd'else[{'x':x,'y':y,'id':1}]})
     y=page.locator('#game-tab-calendar').bounding_box()['y']+18;touch('touchStart',330,y)
     for x in range(300,49,-25):touch('touchMove',x,y);page.wait_for_timeout(16)
     touch('touchEnd');page.wait_for_timeout(350);assert page.evaluate('document.querySelector("#scholar-game-tabs").scrollLeft')>40,'native phone swipe was blocked';assert page.evaluate(ORDER)==initial
     page.evaluate('document.querySelector("#scholar-game-tabs").scrollLeft=0');page.wait_for_timeout(100);r=page.locator('#game-tab-forms').bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2;touch('touchStart',x,y);page.wait_for_timeout(340);assert page.locator('.sg-tab-drag-ghost').count()==1
     for xx in range(int(x),281,16):touch('touchMove',xx,y);page.wait_for_timeout(16)
     touch('touchEnd');page.wait_for_timeout(80);assert page.evaluate(ORDER)!=initial;assert page.locator('body').get_attribute('data-game')=='calculator';assert page.locator('.sg-tab-drag-ghost').count()==0
     page.screenshot(path=str(out/'trusted-touch.png'));assert not errors,errors
     # Holding a dragged tab at the edge reveals destinations off screen.
     page.locator('#game-tab-forms').scroll_into_view_if_needed();r=page.locator('#game-tab-forms').bounding_box();before=page.evaluate('document.querySelector("#scholar-game-tabs").scrollLeft');touch('touchStart',r['x']+r['width']/2,r['y']+r['height']/2);page.wait_for_timeout(340);touch('touchMove',375,r['y']+r['height']/2);page.wait_for_timeout(650);after=page.evaluate('document.querySelector("#scholar-game-tabs").scrollLeft');assert after>before+80,(before,after,'drag edge did not auto-scroll');touch('touchEnd');assert page.locator('.sg-tab-drag-ghost').count()==0
     print('chromium trusted touch: native swipe, long-press reorder, edge auto-scroll and unchanged active page PASS',flush=True);context.close()
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
