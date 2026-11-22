"""Open every AMA attachment individually; keep per-item evidence, not totals only.

Screenshots and diagnostic data stay local. This complements labels-review.py's
source-character and SVG checks by exercising the actual public popup path.
"""
from pathlib import Path
import argparse,functools,http.server,json,re,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

METRICS=r'''body=>{
 const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden';};
 const cells=[...body.querySelectorAll('td,th')],overflow=[];
 for(const cell of cells){
  if(cell.closest('.ax-source-table'))continue;
  const r=cell.getBoundingClientRect();
  for(const p of cell.querySelectorAll('p')){
   const range=document.createRange();range.selectNodeContents(p);
   for(const b of range.getClientRects())if(b.width&&b.height&&(b.left<r.left-3||b.right>r.right+3||b.top<r.top-3||b.bottom>r.bottom+3)){
    overflow.push({cell:cells.indexOf(cell),text:p.textContent.slice(0,140),dx:Math.max(r.left-b.left,b.right-r.right),dy:Math.max(r.top-b.top,b.bottom-r.bottom)});break;
   }
  }
 }
 const broken=[...body.querySelectorAll('img')].filter(n=>!n.complete||!n.naturalWidth).map(n=>n.src);
 const opaqueOverlays=[...body.querySelectorAll('.ax-positioned-cell>svg,.ax-source-grid>svg')].filter(n=>!['transparent','rgba(0, 0, 0, 0)'].includes(getComputedStyle(n).backgroundColor)).map(n=>n.parentElement.className);
 const ids=new Set([...body.querySelectorAll('[id]')].map(n=>n.id)),missing=[];
 for(const n of body.querySelectorAll('svg *'))for(const a of n.attributes){
  const refs=[...a.value.matchAll(/url\(\s*['"]?#([^\s)'" ]+)['"]?\s*\)/g)].map(m=>m[1]);
  if(a.localName==='href'&&a.value.startsWith('#'))refs.push(a.value.slice(1));
  for(const id of refs)if(!ids.has(id))missing.push(id);
 }
 const scrolls=[body,...body.querySelectorAll('*')].filter(n=>n.clientWidth>0&&n.clientHeight>0&&(/auto|scroll/.test(getComputedStyle(n).overflowX+getComputedStyle(n).overflowY))&&(n.scrollWidth>n.clientWidth+4||n.scrollHeight>n.clientHeight+4)).map(n=>{n.scrollLeft=n.scrollWidth;n.scrollTop=n.scrollHeight;return {class:n.className,width:n.scrollWidth,viewWidth:n.clientWidth,height:n.scrollHeight,viewHeight:n.clientHeight,x:n.scrollLeft,y:n.scrollTop};});
 return {textLength:body.textContent.length,visibleText:body.innerText.length,tables:[...body.querySelectorAll('table')].map(t=>({rows:t.rows.length,cells:t.querySelectorAll('td,th').length})),scrolls,
  contentWidth:Math.max(body.scrollWidth,...[...body.querySelectorAll('.ax-table-wrap,.ax-source-object,.ax-form-figure,.ax-ca-sheet,table')].map(n=>n.scrollWidth)),
  art:[...body.querySelectorAll('svg')].filter(n=>!n.closest('defs')).map(n=>({visible:visible(n),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),
  broken,missing,overflow,opaqueOverlays,scrollWidth:body.scrollWidth,clientWidth:body.clientWidth,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight};
}'''

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',default='chromium,firefox,webkit');parser.add_argument('--widths',default='1440,390');parser.add_argument('--screenshots',action='store_true');parser.add_argument('--url');parser.add_argument('--ids');args=parser.parse_args()
 output=ROOT/('.local/ama-popup-audit-live'if args.url else'.local/ama-popup-audit');output.mkdir(parents=True,exist_ok=True)
 chapters=[json.loads((ROOT/f'ama/c{n:02}.json').read_text(encoding='utf8'))for n in range(1,18)]+[json.loads((ROOT/'ama/california.json').read_text(encoding='utf8'))]
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/'
 if args.url:url=args.url.rstrip('/')+'/'
 records=[]
 try:
  with sync_playwright()as p:
   for engine in args.engines.split(','):
    browser=getattr(p,engine).launch()
    for width in map(int,args.widths.split(',')):
     context=browser.new_context(viewport={'width':width,'height':1100},service_workers='block',reduced_motion='reduce')
     page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda route:route.abort())
     page.goto(url+'#ama');page.locator('.ax-page').first.wait_for()
     preview=context.new_page()if args.screenshots and engine=='chromium'and width==1440 else None
     head=re.sub(r'<script\b[^>]*>.*?</script>','',page.locator('head').inner_html(),flags=re.S|re.I)
     for chapter in chapters:
      page.locator('#ax-tab-'+chapter['id']).dispatch_event('click');scope=page.locator('#ax-table-rail'if width==1440 else'#ax-table-shortcuts')
      for item in chapter['attachments']:
       if args.ids and item['id']not in args.ids.split(','):continue
       result={'engine':engine,'width':width,'chapter':chapter['id'],'id':item['id'],'label':item['label'],'page':item['page'],'kind':item['kind'],'issues':[]}
       try:
        if item['kind']in ['table','figure']:
         scope.get_by_role('tab',name='Table'if item['kind']=='table'else'Figure',exact=True).click()
         shortcut=scope.locator('[data-table-open="'+item['id']+'"]');shortcut.wait_for();caption=shortcut.locator('.reader-table-caption');result['caption']=caption.inner_text()if caption.count()else shortcut.get_attribute('title')or shortcut.inner_text()
         if not result['caption'].strip():result['issues'].append('empty caption')
         shortcut.click()
        else:
         page.locator('#ax-body [data-open="'+item['id']+'"]').first.dispatch_event('click');result['caption']=item['label']
        page.locator('#ax-dialog[open]').wait_for();body=page.locator('#ax-dialog-body')
        if body.locator('[data-form-view="source"]').count():body.locator('[data-form-view="source"]').click()
        body.locator('svg').evaluate_all('nodes=>nodes.forEach(n=>n.style.contentVisibility="visible")')
        result.update(body.evaluate(METRICS))
        result['svgImages']=body.evaluate('''async body=>Promise.all([...body.querySelectorAll('svg image')].map(node=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({loaded:true,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve({loaded:false});image.src=node.getAttribute('href')||node.getAttribute('xlink:href');})))''')
        if any(not image['loaded']for image in result['svgImages']):result['issues'].append('broken SVG image')
        if item['id']=='ap16-A'and body.locator('.ax-source-object').count()!=1:result['issues'].append('appendix art and labels detached')
        if result['textLength']<10:result['issues'].append('empty popup')
        for key in ['broken','missing','overflow','opaqueOverlays']:
         if result[key]:result['issues'].append(key)
        for scroller in result['scrolls']:
         if scroller['width']-scroller['viewWidth']-scroller['x']>4 or scroller['height']-scroller['viewHeight']-scroller['y']>4:result['issues'].append('unreachable nested scroll edge')
        # Traverse both scroll axes to prove the far edges are reachable.
        body.evaluate('e=>{e.scrollTop=e.scrollHeight;e.scrollLeft=e.scrollWidth;}')
        result['end']=body.evaluate('e=>({x:e.scrollLeft,y:e.scrollTop})')
        if result['scrollWidth']>result['clientWidth']+4 and result['end']['x']<result['scrollWidth']-result['clientWidth']-4:result['issues'].append('unreachable right edge')
        if result['scrollHeight']>result['clientHeight']+4 and result['end']['y']<result['scrollHeight']-result['clientHeight']-4:result['issues'].append('unreachable bottom edge')
        if preview:
         # Evidence uses the same rendered DOM and styles, expanded only to
         # expose all scroll content. Actual viewport metrics above are intact.
         html=body.inner_html();capture_width=max(1000,result['contentWidth'])
         preview.set_viewport_size({'width':capture_width+4,'height':1100})
         preview.set_content('<html><head><base href="'+url+'">'+head+'</head><body><main id="ama-panel"><div id="ax-dialog-body" class="ax-dialog-body">'+html+'</div></main><style>html,body,#ama-panel{margin:0;padding:0;background:#151b23;overflow:visible!important;height:auto!important}#ax-dialog-body{color:var(--ax-ink);width:'+str(capture_width+40)+'px;max-height:none!important;height:auto!important;overflow:visible!important;content-visibility:visible!important}#ax-dialog-body .ax-table-wrap,#ax-dialog-body .ax-ca-scroll{overflow:visible!important}#ax-dialog-body *{content-visibility:visible!important}</style></body></html>')
         preview.locator('#ax-dialog-body').screenshot(path=str(output/(item['id']+'.png')),timeout=60000)
        page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden')
       except Exception as e:
        result['issues'].append(str(e)[:500]);page.locator('#ax-dialog-close').dispatch_event('click');page.locator('#ax-dialog').wait_for(state='hidden')
       records.append(result);print(engine,width,item['id'],'PASS'if not result['issues']else result['issues'],flush=True)
       (output/f'results-{engine}-{width}.json').write_text(json.dumps([r for r in records if r['engine']==engine and r['width']==width],ensure_ascii=False,indent=2),encoding='utf8')
     assert not errors,errors
     context.close()
    browser.close()
 finally:server.shutdown()
 print('TOTAL',len(records),'ISSUES',sum(bool(r['issues'])for r in records),flush=True)
 if any(r['issues']for r in records):raise SystemExit(1)
if __name__=='__main__':main()
