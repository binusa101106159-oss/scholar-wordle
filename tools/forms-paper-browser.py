"""Check paper-style choices, original grouping, saved answers and scoring."""
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
 catalog=json.loads((ROOT/'forms/data.json').read_text(encoding='utf8'));aaos=json.loads((ROOT/'calculator/aaos.json').read_text(encoding='utf8'));out=ROOT/'.local/forms-paper';out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce',has_touch=width<761);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(base+'#forms',wait_until='domcontentloaded');page.locator('#fm-bsrs input[type=radio]').first.wait_for(state='attached');page.on('dialog',lambda d:d.accept())
     def switch(id):
      if not page.locator('#fm-tab-'+id).is_visible():page.locator('#fm-menu-toggle').click()
      page.locator('#fm-tab-'+id).click()
     def action(id,name):
      button=page.locator('.fm-actions .fm-footer:visible').get_by_role('button',name=name,exact=True)
      if width<761 and not button.is_visible():page.locator('#fm-menu-toggle').click()
      page.locator('.fm-actions .fm-footer:visible').get_by_role('button',name=name,exact=True).click()
      if width<761 and page.locator('#fm-menu-toggle').get_attribute('aria-expanded')=='true':page.locator('#fm-menu-toggle').click()
     def choose(id,index,value):
      label=page.locator(f'#fm-{id}-q{index} input[value="{value}"]').locator('..');label.evaluate('n=>n.scrollIntoView({block:"center"})');(label.tap() if width<761 else label.click());assert page.locator(f'#fm-{id}-q{index} input:checked').input_value()==str(value)
     for form in catalog['forms']:
      id=form['id'];switch(id);section=page.locator('#fm-'+id);assert section.locator('input[type=range],.fm-slider,.fm-start-dots').count()==0;assert section.locator('input:checked').count()==0;assert section.locator('input[type=radio]').count()==sum(len(q['options']) for q in form['questions'])
      assert section.locator('.fm-paper-instructions').inner_text()==form['intro']
      for i,q in enumerate(form['questions'],1):
       row=page.locator(f'#fm-{id}-q{i}');assert q['text'] in row.inner_text()
       for option in q['options']:assert row.locator(f'input[value="{option["value"]}"]').count()==1
       if id=='pdq':assert row.locator('.fm-paper-anchor').all_inner_texts()==q['anchors'];assert row.locator('.fm-paper-numbers .fm-paper-number').count()==11
      if id in ['bsrs','quickdash','aaos']:assert section.locator('.fm-paper-table').count()=={'bsrs':1,'quickdash':5,'aaos':3}[id]
      if id=='aaos':assert section.locator('#fm-aaos-q6 .fm-paper-statements .fm-paper-statement').count()==7
      # Submit unanswered: focus first question, don't invent a default answer.
      action(id,'完成作答');assert section.locator('input:checked').count()==0;assert page.locator(':focus').get_attribute('name')=='q1';assert section.locator('.fm-result').is_hidden()
      chosen=[]
      for i,q in enumerate(form['questions'],1):
       value=0 if id=='bsrs' else 1 if id=='aaos' else q['options'][-1]['value'];choose(id,i,value);chosen.append(value)
      action(id,'完成作答');expected={'bsrs':'0 / 20','quickdash':'100 / 100','aaos':'100 / 100','pdq':'150 / 150'}[id];assert section.locator('.fm-total').inner_text()==expected
      if id=='bsrs':
       choose(id,6,4);action(id,'完成作答');assert section.locator('.fm-total').inner_text()=='0 / 20';assert '4 分' in section.locator('.fm-result').inner_text()
       radio=page.locator('#fm-bsrs-q1 input:checked');radio.focus();radio.press('ArrowRight');assert page.locator('#fm-bsrs-q1 input:checked').input_value()=='1';choose(id,1,0)
      if id=='quickdash':
       for n in [11,10]:
        clear=page.locator(f'#fm-quickdash-q{n} .fm-paper-clear');clear.evaluate('n=>n.scrollIntoView({block:"center"})');clear.click();action(id,'完成作答')
        if n==11:assert section.locator('.fm-total').inner_text()=='100 / 100';assert '第 11 題' in section.locator('.fm-result').inner_text()
        else:assert section.locator('.fm-result').is_hidden()
       choose(id,10,5);choose(id,11,5)
      if id=='aaos':
       choose(id,6,7);assert '我完全無法移動' in page.locator('#fm-aaos-q6 input:checked').get_attribute('aria-label');action(id,'完成作答');expected=page.evaluate('data=>ScholarQuestionnaireScores.scoreAAOS([1,1,1,1,1,7,1],data).displayScore',aaos);assert section.locator('.fm-total').inner_text()==str(expected)+' / 100'
      if id=='pdq':choose(id,1,0);action(id,'完成作答');assert section.locator('.fm-total').inner_text()=='140 / 150'
      # All answer targets are present, source question/option text unchanged, no clipping.
      assert section.evaluate('n=>n.scrollWidth<=n.clientWidth+1');assert page.locator('.fm-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1')
      if engine=='chromium':
       page.locator('.fm-content').evaluate('n=>n.scrollTop=0');page.screenshot(path=str(out/f'{id}-{width}.png'))
     # Switching and clearing a single questionnaire cannot clear the other three.
     switch('quickdash');action('quickdash','清除本份');assert page.locator('#fm-quickdash input:checked').count()==0;assert page.locator('#fm-bsrs input:checked').count()==6;assert page.locator('#fm-aaos input:checked').count()==7;assert page.locator('#fm-pdq input:checked').count()==15
     # Actual wheel scrolling works while cursor is over a question in the middle.
     switch('pdq');page.locator('.fm-content').evaluate('n=>n.scrollTop=0');box=page.locator('.fm-content').bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.wheel(0,500);page.wait_for_timeout(150);assert page.locator('.fm-content').evaluate('n=>n.scrollTop')>0
     assert not errors,errors;page.close()
     # Load numeric draft codes saved by the old slider UI (including 0 and AAOS 7).
     page=browser.new_page(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce',has_touch=width<761);page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(base+'#calculator',wait_until='domcontentloaded');page.locator('#ca-number-input').wait_for();page.evaluate("()=>{ScholarStorage.setItem('scholar-form-bsrs-v1',JSON.stringify({q1:0,q2:4,submitted:false}));ScholarStorage.setItem('scholar-form-aaos-v1',JSON.stringify({q6:7}));location.hash='forms'}");page.locator('#fm-bsrs-q1 input[value="0"]').wait_for(state='attached');assert page.locator('#fm-bsrs-q1 input[value="0"]').is_checked();assert page.locator('#fm-bsrs-q2 input[value="4"]').is_checked();assert page.locator('#fm-bsrs-q3 input:checked').count()==0;assert page.locator('#fm-aaos-q6 input[value="7"]').is_checked();page.close();print(engine,width,'paper matrices / 39 questions / pointer-keyboard / scores / missing-item guards / scoped reset / old drafts / middle wheel PASS',flush=True)
    browser.close()
 finally:
  if server:server.shutdown()
if __name__=='__main__':main()
