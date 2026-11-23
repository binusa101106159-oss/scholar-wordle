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
     switch('mse');assert page.locator('#fm-mse input:not([type=checkbox]),#fm-mse textarea,#fm-mse h1,#fm-mse .fm-clinical-credit').count()==0
     page.locator('#fm-mse-appearance-0').check();page.locator('#fm-mse-speech-0').check();page.locator('#fm-mse-speech-2').check();assert not page.locator('#fm-mse-speech-0').is_checked()
     page.locator('#fm-mse-orientation-1').check();page.locator('#fm-mse-orientation-4').check();page.locator('#fm-mse-insight-0').check();page.locator('#fm-mse-insight-2').check();assert not page.locator('#fm-mse-insight-0').is_checked()
     expected='Mental Status Exam\nObservations\nAppearance: Neat\nSpeech: Pressured\n\nCognition\nOrientation Impairment: Place, Time\n\nInsight\nInsight: Poor'
     # Other questionnaire answers survive clinical clears and switches.
     switch('bsrs');answer=page.locator('#fm-bsrs-q1 input[value="2"]');answer.locator('..').click();switch('mmse')
     assert page.locator('#fm-mmse textarea,#fm-mmse input:not([type=checkbox]),#fm-mmse .fm-clinical-credit,#fm-mmse h1').count()==0
     page.wait_for_function("document.querySelector('.fm-mmse-source')?.complete&&document.querySelector('.fm-mmse-source')?.naturalWidth===840")
     assert page.locator('.fm-mmse-original-row').count()==11;assert page.locator('.fm-mmse-source').evaluate('n=>n.complete&&n.naturalWidth==840');assert page.locator('.fm-mmse-original').evaluate('n=>n.getBoundingClientRect().width')>=680
     assert page.locator('#fm-mmse input[type=checkbox]').count()==30;assert page.locator('#fm-mmse input:checked').count()==0
     assert page.locator('#fm-mmse-time-score').inner_text()==''
     page.locator('#fm-mmse-time-zero').click();assert page.locator('#fm-mmse-time-score').inner_text()=='0';assert '不計總分'in page.locator('#fm-mmse-score').inner_text()
     maxima={'time':5,'place':5,'registration':3,'calculation':5,'recall':3,'naming':2,'repetition':1,'reading':1,'writing':1,'command':3,'construction':1}
     for key,value in maxima.items():
      for index in range(value):page.locator(f'#fm-mmse-{key}-tick-{index}').check()
     assert page.locator('#fm-mmse-score').inner_text()=='總分：30 / 30'
     tick=page.locator('#fm-mmse-time-tick-0');tick.uncheck();assert page.locator('#fm-mmse-score').inner_text()=='總分：29 / 30';tick.focus();tick.press('Space');assert page.locator('#fm-mmse-score').inner_text()=='總分：30 / 30'
     page.locator('#fm-mmse-time-zero').click();assert page.locator('#fm-mmse-time-score').inner_text()=='';assert '不計總分'in page.locator('#fm-mmse-score').inner_text()
     page.locator('#fm-mmse-time-zero').click();assert page.locator('#fm-mmse-score').inner_text()=='總分：25 / 30'
     for index in range(5):page.locator(f'#fm-mmse-time-tick-{index}').check()
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedClinical=text}}})")
     action('mmse','複製病歷');page.wait_for_function('window.copiedClinical!==undefined');mmse_note=page.evaluate('window.copiedClinical');assert '總分：30 / 30'in mmse_note and '時間定向：5 / 5'in mmse_note;assert '備註'not in mmse_note;assert page.locator('#fm-mmse textarea').count()==0
     switch('mse');action('mse','Copy result');page.wait_for_function('window.copiedClinical.startsWith("Mental Status Exam")');assert page.evaluate('window.copiedClinical')==expected
     # Real OS clipboard in Chromium, isolated test context; no patient data.
     if engine=='chromium':
      context.grant_permissions(['clipboard-read','clipboard-write']);page.evaluate("delete navigator.clipboard");action('mse','Copy result');page.wait_for_function("async expected=>(await navigator.clipboard.readText()).replace(/\\r\\n/g,'\\n')===expected",arg=expected)
     if width<761:page.locator('#fm-menu-toggle').click()
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}})")
     action('mse','Copy result');assert page.evaluate("document.activeElement.id==='fm-mse-copy-fallback'&&document.activeElement.selectionEnd===document.activeElement.value.length")
     # Wheel over the content scrolls it; the sidebar stays fixed.
     page.locator('.fm-content').evaluate('n=>n.scrollTop=0');before=page.locator('.fm-content').evaluate('n=>n.scrollTop');page.locator('#fm-mse').hover(position={'x':30,'y':100});page.mouse.wheel(0,600);page.wait_for_timeout(250);assert page.locator('.fm-content').evaluate('n=>n.scrollTop')>before
     dismiss=lambda d:d.dismiss();page.on('dialog',dismiss);action('mse','Clear MSE');assert page.locator('#fm-mse-appearance-0').is_checked()
     page.remove_listener('dialog',dismiss);page.on('dialog',lambda d:d.accept());action('mse','Clear MSE');assert page.locator('#fm-mse input:checked,#fm-mse textarea').count()==0
     switch('mmse');assert page.locator('#fm-mmse-score').inner_text()=='總分：30 / 30'
     switch('bsrs');assert answer.is_checked()
     switch('midas');assert page.locator('#fm-midas input').count()==7;assert all(v=='' for v in page.locator('#fm-midas input').evaluate_all('nodes=>nodes.map(n=>n.value)'))
     assert page.locator('#fm-midas-summary').inner_text()=='主項已填 0 / 5 題'
     for index in range(1,6):page.locator(f'#fm-midas-q{index}').fill('0')
     assert page.locator('#fm-midas-summary').inner_text()=='MIDAS：0 分 · 第I級 · 極少或無失能'
     page.locator('#fm-midas-a').fill('90');page.locator('#fm-midas-b').fill('10');assert 'MIDAS：0 分'in page.locator('#fm-midas-summary').inner_text()
     page.locator('#fm-midas-b').fill('11');assert page.locator('#fm-midas-b').get_attribute('aria-invalid')=='true';assert page.locator('.fm-actions').get_by_role('button',name='複製結果',exact=True,include_hidden=True).is_disabled();page.locator('#fm-midas-b').fill('10')
     page.locator('#fm-midas-q5').fill('');assert page.locator('#fm-midas-summary').inner_text()=='主項已填 4 / 5 題';page.locator('#fm-midas-q5').fill('12');assert '第III級'in page.locator('#fm-midas-summary').inner_text()
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedMIDAS=text}}})")
     action('midas','複製結果');page.wait_for_function('window.copiedMIDAS!==undefined');midas_note=page.evaluate('window.copiedMIDAS');assert '總分：12；第III級'in midas_note and '90 天（不計入總分）'in midas_note and '10 / 10（不計入總分）'in midas_note
     if engine=='chromium':
      page.evaluate('delete navigator.clipboard');action('midas','複製結果');page.wait_for_function("async expected=>(await navigator.clipboard.readText()).replace(/\\r\\n/g,'\\n')===expected",arg=midas_note)
     switch('mmse');assert page.locator('#fm-mmse-score').inner_text()=='總分：30 / 30';switch('midas');assert page.locator('#fm-midas-q5').input_value()=='12'
     if width<761 and page.locator('#fm-tab-midas').is_visible():page.locator('#fm-menu-toggle').click()
     page.locator('.fm-content').evaluate('n=>n.scrollTop=0');assert page.locator('#fm-midas').evaluate('n=>n.scrollWidth<=n.clientWidth+1')
     if engine=='chromium':page.screenshot(path=str(output/f'midas-{width}.png'))
     action('midas','清除 MIDAS');assert page.locator('#fm-midas-q5').input_value()=='';assert page.locator('#fm-midas-summary').inner_text()=='主項已填 0 / 5 題'
     switch('bsrs');assert answer.is_checked()
     switch('mse');page.locator('.fm-content').evaluate('n=>n.scrollTop=0');assert page.locator('#fm-mse').evaluate('n=>n.scrollWidth<=n.clientWidth+1')
     if engine=='chromium':page.screenshot(path=str(output/f'mse-{width}.png'));switch('mmse');page.screenshot(path=str(output/f'mmse-{width}.png'))
     assert not errors,errors;print(engine,width,'clinical selection / exact copy / clipboard fallback / scoped clear / preserved drafts / scrolling PASS',flush=True);context.close()
    browser.close()
 finally:
  if server:server.shutdown()
if __name__=='__main__':main()
