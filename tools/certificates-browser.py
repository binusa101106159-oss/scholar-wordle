"""Exercise purpose navigation, every template, editable copy and blank resets."""
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
 data=json.loads((ROOT/'certificates/templates.json').read_text(encoding='utf8'))
 try:
  with sync_playwright()as p:
   for name in args.engines:
    browser=getattr(p,name).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(base+'#certificates',wait_until='domcontentloaded');page.locator('#dc-output').wait_for();assert page.title()=='診斷書 · Scholar';assert page.locator('#game-tab-certificates').get_attribute('aria-selected')=='true';assert page.locator('#dc-categories [role=tab]').count()==6
     page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.certificateCopy=text}})")
     for category in data['categories']:
      page.locator('#dc-categories').get_by_role('tab',name=category,exact=True).click();templates=[t for t in data['templates'] if t['category']==category];assert page.locator('#dc-template-list button').count()==len(templates)
      for template in templates:
       page.locator('[data-template="'+template['id']+'"]').click();assert page.locator('#dc-title').inner_text()==template['title'];assert page.locator('#dc-output').input_value().count('＿＿＿＿')>0
       for field in page.locator('#dc-fields [data-variable]').all():assert field.input_value()==''
       first=page.locator('#dc-fields [data-variable]').first;first.fill('測試值');before=page.locator('#dc-output').input_value();assert '測試值' not in before;page.locator('#dc-generate').evaluate('n=>n.scrollIntoView({block:"center"})');page.locator('#dc-generate').click();assert '測試值' in page.locator('#dc-output').input_value();assert first.input_value()=='測試值'
       page.locator('#dc-output').fill('自行編輯內容，測試複製。');page.locator('#dc-copy').click();page.wait_for_function('window.certificateCopy==="自行編輯內容，測試複製。"');assert first.input_value()=='測試值'
       # Switching away and back preserves both edited output and form inputs.
       other=next((t for t in templates if t['id']!=template['id']),None)
       if other:page.locator('[data-template="'+other['id']+'"]').click();page.locator('[data-template="'+template['id']+'"]').click();assert first.input_value()=='測試值';assert page.locator('#dc-output').input_value()=='自行編輯內容，測試複製。'
       page.locator('#dc-reset').click();assert first.input_value()=='';assert '＿＿＿＿' in page.locator('#dc-output').input_value()
     # Repeated percentage variables share one input and fill every occurrence.
     page.locator('#dc-categories').get_by_role('tab',name='陳秉暉醫師',exact=True).click();page.locator('[data-template=t14]').click();page.locator('[data-variable="校正後損傷比"]').fill('23');page.locator('#dc-generate').evaluate('n=>n.scrollIntoView({block:"center"})');page.locator('#dc-generate').click();assert page.locator('#dc-output').input_value().count('百分之23')==2
     # Typing stays in this page; tab switching preserves the draft, direct reload is blank.
     page.locator('#dc-output').fill('保留手動內容 abc');page.locator('#game-tab-forms').click();page.locator('#fm-bsrs').wait_for();page.locator('#game-tab-certificates').click();assert page.locator('#dc-output').input_value()=='保留手動內容 abc';assert page.locator('#forms-panel').is_hidden();assert page.locator('#wordle-toolbar').is_hidden()
     assert page.locator('#certificates-panel').evaluate('n=>n.scrollWidth<=n.clientWidth+1');assert page.locator('.dc-columns').evaluate('n=>n.scrollWidth<=n.clientWidth+1')
     if name=='chromium':
      out=ROOT/'.local/certificates';out.mkdir(parents=True,exist_ok=True);page.locator('#dc-categories').get_by_role('tab',name='朱醫師',exact=True).click();page.screenshot(path=str(out/f'page-{width}.png'),full_page=True)
     page.evaluate("()=>{const ids=[...document.querySelectorAll('#scholar-game-tabs>.sg-tab')].filter(n=>!n.hidden&&n.id!=='game-tab-certificates').map(n=>n.id);localStorage.setItem('scholar-tab-order-v1',JSON.stringify(ids));}")
     page.reload(wait_until='domcontentloaded');page.locator('#dc-output').wait_for();assert page.locator('#scholar-game-tabs>.sg-tab:visible').last.get_attribute('id')=='game-group-button';assert page.locator('#dc-fields [data-variable]').first.input_value()=='';assert not errors,errors;print(name,width,'all templates / purpose categories / blank fields / explicit generate / editable copy / retained drafts / reset / navigation PASS',flush=True);page.close()
    browser.close()
 finally:
  if server:server.shutdown()
if __name__=='__main__':main()
