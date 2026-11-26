"""自訂 tab: wallpaper presets and upload, accent, tone, persistence, reset, default look unchanged."""
from pathlib import Path
import argparse,functools,http.server,json,threading,base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
# 2x2 red PNG, generated for the test (no external file).
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==')
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/customize'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True);img=out/'test.png';img.write_bytes(PNG)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    for width in [1440,390]:
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.goto(base+'#wordle');page.locator('#game-tab-customize').wait_for(state='attached')
     before=page.evaluate("getComputedStyle(document.body,'::before').backgroundImage");root=lambda a:page.evaluate(f"document.documentElement.dataset.{a}||''")
     assert root('accent')=='' and root('tone')=='';assert 'radial-gradient' in before
     # The tab sits in the top bar with the other main tabs.
     assert page.locator('#scholar-game-tabs #game-tab-customize').count()==1
     page.evaluate("location.hash='#customize'");page.locator('.cz-card').first.wait_for();assert page.title()=='自訂 · Scholar'
     # Only the 自訂 panel shows: the Wordle board, keyboard and toolbar are hidden.
     assert page.locator('#game-main').is_hidden() and page.locator('#wordle-toolbar').is_hidden();assert page.locator('#customize-panel').bounding_box()['y']<200
     assert page.locator('#customize-panel').evaluate('n=>n.scrollWidth<=n.clientWidth+1');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     page.get_by_role('radio',name='極光').click();assert root('wallpaper')=='aurora';assert page.evaluate("getComputedStyle(document.body,'::before').backgroundImage")!=before
     page.get_by_role('radio',name='純黑').click();assert page.evaluate("getComputedStyle(document.body,'::before').backgroundImage")=='none'
     page.get_by_role('radio',name='綠',exact=True).first.click();assert root('accent')=='custom';assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")=='#8fe3a3'
     sel=page.evaluate("getComputedStyle(document.querySelector('#scholar-game-tabs .lg-tab-lens')||document.getElementById('game-tab-customize')).borderColor");assert '143, 227, 163' in sel,sel
     page.locator('.cz-grid').nth(2).get_by_role('radio',name='紫').click();assert root('tone')=='purple'
     saved=json.loads(page.evaluate("ScholarStorage.getItem('scholar-customize-v1')"));assert saved=={'wallpaper':'black','accent':'#8fe3a3','tone':'purple','dim':35,'blur':0},saved
     # Upload: stays on this device, sliders appear and adjust the overlay.
     page.locator('#cz-upload').set_input_files(str(img));page.wait_for_function("document.documentElement.dataset.wallpaper==='image'")
     assert 'url("data:image/jpeg' in page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--wallpaper')")
     assert page.evaluate("localStorage.getItem('scholar-wallpaper-image')").startswith('data:image/jpeg')
     assert 'data:image' not in page.evaluate("ScholarStorage.getItem('scholar-customize-v1')")
     dim=page.get_by_role('slider',name='變暗');dim.fill('60');dim.dispatch_event('change');assert json.loads(page.evaluate("ScholarStorage.getItem('scholar-customize-v1')"))['dim']==60
     if engine=='chromium':page.screenshot(path=str(out/f'panel-{width}.png'))
     # Reload: the look comes back before anything else runs.
     page.reload();page.locator('.cz-card').first.wait_for();assert root('wallpaper')=='image' and root('accent')=='custom' and root('tone')=='purple'
     page.get_by_role('button',name='移除圖片').click();assert root('wallpaper')=='default'
     # Other tabs still work and keep the accent.
     page.evaluate("location.hash='#forms'");page.locator('#fm-bsrs').wait_for();assert page.locator('#customize-panel').is_hidden()
     if engine=='chromium':page.screenshot(path=str(out/f'forms-{width}.png'))
     page.evaluate("location.hash='#customize'");page.get_by_role('button',name='全部恢復預設').click()
     assert root('accent')=='' and root('tone')=='' and root('wallpaper')=='default';assert page.evaluate("getComputedStyle(document.body,'::before').backgroundImage")==before
     assert not errors,errors;page.close();print(engine,width,'top-bar tab / wallpapers / upload device-only / sliders / accent / tone / reload / reset to the original look PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
