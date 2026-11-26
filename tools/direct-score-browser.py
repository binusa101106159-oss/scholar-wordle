"""計算機 AAOS／QuickDASH: a score typed into the result box gives its grade (AMA 6th Table 15-7 for QuickDASH);
表單 QuickDASH shows mild / moderate / severe."""
from pathlib import Path
import argparse,functools,http.server,threading,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/direct-score'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    for width in [1440,390]:
     page=b.new_page(viewport={'width':width,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.goto(base+'#calculator');page.locator('#qd-score').wait_for();page.locator('#aa-score').wait_for()
     qs,qg=page.locator('#qd-score'),page.locator('#qd-severity')
     # QuickDASH: type a score, get the AMA grade; edge values; invalid input is flagged.
     for v,g in [('73','Severe · GM 3'),('20','No problem · GM 0'),('21','Mild · GM 1'),('60.4','Moderate · GM 2'),('８１','Very severe · GM 4')]:
      qs.fill(v);assert qg.inner_text()==g,(v,qg.inner_text())
     qs.fill('120');assert qs.get_attribute('aria-invalid')=='true' and qg.inner_text()=='—' and '0–100' in page.locator('#qd-error').inner_text()
     qs.fill('45');qs.press('Enter');assert qg.inner_text()=='Moderate · GM 2'
     # AAOS: same, with the AAOS bands.
     a,ag=page.locator('#aa-score'),page.locator('.aa-severity')
     a.fill('60');assert ag.inner_text()=='Moderate deficit · GM 2',ag.inner_text();a.fill('100');assert ag.inner_text()=='Normal · GM 0';a.fill('30');a.press('Enter')
     if engine=='chromium':page.locator('.cl-functional-row').screenshot(path=str(out/f'calc-{width}.png'))
     # Typed scores are saved with the answers (synced like them; signed out they stay in memory only).
     assert json.loads(page.evaluate("ScholarStorage.getItem('scholar-quickdash-v1')"))['score']=='45'
     assert json.loads(page.evaluate("ScholarStorage.getItem('scholar-aaos-v1')"))['score']=='30'
     # Answering the items replaces the typed score with the calculated one.
     for i in range(11):page.locator(f'#qd-q{i+1}').press('2')
     assert page.locator('#qd-score').input_value()=='25' and page.locator('#qd-severity').inner_text()=='Mild · GM 1'
     # Clearing the typed score falls back to the calculated one; 重設 clears everything.
     qs.fill('90');assert qg.inner_text()=='Very severe · GM 4';qs.fill('');qs.press('Tab');assert qs.input_value()=='25' and qg.inner_text()=='Mild · GM 1'
     page.locator('#qd-reset').dispatch_event('click');assert page.locator('#qd-score').input_value()=='' and qg.inner_text()=='—'
     page.locator('#aa-reset').dispatch_event('click');assert page.locator('#aa-score').input_value()=='' and ag.inner_text()=='—'
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     # 表單 QuickDASH: all 3s → 50 → Moderate problem (Grade Modifier 2, AMA Table 15-7).
     page.evaluate("location.hash='#forms'");page.locator('#fm-tab-quickdash').wait_for(state='attached')
     page.evaluate("document.getElementById('fm-tab-quickdash').click()");page.locator('#fm-quickdash').wait_for()
     for i in range(11):page.locator(f'#fm-quickdash input[type=radio][value="3"]').nth(i).check()
     page.locator('button.fm-primary[form="fm-answers-quickdash"]').dispatch_event('click')
     res=page.locator('.fm-result:visible');res.wait_for()
     assert 'Moderate problem · Grade Modifier 2（AMA Guides 6th Table 15-7：QuickDASH 41–60）' in res.inner_text(),res.inner_text()
     if engine=='chromium':res.screenshot(path=str(out/f'form-{width}.png'))
     assert not errors,errors;page.close();print(engine,width,'typed scores grade / edges / invalid / kept / answers win / reset / 表單 QuickDASH level PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
