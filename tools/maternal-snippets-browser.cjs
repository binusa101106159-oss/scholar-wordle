'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const count=require('../cases/maternal-snippets.json').sections.flatMap(s=>s.groups.flatMap(g=>g.snippets)).length;
async function run(browser,output){
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{if(route.request().url().endsWith('cases/maternal-snippets.json'))return route.fulfill({contentType:'application/json',body:fs.readFileSync(path.join(root,'cases/maternal-snippets.json'))});return route.fulfill({contentType:'text/html',body:'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-game="cases"><button id="game-tab-cases">個案追蹤</button><button id="game-tab-maternal">母保罐頭</button><main id="cases-panel"></main><main id="maternal-panel" hidden></main></body></html>'});});
 await page.goto('https://snippets.invalid/');
 const styles=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');await page.addStyleTag({content:styles});
 for(const file of ['cases/cases.css','peek-glass.css','liquid-clear.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
 for(const file of ['sync/state.js','sync/store.js','glass-layer.js','peek-glass.js','calculator/calculator.js','cases/maternal-calls.js','cases/maternal-snippets.js','cases/cases.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
 await page.evaluate(()=>{
  window.copies=[];window.confirms=[];window.acceptCopy=false;window.writes=[];
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copies.push(text)},configurable:true});window.confirm=message=>{window.confirms.push(message);return window.acceptCopy;};
  window.ScholarSync.connect({uid:'fictional-owner'},{commit:async op=>op.next},new Map());
  for(const key of ['setItem','setConfirmed','removeItem'])window.ScholarStorage[key]=()=>{window.writes.push(key);throw Error('Unexpected persistence');};
  window.ScholarCases.show();
  document.getElementById('game-tab-maternal').onclick=()=>{window.ScholarCases.hide();document.getElementById('cases-panel').hidden=true;document.getElementById('maternal-panel').hidden=false;document.body.dataset.game='maternal';window.ScholarMaternalSnippets.show();};
  document.getElementById('game-tab-cases').onclick=()=>{window.ScholarMaternalSnippets.hide();document.getElementById('maternal-panel').hidden=true;document.getElementById('cases-panel').hidden=false;document.body.dataset.game='cases';window.ScholarCases.show();};
 });
 assert.deepEqual(await page.locator('.ct-tabs [role=tab]').allTextContents(),['追蹤中 0','Archive（結案） 0','母性保護回電 0']);
 await page.locator('#game-tab-maternal').click();await page.waitForFunction(total=>document.querySelectorAll('.ct-sn-card').length===total,count);
 await page.locator('#ct-sn-search').fill('經常／偶爾');assert.equal(await page.locator('.ct-sn-card').count(),1);
 const choice=page.locator('.ct-sn-card');await choice.locator('.ct-sn-choice').first().click();await choice.locator('.ct-sn-choice').first().click();await choice.locator('.ct-sn-choice').nth(1).click();
 await choice.getByRole('button',{name:'複製',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.copies),['偶爾需長時間站立']);
 await choice.getByRole('button',{name:'加入',exact:true}).click();assert.equal(await page.locator('#ct-sn-preview').textContent(),'偶爾需長時間站立。');
 await page.locator('#ct-sn-search').fill('');await page.locator('.ct-sn-card').first().getByRole('button',{name:'加入',exact:true}).click();
 assert.equal(await page.locator('#ct-sn-preview mark').count(),2);
 await page.locator('#ct-sn-copy-all').click();assert.equal(await page.evaluate(()=>window.copies.length),1);assert.equal(await page.evaluate(()=>window.confirms.length),1);
 await page.evaluate(()=>window.acceptCopy=true);await page.locator('#ct-sn-copy-all').click();assert.equal(await page.evaluate(()=>window.copies.length),2);
 await page.locator('#ct-sn-items textarea').nth(1).fill('已替換的測試文字。');assert.equal(await page.locator('#ct-sn-preview mark').count(),0);
 await page.locator('#ct-sn-copy-all').click();assert.equal(await page.evaluate(()=>window.confirms.length),2);assert.equal(await page.evaluate(()=>window.copies.at(-1)),await page.locator('#ct-sn-preview').textContent());
 // Keyboard and pointer ordering both retain edited text.
 await page.locator('#ct-sn-items .ct-grip').nth(1).focus();await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#ct-sn-items textarea').first().inputValue(),'已替換的測試文字。');
 const a=await page.locator('#ct-sn-items .ct-grip').first().boundingBox(),b=await page.locator('#ct-sn-items li').nth(1).boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+40,b.y+35,{steps:8});await page.mouse.up();assert.equal(await page.locator('#ct-sn-items textarea').nth(1).inputValue(),'已替換的測試文字。');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);
  if(width<=900){assert.equal(await page.locator('#ct-sn-composer').evaluate(el=>getComputedStyle(el).position),'fixed');if(!await page.locator('#ct-sn-composer').evaluate(el=>el.open))await page.locator('#ct-sn-composer>summary').click();}
  assert.ok(await page.locator('#ct-sn-composer').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'composer overflow '+width);
  assert.equal(await page.locator('#ct-sn-panel').evaluate(panel=>[...panel.querySelectorAll('button,input,textarea')].filter(n=>n.getClientRects().length).some(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+1})),false,'control clipping '+width);
  if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'snippets-'+width+'.png'),fullPage:width>900});}
  if(width<=900){await page.locator('#ct-sn-composer>summary').click();assert.equal(await page.locator('#ct-sn-composer').evaluate(el=>el.open),false);if(output)await page.screenshot({path:path.join(output,'snippets-collapsed-'+width+'.png')});await page.locator('#ct-sn-composer>summary').click();}
 }
 await page.locator('#ct-sn-items').getByRole('button',{name:'刪除此則',exact:true}).first().click();assert.equal(await page.locator('#ct-sn-items li').count(),1);
 await page.locator('#ct-sn-items textarea').fill('<img src=x onerror=alert(1)>');assert.equal(await page.locator('#ct-sn-preview img').count(),0);assert.match(await page.locator('#ct-sn-preview').textContent(),/<img/);
 await page.locator('#ct-sn-clear').click();assert.equal(await page.locator('#ct-sn-items li').count(),0);
 if(await page.locator('#ct-sn-composer').evaluate(el=>el.open))await page.locator('#ct-sn-composer>summary').click();
 await page.locator('.ct-sn-card').first().getByRole('button',{name:'加入',exact:true}).click();await page.locator('#game-tab-cases').click();await page.locator('#game-tab-maternal').click();assert.equal(await page.locator('#ct-sn-items li').count(),0);
 await page.locator('.ct-sn-card').first().getByRole('button',{name:'加入',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.locator('#ct-sn-items li').count(),0);
 await page.locator('.ct-sn-card').first().getByRole('button',{name:'加入',exact:true}).click();await page.evaluate(()=>window.ScholarSync.connect(null,null));assert.equal(await page.locator('#ct-sn-items li').count(),0);
 assert.deepEqual(await page.evaluate(()=>window.writes),[]);assert.equal(await page.evaluate(()=>localStorage.length),0);assert.deepEqual(errors,[]);
 await context.close();return {widths:[1440,390,320],snippets:count,checks:'copy, add, edit, reorder, placeholders, confirmation, search, toggles, clear on exit, no persistence, responsive composer'};
}
module.exports={run};
if(require.main===module){(async()=>{const {chromium}=require('playwright'),browser=await chromium.launch({headless:true});try{console.log(await run(browser,process.argv[2]));}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});}
