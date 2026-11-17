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
    assert page.locator('.hc-head, .hc-beta, #hc-results, .hc-search-label, #hc-copy, #hc-report-clear').count()==0
    assert page.get_by_role('textbox',name='原始資料',exact=True).is_visible() and page.get_by_role('textbox',name='報告草稿',exact=True).is_visible()
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
    # Fictional Ctrl+A fixture: reduced blood panel, two columns, blank CXR and a trap below the cutoff.
    page.locator('#hc-source-clear').click()
    source='QA(F,2000/01/01,26y)\n報告結果\n項目名稱 檢驗值 單位 參考標準 項目名稱 檢驗值 單位 參考標準\nWBC  5.8  k/μL  3.25-9.16  RBC  4.6  M/μL  3.78-5.25\nGLU AC  88  mg/dL  70-100\nT-CHO  225  mg/dL  0-199\nX光暨其他檢查之純文字報告\nChest : PA View (Standing)\n檢查判讀\n醫師總評\nGLU AC  999  mg/dL\n胸部X光檢查：正常。'
    page.locator('#hc-source').fill(source);assert '已排除檢查判讀以下' in page.locator('#hc-source-meta').inner_text()
    page.locator('#hc-regenerate').click();text=page.locator('#hc-report').input_value();assert '總膽固醇偏高' in text and '糖尿病' not in text and '胸部X光檢查：' not in text
    assert '報告尚未提供' in page.locator('#hc-review').inner_text()
    page.locator('#hc-source-clear').click();page.locator('#hc-source').fill(source)
    if page.locator('.hc-options').get_attribute('open') is None:page.locator('.hc-options summary').click()
    page.locator('#hc-cxr-status').select_option('doctor_normal');page.locator('#hc-regenerate').click();assert '胸部X光檢查：心臟大小正常' in page.locator('#hc-report').input_value();assert '醫師選擇暫填' in page.locator('#hc-review').inner_text()
    page.evaluate("location.hash='wordle'");page.locator('#game-main').wait_for(state='visible');page.evaluate("location.hash='checkup'");page.locator('#hc-source').wait_for(state='visible');assert page.locator('#hc-source').input_value()=='' and page.locator('#hc-report').input_value()==''
    page.locator('#hc-source').fill('性別：男\nTG：501')
    if page.locator('.hc-options').get_attribute('open') is None:page.locator('.hc-options summary').click()
    page.locator('[data-agent][value="鉛"]').check();page.locator('[data-grade="鉛"]').select_option('二');page.locator('[data-fit="鉛"]').check();page.locator('#hc-regenerate').click();text=page.locator('#hc-report').input_value();assert '儘速' in text and '鉛作業管理分級：第二級管理' in text and '可以從事鉛作業。' in text
    assert not page.evaluate("()=>Object.values(localStorage).some(v=>v.includes('人工修改保留')||v.includes('GLU AC：85'))")
    page.reload();page.locator('#hc-source').wait_for();assert page.locator('#hc-source').input_value()=='' and page.locator('#hc-report').input_value()==''
    assert not errors,errors;assert not writes,writes
    print(engine,width,'beta generation/cursor/manual grade/ephemeral data PASS',flush=True);context.close()
   browser.close()
finally:server.shutdown()
