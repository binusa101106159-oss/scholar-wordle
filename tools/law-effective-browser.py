"""法規 reader: 備註另定施行日期 shown under 第 X 條, outside the article text used for highlights."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/law-effective'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    for width in [1440,390]:
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.clock.set_fixed_time('2026-11-26T12:00:00+08:00')
     page.goto(base+'#laws');page.locator('#lx-num-btn').wait_for(state='attached')
     page.evaluate("()=>{const b=[...document.querySelectorAll('button,a')].find(n=>n.textContent.includes('勞工健康保護規則'));b.click()}")
     page.locator('#lx-a-s01-1 .lx-l').first.wait_for()
     note=page.locator('#lx-a-s01-6 .lx-effective')
     assert note.count()==1 and note.get_attribute('data-note')=='第 2～4 項自 116 年 7 月 1 日施行' and note.get_attribute('data-tag')=='尚未施行'
     drawn=page.evaluate("()=>{const n=document.querySelector('#lx-a-s01-6 .lx-effective');return [getComputedStyle(n,'::before').content,getComputedStyle(n,'::after').content,n.getBoundingClientRect().height]}")
     assert drawn[0]=='"尚未施行"' and '116 年 7 月 1 日' in drawn[1] and drawn[2]>10,drawn
     # Notes only where the 備註 names the article; the text is not part of the article (highlight offsets unchanged).
     assert page.locator('#lx-a-s01-1 .lx-effective').count()==0 and page.locator('#lx-a-s01-21 .lx-effective').count()==1
     assert '施行' not in page.evaluate("document.querySelector('#lx-a-s01-6').textContent.slice(0,12)")
     body=page.evaluate("document.querySelector('#lx-a-s01-6').textContent")
     assert body.startswith('第 6 條') and '116 年' not in body,body
     # On phones the note sits under 第 X 條; on desktop it is the first line of the article column.
     box=page.evaluate("()=>{const h=document.querySelector('#lx-a-s01-6 .lx-art-no').getBoundingClientRect(),n=document.querySelector('#lx-a-s01-6 .lx-effective').getBoundingClientRect(),l=document.querySelector('#lx-a-s01-6 .lx-l').getBoundingClientRect();return [h.bottom,n.top,n.bottom,l.top]}")
     assert box[2]<=box[3]+1,box
     if width<500: assert box[1]>=box[0]-1,box
     # A highlight in 第 6 條 still lands on the same words.
     page.locator('#lx-a-s01-6').scroll_into_view_if_needed()
     page.evaluate("""()=>{const p=document.querySelector('#lx-a-s01-6 .lx-l');const t=[...p.childNodes].find(n=>n.nodeType===3&&n.nodeValue.length>6);const r=document.createRange();r.setStart(t,0);r.setEnd(t,4);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))}""")
     want=page.evaluate("()=>{const p=document.querySelector('#lx-a-s01-6 .lx-l');return [...p.childNodes].find(n=>n.nodeType===3&&n.nodeValue.length>6).nodeValue.slice(0,4)}")
     page.locator('#lx-hlbar .lx-swatch').first.wait_for();page.locator('#lx-hlbar .lx-swatch').first.click()
     assert page.locator('#lx-a-s01-6 mark.lx-hl').inner_text()==want
     page.locator('#lx-a-s01-6').screenshot(path=str(out/f'art6-{width}.png'))
     # 有機溶劑中毒預防規則 第 3 條: the 附表一 date has passed.
     page.evaluate("()=>{const b=[...document.querySelectorAll('button,a')].find(n=>n.textContent.includes('有機溶劑中毒預防規則'));b.click()}")
     page.locator('#lx-a-a09-3 .lx-effective').wait_for(state='attached')
     assert page.locator('#lx-a-a09-3 .lx-effective').get_attribute('data-tag')=='已施行'
     assert page.locator('#lx-a-a09-18 .lx-effective').get_attribute('data-tag')=='尚未施行'
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     assert not errors,errors;page.close();print(engine,width,'notes under 第 X 條 / pending vs in force / not in highlight text / highlight lands PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
