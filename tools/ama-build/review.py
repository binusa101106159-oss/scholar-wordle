"""Check the live native reader against source characters and table geometry.

Creates source/app comparison images in the ignored .local directory. Never
writes to law/guide assets. Run after build.py and start the site's HTTP server.
"""
import argparse
import asyncio
from collections import Counter
from io import BytesIO
import json
from pathlib import Path
import re
import sys

import pymupdf as pdf
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

sys.path.insert(0,str(Path(__file__).resolve().parent))
from build import ROOT, DEFAULT_SOURCE, Page, canon, CHAPTERS, TABLES
from layout_45 import SPREADS


async def main(args):
    output=args.output; output.mkdir(parents=True,exist_ok=True)
    doc=pdf.open(args.source); errors=[]; totals=dict(pages=0,links=0,cells=0,objects=0)
    all_objects={a['id']:a for file in (ROOT/'ama').glob('c*.json') for a in json.loads(file.read_text(encoding='utf-8'))['attachments']}
    async with async_playwright() as p:
        browser=await p.chromium.launch()
        context=await browser.new_context(viewport=dict(width=1500,height=1000),service_workers='block',reduced_motion='reduce')
        page=await context.new_page(); page.on('pageerror',lambda error:errors.append(str(error)))
        await page.goto(args.url+'index.html#ama')
        await page.locator('.ax-page').first.wait_for()
        async def select_chapter(ident):
            if not await page.locator('#ax-tab-'+ident).is_visible(): await page.locator('#ax-menu').click()
            await page.locator('#ax-tab-'+ident).click()
        for ident in args.ids:
            data=json.loads((ROOT/'ama'/(ident+'.json')).read_text(encoding='utf-8'))
            await select_chapter(ident)
            await page.locator(f'.ax-page[data-page="{data["pages"][-1]["page"]}"]').wait_for()
            for source in data['pages']:
                number=source['page']; native=page.locator(f'.ax-page[data-page="{number}"] .ax-page-content')
                actual=await native.evaluate("""el=>{const c=el.cloneNode(true);c.querySelectorAll('button').forEach(n=>n.remove());return c.textContent;}""")
                originals=[Page(doc,n) for n in source.get('sourcePages',[number])]; text=''.join(c['text'] for original in originals for c in original.chars)
                assert Counter(canon(text))==Counter(canon(actual)),f'p{number}: native DOM character mismatch'
                bullets=await native.locator('p').evaluate_all("items=>items.filter(p=>p.textContent.trimStart().startsWith('•')).length")
                assert bullets==text.count('•'),f'p{number}: flattened bullet paragraphs'
                assert await native.locator('img,iframe,object,embed,canvas').count()==0
                # Character distribution is checked independently inside every
                # physical grid cell, including merged footnote/header cells.
                for original in originals: original.build()
                grids=[g for original in originals for g in original.grids if 'cells' in g]
                if len(originals)==2:
                    left,right=grids
                    cells=[]
                    for row in range(left['rows']):
                        cells.extend(c for c in left['cells'] if c['row']==row)
                        cells.extend(c for c in right['cells'] if c['row']==row)
                    grids=[dict(id=left['id'],cells=cells)]
                actual_tables=await native.locator('table.ax-table').evaluate_all("""tables=>tables.map(t=>Array.from(t.rows,r=>Array.from(r.cells,c=>({text:c.textContent,rs:c.rowSpan,cs:c.colSpan}))))""")
                for grid in grids:
                    candidates=[]
                    for table in actual_tables:
                        flat=[c for row in table for c in row]
                        if len(flat)!=len(grid['cells']):continue
                        if all(canon(c['text'])==canon(s['text']) and c['rs']==s['rowspan'] and c['cs']==s['colspan'] for c,s in zip(flat,grid['cells'])):candidates.append(table)
                    assert candidates,f'p{number}: wrong cell text/span in {grid["id"]}'
                    totals['cells']+=len(grid['cells'])
                if args.images:
                    # Reflowed app page is shown at readable width beside source.
                    style=await page.add_style_tag(content=f'''body{{overflow:visible!important;height:auto!important}} .ax-layout{{height:auto!important;display:block!important;width:900px!important}} .ax-side,.ax-bar,.ax-tools,.ax-status,.ax-head{{display:none!important}} .ax-scroll{{overflow:visible!important;height:auto!important}} .ax-page{{display:none!important}} .ax-page[data-page="{number}"]{{display:block!important}}''')
                    await native.screenshot(path=str(output/f'app-p{number:03d}.png'))
                    await style.evaluate('(el)=>el.remove()')
                    sources=[Image.open(BytesIO(doc[n+24].get_pixmap(matrix=pdf.Matrix(1.4,1.4)).tobytes('png'))).convert('RGB') for n in source.get('sourcePages',[number])]
                    source_image=Image.new('RGB',(sum(im.width for im in sources),max(im.height for im in sources)),'white')
                    offset=0
                    for im in sources: source_image.paste(im,(offset,0));offset+=im.width
                    app_image=Image.open(output/f'app-p{number:03d}.png').convert('RGB')
                    width=source_image.width+app_image.width+24
                    combined=Image.new('RGB',(width,max(source_image.height,app_image.height)+36),'#777')
                    combined.paste(source_image,(0,36));combined.paste(app_image,(source_image.width+24,36))
                    ImageDraw.Draw(combined).text((8,10),f'Original p{number} | Native app (reflow)',fill='white')
                    combined.save(output/f'p{number:03d}.png')
                totals['pages']+=len(originals)
            # Open every inline reference, not only each distinct target.
            refs=await page.locator('#ax-body [data-open]').count()
            for i in range(refs):
                ref=page.locator('#ax-body [data-open]').nth(i); target=await ref.get_attribute('data-open')
                expected=all_objects[target]
                await ref.click()
                await page.locator('#ax-dialog[open]').wait_for()
                assert expected['label'] in await page.locator('#ax-dialog-title').text_content()
                assert await page.locator('#ax-dialog-body img, #ax-dialog-body iframe').count()==0
                if args.images and i==0:await page.screenshot(path=str(output/(ident+'-popup.png')))
                await page.locator('#ax-dialog-close').click();totals['links']+=1
            for attachment in data['attachments']:
                await page.locator('#ax-body .ax-expand[data-open="'+attachment['id']+'"]').first.click()
                await page.locator('#ax-dialog[open]').wait_for()
                if ident in ('c06','c07','c08','c09','c10','c11'):
                    raw=[]
                    for n in attachment.get('sourcePages',[attachment['page']]):
                        original=Page(doc,n);original.build()
                        raw.append(next(a['html'] for a in original.attachments
                                        if a['id']==attachment['id'] or a['id'].startswith(attachment['id']+'-p')))
                    checked=await page.locator('#ax-dialog-body').evaluate("""(el,{sources,spread})=>{
                        const nodes=sources.map(html=>{const d=document.createElement('div');d.innerHTML=html;return d;});
                        const canon=s=>s.replace(/\s+/g,'');
                        const frequency=s=>{const counts={};for(const c of canon(s))counts[c]=(counts[c]||0)+1;return JSON.stringify(Object.entries(counts).sort());};
                        if(frequency(nodes.map(n=>n.textContent).join(''))!==frequency(el.textContent))throw Error('Popup missing or doubled source text');
                        const rows=n=>Array.from(n.querySelectorAll('tr'),r=>Array.from(r.cells,c=>[canon(c.textContent),c.rowSpan,c.colSpan]));
                        let expected=[];
                        if(spread){for(let i=0;i<nodes.length;i+=2){const left=rows(nodes[i]),right=rows(nodes[i+1]);if(left.length!==right.length)throw Error('Spread rows');expected.push(...left.map((r,j)=>r.concat(right[j])));}}
                        else expected=nodes.flatMap(rows);
                        if(JSON.stringify(expected)!==JSON.stringify(rows(el)))throw Error('Popup cell order or spans');
                        for(const cell of el.querySelectorAll('td')){const rgb=getComputedStyle(cell).backgroundColor.match(/\d+/g);if(rgb&&+rgb[0]>230&&+rgb[1]>230&&+rgb[2]>230)throw Error('White table cell');}
                        return expected.length;
                    }""",{'sources':raw,'spread':attachment['id'] in ('t6-11','t7-13','t8-3','t9-14','t10-15','t11-2')})
                if args.images:
                    await page.locator('#ax-dialog-body').evaluate('(el)=>{el.style.maxHeight="none";}')
                    await page.locator('#ax-dialog').evaluate('(el)=>{el.style.maxHeight="none";}')
                    capture_width=3700 if attachment['id']=='t11-2' else 1450
                    style=await page.add_style_tag(content=f'.ax-dialog{{width:{capture_width}px!important;max-width:none!important}}.ax-dialog-body{{width:{capture_width}px!important}}.ax-table-wrap,.ax-object{{overflow:visible!important}}')
                    await page.locator('#ax-dialog-body').screenshot(path=str(output/(attachment['id']+'-app.png')))
                    await style.evaluate('(el)=>el.remove()')
                    app_image=Image.open(output/(attachment['id']+'-app.png')).convert('RGB')
                    sources=[]
                    for n in attachment.get('sourcePages',[attachment['page']]):
                        region=next((box for tid,box,_,_ in TABLES.get(n,[]) if 't'+tid in (attachment['id'],attachment['id']+'-next') or ('t'+tid).startswith(attachment['id']+'-p')),None)
                        if region:
                            sources.append(Image.open(BytesIO(doc[n+24].get_pixmap(matrix=pdf.Matrix(2,2),clip=pdf.Rect(region)).tobytes('png'))).convert('RGB'))
                    if sources:
                        wide=sum(im.width for im in sources)
                        original_image=Image.new('RGB',(wide,max(im.height for im in sources)),'white');x=0
                        for im in sources:original_image.paste(im,(x,0));x+=im.width
                        comparison=Image.new('RGB',(original_image.width+app_image.width+12,max(original_image.height,app_image.height)),'#777')
                        comparison.paste(original_image,(0,0));comparison.paste(app_image,(original_image.width+12,0));comparison.save(output/(attachment['id']+'.png'))
                    await page.locator('#ax-dialog-body').evaluate('(el)=>{el.style.maxHeight="";}')
                    await page.locator('#ax-dialog').evaluate('(el)=>{el.style.maxHeight="";}')
                await page.keyboard.press('Escape');totals['objects']+=1
            print(ident+': source characters, native cells, every popup reference: OK',flush=True)
        await context.close()
        for width in (1400,390,320):
            context=await browser.new_context(viewport=dict(width=width,height=900),service_workers='block')
            page=await context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            await page.goto(args.url+'index.html#ama');await page.locator('.ax-page').first.wait_for()
            catalogue=json.loads((ROOT/'ama/index.json').read_text(encoding='utf-8'))['chapters']
            for chapter in catalogue:
                if not await page.locator('#ax-side').is_visible():await page.locator('#ax-menu').click()
                await page.locator('#ax-tab-'+chapter['id']).click()
                assert await page.locator('#ax-title').text_content()==chapter['title']
                if chapter.get('ready'):await page.locator('.ax-page[data-page="'+str(chapter['end'])+'"]').wait_for()
                else:assert await page.locator('.ax-pending').is_visible()
            if not await page.locator('#ax-side').is_visible():await page.locator('#ax-menu').click()
            await page.locator('#ax-tab-c17').focus();await page.keyboard.press('ArrowDown')
            await page.locator('.ax-page[data-page="18"]').wait_for()
            if width<=900:await page.keyboard.press('Escape')
            section=await page.locator('#ax-section option').nth(1).get_attribute('value')
            await page.locator('#ax-section').select_option(section)
            await page.locator('#ax-larger').click()
            assert await page.locator('#ama-panel').evaluate('e=>e.style.getPropertyValue("--ax-font-size")')=='19px'
            # Highlight, restore, reading position, and search exercise real flows.
            await page.locator('#ax-body .ax-page-content > p').evaluate_all("""elements=>{for(const el of elements){const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){if(n.length<16)continue;const r=document.createRange();r.setStart(n,0);r.setEnd(n,12);const s=getSelection();s.removeAllRanges();s.addRange(r);return;}}throw Error('No selectable source paragraph');}""")
            await page.locator('#ax-mark').click();assert await page.locator('mark.ax-highlight').count()>0
            await page.locator('#ax-scroll').evaluate('el=>{el.scrollTop=800;}');await page.wait_for_timeout(300)
            await page.reload();await page.locator('.ax-page[data-page="18"]').wait_for();await page.wait_for_timeout(150)
            assert await page.locator('mark.ax-highlight').count()>0
            assert await page.locator('#ax-scroll').evaluate('el=>el.scrollTop')>700
            if not await page.locator('#ax-side').is_visible():await page.locator('#ax-menu').click()
            await page.locator('#ax-query').fill('Pain Disability Questionnaire');await page.locator('#ax-search button').click()
            await page.locator('.ax-result').first.wait_for();assert await page.locator('.ax-result').count()>0
            await page.locator('.ax-result').last.click();await page.wait_for_timeout(100)
            assert 'Chapter 3'==await page.locator('#ax-kicker').text_content()
            if width<=900 and await page.locator('#ax-side').is_visible():await page.keyboard.press('Escape')
            await page.screenshot(path=str(output/f'layout-{width}.png'))
            dimensions=await page.evaluate('({width:document.documentElement.scrollWidth,viewport:innerWidth,bottom:document.querySelector(".ax-layout").getBoundingClientRect().bottom,height:innerHeight})')
            assert dimensions['width']<=width,dimensions
            assert dimensions['bottom']<=dimensions['height']+2,dimensions
            for game in ('laws','guides','crossword','sudoku','wordle','ama'):
                await page.locator('#game-tab-'+game).click()
                assert await page.locator('body').get_attribute('data-game')==game
            print(f'{width}px: 17 chapters, keyboard, search, highlight, restore, existing tabs, layout: OK',flush=True)
            await context.close()
        await browser.close()
    assert not errors,errors
    report=dict(**totals,browser_errors=len(errors),status='OK')
    (output/'results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids',nargs='*',default=list(CHAPTERS));parser.add_argument('--url',default='http://localhost:8765/')
    parser.add_argument('--output',type=Path,default=ROOT/'.local'/'ama45'/'review')
    parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE);parser.add_argument('--images',action='store_true')
    asyncio.run(main(parser.parse_args()))
