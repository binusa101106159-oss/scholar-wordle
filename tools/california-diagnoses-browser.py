"""Use real calculator UI, isolated state, and established PDRS/CVC fixtures."""
from pathlib import Path
import argparse,functools,http.server,json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);args=parser.parse_args();server=None
 if args.url:base=args.url.rstrip('/')+'/'
 else:
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 data=json.loads((ROOT/'calculator/california.json').read_text(encoding='utf8'));output=ROOT/'.local/california-diagnoses';output.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1100},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(base+'#calculator',wait_until='domcontentloaded');page.locator('#ca-number-input').wait_for()
     def choose(code,wpi):
      page.locator('#ca-form [name=wpi]').fill(str(wpi));field=page.locator('#ca-number-input');field.evaluate('n=>n.scrollIntoView({block:"center"})');field.fill(code);page.locator('#ca-number-options [role=option]').first.click()
     def expected(wpi,code,age=48,group='311'):
      return page.evaluate('args=>ScholarCalifornia.createEngine(args.data).rate(args.input).final',{'data':data,'input':{'wpi':wpi,'number':code,'age':age,'group':group}})
     def combined(values):return str(page.evaluate('values=>ScholarCalifornia.combine(values).total',values))+'%'
     page.locator('#ca-form [name=age]').fill('48');page.locator('#ca-group-input').fill('311');choose('16.06.01.01',2);assert page.locator('#ca-final').inner_text()=='3%'
     # Existing manual CVC entries are retained, never duplicated or overwritten.
     page.locator('[data-ca-rating="0"]').fill('10');page.locator('#ca-diagnosis-add').click();assert page.locator('.ca-diagnosis-row').count()==1;assert page.locator('#ca-form [name=wpi]').input_value()=='';assert page.locator('#ca-form [name=age]').input_value()=='48';assert page.locator('#ca-group-input').input_value()=='311';assert page.locator('[data-ca-rating="0"]').input_value()=='10';assert page.locator('#ca-combined').inner_text()==combined([3,10])
     choose('13.04.00.00',10);second=expected(10,'13.04.00.00');assert page.locator('[data-linked-diagnosis]').count()==2;assert page.locator('#ca-combined').inner_text()==combined([3,second,10])
     # Shared age changes rerate every row, including already added diagnoses.
     page.locator('#ca-form [name=age]').fill('62');first62=expected(2,'16.06.01.01',62);second62=expected(10,'13.04.00.00',62);assert page.locator('#ca-combined').inner_text()==combined([first62,second62,10]);page.locator('#ca-form [name=age]').fill('48')
     # Stored diagnoses remain inline, with focus retained during rerating.
     first=page.locator('.ca-diagnosis-row').first
     first.locator('[data-diagnosis-field=wpi]').fill('4');edited=expected(4,'16.06.01.01');assert page.locator('#ca-combined').inner_text()==combined([edited,second,10]);assert first.locator('[data-diagnosis-field=wpi]').evaluate('n=>n===document.activeElement');assert page.locator('#ca-form [name=wpi]').input_value()=='10'
     query=first.locator('[data-diagnosis-field=numberQuery]');query.fill('16.06.01.01');first.locator('[role=option]').first.click();assert query.input_value().endswith('Thumb - Range of motion');assert page.locator('#ca-combined').inner_text()==combined([edited,second,10])
     page.locator('#ca-diagnosis-add').click();assert page.locator('.ca-diagnosis-row').count()==2
     # Category changes clear the old diagnosis and block partial totals.
     first.locator('[data-diagnosis-field=category]').select_option('13');assert query.input_value()=='';assert page.locator('#ca-combined').inner_text()=='—'
     first.locator('[data-diagnosis-field=category]').select_option('16');query.fill('16.06.01.01');first.locator('[role=option]').first.click();assert page.locator('#ca-combined').inner_text()==combined([edited,second,10])
     # Incomplete current input blocks a misleading partial combined total.
     page.locator('#ca-form [name=wpi]').fill('1');assert page.locator('#ca-combined').inner_text()=='—';assert page.locator('#ca-copy-combined').is_disabled();page.locator('#ca-diagnosis-clear').click();assert page.locator('#ca-combined').inner_text()==combined([edited,second,10])
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.diagnosisCopy=text}}})");page.locator('#ca-copy-combined').click();page.wait_for_function('window.diagnosisCopy!==undefined');note=page.evaluate('window.diagnosisCopy');assert '13.04.00.00'in note and '16.06.01.01'in note
     saved=page.evaluate("ScholarStorage.getItem('scholar-california-v1')");page.evaluate("async raw=>{ScholarStorage.setItem('scholar-california-v1',raw);const host=document.querySelector('#cl-california');host.replaceChildren();delete host.dataset.ready;await ScholarCalifornia.mount();}",saved);assert page.locator('.ca-diagnosis-row').count()==2;assert page.locator('#ca-combined').inner_text()==combined([edited,second,10])
     page.locator('#ca-number-input').evaluate('n=>n.scrollIntoView({block:"center"})');assert page.locator('#cl-california .ca-app').evaluate('n=>n.scrollWidth<=n.clientWidth+1');assert page.locator('.ca-diagnosis-row').first.evaluate('n=>n.scrollWidth<=n.clientWidth+1')
     if width==390:assert first.locator('.ca-number').evaluate('n=>n.getBoundingClientRect().width>250')
     if engine=='chromium':page.locator('#cl-california .ca-app').screenshot(path=str(output/f'diagnoses-{width}.png'))
     page.locator('[data-diagnosis-action=remove]').first.click();assert page.locator('.ca-diagnosis-row').count()==1;page.locator('#ca-reset').click();assert page.locator('.ca-diagnosis-row').count()==0;assert page.locator('[data-linked-diagnosis]').count()==0;assert page.locator('#ca-combined').inner_text()=='—'
     assert not errors,errors;print(engine,width,'multi diagnoses / shared age rerating / inline edit-category-remove / no double count / existing manual CVC / incomplete guard / hydration / scoped reset PASS',flush=True);page.close()
    browser.close()
 finally:
  if server:server.shutdown()
if __name__=='__main__':main()
