"""Health report beta browser checks using fictional inputs only."""
from pathlib import Path
import functools,http.server,threading,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  for engine in ['chromium','firefox','webkit']:
   browser=getattr(p,engine).launch()
   for width in [1440,390]:
    context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block');page=context.new_page();errors=[];writes=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:writes.append(r.url) if r.method not in ['GET','HEAD'] else None)
    page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort())
    page.goto(url+'/#checkup');page.locator('#hc-library .hc-card').first.wait_for(timeout=30000)
    assert page.locator('.hc-beta').inner_text()=='beta v0.1'
    page.locator('#hc-source').fill('性別：男\nKetone(Dipstick)：3+\nGLU AC：85\nMCH：20')
    page.locator('#hc-regenerate').click();draft=page.locator('#hc-report').input_value()
    assert '疑似為長期空腹' in draft and '平均紅血球血紅素量偏低' in draft
    assert page.locator('#hc-regenerate').is_disabled() and page.locator('#hc-source').get_attribute('readonly') is not None
    page.locator('#hc-report').fill('人工修改保留');page.locator('#hc-search').fill('尿上皮細胞過多')
    page.locator('#hc-report').evaluate("e=>{e.focus();e.setSelectionRange(0,0);e.dispatchEvent(new Event('select'))}")
    page.locator('#hc-library .hc-card').first.click();text=page.locator('#hc-report').input_value();assert text.startswith('尿上皮細胞過多') and text.endswith('人工修改保留')
    page.locator('#hc-source-clear').click();assert page.locator('#hc-report').input_value()==''
    page.locator('#hc-source').fill('性別：女\nMicroalbumin/CRE(UACR)：129\nAlbumin/Creatinine(Dipstick)：Dilute\nNitrite(Dipstick)：1+')
    page.locator('#hc-regenerate').click();text=page.locator('#hc-report').input_value();assert '疑為泌尿道感染' in text and '尿液過稀' in text and '比值偏高' in text
    assert '菌尿症' not in text and '白血球偏高' not in text
    page.evaluate("location.hash='wordle'");page.locator('#game-main').wait_for(state='visible');page.evaluate("location.hash='checkup'");page.locator('#hc-source').wait_for(state='visible');assert page.locator('#hc-source').input_value()=='' and page.locator('#hc-report').input_value()==''
    page.locator('#hc-source').fill('性別：男\nTG：501')
    page.locator('.hc-options summary').click();page.locator('[data-agent][value="鉛"]').check();page.locator('[data-grade="鉛"]').select_option('二');page.locator('[data-fit="鉛"]').check();page.locator('#hc-regenerate').click();text=page.locator('#hc-report').input_value();assert '儘速' in text and '鉛作業管理分級：第二級管理' in text and '可以從事鉛作業。' in text
    assert not page.evaluate("()=>Object.values(localStorage).some(v=>v.includes('人工修改保留')||v.includes('GLU AC：85'))")
    page.reload();page.locator('#hc-source').wait_for();assert page.locator('#hc-source').input_value()=='' and page.locator('#hc-report').input_value()==''
    assert not errors,errors;assert not writes,writes
    print(engine,width,'beta generation/cursor/manual grade/ephemeral data PASS',flush=True);context.close()
   browser.close()
finally:server.shutdown()
