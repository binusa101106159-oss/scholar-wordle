"""Exercise clinician entry, clipboard, draft retention, and scoped clear."""
import argparse,functools,http.server,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);args=parser.parse_args();server=None
 if args.url:base=args.url.rstrip('/')+'/'
 else:
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 output=ROOT/'.local/clinical-forms';output.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     context=browser.new_context(viewport={'width':width,'height':950},service_workers='block',reduced_motion='reduce');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort())
     page.goto(base+'#forms');page.locator('#fm-tab-mse').wait_for(state='attached')
     def switch(form):
      if width<761 and not page.locator('#fm-tab-'+form).is_visible():page.locator('#fm-menu-toggle').click()
      page.locator('#fm-tab-'+form).click()
     def action(form,label):
      if width<761 and not page.locator('.fm-actions').get_by_role('button',name=label,exact=True).is_visible():page.locator('#fm-menu-toggle').click()
      page.locator('.fm-actions').get_by_role('button',name=label,exact=True).click()
     switch('mse');note=page.locator('#fm-mse-preview');assert note.input_value()==''
     page.locator('#fm-mse-appearance-0').check();page.locator('#fm-mse-speech-0').check();page.locator('#fm-mse-speech-2').check();assert not page.locator('#fm-mse-speech-0').is_checked()
     page.locator('#fm-mse-orientation-1').check();page.locator('#fm-mse-orientation-4').check();page.locator('#fm-mse-insight-0').check();page.locator('#fm-mse-insight-2').check();assert not page.locator('#fm-mse-insight-0').is_checked()
     page.locator('#fm-mse-thoughts').fill('Patient said <test>.\nAssessment incomplete.');expected=note.input_value();assert 'Appearance: Neat'in expected and 'Orientation Impairment: Place, Time'in expected and 'Insight: Poor'in expected and 'Suicidality:'not in expected
     # Other questionnaire answers survive clinical clears and switches.
     switch('bsrs');slider=page.locator('#fm-bsrs-q1-slider');slider.fill('2');slider.dispatch_event('input');switch('mmse')
     assert page.locator('#fm-mmse-preview').input_value()==''
     page.locator('#fm-mmse-time-0').check();assert '不計總分'in page.locator('#fm-mmse-score').inner_text()
     maxima={'time':5,'place':5,'registration':3,'calculation':5,'recall':3,'naming':2,'repetition':1,'reading':1,'writing':1,'command':3,'construction':1}
     for key,value in maxima.items():page.locator(f'#fm-mmse-{key}-{value}').check()
     assert page.locator('#fm-mmse-score').inner_text()=='總分：30 / 30';mmse_note=page.locator('#fm-mmse-preview').input_value();assert '總分：30 / 30'in mmse_note
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedClinical=text}}})")
     action('mmse','複製病歷');page.wait_for_function('window.copiedClinical!==undefined');assert page.evaluate('window.copiedClinical')==mmse_note
     switch('mse');assert note.input_value()==expected;action('mse','Copy chart note');page.wait_for_function('window.copiedClinical.startsWith("Mental Status Exam")');assert page.evaluate('window.copiedClinical')==expected
     # Real OS clipboard in Chromium, isolated test context; no patient data.
     if engine=='chromium':
      context.grant_permissions(['clipboard-read','clipboard-write']);page.evaluate("delete navigator.clipboard");action('mse','Copy chart note');page.wait_for_function("async expected=>(await navigator.clipboard.readText()).replace(/\\r\\n/g,'\\n')===expected",arg=expected)
     if width<761:page.locator('#fm-menu-toggle').click()
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}})")
     action('mse','Copy chart note');assert page.evaluate("document.activeElement.id==='fm-mse-preview'&&document.activeElement.selectionEnd===document.activeElement.value.length")
     # Wheel over the content scrolls it; the sidebar stays fixed.
     page.locator('.fm-content').evaluate('n=>n.scrollTop=0');before=page.locator('.fm-content').evaluate('n=>n.scrollTop');page.locator('#fm-mse').hover(position={'x':30,'y':100});page.mouse.wheel(0,600);page.wait_for_timeout(250);assert page.locator('.fm-content').evaluate('n=>n.scrollTop')>before
     dismiss=lambda d:d.dismiss();page.on('dialog',dismiss);action('mse','Clear MSE');assert note.input_value()==expected
     page.remove_listener('dialog',dismiss);page.on('dialog',lambda d:d.accept());action('mse','Clear MSE');assert note.input_value()==''
     switch('mmse');assert page.locator('#fm-mmse-preview').input_value()==mmse_note
     switch('bsrs');assert slider.input_value()=='2'
     switch('mse');page.locator('.fm-content').evaluate('n=>n.scrollTop=0');assert page.locator('#fm-mse').evaluate('n=>n.scrollWidth<=n.clientWidth+1')
     if engine=='chromium':page.screenshot(path=str(output/f'mse-{width}.png'));switch('mmse');page.screenshot(path=str(output/f'mmse-{width}.png'))
     assert not errors,errors;print(engine,width,'clinical selection / exact copy / clipboard fallback / scoped clear / preserved drafts / scrolling PASS',flush=True);context.close()
    browser.close()
 finally:
  if server:server.shutdown()
if __name__=='__main__':main()
