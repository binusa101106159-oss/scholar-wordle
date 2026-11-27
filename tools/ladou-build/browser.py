"""Exercise LaDou via the actual app loader, desktop/mobile and every diagram/table."""
from pathlib import Path
import argparse,functools,http.server,json,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--url');ap.add_argument('--engines',default='chromium,firefox,webkit');args=ap.parse_args()
    out=ROOT/'.local/ladou-browser';out.mkdir(parents=True,exist_ok=True)
    server=None
    if args.url:base=args.url.rstrip('/')+'/'
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
    results=[]
    try:
        with sync_playwright() as p:
            for engine in args.engines.split(','):
                browser=getattr(p,engine).launch()
                for width in (1440,390):
                    context=browser.new_context(viewport={'width':width,'height':950},service_workers='block',reduced_motion='reduce')
                    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort())
                    page.goto(base+'#ladou');page.locator('.ld-page').last.wait_for(timeout=30000)
                    if page.locator('#ld-chapter-select').input_value()!='appendix-a':
                        if width<1200:page.locator('#ld-menu').click()
                        page.locator('#ld-chapter-select').select_option('appendix-a');page.locator('#a-page-30').wait_for(state='attached')
                    assert page.locator('.ld-page').count()==30
                    assert page.locator('.ld-object').count()==21
                    assert page.locator('.ld-figure').count()==4
                    assert page.locator('.ld-toc-link').count()==49
                    assert page.locator('#study-section-ladou').get_attribute('aria-selected')=='true'
                    assert page.locator('#ld-document').evaluate('el=>el.scrollHeight')>10000
                    text=page.locator('#ld-document').inner_text()
                    assert '140.112.125.138' not in text and 'Downloaded' not in text
                    assert 'Type II Error' in text and 'Matched Case-Control Studies' in text
                    assert 'Methods' not in page.locator('#ld-status').inner_text()
                    # All images exist and decode, including offscreen lazy equations and all figures.
                    images=page.locator('#ld-document img').evaluate_all('nodes=>nodes.map(n=>n.src)')
                    failures=page.evaluate('''async urls=>{const result=[];for(const url of new Set(urls)){const im=new Image();im.src=url;try{await im.decode();if(!im.naturalWidth)throw Error();}catch(_){result.push(url);}}return result;}''',images)
                    assert not failures,failures
                    assert page.locator('#ld-document').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
                    page.locator('#ld-find').fill('confounding');page.locator('#ld-search-form button[type=submit]').click()
                    count=page.locator('#ld-find-count').inner_text();assert count.startswith('1 / ') and int(count.split('/')[1])>=5,count
                    page.locator('#ld-find-next').click();assert page.locator('#ld-find-count').inner_text().startswith('2 / ')
                    page.locator('#ld-find-prev').click();assert page.locator('#ld-find-count').inner_text().startswith('1 / ')
                    page.locator('#ld-page-number').fill('18');page.locator('#ld-page-form button').click()
                    print('JUMP',page.evaluate('({value:document.querySelector("#ld-page-number").value,top:document.querySelector("#a-page-18").getBoundingClientRect().top,scrollTop:document.querySelector("#ld-scroll").scrollTop,scrollBox:document.querySelector("#ld-scroll").getBoundingClientRect().top})'),flush=True)
                    assert page.locator('#a-page-18').evaluate('el=>Math.abs(el.getBoundingClientRect().top-document.querySelector("#ld-scroll").getBoundingClientRect().top)<60')
                    assert page.locator('#a-table-a2').inner_text().count('1000')>=2
                    assert '100,000 live births' in page.locator('#a-table-a2').inner_text()
                    assert 'Yes' in page.locator('#a-table-p24-1').inner_text() and 'No' in page.locator('#a-table-p24-1').inner_text()
                    # Select, save, and remove a real range without changing source characters.
                    page.evaluate('''()=>{const root=document.querySelector('#a-page-1-content p');const r=document.createRange();r.setStart(root.firstChild,0);r.setEnd(root.firstChild,25);getSelection().removeAllRanges();getSelection().addRange(r);}''')
                    page.locator('#ld-mark').click();assert page.locator('#ld-status').inner_text()=='已畫線'
                    stored=page.evaluate('JSON.parse(ScholarStorage.getItem("scholar-ladou-marks-v1"))');assert len(stored['appendix-a'])==1
                    page.locator('#ld-unmark').click();assert page.locator('#ld-status').inner_text()=='已移除選取範圍的畫線'
                    # Wheel over the middle really scrolls the reader, not the two sidebars.
                    page.locator('#ld-scroll').evaluate('el=>el.scrollTop=0');page.locator('#ld-scroll').hover(position={'x':100,'y':200});page.mouse.wheel(0,600);page.wait_for_timeout(200)
                    assert page.locator('#ld-scroll').evaluate('el=>el.scrollTop')>100
                    # Table and figure tabs work independently; every object opens and closes.
                    if width<1200:page.locator('#ld-quick').click()
                    for kind in ('table','figure'):
                        page.locator('#ld-kind-'+kind).click()
                        ids=page.locator('#ld-object-list [data-ld-object]').evaluate_all('ns=>ns.map(n=>n.dataset.ldObject)')
                        for ident in ids:
                            if width<1200 and not page.locator('#ld-rail').is_visible():page.locator('#ld-quick').click()
                            page.locator(f'#ld-object-list [data-ld-object="{ident}"]').click();page.wait_for_function('document.querySelector("#ld-dialog").open')
                            assert page.locator('#ld-dialog-title').inner_text()
                            assert page.locator('#ld-dialog-body').inner_text().strip() or page.locator('#ld-dialog-body img').count()
                            if kind=='figure':page.locator('#ld-dialog-body img').evaluate('im=>im.decode()')
                            assert page.locator('#ld-dialog').evaluate('el=>el.getBoundingClientRect().width<=innerWidth')
                            page.locator('#ld-dialog-close').click();page.wait_for_function('!document.querySelector("#ld-dialog").open')
                    page.evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>window.ladouCopied=text}})')
                    page.evaluate('document.querySelector("#a-table-a2 [data-ld-object]").click()');page.wait_for_function('document.querySelector("#ld-dialog").open')
                    page.locator('#ld-dialog-copy').click();page.wait_for_function('window.ladouCopied?.includes("Crude death rate")')
                    page.locator('#ld-dialog-close').click();page.wait_for_function('!document.querySelector("#ld-dialog").open')
                    if width<1200:page.locator('#ld-close-right').click()
                    # Reading settings and main tab round trip preserve content and scroll position.
                    page.locator('#ld-reading-settings summary').click();page.locator('#ld-font').select_option('20');page.locator('#ld-width').select_option('full');page.locator('#ld-reading-settings summary').click()
                    page.locator('#ld-page-number').fill('24');page.locator('#ld-page-form button').click()
                    page.wait_for_timeout(400);before=page.locator('#ld-scroll').evaluate('el=>el.scrollTop')
                    assert not page.locator('#study-nav').is_visible()
                    page.locator('#game-tab-study').click();assert page.locator('#study-group-menu').is_visible()
                    assert page.locator('#study-group-menu [role=menuitemradio]').count()==4
                    assert page.locator('#ld-scroll').evaluate('el=>el.scrollTop')==before
                    page.locator('[data-study-menu=ilo]').click();assert page.locator('#ilo-panel').is_visible()
                    page.locator('#game-tab-study').click();page.locator('[data-study-menu=ladou]').click();assert page.locator('#ld-scroll').evaluate('el=>el.scrollTop')==before
                    page.locator('#game-tab-study').focus();page.keyboard.press('ArrowDown');assert page.locator('#study-group-menu').is_visible();page.keyboard.press('Escape');assert not page.locator('#study-group-menu').is_visible()
                    assert page.locator('#game-tab-study').evaluate('el=>el===document.activeElement')
                    # Search expands matching ancestors; clear restores the compact hierarchy.
                    page.locator('#ld-menu').click() if width<1200 else None
                    assert page.locator('#ld-contents details:not([open])').count()>0
                    page.locator('#ld-toc-search').fill('Median');assert page.locator('#ld-contents .ld-toc-link').filter(has_text='2. Median').is_visible()
                    page.locator('#ld-toc-search').fill('');page.locator('[data-ld-expand=true]').click();assert page.locator('#ld-contents details:not([open])').count()==0
                    page.locator('[data-ld-expand=false]').click();assert page.locator('#ld-contents details[open]').count()==0
                    if width<1200:page.locator('#ld-close-left').click()
                    page.locator('#ld-page-number').fill('4');page.locator('#ld-page-form button').click();page.screenshot(path=str(out/f'{engine}-{width}.png'))
                    assert not errors,errors
                    results.append({'engine':engine,'width':width,'pages':30,'objectsOpened':len(ids)+17,'imagesDecoded':len(set(images)),'passed':True})
                    print(engine,width,'passed',flush=True);context.close()
                browser.close()
    finally:
        if server:server.shutdown()
    (out/'results.json').write_text(json.dumps(results,indent=2),encoding='utf8')

if __name__=='__main__':main()
