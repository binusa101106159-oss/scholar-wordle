"""指引 勞工職業災害保險職業病種類表: the search box lists matching 項目 as cards (類別／子分類 from the merged cells),
a card opens its row in the full table, clearing the box brings the table back."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/od-search'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    for width in [1440,390]:
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.goto(base+'#guides');page.locator('.gx-guide').first.wait_for(state='attached')
     page.evaluate("document.querySelector('.gx-guide[data-guide=\"top01\"]').click()");page.locator('#gx-od-q').wait_for()
     q,count,cards=page.locator('#gx-od-q'),page.locator('#gx-od-count'),page.locator('.gx-od-card')
     assert count.inner_text()=='共 169 項，可搜尋名稱、物質、作業或項目編號',count.inner_text()
     # by code
     q.fill('1.1.13');page.wait_for_timeout(250);assert cards.count()==1 and '二硫化碳' in cards.first.inner_text() and '第一子分類化學性危害物質' in cards.first.inner_text()
     assert page.locator('#gx-doc .gx-body').is_hidden()
     # by substance (English across the PDF's hyphenation), several words, a category filled in from a merged cell
     q.fill('acrylamide');page.wait_for_timeout(250);assert cards.count()>=1 and '丙烯醯胺' in cards.first.inner_text(),cards.count()
     q.fill('鉛');page.wait_for_timeout(250);n=cards.count();assert n>=1 and count.inner_text()==f'找到 {n} 項'
     q.fill('塵肺');page.wait_for_timeout(250);assert cards.count()>=1 and all('第五類職業性呼吸系統疾病' in t for t in cards.all_inner_texts()[:1]),cards.all_inner_texts()[:2]
     assert page.locator('.gx-od-card mark.gx-od-hit').count()>=1
     if engine=='chromium':page.screenshot(path=str(out/f'search-{width}.png'))
     q.fill('不可能存在的字');page.wait_for_timeout(250);assert cards.count()==0 and count.inner_text()=='沒有符合的項目'
     # a card opens its row in the table
     q.fill('1.1.57');page.wait_for_timeout(250);cards.first.click();page.wait_for_timeout(1800)
     assert q.input_value()=='' and page.locator('#gx-doc .gx-body').is_visible()
     row=page.locator('#gx-doc .gx-table tr.gx-od-flash');assert row.count()==1 and '1.1.57' in row.inner_text() and '正己烷' in row.inner_text()
     top=row.evaluate('r=>r.getBoundingClientRect().top');assert 0<top<900,top
     # Escape clears
     q.fill('苯');page.wait_for_timeout(250);q.press('Escape');page.wait_for_timeout(100);assert q.input_value()=='' and cards.count()==0
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     # other guides have no box
     page.evaluate("document.querySelector('.gx-guide[data-guide=\"e01\"]').click()");page.wait_for_timeout(800);assert page.locator('#gx-od-q').count()==0
     assert not errors,errors;page.close();print(engine,width,'search by code / substance / words / category / no hits / card opens row / Escape / only this document PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
