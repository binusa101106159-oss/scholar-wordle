/* Isolated UI acceptance; all employee values are fictional, no Firebase access. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),S=require('../sync/state.js');
const key='scholar-maternal-calls-v1';
async function run(browser,output){
 const server=new Map();let fail=false,delay=false,release;
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 const styles=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 async function device(signedIn=true){
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-game="cases"><main id="cases-panel"></main></body></html>'}));
  await page.goto('https://maternal.invalid/');
  await page.addStyleTag({content:styles});
  for(const file of ['cases/cases.css','peek-glass.css','liquid-clear.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.exposeFunction('testCommit',async op=>{
   if(delay)await new Promise(resolve=>release=resolve);
   if(fail)throw Error('simulated permission denial');
   const merged=S.reconcile(op.base,op.next,server.get(op.id)??null,op.id);
   if(op.next!==null&&merged===null)throw Error('deleted remotely');
   if(merged===null)server.delete(op.id);else server.set(op.id,merged);return merged;
  });
  for(const file of ['sync/state.js','sync/store.js','glass-layer.js','peek-glass.js','calculator/calculator.js','cases/maternal-calls.js','cases/maternal-snippets.js','cases/cases.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(({signedIn,entries})=>{window.ScholarSync.connect(signedIn?{uid:'fictional-owner'}:null,signedIn?{commit:op=>window.testCommit(op)}:null,new Map(entries));window.ScholarCases.show();},{signedIn,entries:[...server]});
  await page.locator('#ct-tab-maternal').click();return page;
 }
 const page=await device(false);assert.equal(await page.locator('#ct-m-add').isDisabled(),true);
 await page.evaluate(()=>window.ScholarSync.connect({uid:'fictional-owner'},{commit:op=>window.testCommit(op)},new Map()));
 await page.locator('#ct-m-add').click();
 for(const [field,value]of Object.entries({name:'虛構員工甲',employeeId:'000TEST',unit:'虛構測試單位',caseNumber:'000CASE',phone:'TEST-PHONE',status:'虛構孕期說明',referralDate:'1151116',asks:'虛構詢問甲\n虛構詢問乙',confirms:'虛構確認甲',notes:'<img src=x onerror=alert(1)>'}))await page.locator('#ct-m-'+field).fill(value);
 assert.equal(await page.locator('#ct-m-deadline').inputValue(),'20261123');
 assert.match(await page.locator('#ct-m-referralDate-preview').textContent(),/西元 2026\/11\/16/);
 fail=true;await page.locator('#ct-m-form button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('ct-m-form-error').textContent.includes('未確認'));
 assert.equal(await page.locator('#ct-m-editor').evaluate(el=>el.open),true);assert.equal(await page.locator('#ct-m-name').inputValue(),'虛構員工甲');assert.equal(server.size,0);
 fail=false;delay=true;await page.locator('#ct-m-form button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('ct-m-close').disabled);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#ct-m-editor').evaluate(el=>el.open),true);
 delay=false;release();await page.waitForFunction(()=>!document.getElementById('ct-m-editor').open);
 assert.equal(server.size,1);assert.equal(await page.locator('#ct-m-rows img').count(),0);
 assert.match(await page.locator('#ct-m-rows').textContent(),/<img src=x onerror=alert\(1\)>/);
 const id=JSON.parse([...server.values()][0]).id;
 const remote=await device();
 await page.getByRole('checkbox',{name:'已問：虛構詢問甲',exact:true}).check();
 await page.getByRole('textbox',{name:'回覆：虛構詢問甲',exact:true}).fill('虛構回答甲');
 fail=true;await page.getByRole('button',{name:'儲存回覆',exact:true}).click();await page.waitForFunction(()=>document.getElementById('ct-m-message').textContent.includes('未確認'));
 assert.equal(await page.getByRole('textbox',{name:'回覆：虛構詢問甲',exact:true}).inputValue(),'虛構回答甲');
 fail=false;await remote.getByRole('checkbox',{name:'已確認：虛構確認甲',exact:true}).check();await remote.getByRole('button',{name:'儲存回覆',exact:true}).click();await remote.waitForFunction(()=>document.getElementById('ct-m-message').textContent.includes('已儲存'));
 await page.getByRole('button',{name:'儲存回覆',exact:true}).click();await page.waitForFunction(()=>document.getElementById('ct-m-message').textContent==='已儲存至雲端。');
 const record=JSON.parse([...server.values()][0]);assert.equal(record.asks[0].reply,'虛構回答甲');assert.equal(record.confirms[0].done,true);
 await page.getByRole('button',{name:'編輯',exact:true}).click();await page.locator('#ct-m-asks').fill('虛構詢問乙\n虛構詢問甲\n新虛構問題');
 // Advance another device while the first dialog remains open.
 await remote.evaluate(entries=>window.ScholarSync.receive(new Map(entries)),[...server]);
 await remote.getByRole('button',{name:'編輯',exact:true}).click();await remote.locator('#ct-m-unit').fill('另一裝置的虛構單位');await remote.locator('#ct-m-form button[type=submit]').click();await remote.waitForFunction(()=>!document.getElementById('ct-m-editor').open);
 await page.evaluate(entries=>window.ScholarSync.receive(new Map(entries)),[...server]);
 await page.locator('#ct-m-form button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('ct-m-editor').open);
 assert.equal(JSON.parse([...server.values()][0]).unit,'另一裝置的虛構單位');assert.equal(JSON.parse([...server.values()][0]).asks.find(i=>i.text==='虛構詢問甲').reply,'虛構回答甲');
 await page.locator('#ct-m-search').fill('虛構回答甲');assert.equal(await page.locator('#ct-m-rows tr').count(),1);await page.locator('#ct-m-search').fill('');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);
  assert.equal(await page.locator('#ct-m-rows tr').evaluate(el=>getComputedStyle(el).display),width>900?'table-row':'block');
  const clipping=await page.locator('#ct-m-panel').evaluate(panel=>[...panel.querySelectorAll('input,button,fieldset')].filter(n=>n.getClientRects().length).some(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}));assert.equal(clipping,false,'controls overflow '+width);
  assert.equal(await page.locator('.ct-m-head').evaluate(head=>{const a=head.querySelector('.ct-tools').getBoundingClientRect(),b=head.querySelector('#ct-m-add').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}),false,'header overlap '+width);
  if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'maternal-'+width+'.png'),fullPage:true});}
  await page.getByRole('button',{name:'編輯',exact:true}).click();assert.ok(await page.locator('#ct-m-editor').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog overflow '+width);
  if(output)await page.screenshot({path:path.join(output,'maternal-form-'+width+'.png')});
  await page.locator('#ct-m-cancel').click();await page.waitForFunction(()=>!document.getElementById('ct-m-editor').open);
 }
 await page.getByRole('button',{name:'完成',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#ct-m-rows tr'));
 await page.locator('#ct-m-filter').selectOption('completed');assert.equal(await page.locator('#ct-m-rows tr').count(),1);
 await page.getByRole('button',{name:'恢復待回電',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#ct-m-rows tr'));await page.locator('#ct-m-filter').selectOption('active');assert.equal(await page.locator('#ct-m-rows tr').count(),1);
 await remote.evaluate(entries=>window.ScholarSync.receive(new Map(entries)),[...server]);await remote.getByRole('button',{name:'編輯',exact:true}).click();await remote.locator('#ct-m-notes').fill('過期表單草稿');
 await page.getByRole('button',{name:'刪除',exact:true}).click();fail=true;await page.locator('#ct-m-delete-confirm').click();await page.waitForFunction(()=>document.getElementById('ct-m-delete-error').textContent.includes('未確認'));assert.equal(await page.locator('#ct-m-delete').evaluate(el=>el.open),true);assert.equal(server.size,1);
 fail=false;delay=true;await page.locator('#ct-m-delete-confirm').click();await page.waitForFunction(()=>document.getElementById('ct-m-delete-cancel').disabled);await page.keyboard.press('Escape');assert.equal(await page.locator('#ct-m-delete').evaluate(el=>el.open),true);delay=false;release();await page.waitForFunction(()=>!document.getElementById('ct-m-delete').open);assert.equal(server.size,0);
 await remote.locator('#ct-m-form button[type=submit]').click();await remote.waitForFunction(()=>document.getElementById('ct-m-form-error').textContent.includes('未確認'));assert.equal(server.size,0);assert.equal(await remote.locator('#ct-m-notes').inputValue(),'過期表單草稿');
 await remote.locator('#ct-m-cancel').click();await remote.waitForFunction(()=>!document.getElementById('ct-m-editor').open);
 await page.evaluate(()=>window.ScholarSync.connect(null,null));assert.equal(await page.locator('#ct-m-add').isDisabled(),true);assert.equal(await page.locator('#ct-m-rows tr').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.length),0);assert.deepEqual(errors,[]);
 await context.close();return {widths:[1440,390,320],checks:'guest gate, confirmed CRUD, failed drafts, Escape locks, inline replies, two devices, stale deletion, XSS, memory-only data, responsive layout',record:id};
}
module.exports={run};
if(require.main===module){(async()=>{const {chromium}=require('playwright');const browser=await chromium.launch({headless:true});try{console.log(await run(browser,process.argv[2]));}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});}
