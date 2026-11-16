'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../cases/maternal-calls.js'),S=require('../sync/state.js');
const row=(id='fictional',extra={})=>({...Object.fromEntries(M.fields.map(([key])=>[key,''])),id,name:'虛構員工甲',employeeId:'000TEST',phone:'TEST-PHONE',level:'未定',progress:'待回電',asks:[],confirms:[],...extra});
const raw=records=>JSON.stringify({version:1,records});
test('maternal records validate their independent versioned schema and retain string identifiers and raw dates',()=>{
 const record=row('fictional',{caseNumber:'000CASE',referralDate:' １１５１１１６ ',notes:'第一行\n第二行',asks:[{id:'q',text:'虛構問題',done:true,reply:'虛構回答'}]});
 assert.deepEqual(M.parseRecords(raw([record])),[record]);assert.deepEqual(M.parseRecords(null),[]);
 for(const value of ['', '{}','[]',JSON.stringify({version:2,records:[]}),raw([record,record]),raw([row('bad',{employeeId:123})]),raw([row('bad',{name:'  '})]),raw([row('bad',{progress:'other'})]),raw([row('bad',{level:1})]),raw([row('bad',{asks:[{id:'q',text:'question',done:0,reply:''}]})]),raw([row('bad',{confirms:null})])])assert.throws(()=>M.parseRecords(value));
});
test('textarea lines become independent stable items, preserving done/reply on reorder and duplicate lines',()=>{
 let id=0;const uuid=()=>String(++id);
 const first=M.itemsFromText('  虛構問題甲\r\n\r\n虛構問題乙\n虛構問題甲 ',[],uuid);
 assert.deepEqual(first.map(i=>i.text),['虛構問題甲','虛構問題乙','虛構問題甲']);
 first[0].done=true;first[0].reply='回覆甲';first[2].reply='重複題回覆';
 const edited=M.itemsFromText('虛構問題乙\n虛構問題甲\n虛構問題甲\n新問題',first,uuid);
 assert.equal(edited[1].done,true);assert.equal(edited[1].reply,'回覆甲');assert.equal(edited[2].reply,'重複題回覆');assert.equal(edited[3].done,false);assert.equal(edited[3].reply,'');
 assert.equal(new Set(edited.map(i=>i.id)).size,4);assert.deepEqual(M.itemsFromText(' \n'),[]);assert.deepEqual(first.map(i=>i.id),['1','2','3']);
});
test('date defaults and previews share Gregorian/ROC parsing without rewriting raw input',()=>{
 assert.equal(M.defaultDeadline('1151116'),'20261123');assert.equal(M.defaultDeadline('20261229'),'20270105');assert.equal(M.defaultDeadline('1130223'),'20240301');
 for(const invalid of ['','20260229','1151131','11/16','待定'])assert.equal(M.defaultDeadline(invalid),'');
});
test('search covers every text field and all asks/confirms replies with normalized multi-term matching',()=>{
 for(const [key]of M.fields){const record=row('fictional',{[key]:key==='level'?'第三級':key==='progress'?'已報主治確核':'needle'});assert.deepEqual(M.filterRecords([record],record[key]),[record]);}
 const record=row('fictional',{asks:[{id:'a',text:'工作問題',done:false,reply:'ANSWER'}],confirms:[{id:'c',text:'確認設備',done:true,reply:'虛構回覆'}]});
 assert.deepEqual(M.filterRecords([record],'ＡＮＳＷＥＲ 設備 虛構回覆'),[record]);assert.deepEqual(M.filterRecords([record],'不存在'),[]);
});
test('uncalled records sort first, then nearest valid deadline, invalid/empty dates last; source order is untouched',()=>{
 const rows=[row('called',{callDate:'1151116',deadline:'1151117'}),row('later',{deadline:'1151120'}),row('empty'),row('earlier',{deadline:'20261118'}),row('invalid',{deadline:'not a date'})];
 assert.deepEqual(M.sortRecords(rows).map(r=>r.id),['earlier','later','empty','invalid','called']);assert.equal(rows[0].id,'called');
});
test('deadline highlights distinguish overdue, today, two days, and no alert beyond two days or after completion',()=>{
 for(const [deadline,className,text]of [['1151115','ct-overdue','逾期 1 天'],['20261116','ct-due','今日到期'],['1151118','ct-due','剩 2 天'],['1151119','',''],['','',''],['20260230','','']])assert.deepEqual(M.deadlineState(row('fictional',{deadline}),'2026-11-16'),{className,text});
 assert.deepEqual(M.deadlineState(row('fictional',{deadline:'1151115',progress:'已完成'}),'2026-11-16'),{className:'',text:''});
});
test('stale editor keeps remote scalar fields and per-item replies, respects removed items and last changed field',()=>{
 const base=row('fictional',{notes:'original',asks:[{id:'a',text:'題甲',done:false,reply:''},{id:'b',text:'題乙',done:false,reply:''}]});
 const remote={...base,phone:'REMOTE-TEST',asks:[{...base.asks[0],done:true,reply:'另一裝置回答'},{id:'c',text:'另一裝置新增題',done:false,reply:''}]};
 const draft={...base,notes:'新備註',asks:M.itemsFromText('題甲\n題乙\n新題',base.asks,()=>'new')};
 const merged=M.mergeDraft(base,draft,remote);assert.equal(merged.phone,'REMOTE-TEST');assert.equal(merged.notes,'新備註');assert.equal(merged.asks[0].reply,'另一裝置回答');assert.equal(merged.asks[0].done,true);assert.deepEqual(merged.asks.map(i=>i.id),['a','new','c']);
 const replyDraft={...base,asks:[{...base.asks[0],reply:'此裝置回答'},base.asks[1]]};
 assert.deepEqual(M.mergeDraft(base,replyDraft,remote).asks[0],{...remote.asks[0],reply:'此裝置回答'});assert.throws(()=>M.mergeDraft(base,draft,undefined),/已在其他裝置刪除/);
});
test('maternal records shard independently and use the existing server reconciliation for nested items and deletions',()=>{
 const base=row('fictional',{asks:[{id:'a',text:'題甲',done:false,reply:''}]}),other=row('other');
 const chunks=S.split(M.STORE,raw([base,other]));assert.equal(chunks.size,2);assert.deepEqual(JSON.parse(S.join(M.STORE,chunks)).records.map(r=>r.id).sort(),['fictional','other']);
 const local={...base,asks:[{...base.asks[0],done:true}]},remote={...base,asks:[{...base.asks[0],reply:'遠端回答'}]};
 const result=JSON.parse(S.reconcile(JSON.stringify(base),JSON.stringify(local),JSON.stringify(remote),M.STORE));assert.deepEqual(result.asks[0],{...base.asks[0],done:true,reply:'遠端回答'});
 assert.equal(S.reconcile(JSON.stringify(base),JSON.stringify(local),null,M.STORE),null);assert.equal(S.join(M.STORE,S.split(M.STORE,raw([]))),null);
});
