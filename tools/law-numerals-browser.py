"""法規 reader: 原文／阿拉伯數字 switch, 附表 links, separate highlights per mode, kept after reload."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/law-numerals'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    for width in [1440,390]:
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.goto(base+'#laws');page.locator('#lx-num-btn').wait_for(state='attached')
     page.evaluate("()=>{const b=[...document.querySelectorAll('button,a')].find(n=>n.textContent.includes('勞工健康保護規則'));b.click()}")
     art1=page.locator('#lx-a-s01-1 .lx-l').first;art1.wait_for()
     assert '第六條第三項' in art1.inner_text();sw=page.locator('#lx-num-btn')
     if not sw.is_visible():page.locator('#lx-menu').click()
     assert sw.get_attribute('aria-checked')=='false';sw.click();assert sw.get_attribute('aria-checked')=='true'
     assert '第 6 條第 3 項、第 20 條第 3 項' in page.locator('#lx-a-s01-1 .lx-l').first.inner_text()
     night=page.locator('#lx-a-s01-2').inner_text();assert '10:00PM 至翌晨 6:00AM' in night and '1/2' in night and '700 小時' in night and '附表一' in night,night
     assert '115 年 6 月 26 日' in page.locator('.lx-note').first.inner_text()
     if engine=='chromium':page.locator('#lx-a-s01-2').screenshot(path=str(out/f'art2-{width}.png'))
     # 附表 link still opens from the converted text.
     page.locator('#lx-a-s01-2 .lx-ref').first.click();page.locator('dialog[open]').first.wait_for();page.keyboard.press('Escape');page.wait_for_function("!document.querySelector('dialog[open]')")
     # Highlight in 阿拉伯數字 mode; it is not shown in 原文 mode and comes back when switching again.
     line=page.locator('#lx-a-s01-1 .lx-l').first;line.scroll_into_view_if_needed()
     page.evaluate("""()=>{const p=document.querySelector('#lx-a-s01-1 .lx-l');const t=[...p.childNodes].find(n=>n.nodeType===3&&n.nodeValue.includes('第 6 條'));const i=t.nodeValue.indexOf('第 6 條');const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+5);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))}""")
     page.locator('#lx-hlbar .lx-swatch').first.wait_for();page.locator('#lx-hlbar .lx-swatch').first.click()
     assert page.locator('#lx-a-s01-1 mark.lx-hl').inner_text()=='第 6 條'
     sw.click();assert sw.get_attribute('aria-checked')=='false';assert '第六條第三項' in page.locator('#lx-a-s01-1 .lx-l').first.inner_text();assert page.locator('#lx-a-s01-1 mark.lx-hl').count()==0
     sw.click();assert page.locator('#lx-a-s01-1 mark.lx-hl').inner_text()=='第 6 條'
     # The choice is a reading setting saved with the account, like 字級 and 行距 (signed out it lasts for this visit).
     import json as _j;assert _j.loads(page.evaluate("ScholarStorage.getItem('scholar-reading-v1')"))['numerals']=='arabic'
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     page.locator('#lx-num-btn').click()
     assert not errors,errors;page.close();print(engine,width,'switch / user examples / note / 附表 link / separate highlights / saved setting PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
