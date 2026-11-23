"""Check every page/object for offset preservation and visible word repair."""
from pathlib import Path
import argparse,functools,http.server,json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',default='chromium');parser.add_argument('--url');parser.add_argument('--public-only',action='store_true');args=parser.parse_args();output=ROOT/'.local/ama-hyphen-current';output.mkdir(exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=args.url or f'http://127.0.0.1:{server.server_port}/'
 source=(ROOT/'ama/ama.js').read_text(encoding='utf8');helpers=source[source.index('  const CHAPTER_MARK='):source.index('  function textNodes(')]
 results=[]
 try:
  with sync_playwright()as p:
   for engine in args.engines.split(','):
    browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':1440,'height':1000},service_workers='block');page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(base.rstrip('/')+'/#ama');page.locator('.ax-page').first.wait_for()
    if not args.url and not args.public_only:
     page.evaluate('()=>{'+helpers+'''window.auditHyphens=items=>items.map(item=>{
      const root=document.createElement('div');root.innerHTML=item.html;const before=root.textContent,anchors=[...root.querySelectorAll('[id]')].map(n=>n.id),old=[...root.querySelectorAll('.ax-soft-break')];repairHyphens(root);
      const after=root.textContent,now=new Set([...root.querySelectorAll('[id]')].map(n=>n.id));const copy=readableCopy(root.cloneNode(true));
      const remains=[];for(const cell of copy.querySelectorAll('td,th,p,h1,h2,h3,h4,svg text'))if(hyphenEdits(cell.textContent).length)remains.push(cell.textContent.slice(0,160));
      return {...item,html:undefined,preserved:before===after,missingAnchors:anchors.filter(id=>!now.has(id)),fixed:[...root.querySelectorAll('.ax-soft-break')].filter(n=>!old.includes(n)).length,restored:old.filter(n=>!n.classList.contains('ax-soft-break')).length,remaining:remains};
     });}''')
     for file in sorted((ROOT/'ama').glob('c*.json')):
      data=json.loads(file.read_text(encoding='utf8'));items=[{'chapter':data['id'],'kind':kind,'id':o.get('id',str(o['page'])),'page':o['page'],'html':o['html']}for kind,objects in [('page',data['pages']),('object',data['attachments'])]for o in objects]
      rows=page.evaluate('items=>auditHyphens(items)',items);[r.update(engine=engine)for r in rows];results.extend(rows);print(engine,data['id'],'objects',len(rows),'new spans',sum(r['fixed']for r in rows),'remaining',sum(len(r['remaining'])for r in rows),flush=True)
     (output/f'browser-{engine}.json').write_text(json.dumps([r for r in results if r['engine']==engine],ensure_ascii=False,indent=2),encoding='utf8')
     assert all(r['preserved']and not r['missingAnchors']for r in results),'source offsets/anchors changed'
     assert not any(r['remaining']for r in results),'unhandled approved splits'
    # Original public reader path: the reported phrase, clipboard, and search.
    page.locator('#ax-tab-c15').dispatch_event('click');page.locator('#ax-body #ax-page-408').wait_for(state='attached');page.locator('#ax-page-408').scroll_into_view_if_needed();page.wait_for_function("document.getElementById('ax-page-408')?.innerText.includes('palpatory')")
    assert 'palpa-tory'not in page.locator('#ax-page-408').inner_text();assert 'palpatory'in page.locator('#ax-page-408').inner_text()
    page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.hyphenCopy=text}}})");page.locator('#ax-copy-chapter').dispatch_event('click');page.wait_for_function('window.hyphenCopy!==undefined');text=page.evaluate('window.hyphenCopy');assert 'palpa-tory'not in text and 'docu-mented'not in text and 'sup-ported'not in text;assert 'palpatory'in text and 'documented'in text and 'supported'in text
    page.locator('#ax-chapter-query').fill('palpatory');page.locator('#ax-chapter-query').press('Enter');page.locator('#ax-chapter-results .ax-result').first.wait_for();assert page.locator('#ax-chapter-results .ax-result').count()>0
    page.locator('#ax-body [data-open="t15-8"]').first.dispatch_event('click');page.locator('#ax-dialog[open]').wait_for();assert 'Moderate palpatory findings' in page.locator('#ax-dialog-body').inner_text()
    selection=page.evaluate('''()=>{const cell=[...document.querySelectorAll('#ax-dialog-body td')].find(n=>n.textContent.includes('Moderate palpa'));const range=document.createRange();range.selectNodeContents(cell);getSelection().removeAllRanges();getSelection().addRange(range);const data={},event=new Event('copy',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{setData:(kind,value)=>data[kind]=value}});cell.dispatchEvent(event);getSelection().removeAllRanges();return data['text/plain']||'';}''');assert 'palpatory' in selection and 'documented' in selection and 'supported' in selection;assert 'palpa-tory'not in selection
    page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden')
    page.set_viewport_size({'width':390,'height':950});page.locator('#ax-page-408').scroll_into_view_if_needed();page.wait_for_function("document.getElementById('ax-page-408')?.innerText.includes('palpatory')");assert 'palpa-tory'not in page.locator('#ax-page-408').inner_text()
    page.locator('#ax-page-408').screenshot(path=str(output/f'{engine}-page408.png'));print(engine,'public display/copy/search PASS',flush=True);browser.close()
 finally:server.shutdown()
 print('TOTAL',len(results),'FIXED',sum(r['fixed']for r in results),flush=True)
if __name__=='__main__':main()
