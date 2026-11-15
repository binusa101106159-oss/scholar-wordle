"""Pixel regressions for PDF knockouts and raster/vector paper matching."""
from pathlib import Path
import base64,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
SAMPLES=r'''async ({png,points})=>{const im=new Image();im.src='data:image/png;base64,'+png;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return points.map(([a,b])=>[...x.getImageData(Math.round(a),Math.round(b),1,1).data].slice(0,3));}'''
def main():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright()as p:
   for engine in ['chromium','firefox','webkit']:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1100},service_workers='block',reduced_motion='reduce');page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(f'http://127.0.0.1:{server.server_port}/#ama');page.locator('.ax-page').first.wait_for()
     for chapter,ident in [('c12','f12-8'),('c15','f15-20')]:
      page.locator('#ax-tab-'+chapter).dispatch_event('click');page.locator('#ax-body [data-open="'+ident+'"]').first.dispatch_event('click');page.locator('#ax-dialog[open]').wait_for()
      if ident=='f12-8':
       art=page.locator('#ax-dialog-body .ax-vector').first
       points=art.evaluate('e=>{const v=e.viewBox.baseVal,r=e.getBoundingClientRect();return [[200,162],[205,162],[210,162]].map(([x,y])=>[(x-v.x)*r.width/v.width,(y-v.y)*r.height/v.height]);}')
      else:
       art=page.locator('#ax-dialog-body .ax-source-object');points=[[270,170],[300,170],[345,200]]
      values=page.evaluate(SAMPLES,{'png':base64.b64encode(art.screenshot()).decode(),'points':points})
      assert all(19<=c<=35 for value in values for c in value),(engine,width,ident,'white paper became a black bar or grey patch',values)
      page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden')
     print(engine,width,'white knockout strokes and raster/vector paper continuity PASS',flush=True);page.close()
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
