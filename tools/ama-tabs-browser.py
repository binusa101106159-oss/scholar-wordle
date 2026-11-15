"""Exercise the AMA quick-view Table/Figure tabs on desktop and mobile."""
from pathlib import Path
import functools,http.server,json,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def main():
 output=ROOT/'.local/ama-tabs';output.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   for engine in ['chromium','firefox','webkit']:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce')
     errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.route('https://www.gstatic.com/firebasejs/**',lambda route:route.abort())
     page.goto(f'http://127.0.0.1:{server.server_port}/#ama');page.locator('.ax-page').first.wait_for()
     page.locator('#ax-tab-c15').dispatch_event('click')
     scope=page.locator('#ax-table-rail'if width==1440 else'#ax-table-shortcuts')
     scope.get_by_role('tab',name='Table',exact=True).wait_for()
     assert scope.get_by_role('tab',name='Table',exact=True).get_attribute('aria-selected')=='true'
     assert scope.locator('button[data-table-open]:visible').count()==40
     scope.get_by_role('tab',name='Figure',exact=True).click()
     assert scope.get_by_role('tab',name='Figure',exact=True).get_attribute('aria-selected')=='true'
     assert scope.locator('button[data-table-open]:visible').count()==31
     assert scope.locator('button[data-object-kind="table"]:visible').count()==0
     scope.locator('[data-table-open="f15-3"]').click();page.locator('#ax-dialog[open]').wait_for()
     assert page.locator('#ax-dialog-body').get_attribute('data-object')=='f15-3'
     assert page.locator('#ax-dialog-body').evaluate('''d=>[...d.querySelectorAll('[mask]')].every(n=>[...d.querySelectorAll('[id]')].some(a=>a.id===n.getAttribute('mask').match(/#([^)]*)/)[1]))''')
     page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden')
     scope.get_by_role('tab',name='Figure',exact=True).focus();page.keyboard.press('ArrowLeft')
     assert scope.get_by_role('tab',name='Table',exact=True).get_attribute('aria-selected')=='true'
     assert scope.locator('button[data-table-open]:visible').count()==40
     scope.locator('[data-table-open="t15-1"]').click();page.locator('#ax-dialog[open]').wait_for()
     assert page.locator('#ax-dialog-body').get_attribute('data-object')=='t15-1'
     page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden')
     scope.get_by_role('tab',name='Figure',exact=True).click();page.locator('#ax-tab-c04').dispatch_event('click')
     scope.locator('.reader-table-empty:visible').wait_for()
     assert scope.get_by_role('tab',name='Figure',exact=True).get_attribute('aria-selected')=='true'
     assert scope.locator('button[data-table-open]:visible').count()==0
     scope.get_by_role('tab',name='Table',exact=True).click()
     assert scope.locator('button[data-table-open]:visible').count()==15
     if width==1440:
      before=page.locator('#ax-scroll').evaluate('e=>e.scrollTop')
      scope.locator('.reader-table-list').hover();page.mouse.wheel(0,400)
      page.wait_for_function('document.querySelector("#ax-table-rail .reader-table-list").scrollTop>0')
      assert page.locator('#ax-scroll').evaluate('e=>e.scrollTop')==before
     # Jump by printed page across chapters, then search only that chapter.
     page.locator('#ax-page-query').fill('465');page.locator('#ax-page-search button').click()
     page.locator('#ax-tab-c15[aria-selected="true"]').wait_for(state='attached')
     rom=page.locator('.ax-page[data-page="465"] table').filter(has_text='Joint ankylosis')
     rom.wait_for();rom.scroll_into_view_if_needed()
     alignment=rom.evaluate('''t=>[...t.rows].slice(1).map(r=>({number:getComputedStyle(r.cells[0]).textAlign,severity:getComputedStyle(r.cells[1]).textAlign}))''')
     assert all(r=={'number':'center','severity':'left'}for r in alignment),alignment
     assert 'aver-age' not in rom.inner_text() and 'average: 15%' in rom.inner_text()
     if engine=='chromium' and width==1440:rom.screenshot(path=str(output/'rom-table.png'))
     page.locator('#ax-chapter-query').fill('motion');page.locator('#ax-chapter-search button').click()
     page.locator('#ax-chapter-results button[data-page]').first.wait_for()
     matches=page.locator('#ax-chapter-results button[data-page]').evaluate_all('ns=>ns.map(n=>+n.dataset.page)')
     assert matches and all(383<=n<=492 for n in matches),matches
     page.locator('#ax-chapter-results button[data-page]').first.click()
     assert page.locator('#ax-chapter-results').is_hidden()
     page.locator('#ax-chapter-query').fill('no_match_234234');page.locator('#ax-chapter-search button').click()
     page.wait_for_function('document.querySelector("#ax-chapter-results").textContent.includes("本章沒有符合")')
     page.locator('#ax-chapter-query').fill('');assert page.locator('#ax-chapter-results').is_hidden()
     page.locator('#ax-page-query').fill('99999');page.locator('#ax-page-search button').click()
     page.wait_for_function('document.querySelector("#ax-status").textContent.includes("找不到原書第 99999 頁")')
     assert page.locator('#ax-tab-c15').get_attribute('aria-selected')=='true'
     scope.get_by_role('tab',name='Table',exact=True).click();scope.locator('[data-table-open="t15-12"]').click();page.locator('#ax-dialog[open]').wait_for()
     cells=page.locator('#ax-dialog-body table').first.evaluate('''t=>[...t.rows].filter(r=>['4','9','10','11'].includes(r.cells[0]?.textContent.trim())).map(r=>getComputedStyle(r.cells[0]).textAlign)''')
     assert len(cells)==4 and set(cells)=={'center'},cells
     if engine=='chromium' and width==1440:page.locator('#ax-dialog-body table').first.screenshot(path=str(output/'digit-table.png'))
     page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden')
     page.screenshot(path=str(output/f'{engine}-{width}.png'))
     assert not errors,errors
     print(engine,width,'Table/Figure tabs, printed page jump, chapter search, consistent table columns, independent scrolling PASS',flush=True)
     page.close()
    browser.close()
 finally:server.shutdown()

if __name__=='__main__':main()
