"""Exercise both source overlays with a synthetic image; never patient data."""
from pathlib import Path
import argparse,functools,http.server,threading
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--engines',default='chromium,firefox,webkit');args=parser.parse_args()
 output=ROOT/'.local/field-overlay';output.mkdir(parents=True,exist_ok=True)
 image=Image.new('RGB',(320,400),'#d7e6ef');draw=ImageDraw.Draw(image);draw.rectangle((70,90,220,260),fill='#215c9a');draw.ellipse((120,140,160,180),fill='yellow');image.save(output/'fixture.png')
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=args.url or f'http://127.0.0.1:{server.server_port}/'
 try:
  with sync_playwright()as p:
   for engine in args.engines.split(','):
    browser=getattr(p,engine).launch()
    for width in (1440,390):
     context=browser.new_context(viewport={'width':width,'height':950},accept_downloads=True,has_touch=width==390,service_workers='block',reduced_motion='reduce');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/firebasejs/**',lambda r:r.abort())
     page.goto(base.rstrip('/')+'/#ama');page.locator('.ax-page').first.wait_for();page.locator('#ax-tab-c12').dispatch_event('click');page.locator('#ax-body [data-open="f12-10"]').first.wait_for(state='attached')
     for ident in ('f12-10','f12-11'):
      page.locator(f'#ax-body [data-open="{ident}"]').first.dispatch_event('click');body=page.locator('#ax-dialog-body');tool=body.locator('.ax-overlay-tool');tool.get_by_role('button',name='圖片疊合',exact=True).click();assert not body.locator('svg.ax-source-overlay').is_visible()
      if ident=='f12-11':
       choices=tool.get_by_role('combobox',name='Humphrey 格線');assert choices.locator('option').count()==7
       for option in range(7):choices.select_option(str(option));assert tool.locator('.ax-overlay-grid').get_attribute('viewBox')
       choices.select_option('0');assert tool.locator('.ax-overlay-grid').get_attribute('viewBox')=='80 535 410 410'
      tool.locator('input[type=file]').set_input_files(output/'fixture.png');photo=tool.locator('.ax-overlay-photo');photo.wait_for(state='visible');assert photo.evaluate('n=>n.naturalWidth')==320
      scale=tool.get_by_role('slider',name='縮放',exact=True);scale.fill('130');scale.dispatch_event('input');assert '1.3' in photo.get_attribute('style')
      tool.locator('select').last.select_option('grid');assert scale.input_value()=='100';scale.fill('110');scale.dispatch_event('input');rotation=tool.get_by_role('slider',name='旋轉',exact=True);rotation.fill('12');rotation.dispatch_event('input');assert 'rotate(12deg)'in tool.locator('.ax-overlay-grid').get_attribute('style')
      stage=tool.locator('.ax-overlay-stage');stage.scroll_into_view_if_needed();stage.focus();stage.press('ArrowRight');assert 'translate(0.25%'in tool.locator('.ax-overlay-grid').get_attribute('style')
      box=stage.bounding_box();x=box['x']+box['width']*.4;y=max(box['y']+30,min(box['y']+box['height']*.4,800));page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+30,y+20,steps=4);page.mouse.up();assert 'translate(0.25%'not in tool.locator('.ax-overlay-grid').get_attribute('style')
      opacity=tool.get_by_role('slider',name='格線透明度');opacity.fill('45');opacity.dispatch_event('input');assert tool.locator('.ax-overlay-grid').evaluate('n=>n.style.opacity')=='0.45'
      with page.expect_download()as pending:tool.get_by_role('button',name='下載疊合圖',exact=True).click()
      download=pending.value;download.save_as(output/f'{engine}-{width}-{ident}.png');export=Image.open(output/f'{engine}-{width}-{ident}.png').convert('RGB');assert export.width==1200;assert len(export.getcolors(export.width*export.height))>20
      if engine=='chromium'and width==1440:tool.screenshot(path=str(output/f'{ident}-editor.png'))
      tool.get_by_role('button',name='重設位置',exact=True).click();assert scale.input_value()=='100'and rotation.input_value()=='0'and opacity.input_value()=='65'
      tool.get_by_role('button',name='移除圖片',exact=True).click();assert not photo.is_visible();assert tool.get_by_role('button',name='下載疊合圖').is_disabled()
      tool.get_by_role('button',name='返回原圖',exact=True).click();assert body.locator('svg.ax-source-overlay').is_visible();page.locator('#ax-dialog-close').click();page.locator('#ax-dialog').wait_for(state='hidden');print(engine,width,ident,'upload/transform/drag/keyboard/export/reset/remove/original PASS',flush=True)
     assert not errors,errors;context.close()
    browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
