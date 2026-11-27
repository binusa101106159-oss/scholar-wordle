"""Validate chapter switching, every new object and independent reading/highlight state."""
from pathlib import Path
import argparse,functools,http.server,json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--engines',default='chromium,firefox,webkit');ap.add_argument('--widths',default='1440,390');ap.add_argument('--url');args=ap.parse_args()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=(args.url or f'http://127.0.0.1:{server.server_port}/').rstrip('/')+'/'
    out=ROOT/'.local/ladou-batch-01/browser';out.mkdir(exist_ok=True,parents=True);results=[]
    try:
        with sync_playwright()as p:
            for engine in args.engines.split(','):
                browser=getattr(p,engine).launch()
                for width in map(int,args.widths.split(',')):
                    page=browser.new_page(viewport={'width':width,'height':950},service_workers='block',reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort());page.goto(base+'#ladou');page.locator('#ld-chapter-select').wait_for(state='attached')
                    assert page.locator('#ld-chapter-select option').count()==6
                    def choose(ch):
                        if not page.locator('#ld-side').is_visible():page.locator('#ld-menu').click()
                        page.locator('#ld-chapter-select').select_option(ch);page.locator(f'#{ch}-page-1').wait_for(state='attached')
                    for n,total in enumerate((6,8,10,6,11),1):
                        print(engine,width,'checking chapter',n,flush=True)
                        ch=f'c{n:02d}';choose(ch);assert page.locator('.ld-page').count()==total
                        assert page.locator('#ld-document').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
                        text=page.locator('#ld-document').inner_text();assert '140.112.'not in text and 'Downloaded'not in text
                        assert ('References' in text or 'REFERENCES'in text)
                        page.locator('#ld-find').fill('work');page.locator('#ld-search-form button[type=submit]').click();assert page.locator('#ld-find-count').inner_text().startswith('1 / ')
                        page.locator('#ld-page-number').fill(str(total));page.locator('#ld-page-form button').click();page.wait_for_timeout(100)
                        ids=page.locator('#ld-document [data-ld-object]').evaluate_all('ns=>[...new Set(ns.map(n=>n.dataset.ldObject))]')
                        for oid in ids:
                            page.locator(f'[data-ld-object="{oid}"]').first.click();page.wait_for_function('document.querySelector("#ld-dialog").open');assert page.locator('#ld-dialog-body').inner_text().strip() or page.locator('#ld-dialog-body img').count()
                            if page.locator('#ld-dialog-body img').count():
                                page.locator('#ld-dialog-body img').scroll_into_view_if_needed();page.wait_for_function('document.querySelector("#ld-dialog-body img").complete&&document.querySelector("#ld-dialog-body img").naturalWidth>0')
                            assert page.locator('#ld-dialog').evaluate('el=>el.getBoundingClientRect().right<=innerWidth+1');page.screenshot(path=str(out/f'{engine}-{width}-{oid}.png'));page.locator('#ld-dialog-close').click();page.wait_for_function('!document.querySelector("#ld-dialog").open')
                        assert page.locator('.ld-contents').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
                        page.locator('#ld-document').evaluate('el=>el.querySelectorAll("img").forEach(im=>im.loading="eager")')
                        page.screenshot(path=str(out/f'{engine}-{width}-{ch}.png'))
                    # Chapter 2's split source figure is one complete object, beside its caption.
                    choose('c02');assert page.locator('#c02-page-1 .ld-figure').count()==1;assert page.locator('#c02-page-2 .ld-figure').count()==0
                    page.locator('#c02-page-1 img').scroll_into_view_if_needed();page.wait_for_function('document.querySelector("#c02-page-1 img").complete&&document.querySelector("#c02-page-1 img").naturalWidth===520');assert page.locator('#c02-page-1 img').evaluate('im=>im.naturalHeight===296')
                    page.locator('#ld-page-number').fill('4');page.locator('#ld-page-form button').click();page.wait_for_timeout(400)
                    page.evaluate('''()=>{const el=document.querySelector('#c02-page-4-content p');const r=document.createRange();r.setStart(el.firstChild,0);r.setEnd(el.firstChild,20);getSelection().removeAllRanges();getSelection().addRange(r);}''');page.locator('#ld-mark').click();assert page.locator('#ld-status').inner_text()=='已畫線'
                    choose('c03');assert not page.evaluate('JSON.parse(ScholarStorage.getItem("scholar-ladou-marks-v1"))["c03"]?.length||0')
                    choose('c02');page.wait_for_timeout(200);assert page.locator('#ld-page-number').input_value()=='4'
                    assert page.evaluate('JSON.parse(ScholarStorage.getItem("scholar-ladou-marks-v1"))["c02"].length')==1
                    # Guest account state is deliberately memory-only, just like other readers.
                    page.reload();page.locator('#c01-page-1').wait_for(state='attached');assert page.locator('#ld-chapter-select').input_value()=='c01'
                    assert not errors,errors;print(engine,width,'5 chapters / all objects / search / page jump / isolated marks / reload PASS',flush=True);results.append({'engine':engine,'width':width,'passed':True});page.close()
                browser.close()
    finally:server.shutdown()
    (out/'results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
if __name__=='__main__':main()
