"""法規／指引 readers: wide tables grow into the free width (most when the sidebar is collapsed), letter-spaced
source headings close up on screen only, blank form cells keep a line of height, phones unchanged."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/wide-tables'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 W="(sel)=>{const w=document.querySelector(sel);return Math.round(w.getBoundingClientRect().width)}"
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    for width in [1440,390]:
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.goto(base+'#laws');page.locator('#lx-a-s01-1').wait_for()
     page.evaluate("document.querySelector('[data-law=\"a17\"]').click()");page.locator('#lx-a-a17-5 .lx-twrap').wait_for();page.wait_for_timeout(300)
     art='#lx-a-a17-5'
     # On screen 「時 間 比 例…」 reads as one word, but the article text (search, highlights) keeps the source spaces.
     assert '時 間 比 例' in page.evaluate(f"document.querySelector('{art}').textContent")
     gaps=page.evaluate(f"[...document.querySelectorAll('{art} .rt-gap')].map(g=>g.getBoundingClientRect().width)");assert gaps and max(gaps)<0.5,gaps
     if width>900:
      doc=page.evaluate(W,'#lx-doc');wide=page.evaluate(W,art+' .lx-twrap');assert wide>doc-40,(wide,doc)
      # the 作息 row fits on one line
      tall=page.evaluate(f"Math.max(...[...[...document.querySelector('{art} tbody').rows].at(-1).cells].map(c=>c.getBoundingClientRect().height))");assert tall<48,tall
      # nothing is clipped: the table's right edge stays inside the reader
      assert page.evaluate(f"document.querySelector('{art} .lx-twrap').getBoundingClientRect().right<=document.querySelector('.lx-reader').getBoundingClientRect().right+1")
     else:
      assert page.locator('.rt-wide').count()==0 and page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     page.locator(art+' .lx-twrap').scroll_into_view_if_needed();page.screenshot(path=str(out/f'law-{width}.png'))
     # A form with blank cells keeps a line of height in each blank row.
     page.evaluate("document.querySelector('[data-law=\"a10\"]').click()");page.locator('#lx-a-a10-14 .lx-twrap').wait_for();page.wait_for_timeout(200)
     low=page.evaluate("Math.min(...[...document.querySelectorAll('#lx-a-a10-14 tr')].map(r=>r.getBoundingClientRect().height))");assert low>=18,low
     # 指引: a 15-column table grows when the sidebar is collapsed and goes back when it opens.
     if width>900:
      page.evaluate("location.hash='#guides'");page.locator('.gx-guide').first.wait_for()
      page.evaluate("document.querySelector('.gx-guide[data-guide=\"c019\"]').click()");page.locator('#gx-doc .gx-twrap').first.wait_for();page.wait_for_timeout(500)
      pick="[...document.querySelectorAll('#gx-doc .gx-twrap:not(.gx-nested)')].find(w=>w.querySelectorAll(':scope>table>colgroup>col').length>=15)"
      before=page.evaluate(f"Math.round({pick}.getBoundingClientRect().width)")
      page.locator('#gx-side-close').click();page.wait_for_timeout(500)
      after=page.evaluate(f"Math.round({pick}.getBoundingClientRect().width)");assert after>before+200,(before,after)
      page.evaluate(f"{pick}.scrollIntoView({{block:'start'}})");page.screenshot(path=str(out/f'guide-collapsed-{width}.png'))
      page.locator('#gx-menu').click();page.wait_for_timeout(500);assert page.evaluate(f"Math.round({pick}.getBoundingClientRect().width)")<=before+1
     assert not errors,errors;page.close();print(engine,width,'wide tables use the free width / sidebar collapse / spaced headings / blank rows / phones unchanged PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
