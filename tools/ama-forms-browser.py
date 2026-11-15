"""Verify Figure captions and composite form geometry in real reader popups."""
from pathlib import Path
import functools,http.server,json,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 fixture=json.loads((ROOT/'tests/fixtures/ama-form-geometry.json').read_text());output=ROOT/'.local/ama-form-browser';output.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright()as p:
   for engine in ['chromium','firefox','webkit']:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.route('https://www.gstatic.com/firebasejs/**',lambda route:route.abort());page.goto(f'http://127.0.0.1:{server.server_port}/#ama');page.locator('.ax-page').first.wait_for();chapter=None
     for form in fixture['figures']:
      if chapter!=form['chapter']:
       chapter=form['chapter'];page.locator('#ax-tab-'+chapter).dispatch_event('click')
      scope=page.locator('#ax-table-rail'if width==1440 else'#ax-table-shortcuts');scope.get_by_role('tab',name='Figure',exact=True).click()
      shortcut=scope.locator('[data-table-open="'+form['id']+'"]');shortcut.wait_for()
      subtitle=shortcut.locator('.reader-table-caption');assert subtitle.count()==1 and subtitle.inner_text().strip(),form['id']+' missing/duplicate visible caption'
      shortcut.click();page.locator('#ax-dialog[open]').wait_for();body=page.locator('#ax-dialog-body');frames=body.locator('.ax-form-figure');assert frames.count()==len(form['parts']),(form['id'],'missing source continuation')
      for index,part in enumerate(form['parts']):
       metrics=frames.nth(index).evaluate('''el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,grids:[...el.querySelectorAll('.ax-source-grid')].map(n=>{const g=n.getBoundingClientRect(),t=n.querySelector('table').getBoundingClientRect();return {left:g.left-r.left,top:g.top-r.top,width:g.width,height:g.height,tableWidth:t.width};}),natural:el.querySelectorAll('.ax-natural-label').length};}''')
       assert abs(metrics['width']-part['width'])<2,(form['id'],metrics,part)
       assert metrics['height']<=part['height']*1.15+40,(form['id'],'stacked source art/labels',metrics,part)
       assert metrics['natural']>10,(form['id'],'text was not normalized')
       for grid in metrics['grids']:
        assert abs(grid['tableWidth']-grid['width'])<2,(form['id'],'native cells detached from source rules',grid)
        assert grid['top']>=-1 and grid['top']+grid['height']<=metrics['height']+2,(form['id'],'grid outside source form',grid)
      if form['id']in fixture['choiceAnchors']:
       choices=frames.first.evaluate('''el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('.ax-natural-label')].map(n=>{const b=n.getBoundingClientRect();return {text:n.textContent.trim(),x:b.left-r.left,y:b.top-r.top};});}''')
       for text,x,y in fixture['choiceAnchors'][form['id']]:assert any(n['text']==text and abs(n['x']-x)<2 and abs(n['y']-y)<2 for n in choices),(text,x,y,'choice detached from printed selection circle')
      if engine=='chromium'and width==1440:
       body.evaluate('el=>el.scrollTop=0');body.screenshot(path=str(output/(form['id']+'-top.png')))
       body.evaluate('el=>el.scrollTop=el.scrollHeight');body.screenshot(path=str(output/(form['id']+'-bottom.png')))
      page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden')
     assert not errors,errors
     print(engine,width,'8 forms / 9 source pages: visible captions, compact aligned grids, continuation, native labels and printed choice anchors PASS',flush=True);page.close()
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
