"""PDF/app page comparisons, DOM checks and real attachment clicks for guides.

Serve the repository on :8765, run build.py for the selected guides first,
then: python review.py farm-e farm-c farm-p farm-b plans
Review PNGs and a machine-readable result live under review/ (not shipped).
"""
import io, json, math, os, re, sys
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from build import visible
from guides_catalog import GUIDES, source_path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / 'review'
SITE = os.environ.get('SITE_URL', 'http://localhost:8765/index.html')
norm = lambda s: re.sub(r'\s+', '', s or '')


def ready(page, selector):
    page.evaluate('''async selector => {
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll(selector + ' img')].map(async im => {
            im.loading = 'eager'; await im.decode();
        }));
    }''', selector)


def main(want):
    OUT.mkdir(exist_ok=True)
    index = json.loads((ROOT/'guides/index.json').read_text(encoding='utf-8'))
    audit = json.loads((HERE/'report.json').read_text(encoding='utf-8'))
    catalog = {g[0]: g for g in GUIDES}
    result = dict(guides=[], errors=[])
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport=dict(width=1280, height=900), service_workers='block', reduced_motion='reduce')
        page.on('pageerror', lambda e: result['errors'].append(str(e)))
        page.goto(SITE+'#guides')
        page.locator('.gx-guide').first.wait_for(state='attached')
        for meta in index['guides']:
            gid = meta['id']
            if want and gid not in want and meta['cat'] not in want: continue
            data = json.loads((ROOT/'guides/text'/f'{gid}.json').read_text(encoding='utf-8'))
            category = next(c for c in index['cats'] if c['id'] == meta['cat'])
            chain = [category]
            while chain[-1].get('parent'):
                chain.append(next(c for c in index['cats'] if c['id'] == chain[-1]['parent']))
            for c in reversed(chain):
                button = page.locator(f'[data-cat="{c["id"]}"]')
                if button.get_attribute('aria-expanded') == 'false': button.click()
            page.locator(f'.gx-guide[data-guide="{gid}"]').click()
            page.wait_for_function('(title)=>document.querySelector(".gx-title")?.textContent===title', arg=meta['name'])
            ready(page, '#gx-doc')
            expected = [visible([b]) for b in data['blocks']]
            actual = page.evaluate('''({gid, count}) => Array.from({length: count}, (_, i) =>
                document.getElementById('gx-b-' + gid + '-' + i)?.textContent || '')''', dict(gid=gid, count=len(expected)))
            for i, (a, e) in enumerate(zip(actual, expected)):
                assert norm(a) == norm(e), f'{gid} block {i}: DOM text differs'
            clicks = jumps = 0
            refs = page.locator('#gx-doc [data-att], #gx-doc [data-goto]')
            for i in range(refs.count()):
                ref = refs.nth(i)
                aid = ref.get_attribute('data-att')
                block = ref.get_attribute('data-goto')
                ref.evaluate('(el)=>el.scrollIntoView({block:"center",behavior:"instant"})')
                ref.click()
                if block is not None:
                    assert page.locator(f'#gx-b-{gid}-{block}').count() == 1
                    jumps += 1; continue
                page.wait_for_function('document.getElementById("gx-att").open')
                page.locator('#gx-att-body .gx-loading').wait_for(state='detached')
                assert page.locator('#gx-att-guide').text_content() == meta['name'], aid
                ready(page, '#gx-att-body')
                att = json.loads((ROOT/'guides/attach'/f'{aid}.json').read_text(encoding='utf-8'))
                exp = ''.join(att.get('cover', [])) + visible([b for b in att['blocks'] if not b.get('cap')])
                assert norm(page.locator('#gx-att-body').text_content()) == norm(exp), aid
                page.locator('#gx-att [data-close]').click()
                page.wait_for_function('!document.getElementById("gx-att").open')
                clicks += 1
            # The review uses the actual reader HTML, with only its viewport and
            # overflow restrictions removed so no page or wide table is cropped.
            page.add_style_tag(content='''
                #gx-doc {position:fixed!important;left:0!important;top:0!important;width:1100px!important;max-width:none!important;margin:0!important;z-index:999!important;background:#14161c;}
                #gx-scroll {overflow:visible!important;}
                .sg-nav-shell {visibility:hidden!important;}
                .gx-twrap {overflow:visible!important;}
            ''')
            page.locator('#gx-scroll').evaluate('(el)=>el.scrollTop=0')
            bounds = page.evaluate('''({gid, count}) => {
                const root = document.getElementById('gx-doc'), r = root.getBoundingClientRect();
                return {height:Math.ceil(root.scrollHeight), width:Math.ceil(Math.max(1100,root.scrollWidth)),
                    blocks:Array.from({length:count},(_,i)=>{
                        const el=document.getElementById('gx-b-'+gid+'-'+i);
                        if(!el)return null; const b=el.getBoundingClientRect();
                        return [b.top-r.top,b.height];
                    })};
            }''', dict(gid=gid, count=len(data['blocks'])))
            _, cat, _, filename = catalog[gid]
            doc = pymupdf.open(source_path(cat, filename))
            for old in OUT.glob(gid+'-p*.png'):
                if re.fullmatch(re.escape(gid)+r'-p\d+(?:-s\d+)?\.png',old.name): old.unlink()
            points = [[] for _ in doc]
            for (start, end), box in zip(audit[gid]['page_map'], bounds['blocks']):
                if box is None: continue
                for n in range(start, min(end+1, len(doc))):
                    points[n].append(box[0]+box[1]*(n-start)/max(1,end-start+1))
            cuts = [0]
            for n in range(1,len(doc)):
                cut = min(points[n]) if points[n] else cuts[-1]
                cuts.append(max(cuts[-1],min(bounds['height'],math.floor(cut))))
            cuts.append(bounds['height'])
            images = []
            for n, pdfpage in enumerate(doc):
                pix = pdfpage.get_pixmap(dpi=110)
                left = Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
                left.thumbnail((760,1600))
                start, end = max(0,cuts[n]-12), min(bounds['height'],cuts[n+1]+12)
                count = max(1,math.ceil((end-start)/2100))
                for segment in range(count):
                    top=start+segment*2100; height=max(1,min(2100,end-top))
                    page.set_viewport_size(dict(width=bounds['width']+20,height=max(900,math.ceil(height))))
                    page.locator('#gx-doc').evaluate('(el,y)=>el.style.transform="translateY(-"+y+"px)"',top)
                    shot=page.screenshot(clip=dict(x=0,y=0,width=bounds['width'],height=height),animations='disabled')
                    app=Image.open(io.BytesIO(shot)).convert('RGB')
                    app=app.resize((760,max(1,round(app.height*760/app.width))))
                    comp=Image.new('RGB',(left.width+app.width+20,max(left.height,app.height)+28),'white')
                    draw=ImageDraw.Draw(comp)
                    draw.text((8,6),f'{gid} PDF {n+1}/{len(doc)}',fill='black')
                    draw.text((left.width+28,6),f'APP {segment+1}/{count}',fill='black')
                    comp.paste(left,(0,28));comp.paste(app,(left.width+20,28))
                    name=f'{gid}-p{n+1:03}'+(f'-s{segment+1:02}' if count>1 else '')+'.png'
                    comp.save(OUT/name);images.append(name)
            result['guides'].append(dict(id=gid,pages=len(doc),images=images,clicks=clicks,jumps=jumps,dom=True))
            print(gid, 'pages:',len(doc),'images:',len(images),'attachment clicks:',clicks,'appendix jumps:',jumps,'DOM: OK',flush=True)
            page.reload()
            page.set_viewport_size(dict(width=1280,height=900))
            page.locator('.gx-guide').first.wait_for(state='attached')
        assert not result['errors'],result['errors']
        browser.close()
    if (OUT/'result.json').exists():
        previous = json.loads((OUT/'result.json').read_text(encoding='utf-8'))
        merged = {g['id']:g for g in previous['guides']}
        merged.update({g['id']:g for g in result['guides']})
        result['guides'] = [merged[g['id']] for g in index['guides'] if g['id'] in merged]
    (OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('REVIEW:',sum(len(g['images']) for g in result['guides']),'images;',sum(g['clicks'] for g in result['guides']),'attachment clicks; browser errors: 0',flush=True)


if __name__ == '__main__': main(set(sys.argv[1:]))
