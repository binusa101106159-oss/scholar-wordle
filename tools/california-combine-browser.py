"""Verify independent combination, keyboard flow and per-diagnosis results."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);args=parser.parse_args();server=None
 if args.url:base=args.url.rstrip('/')+'/'
 else:
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 try:
  with sync_playwright()as p:
   for name in args.engines:
    browser=getattr(p,name).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1100},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(base+'#calculator',wait_until='domcontentloaded');page.locator('#ca-number-input').wait_for()
     assert page.locator('#cl-help').count()==0;assert page.locator('#ca-rating-label').count()==0
     assert page.locator('#cl-combine header, #cl-impairment header, #pure-combine-title, #ic-title').count()==0
     assert page.locator('#pure-combine-reset').evaluate('n=>n.parentElement.classList.contains("ca-combine")');assert page.locator('#ic-reset').evaluate('n=>n.parentElement.classList.contains("ic-footer")')
     page.locator('#ic-unit').select_option('UEI');page.locator('#ic-value').fill('10');assert page.locator('#ic-copy').is_enabled();page.locator('#ic-reset').click();assert page.locator('#ic-value').input_value()=='';assert page.locator('#ic-copy').is_disabled()
     assert page.evaluate("()=>{const nodes=[...document.querySelector('.cl-specialty').children].map(n=>n.id);return nodes.indexOf('cl-impairment')<nodes.indexOf('cl-combine')&&nodes.indexOf('cl-combine')<nodes.indexOf('cl-california')}")
     def flow(selector,result,total='36%'):
      fields=page.locator(selector);fields.nth(0).click();fields.nth(0).press_sequentially('25');assert fields.nth(1).evaluate('n=>n===document.activeElement')
      fields.nth(1).press_sequentially('5');assert fields.nth(1).evaluate('n=>n===document.activeElement');fields.nth(1).press('Tab');assert fields.nth(2).evaluate('n=>n===document.activeElement')
      fields.nth(2).press('Backspace');assert fields.nth(1).evaluate('n=>n===document.activeElement');assert fields.nth(1).input_value()=='5';fields.nth(1).press('Tab');fields.nth(2).press_sequentially('10');assert fields.nth(3).evaluate('n=>n===document.activeElement');assert page.locator(result).inner_text()==total
     flow('[data-pure-rating]','#pure-combined')
     page.locator('#ca-form [name=age]').fill('48');page.locator('#ca-group-input').fill('nurse general duty');page.locator('#ca-group-options [role=option]').first.click();assert 'NURSE, GENERAL DUTY' in page.locator('#ca-group-input').input_value();assert 'medical ser.' in page.locator('#ca-group-input').input_value();assert page.locator('#ca-job-description').is_hidden()
     page.locator('#ca-form [name=wpi]').fill('2');page.locator('#ca-number-input').evaluate('n=>n.scrollIntoView({block:"center"})');page.locator('#ca-number-input').fill('16.06.01.01');page.locator('#ca-number-options [role=option]').first.click();page.locator('#ca-diagnosis-add').click()
     row=page.locator('.ca-diagnosis-row').first;assert row.locator('.ca-chain').is_visible();assert row.locator('.ca-chain dd').all_inner_texts()==['2%','2%','3%','3%']
     if width==1440:
      assert row.locator('.ca-chain').bounding_box()['x']>row.locator('.ca-diagnosis-grid').bounding_box()['x']
      assert page.locator('#ca-group-input').bounding_box()['width']>500
     flow('[data-ca-rating]','#ca-combined','38%');assert page.locator('#ca-combined').inner_text()==page.evaluate("ScholarCalifornia.combine([3,25,5,10]).total+'%'")
     assert page.locator('#pure-combined').inner_text()=='36%';page.locator('#pure-combine-reset').click();assert page.locator('#pure-combined').inner_text()=='—';assert page.locator('#ca-form [name=age]').input_value()=='48';assert row.locator('.ca-chain').is_visible()
     # Single pasted values retain support for 100; bulk paste and invalid values are validated.
     first=page.locator('[data-pure-rating]').first;first.fill('100');assert page.locator('#pure-combined').inner_text()=='100%';first.fill('101');assert page.locator('#pure-combined').inner_text()=='—';assert first.get_attribute('aria-invalid')=='true'
     page.locator('#pure-combine-reset').click();first.evaluate("n=>{const e=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=> '20 10 5'}});n.dispatchEvent(e)}");assert page.locator('#pure-combined').inner_text()=='32%'
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.combineCopy=text}})");page.locator('#pure-combine-copy').click();page.wait_for_function('window.combineCopy');assert '32%' in page.evaluate('window.combineCopy')
     for selector in ['#cl-combine .ca-app','#cl-california .ca-app','.ca-diagnosis-row']:assert page.locator(selector).first.evaluate('n=>n.scrollWidth<=n.clientWidth+1')
     if name=='chromium':
      output=ROOT/'.local/california-combine';output.mkdir(parents=True,exist_ok=True);page.locator('#cl-california .ca-app').screenshot(path=str(output/f'california-{width}.png'));page.locator('#cl-combine .ca-app').screenshot(path=str(output/f'combine-{width}.png'));page.locator('#cl-impairment .ic-card').screenshot(path=str(output/f'impairment-{width}.png'))
     assert not errors,errors;print(name,width,'independent combine / auto advance-tab-backspace / per-row steps / wide job / scoped reset-copy / no overflow PASS',flush=True);page.close()
    browser.close()
 finally:
  if server:server.shutdown()
if __name__=='__main__':main()
