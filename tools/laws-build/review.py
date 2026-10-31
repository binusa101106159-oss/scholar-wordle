"""Review every PDF page and all native app content; exercise every article link."""
import sys, json, asyncio, glob, os, re, math, io
import pymupdf
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
from catalog import SRC, LAWS
from annex import visible_text

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.environ.get('SITE_URL', 'http://localhost:8765/index.html')
OUT = os.path.join(HERE, 'review')
os.makedirs(OUT, exist_ok=True)
idx = json.load(open(os.path.join(HERE, '../../laws/index.json'), encoding='utf-8'))
STEM = {lid: stem for lid, _, _, stem in LAWS}
want = set(sys.argv[1:])
norm = lambda s: re.sub(r'\s+', '', s)


def pdf_path(law_id, label):
    stem = STEM[law_id]
    for f in sorted(glob.glob(os.path.join(SRC, stem + ' *'))):
        rest = os.path.basename(f)[len(stem) + 1:]
        if f.upper().endswith('.PDF') and rest.startswith(label) and rest[len(label):][:1] not in '一二三四五六七八九十之':
            return f
    raise FileNotFoundError(stem + ' ' + label)


async def ready(pg):
    await pg.locator('#lx-annex-body .lx-loading').wait_for(state='detached')
    await pg.evaluate("""async () => {
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('#lx-annex-body img')].map(async im => {
            im.loading = 'eager'; await im.decode();
        }));
    }""")


async def close(pg):
    await pg.evaluate("document.getElementById('lx-annex').close()")
    await pg.wait_for_function("!document.getElementById('lx-annex').open")


async def check_body(pg, aid):
    data = json.load(open(os.path.join(HERE, '../../laws/annex', aid + '.json'), encoding='utf-8'))
    actual = await pg.locator('#lx-annex-body').text_content()
    assert norm(actual) == norm(visible_text(data)), f'{aid}: native DOM text differs'


async def review_annex(pg, law, a):
    aid = a['id']
    await pg.click(f'.lx-chip[data-annex="{aid}"]')
    await ready(pg)
    await check_body(pg, aid)
    doc = pymupdf.open(pdf_path(law['id'], a['label']))
    native=json.load(open(os.path.join(HERE,'../../laws/annex',aid+'.json'),encoding='utf-8'))
    def codes(blocks):
        out=set()
        for block in blocks:
            for row in block.get('rows',[]):
                for cell in row:
                    out.update(s for s in cell['text'].split() if re.fullmatch(r'[A-Z][a-z]?-\d+(?:m\d?)?',s) and int(re.search(r'\d+',s)[0])>1)
                    out.update(codes(cell.get('blocks',[])))
        return out
    nuclides=codes(native['blocks'])
    for path in glob.glob(os.path.join(OUT, aid + '*.png')):
        if re.fullmatch(re.escape(aid) + r'(?:_app|-p\d+(?:-s\d+)?)?\.png', os.path.basename(path)):
            os.remove(path)
    await pg.evaluate("""() => {
        const d = document.getElementById('lx-annex');
        d.style.cssText = 'position:absolute;inset:0 auto auto 0;margin:0;width:1080px;max-width:none;height:auto;max-height:none;transform:none;overflow:visible';
        document.getElementById('lx-annex-body').style.cssText = 'height:auto;flex:none;overflow:visible;max-height:none';
        document.body.style.minHeight = (d.scrollHeight + 100) + 'px';
    }""")
    # Unique text anchors locate page breaks in reflowed native content. A Range
    # locates the actual line even when a cell spans several PDF pages.
    candidates = []
    for page in doc:
        raw=page.get_text();text=norm(raw)
        # Keep cell separators while finding isotope masses: removing a
        # newline first would turn "Y-86\n14.7" into the false code Y-8614.
        structural=[norm(s) for s in re.findall(r'[A-Z][a-z]?-\d+(?:m\d?)?|[（(]\s*[A-Z][a-z]{3,}\s*[）)]',raw)
                    if norm(s) in nuclides or s.startswith(('(','（'))]
        candidates.append(dict(keys=[text[i:i+18] for i in range(0, len(text)-17, 9)],structural=structural))
    bounds = await pg.evaluate("""pages => {
        const root=document.getElementById('lx-annex-body'), walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
        let node, text='', points=[];
        while(node=walker.nextNode()) for(let i=0;i<node.textContent.length;i++) {
            const ch=node.textContent[i]; if(/\s/.test(ch)) continue;
            text+=ch; points.push([node,i]);
        }
        let cursor=0;
        const spans=pages.map(page=>{
            let lo=Infinity, hi=-Infinity, matches=0;
            let local=cursor, last=cursor, hits=[];
            // A PDF may draw an isotope's whole column before the next one;
            // HTML reads the same data row by row. Isotope/element labels
            // provide ordered anchors even when long text windows cross
            // those different reading orders or repeat in another subtable.
            for(const key of page.structural) {
                const at=text.indexOf(key,local);if(at<0)continue;
                hits.push([at,key.length]);local=at+key.length;last=local;
            }
            const hasStructural=hits.length>0;
            for(const key of page.keys) {
                const at=text.indexOf(key,cursor);
                if(at<0 || (hasStructural ? at>last+500 : text.indexOf(key,at+1)>=0))continue;
                hits.push([at,key.length]);
            }
            for(const [at,len] of hits) {
                const range=document.createRange();
                range.setStart(...points[at]); range.setEnd(points[at+len-1][0],points[at+len-1][1]+1);
                for(const rect of range.getClientRects()) { lo=Math.min(lo,rect.top+scrollY); hi=Math.max(hi,rect.bottom+scrollY); }
                matches++;
            }
            if(last>cursor)cursor=last;
            return {lo:Number.isFinite(lo)?lo:null,hi:Number.isFinite(hi)?hi:null,matches};
        });
        const d=document.getElementById('lx-annex').getBoundingClientRect();
        return {spans,width:Math.ceil(d.width),height:Math.ceil(d.height)};
    }""", candidates)
    cuts = [0]
    for i in range(1, len(doc)):
        lo=bounds['spans'][i]['lo']; prev=bounds['spans'][i-1]['hi']
        if lo is None: cut=bounds['height']*i/len(doc)
        else: cut=(lo+prev)/2 if prev is not None and prev<=lo else lo
        cuts.append(max(cuts[-1], min(bounds['height'], int(cut))))
    cuts.append(bounds['height'])
    count=0
    for i,page in enumerate(doc):
        pix=page.get_pixmap(dpi=110)
        left=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        left.thumbnail((760,1600))
        y0=max(0,cuts[i]-20); y1=min(bounds['height'],cuts[i+1]+20)
        segments=max(1,math.ceil((y1-y0)/2100))
        for k in range(segments):
            top=y0+k*2100; height=max(1,min(2100,y1-top))
            await pg.set_viewport_size(dict(width=1200,height=max(900,math.ceil(height))))
            await pg.evaluate('(top)=>{document.getElementById("lx-annex").style.transform=`translateY(${-top}px)`}',top)
            raw=await pg.screenshot(clip=dict(x=0,y=0,width=bounds['width'],height=height), animations='disabled')
            app=Image.open(io.BytesIO(raw)).convert('RGB')
            app=app.resize((760,max(1,round(app.height*760/app.width))))
            comp=Image.new('RGB',(left.width+app.width+20,max(left.height,app.height)+28),'white')
            draw=ImageDraw.Draw(comp)
            draw.text((8,6),f'{aid} PDF page {i+1}/{len(doc)}',fill='black')
            draw.text((left.width+28,6),f'APP | segment {k+1}/{segments}',fill='black')
            comp.paste(left,(0,28));comp.paste(app,(left.width+20,28))
            suffix=f'-s{k+1:02}' if segments>1 else ''
            comp.save(os.path.join(OUT,f'{aid}-p{i+1:03}{suffix}.png'))
            count+=1
    await close(pg)
    await pg.evaluate("""() => {
        document.getElementById('lx-annex').removeAttribute('style');
        document.getElementById('lx-annex-body').removeAttribute('style');
        document.body.style.minHeight='';
        window.scrollTo(0,0);
    }""")
    await pg.set_viewport_size(dict(width=1200,height=900))
    print(aid,'PDF pages:',len(doc),'review images:',count,'DOM text: OK',flush=True)
    return count


async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch()
        pg=await browser.new_page(viewport=dict(width=1200,height=900),reduced_motion='reduce',service_workers='block')
        errors=[]
        pg.on('pageerror',lambda e:errors.append(str(e)))
        await pg.goto(SITE+'#laws')
        await pg.locator('.lx-law').first.wait_for()
        images=links=0
        for law in idx['laws']:
            if want and law['id'] not in want and not any(a['id'] in want for a in law['annexes']):continue
            tier=pg.locator(f'.lx-tier[data-tier="{law["tier"]}"]')
            if await tier.count() and await tier.get_attribute('aria-expanded')=='false':
                await tier.click()
            await pg.click(f'.lx-law[data-law="{law["id"]}"]')
            await pg.wait_for_function('(title)=>document.querySelector(".lx-title")?.textContent===title',arg=law['name'])
            for a in law['annexes']:
                if want and law['id'] not in want and a['id'] not in want:continue
                images+=await review_annex(pg,law,a)
            refs=pg.locator('#lx-doc .lx-ref')
            for k in range(await refs.count()):
                ref=refs.nth(k);aid=await ref.get_attribute('data-annex')
                await ref.evaluate('(el)=>el.scrollIntoView({block:"center",behavior:"instant"})')
                await ref.click();await ready(pg)
                target=next(l for l in idx['laws'] if l['id']==aid.split('-')[0])
                meta=next(a for a in target['annexes'] if a['id']==aid)
                assert await pg.locator('#lx-annex-law').text_content()==target['name'],aid
                assert await pg.locator('#lx-annex-title b').text_content()==meta['label'],aid
                await check_body(pg,aid);await close(pg);links+=1
            print(law['id'],'article/notes links:',await refs.count(),'click-through: OK',flush=True)
        assert not errors,errors
        print('REVIEW:',images,'images;',links,'clicks; browser errors: 0',flush=True)
        await browser.close()


if __name__=='__main__':asyncio.run(main())
