"""Page zoom control on phones/tablets: steps, reflow, reset, persistence, popups; absent on desktop."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--shots',default=str(ROOT/'.local/page-zoom'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   b=p.chromium.launch()
   # Desktop: the viewport meta has no effect there, so no control is added.
   page=b.new_page(viewport={'width':1440,'height':900},service_workers='block');page.route('https://www.gstatic.com/**',lambda r:r.abort());page.goto(base);page.locator('#game-tab-forms').wait_for()
   assert page.locator('#page-zoom').count()==0;page.close();print('desktop: no control PASS')
   for name in ['iPhone 13','iPad (gen 7)']:
    dev={k:v for k,v in p.devices[name].items() if k!='default_browser_type'};ctx=b.new_context(**dev,service_workers='block');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
    page.goto(base+'#forms');page.locator('#page-zoom').wait_for();w0=page.evaluate('innerWidth')
    zoom=page.locator('#page-zoom');level=zoom.locator('.sg-zoom-level')
    assert level.inner_text()=='100%';box=zoom.bounding_box();assert box['x']<40 and box['y']<40,box
    page.get_by_role('button',name='放大頁面').click();page.wait_for_function(f'innerWidth<{w0}');assert level.inner_text()=='115%'
    page.get_by_role('button',name='放大頁面').click();page.wait_for_function('Math.abs(innerWidth*visualViewport.scale-%d)<3'%w0);assert level.inner_text()=='125%'
    assert abs(page.evaluate('innerWidth')-w0/1.25)<2;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.screenshot(path=str(out/(name.replace(' ','_')+'-125.png')))
    # Popups still land inside the screen at 125%.
    page.locator('#game-group-button').scroll_into_view_if_needed();page.locator('#game-group-button').click();m=page.locator('#game-group-menu').bounding_box();vw=page.evaluate('innerWidth')
    assert m and m['x']>=0 and m['x']+m['width']<=vw+1,(m,vw);page.keyboard.press('Escape')
    # Persists on reload; tapping the percentage goes back to 100%.
    page.reload();page.locator('#page-zoom').wait_for();assert page.locator('#page-zoom .sg-zoom-level').inner_text()=='125%';assert abs(page.evaluate('innerWidth')-w0/1.25)<2
    page.locator('#page-zoom .sg-zoom-level').click();page.wait_for_function(f'innerWidth==={w0}');assert page.evaluate("localStorage.getItem('scholar-zoom-v1')") is None
    for _ in range(3):page.get_by_role('button',name='縮小頁面').click()
    assert level.inner_text()=='50%';assert page.get_by_role('button',name='縮小頁面').is_disabled();assert abs(page.evaluate('innerWidth')-w0*2)<3
    page.screenshot(path=str(out/(name.replace(' ','_')+'-50.png')))
    assert zoom.bounding_box()['x']<40,'control must stay at the far left at 50%'
    for _ in range(8):
     if page.get_by_role('button',name='放大頁面').is_enabled():page.get_by_role('button',name='放大頁面').click()
    assert level.inner_text()=='200%';assert page.get_by_role('button',name='放大頁面').is_disabled()
    level.click();assert not errors,errors;ctx.close();print(name,'steps / reflow / popup / persist / reset / limits PASS')
   b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
