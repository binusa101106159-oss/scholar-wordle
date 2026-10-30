"""Visual check: open each 附表 in the real 法規 tab and save it next to page 1 of its PDF.

    python3 -m http.server 8765 --directory ../..      # serve the site (separate terminal)
    python3 review.py a01 a02-1 ...                    # law ids or annex ids; no args = all
Output: review/<annex-id>.png  (PDF left, app right). Look at every one before publishing.
Needs: pip install playwright pymupdf pillow && playwright install chromium
"""
import sys, json, asyncio, glob, os
import pymupdf
from PIL import Image
from playwright.async_api import async_playwright
from catalog import SRC, LAWS

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.environ.get('SITE_URL', 'http://localhost:8765/index.html')
OUT = os.path.join(HERE, 'review')
os.makedirs(OUT, exist_ok=True)
idx = json.load(open(os.path.join(HERE, '../../laws/index.json'), encoding='utf-8'))
STEM = {lid: stem for lid, _, _, stem in LAWS}
want = set(sys.argv[1:])


def pdf_path(law_id, label):
    stem = STEM[law_id]
    for f in sorted(glob.glob(os.path.join(SRC, stem + ' *'))):
        rest = os.path.basename(f)[len(stem) + 1:]
        if f.upper().endswith('.PDF') and rest.startswith(label) and rest[len(label):][:1] not in '一二三四五六七八九十之':
            return f
    raise FileNotFoundError(stem + ' ' + label)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1200, 'height': 900})
        await pg.goto(SITE + '#laws')
        await pg.wait_for_timeout(1200)
        for law in idx['laws']:
            for a in law['annexes']:
                if want and a['id'] not in want and law['id'] not in want: continue
                await pg.set_viewport_size({'width': 1200, 'height': 900})
                await pg.click(f'.lx-law[data-law="{law["id"]}"]')
                await pg.wait_for_timeout(400)
                await pg.click(f'.lx-chip[data-annex="{a["id"]}"]')
                await pg.wait_for_timeout(700)
                h = await pg.evaluate("""() => { const d = document.getElementById('lx-annex'); d.style.height = 'auto'; d.style.maxHeight = 'none';
                    document.getElementById('lx-annex-body').style.overflow = 'visible'; return d.scrollHeight + 120; }""")
                await pg.set_viewport_size({'width': 1200, 'height': min(h, 9000)})
                await pg.wait_for_timeout(300)
                shot = os.path.join(OUT, a['id'] + '_app.png')
                await pg.locator('#lx-annex').screenshot(path=shot)
                await pg.evaluate("const d=document.getElementById('lx-annex'); d.close(); d.removeAttribute('style'); document.getElementById('lx-annex-body').removeAttribute('style')")
                doc = pymupdf.open(pdf_path(law['id'], a['label']))
                pix = doc[0].get_pixmap(dpi=72)
                left = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
                app = Image.open(shot).convert('RGB')
                app = app.resize((int(app.width * 0.62), int(app.height * 0.62)))
                hh = max(left.height, min(app.height, 1600))
                comp = Image.new('RGB', (left.width + app.width + 20, hh), 'white')
                comp.paste(left, (0, 0)); comp.paste(app.crop((0, 0, app.width, min(app.height, hh))), (left.width + 20, 0))
                comp.save(os.path.join(OUT, a['id'] + '.png'))
                print(a['id'], 'pdf pages', len(doc))
        await b.close()

asyncio.run(main())
