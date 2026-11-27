"""法規／指引／特檢／AMA: the right-hand 表格與附件 rail folds away and comes back, like the left sidebar."""
from pathlib import Path
import argparse,functools,http.server,threading,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/rail'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    page=b.new_page(viewport={'width':1600,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
    page.goto(base+'#guides');page.locator('.gx-guide').first.wait_for(state='attached')
    page.evaluate("document.querySelector('.gx-guide[data-guide=\"plans03\"]').click()");page.locator('#gx-table-rail:not([hidden])').wait_for()
    docw=lambda:page.evaluate("Math.round(document.getElementById('gx-doc').getBoundingClientRect().width)")
    before=docw()
    page.locator('#gx-rail-close').click();page.wait_for_timeout(400)
    assert page.locator('#gx-table-rail').is_hidden() and page.locator('#gx-rail-open').is_visible()
    assert page.evaluate("document.getElementById('gx-layout').dataset.tableRailCollapsed")=='true'
    assert docw()>before+150,(before,docw())
    # the shortcuts are still at hand in the page head
    assert page.locator('#gx-doc .gx-chips').is_visible()
    assert json.loads(page.evaluate("ScholarStorage.getItem('scholar-reading-v1')"))['railCollapsed'] is True
    if engine=='chromium':page.screenshot(path=str(out/'guide-folded.png'))
    # one choice for every reader: 法規 opens folded too
    page.evaluate("location.hash='#laws'");page.locator('#lx-a-s01-1').wait_for();page.wait_for_timeout(300)
    assert page.locator('#lx-table-rail').is_hidden() and page.locator('#lx-rail-open').is_visible() and page.locator('#gx-rail-open').is_hidden()
    page.locator('#lx-rail-open').click();page.wait_for_timeout(300)
    assert page.locator('#lx-table-rail').is_visible() and page.locator('#lx-rail-open').is_hidden()
    assert json.loads(page.evaluate("ScholarStorage.getItem('scholar-reading-v1')"))['railCollapsed'] is False
    if engine=='chromium':page.screenshot(path=str(out/'laws-open.png'))
    page.evaluate("location.hash='#guides'");page.wait_for_timeout(300);assert page.locator('#gx-table-rail').is_visible() and docw()==before
    assert not errors,errors;page.close()
    # phones: no rail and no edge tab
    page=b.new_page(viewport={'width':390,'height':844},service_workers='block');page.route('https://www.gstatic.com/**',lambda r:r.abort())
    page.goto(base+'#guides');page.locator('.gx-guide').first.wait_for(state='attached');page.evaluate("document.querySelector('.gx-guide[data-guide=\"plans03\"]').click()");page.locator('#gx-doc .gx-toc').wait_for()
    assert page.locator('#gx-rail-open').is_hidden() and page.locator('#gx-table-rail').is_hidden();page.close()
    print(engine,'rail folds / edge tab brings it back / text widens / shared across readers / saved / phones untouched PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
