"""計算機 tab: 生日計算 below the 月曆 — age in years, months and days, to today or another date; nothing saved."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/birthday'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    for width in [1440,390]:
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.clock.set_fixed_time('2026-11-27T09:00:00+08:00')
     page.goto(base+'#calculator');page.locator('#cl-bd-birth').wait_for()
     # sits right under the 月曆
     assert page.evaluate("document.querySelector('.cl-calendar').nextElementSibling.classList.contains('cl-birthday')")
     cal=page.evaluate("document.querySelector('.cl-calendar').getBoundingClientRect().bottom");card=page.evaluate("document.querySelector('.cl-birthday').getBoundingClientRect().top");assert card>=cal,(cal,card)
     out_=page.locator('#cl-bd-out')
     page.locator('#cl-bd-birth').fill('0790105')
     t=out_.inner_text();assert '36 歲' in t and '足歲 36 歲 10 個月 22 天' in t and '1990/01/05（民國 79 年 1 月 5 日）星期五' in t and '13,475 天' in t and '2027/01/05 星期二，還有 39 天（滿 37 歲）' in t,t
     for v in ['79/1/5','19900105','1990/1/5','民國79年1月5日']:page.locator('#cl-bd-birth').fill(v);assert '足歲 36 歲 10 個月 22 天' in out_.inner_text(),v
     # to another date (e.g. 受傷日)
     page.locator('#cl-bd-base').fill('1100315');t=out_.inner_text();assert '足歲 31 歲 2 個月 10 天' in t and '2021/03/15' in t,t
     if engine=='chromium':page.locator('.cl-birthday').screenshot(path=str(out/f'birthday-{width}.png'))
     page.locator('#cl-bd-base').fill('0780101');assert '早於' in out_.inner_text()
     page.locator('#cl-bd-base').fill('');page.locator('#cl-bd-birth').fill('1130231');assert page.locator('#cl-bd-birth').get_attribute('aria-invalid')=='true' and '格式不對' in out_.inner_text()
     # today is the birthday
     page.locator('#cl-bd-birth').fill('19801127');assert '今天生日，滿 46 歲' in out_.inner_text()
     # not saved
     assert page.evaluate("Object.keys(localStorage).every(k=>!/birth/i.test(k)) && !JSON.stringify(localStorage).includes('19801127')")
     page.locator('#cl-bd-clear').dispatch_event('click');assert page.locator('#cl-bd-birth').input_value()=='' and out_.inner_text().strip()==''
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     assert not errors,errors;page.close();print(engine,width,'under 月曆 / age y-m-d / 民國 & 西元 input / to another date / errors / birthday today / not saved / clear PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
