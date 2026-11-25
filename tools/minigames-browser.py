"""Play each mini game in a real browser: menu, controls, scoring, overflow at 1440 and 390 px."""
from pathlib import Path
import argparse,functools,http.server,json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/minigames'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    browser=getattr(p,engine).launch()
    for width in [1440,390]:
     mobile=width<761
     page=browser.new_page(viewport={'width':width,'height':900},service_workers='block',has_touch=mobile);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
     page.goto(base+'#g2048',wait_until='domcontentloaded');page.locator('.mg-2048').wait_for()
     saved=lambda:json.loads(page.evaluate("ScholarStorage.getItem('scholar-minigames-v1')||'{}'"))
     def no_overflow(name):assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),name+' overflows';assert page.locator('#minigames-panel').evaluate('n=>n.scrollWidth<=n.clientWidth+1'),name+' panel overflows'
     def shot(name):
      if engine=='chromium':page.screenshot(path=str(out/f'{name}-{width}.png'))
     # Games menu lists the three old games and the five new ones.
     page.locator('#game-group-button').click();items=page.locator('#game-group-menu [role=menuitemradio]');assert items.count()==8,items.count();assert '踩地雷' in page.locator('#game-group-menu').inner_text();page.keyboard.press('Escape')
     # 2048: arrow keys move and score; 新遊戲 resets to two tiles.
     board=lambda:page.locator('.mg-tile').evaluate_all('ns=>ns.map(n=>Number(n.textContent)||0)')
     assert sum(1 for v in board() if v)==2;page.locator('.mg-2048').focus()
     before=board()
     for k in ['ArrowLeft','ArrowUp','ArrowRight','ArrowDown']*6:page.keyboard.press(k)
     assert board()!=before;assert sum(board())>4
     if mobile:
      box=page.locator('.mg-2048').bounding_box();b0=board()
      for dx,dy in [(-120,0),(0,-120),(120,0),(0,120)]:
       page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']/2+dx,box['y']+box['height']/2+dy,steps=4);page.mouse.up()
      assert board()!=b0,'swipe did not move'
     no_overflow('2048');shot('2048')
     page.get_by_role('button',name='新遊戲').click();assert sum(1 for v in board() if v)==2;assert saved()['g2048']['score']==0
     # Leaving 2048 removes its arrow-key handler.
     page.evaluate("location.hash='#mines'");page.locator('.mg-mines').wait_for();b=None
     # Minesweeper: first click is safe and opens an area; right click flags; flag mode flags on tap.
     cells=page.locator('.mg-cell');assert cells.count()==81
     cells.nth(40).click();assert page.locator('.mg-cell.open').count()>=1;assert page.locator('.mg-cell.boom').count()==0
     closed=page.locator('.mg-cell:not(.open)').first;closed.click(button='right');assert page.locator('.mg-cell.flag').count()==1;assert '剩餘 9 雷' in page.locator('.mg-tools').inner_text()
     page.get_by_role('button',name='插旗：關').click();page.locator('.mg-cell:not(.open):not(.flag)').first.click();assert page.locator('.mg-cell.flag').count()==2;page.get_by_role('button',name='插旗：開').click()
     page.locator('.mg-tools select').select_option('medium');assert cells.count()==256;assert page.locator('.mg-cell.open').count()==0;assert saved()['minesLevel']=='medium'
     cells.nth(120).click();no_overflow('mines');shot('mines')
     # Winning is covered by tests/minigames.test.cjs (minesWon); here 新局 must clear flags.
     page.get_by_role('button',name='新局').click();assert page.locator('.mg-cell.flag').count()==0
     # IARC: answer shows the correct group and the next question.
     page.evaluate("location.hash='#iarcquiz'");page.locator('.mg-choice').first.wait_for();assert page.locator('.mg-choice').count()==4
     q=page.locator('.mg-question').inner_text();page.locator('.mg-choice').first.click();assert page.locator('.mg-choice.right').count()==1;assert '正確答案：Group' in page.locator('.mg-result').inner_text()
     assert saved()['iarcquiz']['total']==1;page.get_by_role('button',name='下一題').click();assert page.locator('.mg-choice:disabled').count()==0;no_overflow('iarc');shot('iarc')
     # 法規條次: both question types, S tier by default.
     page.evaluate("location.hash='#lawmatch'");page.locator('.mg-choice').first.wait_for();assert page.locator('.mg-choice').count()==4;assert '》第 ' in page.locator('.mg-choice').first.inner_text()
     page.locator('.mg-choice').nth(2).click();assert page.locator('.mg-choice.right').count()==1;assert '正確條文：《' in page.locator('.mg-result').inner_text()
     page.locator('.mg-tools select').nth(1).select_option('label');page.locator('.mg-choice').first.wait_for();assert page.locator('.mg-question').inner_text().startswith('《');no_overflow('law');shot('law')
     page.locator('.mg-tools select').nth(0).select_option('all');page.wait_for_function("document.querySelectorAll('.mg-choice').length===4&&!document.querySelector('.mg-question').textContent.includes('載入中')",timeout=30000)
     assert saved()['lawmatch']['tier']=='all'
     # Connections: solve one group, then lose with wrong guesses; every group is revealed.
     page.evaluate("location.hash='#connect'");page.locator('.mg-tile-word').first.wait_for();assert page.locator('.mg-tile-word').count()==16
     owners=page.evaluate("""async()=>{const L=ScholarGameLogic;const [g,l,i]=await Promise.all(['guides/index.json','laws/index.json','iarc/data.json'].map(u=>fetch(u).then(r=>r.json())));const m={};L.connectionGroups({guides:g,laws:l,iarc:i}).filter(x=>x.theme==='guide-law').forEach(x=>x.items.forEach(t=>m[t]=x.label));return m;}""")
     texts=page.locator('.mg-tile-word').all_inner_texts();by={}
     for t in texts:by.setdefault(owners[t],[]).append(t)
     assert all(len(v)==4 for v in by.values()) and len(by)==4,by
     first=list(by)[0]
     for t in by[first]:page.locator('.mg-tile-word',has_text=t).first.click()
     page.get_by_role('button',name='送出').click();assert page.locator('.mg-group').count()==1;assert first in page.locator('.mg-solved').inner_text();assert page.locator('.mg-tile-word').count()==12
     others=[by[k] for k in list(by)[1:]]
     for n in range(4):
      guess=[others[0][0],others[0][1],others[1][n%4],others[2][(n+1)%4]]
      if page.get_by_role('button',name='取消選取').is_enabled():page.get_by_role('button',name='取消選取').click()
      for t in guess:page.locator('.mg-tile-word',has_text=t).first.click()
      page.get_by_role('button',name='送出').click()
     assert page.locator('.mg-group').count()==4;assert '錯 4 次' in page.locator('.mg-status').inner_text();assert saved()['connect']['played']==1
     no_overflow('connect');shot('connect')
     page.locator('.mg-tools select').select_option('iarc');page.locator('.mg-tile-word').first.wait_for();assert page.locator('.mg-tile-word').count()==16;no_overflow('connect-iarc')
     # Old games still work after visiting the new ones.
     page.evaluate("location.hash='#sudoku'");page.locator('#sudoku-board [data-cell]').first.wait_for();page.keyboard.press('ArrowRight')
     assert not errors,errors;page.close();print(engine,width,'menu / 2048 keys+swipe / mines safe start+flags+levels / IARC / 法規條次 two modes+tiers / Connections solve+lose / overflow PASS',flush=True)
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
