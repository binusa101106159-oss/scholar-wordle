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
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort());page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
     page.goto(base+'#wordle');page.locator('#game-tab-customize').wait_for(state='attached')
     before=page.evaluate("getComputedStyle(document.body,'::before').backgroundImage");root=lambda a:page.evaluate(f"document.documentElement.dataset.{a}||''")
     assert root('accent')=='' and root('tone')=='';assert 'radial-gradient' in before
     # The tab sits in the top bar with the other main tabs.
     assert page.locator('#scholar-game-tabs #game-tab-customize').count()==1
     page.evaluate("location.hash='#customize'");page.locator('.cz-card').first.wait_for();assert page.title()=='自訂 · Scholar'
     # Only the 自訂 panel shows: the Wordle board, keyboard and toolbar are hidden.
     assert page.locator('#game-main').is_hidden() and page.locator('#wordle-toolbar').is_hidden();assert page.locator('#customize-panel').bounding_box()['y']<200
     assert page.locator('#customize-panel').evaluate('n=>n.scrollWidth<=n.clientWidth+1');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     # Backgrounds are solid colours (no gradient).
     bgc=lambda:page.evaluate("[getComputedStyle(document.body,'::before').backgroundImage,getComputedStyle(document.body,'::before').backgroundColor]")
     chips=page.evaluate("Object.fromEntries([...document.querySelectorAll('.cz-swatch')].filter(n=>n.querySelector('.cz-wall')).map(n=>[n.textContent.trim(),getComputedStyle(n.querySelector('.cz-wall')).backgroundColor]))")
     assert chips['深藍']=='rgb(11, 26, 51)' and chips['酒紅']=='rgb(58, 15, 26)' and chips['墨綠']=='rgb(15, 42, 29)',chips
     page.get_by_role('radio',name='深藍').click();assert root('wallpaper')=='navy';assert bgc()==['none','rgb(11, 26, 51)'],bgc()
     page.locator('.cz-wall-custom input').evaluate("n=>{n.value='#336699';n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}))}");assert bgc()==['none','rgb(51, 102, 153)'],bgc()
     page.get_by_role('radio',name='純黑').click();assert bgc()==['none','rgb(0, 0, 0)'],bgc()
     page.get_by_role('radio',name='綠',exact=True).first.click();assert root('accent')=='custom';assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")=='#8fe3a3'
     sel=page.evaluate("getComputedStyle(document.querySelector('#scholar-game-tabs .lg-tab-lens')||document.getElementById('game-tab-customize')).borderColor");assert '143, 227, 163' in sel,sel
     page.get_by_role('radiogroup',name='主題色調').get_by_role('radio',name='紫').click();assert root('tone')=='purple'
     saved=json.loads(page.evaluate("ScholarStorage.getItem('scholar-customize-v1')"));assert saved=={'wallpaper':'black','accent':'#8fe3a3','tone':'purple','color':'#336699','dim':35,'blur':0,'font':'default','size':100,'text':'','bold':False,'motion':False},saved
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
     page.evaluate("location.hash='#customize'");page.locator('.cz-preview').wait_for()
     # 一鍵主題: sets wallpaper, accent, tone and text colour together; picking it shows as selected.
     page.get_by_role('radio',name='林野').click()
     t=json.loads(page.evaluate("ScholarStorage.getItem('scholar-customize-v1')"))
     assert (t['wallpaper'],t['color'],t['accent'],t['tone'],t['text'])==('custom','#13301f','#d4a93a','green','#efe0c0'),t
     assert bgc()==['none','rgb(19, 48, 31)'] and root('tone')=='green' and page.get_by_role('radio',name='林野').get_attribute('aria-checked')=='true'
     if engine=='chromium':page.screenshot(path=str(out/f'theme-{width}.png'))
     page.get_by_role('radio',name='紅磚').click();assert page.get_by_role('radio',name='林野').get_attribute('aria-checked')=='false' and bgc()==['none','rgb(90, 23, 18)']
     css=lambda sel,prop:page.evaluate(f"getComputedStyle(document.querySelector('{sel}')).{prop}")
     # 文字：字型
     page.get_by_role('radio',name='明體').click();assert root('font')=='serif';assert 'Noto Serif TC' in css('.cz-preview','fontFamily')
     assert 'Noto+Serif+TC' in page.evaluate("document.getElementById('cz-webfont').href")
     assert 'Noto Serif TC' not in css('.cz-font-chip','fontFamily')  # each preview chip keeps its own font
     # 文字大小 scales px text everywhere, also tabs loaded later; layout boxes and zoom untouched.
     tab=float(css('#game-tab-customize','fontSize')[:-2])
     size=page.get_by_role('slider',name='文字大小');size.fill('120');size.dispatch_event('change')
     assert css('.cz-preview','fontSize')=='19.2px';assert abs(float(css('#game-tab-customize','fontSize')[:-2])-tab*1.2)<.05
     # 文字顏色: white/grey text takes the colour (relative brightness kept); coloured text stays.
     page.get_by_role('radio',name='淺藍').click();assert css('.cz-preview','color')=='rgb(204, 222, 251)',css('.cz-preview','color')
     assert page.evaluate("ScholarCustomize.recolor('rgba(255, 255, 255, 0.5)',[10,20,30])")=='rgba(10, 20, 30, 0.5)'
     assert page.evaluate("ScholarCustomize.recolor('#22c55e',[10,20,30])")=='#22c55e' and page.evaluate("ScholarCustomize.recolor('rgb(40, 40, 40)',[10,20,30])")=='rgb(40, 40, 40)'
     # 色碼 fields: valid codes apply, Enter keeps; invalid codes are flagged and undone.
     hx=page.get_by_role('textbox',name='文字顏色色碼');hx.fill('abc');hx.press('Enter');assert json.loads(page.evaluate("ScholarStorage.getItem('scholar-customize-v1')"))['text']=='#aabbcc'
     hx=page.get_by_role('textbox',name='強調色色碼');hx.fill('#12345');assert hx.get_attribute('aria-invalid')=='true';hx.press('Enter');assert hx.input_value()!='#12345'
     hx=page.get_by_role('textbox',name='強調色色碼');hx.fill('#123456');hx.press('Enter');assert root('accent')=='custom' and json.loads(page.evaluate("ScholarStorage.getItem('scholar-customize-v1')"))['accent']=='#123456'
     hx=page.get_by_role('textbox',name='桌布色碼');hx.fill('#204060');hx.press('Enter');assert bgc()==['none','rgb(32, 64, 96)'],bgc()
     # 粗體文字 and 減少動態效果
     h1=int(css('.cz-head h1','fontWeight'));page.get_by_role('switch',name='粗體文字').click();assert root('bold')=='' and page.evaluate("'bold' in document.documentElement.dataset")
     assert int(css('.cz-head h1','fontWeight'))==min(900,h1+200 if h1<=400 else h1+100)
     page.get_by_role('switch',name='減少動態效果').click();assert root('motion')=='reduce';assert css('.cz-knob','transitionDuration') in ('1e-05s','0.00001s')
     saved=json.loads(page.evaluate("ScholarStorage.getItem('scholar-customize-v1')"));assert (saved['font'],saved['size'],saved['text'],saved['bold'],saved['motion'])==('serif',120,'#aabbcc',True,True),saved
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     if engine=='chromium':page.screenshot(path=str(out/f'text-{width}.png'),full_page=False)
     page.reload();page.locator('.cz-preview').wait_for();page.wait_for_timeout(300);assert root('font')=='serif' and css('.cz-preview','fontSize')=='19.2px'
     # Another tab after reload keeps the larger text.
     page.evaluate("location.hash='#forms'");page.locator('#fm-bsrs').wait_for();page.wait_for_timeout(200)
     if engine=='chromium':page.screenshot(path=str(out/f'forms-text-{width}.png'))
     page.evaluate("location.hash='#customize'");page.get_by_role('button',name='全部恢復預設').click()
     assert css('.cz-preview','fontSize')=='16px' and css('.cz-preview','color')=='rgb(237, 243, 251)' and int(css('.cz-head h1','fontWeight'))==h1
     assert css('#game-tab-customize','fontSize')==str(tab).rstrip('0').rstrip('.')+'px' and page.evaluate("document.documentElement.style.fontSize")==''
     assert root('font')=='' and root('motion')=='' and not page.evaluate("'bold' in document.documentElement.dataset")
     assert root('accent')=='' and root('tone')=='' and root('wallpaper')=='default';assert page.evaluate("getComputedStyle(document.body,'::before').backgroundImage")==before
     assert not errors,errors;page.close();print(engine,width,'top-bar tab / wallpapers / upload device-only / sliders / accent / tone / font / text size / text colour / hex codes / bold / motion / reload / reset to the original look PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
