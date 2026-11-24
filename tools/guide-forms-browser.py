"""Check the guide appendix questionnaires on the 表單 tab: render, tick, type, score, scoped reset, sync-safe IME."""
from pathlib import Path
import argparse,functools,http.server,json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/guide-forms'));args=parser.parse_args();server=None
 if args.url:base=args.url.rstrip('/')+'/'
 else:
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 data=json.loads((ROOT/'forms/guide-forms.json').read_text(encoding='utf8'));out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     mobile=width<761
     page=browser.new_page(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce',has_touch=mobile);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.on('dialog',lambda d:d.accept())
     page.goto(base+'#forms',wait_until='domcontentloaded');page.locator('#fm-nmq').wait_for(state='attached')
     def switch(id):
      if not page.locator('#fm-tab-'+id).is_visible():page.locator('#fm-menu-toggle').click()
      page.locator('#fm-tab-'+id).click();assert page.locator('#fm-'+id).is_visible()
     def action(name):
      button=page.locator('.fm-actions .fm-footer:visible').get_by_role('button',name=name,exact=True)
      if mobile and not button.is_visible():page.locator('#fm-menu-toggle').click()
      button.click()
      if mobile and page.locator('#fm-menu-toggle').get_attribute('aria-expanded')=='true':page.locator('#fm-menu-toggle').click()
     def tick(section,label,nth=0):
      box=page.locator(f'#fm-{section} input[aria-label="{label}"]').nth(nth);box.evaluate('n=>n.scrollIntoView({block:"center"})');target=box.locator('..');(target.tap() if mobile else target.click());return box
     def saved(id):return json.loads(page.evaluate(f"()=>ScholarStorage.getItem('scholar-form-guide-{id}-v1')||'{{}}'"))
     # Existing questionnaire answer, used later to prove the new resets are scoped.
     switch('bsrs');page.locator('#fm-bsrs-q1 input[value="2"]').locator('..').click();assert page.locator('#fm-bsrs-q1 input:checked').count()==1
     for form in data['forms']:
      id=form['id'];switch(id);section=page.locator('#fm-'+id)
      assert section.locator('input:checked').count()==0;assert section.locator('h1').inner_text()==form['subtitle']
      assert section.evaluate('n=>n.scrollWidth<=n.clientWidth+1'),id+' overflows';assert page.locator('.fm-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1')
      for img in section.locator('img').all():img.evaluate('n=>n.scrollIntoView()');page.wait_for_function('n=>n.complete&&n.naturalWidth>0',arg=img.element_handle())
      page.locator('.fm-content').evaluate('n=>n.scrollTop=0')
      if engine=='chromium':page.screenshot(path=str(out/f'{id}-{width}.png'),full_page=False)
     # NMQ: one-of boxes behave like paper (one tick, tick again clears); body grid scoring.
     switch('nmq');male=tick('nmq','男');assert male.is_checked();female=tick('nmq','女');assert female.is_checked() and not male.is_checked();tick('nmq','女');assert not female.is_checked();assert 'sex' not in saved('nmq')
     tick('nmq','是（若否，結束此調查表；若是，請繼續填寫下列表格。）')
     def part(key,value):
      r=page.locator(f'#fm-nmq-part-{key} input[value="{value}"]');r.evaluate('n=>n.scrollIntoView({block:"center"})');lab=r.locator('..');(lab.tap() if mobile else lab.click());assert r.is_checked()
     body=next(b for b in data['forms'][0]['blocks'] if b['type']=='body');keys=[k for k,_ in body['left']+body['right']]
     assert page.locator('#fm-nmq .fg-body-row').count()==15;assert page.locator('#fm-nmq .fg-body-row input[type=radio]').count()==90
     part('neck',3);action('完成作答');result=page.locator('#fm-nmq .fm-result');assert '頸 3 分' in result.inner_text();assert '疑似有危害' in result.inner_text()
     page.locator('#fm-nmq .fg-small').click();assert page.locator('#fm-nmq .fg-body-row input:checked').count()==0
     for k in keys:part(k,2)
     action('完成作答');assert '符合無危害' in result.inner_text(),result.inner_text()
     # Typing Chinese in a blank, then switching forms, keeps the text and the draft.
     field=page.locator('#fm-nmq .fg-line .fg-field').first;field.evaluate('n=>n.scrollIntoView({block:"center"})');field.click();page.keyboard.insert_text('臺大醫院');assert saved('nmq')['company']=='臺大醫院'
     if engine=='chromium':
      # IME composition must not be saved until committed.
      cdp=page.context.new_cdp_session(page);other=page.locator('#fm-nmq .fg-grid .fg-field').first;other.click();cdp.send('Input.imeSetComposition',{'text':'ㄅ','selectionStart':1,'selectionEnd':1});assert 'site' not in saved('nmq');cdp.send('Input.insertText',{'text':'北'});assert saved('nmq')['site']=='北',saved('nmq')
     switch('skin');switch('nmq');assert page.locator('#fm-nmq .fg-line .fg-field').first.input_value()=='臺大醫院'
     # Burnout: all (3) gives personal 50, which sits on two guide bands and is flagged.
     switch('burnout')
     for i in range(1,7):tick('burnout','(3)有時候',i-1)
     action('完成作答');text=page.locator('#fm-burnout .fm-result').inner_text();assert '50 分' in text and '請人工判讀' in text,text;assert '工作相關過勞' in text and '未完成' in text
     for i in range(4,8):tick('burnout','(5)從未或幾乎從未',6+i-4)
     for i in range(1,4):tick('burnout','(5)非常輕微',i-1)
     action('完成作答');text=page.locator('#fm-burnout .fm-result').inner_text();assert '輕微' in text and '未完成' not in text,text
     # Unscored forms keep ticks and text; reset clears only its own form.
     switch('skin');tick('skin','有');page.locator('#fm-skin textarea').first.fill('洗手乳');assert saved('skin')['glove']=='yes'
     switch('maternal');tick('maternal','高血壓');assert saved('maternal')['pmh_htn'] is True
     switch('overload');tick('overload','白班');page.locator('#fm-overload input[aria-label="4.血壓"]').fill('128');assert saved('overload')['sbp']=='128'
     switch('skin');action('清除本份');assert saved('skin')=={};assert page.locator('#fm-skin input:checked').count()==0
     assert saved('maternal')['pmh_htn'] is True;assert saved('overload')['sh_day'] is True;assert saved('nmq')['company']=='臺大醫院';assert saved('burnout')['p1']=='3'
     switch('bsrs');assert page.locator('#fm-bsrs-q1 input:checked').count()==1
     # 複製結果: guide form and an existing questionnaire, clipboard then fallback box.
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text}}})")
     action('複製結果');page.wait_for_function('window.copied');assert page.evaluate('window.copied').startswith('BSRS-5（簡式健康量表）\n1. ');assert '已複製' in page.evaluate("[...document.querySelectorAll('.fm-actions .fm-footer')].find(f=>!f.hidden).querySelector('.fm-progress').textContent")
     switch('burnout');action('複製結果');page.wait_for_function("window.copied.startsWith('過勞量表')");assert '個人相關過勞：50 分' in page.evaluate('window.copied')
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}})")
     switch('overload');action('複製結果');box=page.locator('#fm-overload .fm-copy-fallback');box.wait_for();assert '4.血壓 128' in box.input_value();tick('overload','夜班');assert page.locator('#fm-overload .fm-copy-fallback').count()==0
     switch('skin');assert page.evaluate("[...document.querySelectorAll('.fm-actions .fm-footer')].find(f=>!f.hidden).querySelector('.fm-copy').disabled")
     assert not errors,errors;page.close();print(engine,width,'5 guide forms render / one-of boxes / NMQ grid and 表1 rows / burnout bands / text drafts / scoped reset PASS',flush=True)
    browser.close()
 finally:
  if server:server.shutdown()
if __name__=='__main__':main()
