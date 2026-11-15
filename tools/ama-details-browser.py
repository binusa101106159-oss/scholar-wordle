"""Verify quick-view headings, example columns, unit conversion and diagnosis labels."""
from pathlib import Path
import functools,http.server,json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 output=ROOT/'.local/ama-details';output.mkdir(parents=True,exist_ok=True)
 data=json.loads((ROOT/'calculator/california.json').read_text(encoding='utf8'));record=next(r for r in data['impairments']if r[2]is not None)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright()as p:
   for engine in ['chromium','firefox','webkit']:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     page=browser.new_page(viewport={'width':width,'height':1100},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.route('https://www.gstatic.com/firebasejs/**',lambda route:route.abort());page.goto(f'http://127.0.0.1:{server.server_port}/#ama');page.locator('.ax-page').first.wait_for();page.locator('#ax-tab-c15').dispatch_event('click')
     if engine=='chromium'and width==1440:
      js=(ROOT/'ama/ama.js').read_text(encoding='utf8');helper=js[js.index('  function layoutExamples('):js.index('  function markSelection(')]
      page.evaluate('()=>{'+helper+'''window.checkExamples=pages=>{const c=document.createElement('div');for(const p of pages){const wrapper=document.createElement('article'),body=document.createElement('div');body.className='ax-page-content';body.innerHTML=p.html;wrapper.append(body);c.append(wrapper);}const before=[...c.children].map(p=>p.textContent),ids=[...c.querySelectorAll('[id]')].map(n=>n.id);layoutExamples(c);if(JSON.stringify(before)!==JSON.stringify([...c.children].map(p=>p.textContent)))throw Error('Example layout changed source text');if(JSON.stringify(ids)!==JSON.stringify([...c.querySelectorAll('[id]')].map(n=>n.id)))throw Error('Example layout changed source ID order');return c.querySelectorAll('.ax-example').length;};}''')
      count=0
      for number in range(1,18):count+=page.evaluate('p=>checkExamples(p)',json.loads((ROOT/f'ama/c{number:02}.json').read_text(encoding='utf8'))['pages'])
      assert count>100,count
      print('All 17 chapters: example wrappers preserve every page text and source ID order; sections',count,flush=True)
     scope=page.locator('#ax-table-rail'if width==1440 else'#ax-table-shortcuts');scope.get_by_role('tab',name='Figure',exact=True).click()
     for number,title in [(16,'Flexion of Thumb MCP Joint'),(17,'Neutral Position of Thumb MCP Joint'),(18,'Thumb Radial Abduction'),(19,'Adduction of Thumb')]:
      assert scope.locator(f'[data-table-open="f15-{number}"] .reader-table-caption').inner_text()==title
     if width==1440:
      bounds=scope.locator('.reader-table-heading').evaluate('e=>[...e.children].map(n=>{const r=n.getBoundingClientRect();return {x:r.left,y:r.top,h:r.height,right:r.right};})')
      assert abs(bounds[0]['y']+bounds[0]['h']/2-bounds[1]['y']-bounds[1]['h']/2)<4 and bounds[1]['x']>=bounds[0]['right'],bounds
     page.locator('#ax-page-query').fill('413');page.locator('#ax-page-search button').click()
     example=page.locator('.ax-example[data-example="15-1"]').first;example.scroll_into_view_if_needed()
     metrics=example.evaluate('''e=>{const cols=[...e.querySelector('.ax-example-columns').children],bounds=cols.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};});const contained=cols.every(col=>{const r=col.getBoundingClientRect();return [...col.querySelectorAll('.ax-example-field')].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1;});});return {bounds,contained};}''')
     assert metrics['contained'] and len(metrics['bounds'])==2,metrics
     if width==1440:assert metrics['bounds'][1]['x']>=metrics['bounds'][0]['right'],metrics
     else:assert metrics['bounds'][1]['y']>=metrics['bounds'][0]['bottom'],metrics
     assert page.locator('#p413-b16-0').evaluate('n=>n.closest(".ax-example-field")===document.querySelector("#p413-b17-0").closest(".ax-example-field")'),'split History paragraphs escaped their field'
     if engine=='chromium':example.screenshot(path=str(output/f'example-{width}.png'))
     page.evaluate('location.hash="calculator"');page.locator('#ic-results [data-unit="WPI"]').wait_for()
     page.locator('#cl-input').fill('1+2');page.locator('#ic-value').fill('45');page.locator('#ic-digit').select_option('little')
     assert page.locator('#ic-results [data-unit="UEI"]').inner_text()=='4%';assert page.locator('#ic-results [data-unit="WPI"]').inner_text()=='2%'
     page.locator('#ic-mode').select_option('stepwise');assert page.locator('#ic-results [data-unit="WPI"]').inner_text()=='3%'
     page.locator('#ic-unit').select_option('LEI');page.locator('#ic-value').fill('1');assert page.locator('#ic-results [data-unit="WPI"]').inner_text()=='1%'
     page.locator('#ic-reset').click();assert page.locator('#cl-input').input_value()=='1+2';assert page.locator('#ic-results [data-unit="WPI"]').inner_text()=='—'
     page.locator('#ca-number-input').fill(record[0]);page.locator('#ca-number-options [role="option"]').first.click()
     assert page.locator('.ca-number #ca-description').inner_text()==record[1];assert page.locator('#ca-description').is_visible();assert page.locator('#ca-number-input').input_value()==record[0]
     assert page.locator('#ca-description').evaluate('e=>{const a=e.getBoundingClientRect(),b=e.closest(".ca-number").getBoundingClientRect();return a.left>=b.left&&a.right<=b.right+1;}')
     if engine=='chromium':
      page.locator('#ca-description').scroll_into_view_if_needed();page.locator('.ca-selectors').screenshot(path=str(output/f'diagnosis-{width}.png'));page.locator('#cl-impairment').screenshot(path=str(output/f'conversion-{width}.png'))
     assert not errors,errors
     print(engine,width,'header tabs / exact figure names / contained example columns / source conversions / selected diagnosis / scoped reset PASS',flush=True);page.close()
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
