"""指引: the printed 目錄 becomes a contents list (no dot leaders or page numbers, entries jump), the title and 公告
history sit centred under it, and on wide screens the text fills the width beside the sidebar (版面寬度 填滿)."""
from pathlib import Path
import argparse,functools,http.server,threading,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/guide-toc'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    for width in [1600,390]:
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.goto(base+'#guides');page.locator('.gx-guide').first.wait_for(state='attached')
     for gid in ['plans01','plans02','plans03','plans04']:
      page.evaluate(f"document.querySelector('.gx-guide[data-guide=\"{gid}\"]').click()");page.locator('#gx-doc .gx-toc').wait_for()
      toc=page.locator('#gx-doc .gx-toc').inner_text()
      assert not re.search(r'\.{3,}|…{2,}',toc) and not re.search(r'\s\d+\s*$',toc,re.M),(gid,toc[:300])
      # 章節 menu lists the real headings only, not the printed contents lines
      opts=page.evaluate("[...document.querySelectorAll('#gx-chapters option')].map(o=>o.textContent)")
      assert not any(re.search(r'\.{3,}',o) for o in opts),opts
     # plans03: merged lines split, title and 公告 history centred under the contents
     page.evaluate("document.querySelector('.gx-guide[data-guide=\"plans03\"]').click()");page.locator('#gx-doc .gx-toc').wait_for()
     items=page.evaluate("[...document.querySelectorAll('#gx-doc .gx-toc-item')].map(n=>n.textContent.trim())")
     assert '伍、 結語' in items and '參考資料' in items and '附錄五、常見問題' in items,items
     assert page.locator('.gx-toc-doc-title').inner_text()=='工作場所母性健康保護技術指引'
     hist=page.evaluate("[...document.querySelectorAll('.gx-toc-history>span')].map(n=>n.textContent)");assert len(hist)==3 and hist[0].endswith('號公告訂定'),hist
     assert page.evaluate("getComputedStyle(document.querySelector('.gx-toc-history')).textAlign")=='center'
     # entries jump to their section
     page.locator('.gx-toc-go',has_text='適用範圍及定義').click();page.wait_for_timeout(600)
     top=page.evaluate("(()=>{const h=[...document.querySelectorAll('#gx-doc h2')].find(n=>n.textContent.includes('適用範圍及定義'));return h.getBoundingClientRect().top})()");assert 0<=top<400,top
     if width>900:
      # 填滿: the text uses the reader width (sidebar open or collapsed)
      fill=lambda:page.evaluate("(()=>{const r=document.querySelector('.gx-reader').getBoundingClientRect(),d=document.getElementById('gx-doc').getBoundingClientRect();return [Math.round(r.width),Math.round(d.width)]})()")
      r,d=fill();assert d>=r-40,(r,d)
      if page.locator('#gx-side-close').is_visible():page.locator('#gx-side-close').click();page.wait_for_timeout(500)
      r,d=fill();assert d>=r-40 and d>1100,(r,d)
      page.evaluate("document.querySelector('.gx-toc').scrollIntoView({block:'start'})");page.wait_for_timeout(200)
      if engine=='chromium':page.screenshot(path=str(out/f'toc-{width}.png'))
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     assert not errors,errors;page.close();print(engine,width,'contents list / no leaders or page numbers / 章節 menu clean / title & 公告 / jump / 填滿 width PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
