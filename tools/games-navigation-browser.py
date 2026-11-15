"""Check the rightmost games menu across desktop, phone and landscape layouts."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',default='chromium,firefox,webkit');args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();url=args.url or f'http://127.0.0.1:{server.server_port}/'
 out=ROOT/'.local/games-navigation';out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines.split(','):
    browser=getattr(p,engine).launch()
    for width,height in [(1440,1000),(390,900),(760,390)]:
     page=browser.new_page(viewport={'width':width,'height':height},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(url.rstrip('/')+'/#forms');page.locator('#fm-bsrs').wait_for()
     group=page.locator('#game-group-button');menu=page.locator('#game-group-menu')
     assert group.is_visible()and '小遊戲'in group.inner_text()
     assert page.locator('#scholar-game-tabs>.sg-tab:visible').last.get_attribute('id')=='game-group-button'
     for id in ['wordle','crossword','sudoku']:assert page.locator('#game-tab-'+id).is_hidden()
     for id,label in [('wordle','Wordle'),('crossword','Crossword'),('sudoku','Sudoku')]:
      group.click();assert menu.is_visible();bounds=menu.bounding_box();assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1,(width,bounds)
      menu.get_by_role('menuitemradio',name=label,exact=True).click();page.wait_for_function('game=>document.body.dataset.game===game',arg=id)
      assert menu.is_hidden();page.wait_for_function('document.querySelector("#game-group-button").dataset.active==="true"')
      assert menu.get_by_role('menuitemradio',name=label,exact=True,include_hidden=True).get_attribute('aria-checked')=='true'
      assert group.get_attribute('aria-label')=='小遊戲：'+label
     group.press('ArrowDown');assert menu.is_visible();page.keyboard.press('Home');assert page.locator(':focus').get_attribute('aria-label')=='Wordle';page.keyboard.press('Escape');assert menu.is_hidden()and group.evaluate('e=>e===document.activeElement')
     page.keyboard.press('Escape');assert group.evaluate('e=>e===document.activeElement'),'game Escape must not focus a hidden old tab'
     group.press('ArrowLeft');assert page.locator(':focus').get_attribute('id')=='game-tab-cases'
     page.locator('#game-tab-cases').press('End');assert group.evaluate('e=>e===document.activeElement')
     group.click()
     if engine=='chromium'and width in [1440,390]:page.screenshot(path=str(out/f'menu-{width}.png'))
     page.locator('#game-tab-forms').click();assert menu.is_hidden()
     page.evaluate("location.hash='crossword'");page.wait_for_function('document.body.dataset.game==="crossword"');page.reload();page.wait_for_function('document.body.dataset.game==="crossword"&&document.querySelector("#game-group-button")?.dataset.active==="true"')
     page.set_viewport_size({'width':390 if width!=390 else 1440,'height':900 if width!=390 else 1000});assert group.is_visible()
     assert all(page.locator('#game-tab-'+id).is_hidden()for id in ['wordle','crossword','sudoku'])
     assert not errors,errors;print(engine,width,height,'rightmost group / all games / keyboard / menu bounds / direct URL / resize PASS',flush=True);page.close()
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
