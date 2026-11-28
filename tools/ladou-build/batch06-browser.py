"""Exercise batch 26–30 through the real loader, every popup, panel and page."""
from pathlib import Path
import argparse,functools,http.server,json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--engines',default='chromium,firefox,webkit');ap.add_argument('--widths',default='1440,390');ap.add_argument('--url');args=ap.parse_args()
    out=ROOT/'.local/ladou-batch-06/browser';out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((ROOT/'ladou/index.json').read_text('utf8'));reports=[]
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    base=(args.url or f'http://127.0.0.1:{server.server_port}/').rstrip('/')+'/'
    try:
        with sync_playwright()as p:
            for engine in args.engines.split(','):
                print('Launching',engine,flush=True);browser=getattr(p,engine).launch()
                for width in map(int,args.widths.split(',')):
                    page=browser.new_page(viewport={'width':width,'height':950},service_workers='block',reduced_motion='reduce');errors=[]
                    page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort())
                    print('Opening',base,width,flush=True);page.goto(base+'#ladou');page.locator('#ld-chapter-select').wait_for(state='attached')
                    assert page.locator('#ld-chapter-select option').count()==len(manifest['chapters'])
                    for n in range(26,31):
                        ch=f'c{n:02d}';entry=next(c for c in manifest['chapters']if c['id']==ch);data=json.loads((ROOT/entry['file']).read_text('utf8'))
                        print(engine,width,ch,'start',flush=True)
                        if not page.locator('#ld-side').is_visible():page.locator('#ld-menu').click()
                        page.locator('#ld-chapter-select').select_option(ch);page.locator(f'#{ch}-page-1').wait_for(state='attached')
                        assert page.locator('.ld-page').count()==entry['pages'];assert page.locator('#ld-document').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                        for k in ['table','figure']:
                            objects=[o for o in data['objects']if o['kind']==k]
                            if not objects:continue
                            if not page.locator('#ld-rail').is_visible():page.locator('#ld-quick').click()
                            page.locator('#ld-kind-'+k).click()
                            assert page.locator('#ld-object-list [data-ld-object]').count()==len(objects)
                            for o in objects:
                                page.locator(f'#ld-object-list [data-ld-object="{o["id"]}"]').click();page.wait_for_function('document.querySelector("#ld-dialog").open')
                                body=page.locator('#ld-dialog-body');assert body.bounding_box()['height']>=(8 if o['label']=='Reaction (p. 30)' else 80),(o['label'],body.bounding_box())
                                if len(o['title'])>240:assert page.locator('.ld-full-caption').inner_text()==o['title']
                                body.locator('img').evaluate_all('ns=>ns.forEach(im=>im.loading="eager")')
                                page.wait_for_function('[...document.querySelectorAll("#ld-dialog-body img")].every(im=>im.complete&&im.naturalWidth>0)')
                                body.locator('img').evaluate_all('async ns=>{await Promise.all(ns.map(im=>im.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}')
                                assert page.locator('#ld-dialog').evaluate('e=>{let r=e.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1}')
                                # Only intentional native tables may scroll horizontally.
                                if k=='figure':assert body.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                                page.screenshot(path=str(out/f'{engine}-{width}-{o["id"]}.png'))
                                if engine=='chromium' and k=='table':
                                    # Exercise every row/column, including continuation
                                    # rows below the popup viewport and horizontal mobile overflow.
                                    metrics=body.evaluate('e=>({height:e.clientHeight,max:e.scrollHeight-e.clientHeight})')
                                    vertical=list(range(0,int(metrics['max']),max(1,int(metrics['height']*.85))))+[int(metrics['max'])]
                                    wraps=body.locator('.ld-table-wrap')
                                    if not wraps.count():wraps=body
                                    assert wraps.count()==1
                                    horizontal=wraps.evaluate('e=>({width:e.clientWidth,max:e.scrollWidth-e.clientWidth})')
                                    offsets=list(range(0,int(horizontal['max']),max(1,int(horizontal['width']*.85))))+[int(horizontal['max'])]
                                    seen=set();cells=body.locator('th,td').count()
                                    for yi,y in enumerate(vertical):
                                        for xi,x in enumerate(offsets):
                                            body.evaluate('(e,y)=>e.scrollTop=y',y);wraps.evaluate('(e,x)=>e.scrollLeft=x',x)
                                            visible=body.evaluate('async e=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));let b=e.getBoundingClientRect();return [...e.querySelectorAll("th,td")].flatMap((c,i)=>{let r=c.getBoundingClientRect();return r.bottom>b.top&&r.top<b.bottom&&r.right>b.left&&r.left<b.right?[i]:[]})}')
                                            seen.update(visible)
                                            if len(vertical)>1 or len(offsets)>1:page.screenshot(path=str(out/f'{engine}-{width}-{o["id"]}-scroll-{yi}-{xi}.png'))
                                    assert len(seen)==cells,(o['label'],len(seen),cells)
                                    body.evaluate('e=>e.scrollTop=0');wraps.evaluate('e=>e.scrollLeft=0')
                                if body.locator('img').count()>1:
                                    body.locator('img').last.scroll_into_view_if_needed();page.screenshot(path=str(out/f'{engine}-{width}-{o["id"]}-last.png'))
                                page.locator('#ld-dialog-close').click();page.wait_for_function('!document.querySelector("#ld-dialog").open')
                        if width<1200 and page.locator('#ld-rail').is_visible():page.locator('#ld-close-right').click()
                        # Inspect all page targets for text/layout overflow, load every inline asset.
                        for pn in range(1,entry['pages']+1):
                            page.locator(f'#{ch}-page-{pn}').evaluate('e=>e.scrollIntoView()')
                            assert page.locator(f'#{ch}-page-{pn}').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(ch,pn)
                        page.locator('#ld-document img').evaluate_all('ns=>ns.forEach(im=>im.loading="eager")')
                        page.wait_for_function('[...document.querySelectorAll("#ld-document img")].every(im=>im.complete&&im.naturalWidth>0)')
                        page.locator('#ld-find').fill('exposure');page.locator('#ld-search-form button[type=submit]').click();assert page.locator('#ld-find-count').inner_text().startswith('1 / ')
                        field=page.locator('#ld-page-number');field.click();field.fill('7');page.locator(f'#{ch}-page-1').evaluate('e=>e.scrollIntoView()');page.wait_for_timeout(200);assert field.input_value()=='7';field.fill(str(entry['pages']));assert field.input_value()==str(entry['pages']);page.locator('#ld-page-form button').click();page.wait_for_timeout(150)
                        target=f'#{ch}-page-{entry["pages"]}'
                        print('JUMP',engine,width,ch,page.locator(target).evaluate('e=>({top:e.getBoundingClientRect().top,number:document.querySelector("#ld-page-number").value,scroll:document.querySelector("#ld-scroll").scrollTop})'),flush=True)
                        page.wait_for_function('(s)=>document.querySelector(s).getBoundingClientRect().top<innerHeight',arg=target)
                        page.screenshot(path=str(out/f'{engine}-{width}-{ch}-last-page.png'))
                        print(engine,width,ch,'PASS',len(data['objects']),'objects',entry['pages'],'pages',flush=True)
                    assert not errors,errors;reports.append({'engine':engine,'width':width,'passed':True});page.close()
                browser.close()
    finally:server.shutdown()
    (out/'results.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
if __name__=='__main__':main()
