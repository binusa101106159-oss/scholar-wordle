'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const data=require('../cases/maternal-snippets.json'),M=require('../cases/maternal-snippets.js');
const rows=M.flatten(data);
const additions=require('./fixtures/maternal-snippets-additions.json').snippets;
const addedIds=new Set(additions.map(row=>row.id));
const originalRows=rows.filter(row=>!addedIds.has(row.id));
test('maternal snippets have five sections, nonempty groups and globally unique ids',()=>{
 assert.deepEqual(data.sections.map(s=>s.title),['一、個案基本資料','二、工作內容','三、作業風險評估','四、工作建議','五、結尾']);
 const ids=[];for(const section of data.sections){ids.push(section.id);assert.ok(section.groups.length);for(const group of section.groups){ids.push(group.id);assert.ok(group.title);assert.ok(group.snippets.length);for(const snippet of group.snippets){ids.push(snippet.id);assert.equal(typeof snippet.text,'string');assert.ok(snippet.text);if(snippet.label!==undefined)assert.equal(typeof snippet.label,'string');}}}
 assert.equal(new Set(ids).size,ids.length);assert.equal(rows.length,58+additions.length);
});
test('all 58 texts and optional labels match the supplied source verbatim in order, without Unicode normalization',()=>{
 const source=fs.readFileSync(require.resolve('./fixtures/maternal-snippets-source.txt'),'utf8');
 const expected=source.split(/\r?\n/).filter(line=>line.startsWith('- ')).map(line=>{const raw=line.slice(2),label=raw.match(/^（([^）]+)）/);return {text:label?raw.slice(label[0].length):raw,...(label?{label:label[1]}:{})};});
 assert.equal(expected.length,58);assert.deepEqual(originalRows.map(({text,label})=>({text,...(label?{label}:{})})),expected);
 assert.equal(originalRows.map(r=>r.text).join('\n'),expected.map(r=>r.text).join('\n'));
});
test('reviewed additions match the de-identified fixture, stay in their groups and introduce no duplicate texts',()=>{
 assert.equal(additions.length,40);assert.equal(new Set(rows.map(row=>row.text)).size,rows.length);
 for(const {id,group,label,text} of additions){const found=rows.find(row=>row.id===id);assert.ok(found,id);assert.deepEqual({group:found.group,label:found.label,text:found.text},{group,label,text},id);}
 assert.ok(additions.every(row=>!/\d+歲女性|\d{4}年\d{1,2}月\d{1,2}日/.test(row.text)));
 const lifting=rows.find(row=>row.id==='maternal-extra-35').text;
 assert.match(lifting,/實際可搬抬重量因人而異，可能會小於10公斤/);
 assert.ok(rows.find(row=>row.id==='maternal-extra-39').text.includes('【工作壓力、加班】'));
});
test('same-group neighbors use semicolons, cross-group sentences use full stops and original internal punctuation stays intact',()=>{
 const item=(group,text)=>({group,text});
 assert.equal(M.compose([item('a','甲'),item('a','乙。'),item('b','丙')]),'甲；乙。丙。');
 assert.equal(M.compose([item('a','甲。'),item('a','乙。')]),'甲；乙。');
 assert.equal(M.compose([item('a','第一句。第二句。'),item('b','第三句。')]),'第一句。第二句。第三句。');
 assert.equal(M.compose([item('intro','工作建議如下：'),item('a','甲。'),item('b','乙。')]),'工作建議如下：甲。乙。');
 assert.equal(M.compose([item('intro','懷孕期間之作業風險評估，'),item('a','甲'),item('a','乙')]),'懷孕期間之作業風險評估，甲；乙。');
 assert.equal(M.compose([item('a','甲'),item('b','乙'),item('a','丙')]),'甲。乙。丙。');
 assert.equal(M.compose([item('a',''),item('a','  ')]),'');assert.equal(M.compose([]),'');
 const doi=rows.find(r=>r.label==='附參考文獻').text;assert.equal(M.compose([item('ref',doi)]),doi+'。');
});
test('placeholder detection includes empty brackets and repeated placeholders and ignores normal parentheses',()=>{
 assert.deepEqual(M.placeholders('【年齡】、【】、【年齡】及（MTX）'),['【年齡】','【】','【年齡】']);
 assert.deepEqual(M.placeholders('已替換的文字'),[]);assert.deepEqual(M.placeholders('【未封閉'),[]);
});
test('search finds all phrase text including English, full-width variants and multiple terms',()=>{
 assert.ok(M.filterSnippets(rows,'ＧＨＳ 乙腈').length);assert.equal(M.filterSnippets(rows,'infusion adapter').length,1);assert.equal(M.filterSnippets(rows,'不存在的片段').length,0);
});
test('choice tags replace only requested alternatives and never mutate the static catalog',()=>{
 const original=rows.find(row=>row.text.includes('經常／偶爾')).text;
 assert.equal(M.choose(original,{'經常／偶爾':'偶爾','站立／靜坐':'靜坐'}),'偶爾需長時間靜坐');
 assert.equal(rows.find(row=>row.text.includes('經常／偶爾')).text,original);
 assert.equal(M.choose(original,{'經常／偶爾':'invalid'}),original);
});
test('composition reorder preserves edited values and allows duplicate source phrases',()=>{
 const items=[{id:'a',sourceId:'same',group:'a',text:'編輯後甲'},{id:'b',sourceId:'same',group:'a',text:'乙'}];
 assert.deepEqual(M.move(items,'b','a').map(i=>i.text),['乙','編輯後甲']);assert.equal(items[0].id,'a');assert.equal(M.move(items,'missing','a'),items);
});
test('maternal snippets have an independent lazy main tab with a direct URL and no case-subtab dependency',()=>{
 const index=fs.readFileSync(require.resolve('../index.html'),'utf8'),loader=fs.readFileSync(require.resolve('../app-loader.js'),'utf8'),cases=fs.readFileSync(require.resolve('../cases/cases.js'),'utf8'),source=fs.readFileSync(require.resolve('../cases/maternal-snippets.js'),'utf8');
 assert.match(index,/id="game-tab-maternal"[^>]*data-game-tab="maternal"/);
 assert.match(index,/data-lazy="maternal" data-cloud-src="cases\/maternal-snippets.js"/);
 assert.match(index,/id="maternal-panel"[^>]*aria-labelledby="game-tab-maternal"/);
 assert.match(index,/location.hash === '#maternal' \? 'maternal'/);
 assert.match(loader,/maternal:'ScholarMaternalSnippets'/);
 assert.ok(!cases.includes('ct-tab-snippets'));assert.ok(!cases.includes('ScholarMaternalSnippets'));
 assert.match(source,/by\('maternal-panel'\).replaceChildren\(panel\)/);
});
