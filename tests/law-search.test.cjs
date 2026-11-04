const test=require('node:test'),assert=require('node:assert/strict');
const {fold,termsFor,makeIndex,findResults}=require('../laws/search.js');
const laws=[{id:'s01',name:'勞工健康保護規則',tier:'S',articles:29,annexes:[{id:'s01-1',label:'附表一',title:'特別危害健康作業'}]},{id:'a01',name:'職業安全衛生法施行細則',tier:'A',articles:50,annexes:[]}];
const corpus=[{law:'s01',art:'10',where:'第 10 條',text:'每年健康檢查',norm:'每年健康檢查'},{law:'s01',art:'2',where:'第 2 條',text:'健康服務。',norm:'健康服務。'},{law:'s01',annex:'s01-1',where:'附表一',text:'BLOOD 鉛 ５０ μg',norm:'blood 鉛 50 μg'},{law:'a01',art:'1',where:'第 1 條',text:'其他事項',norm:'其他事項'}];
const index=makeIndex(laws,corpus);
test('law search normalizes fullwidth/case/whitespace and requires every term',()=>{assert.equal(fold('ＢＬＯＯＤ ５０'),'blood50');assert.deepEqual(termsFor('健康 健康 鉛'),['健康','鉛']);assert.equal(findResults(index,'blood ５０').length,1);assert.equal(findResults(index,'健康 不存在').length,0);assert.equal(findResults(index,'   ').length,0);});
test('law search covers law names, numbered articles and annex titles/text',()=>{assert.equal(findResults(index,'勞工健康保護規則')[0].kind,'law');assert.equal(findResults(index,'第１０條')[0].art,'10');assert.equal(findResults(index,'特別危害')[0].annex,'s01-1');assert.equal(findResults(index,'保護規則 鉛')[0].kind,'annex');});
test('law search preserves numeric article order and literal query safety',()=>{assert.deepEqual(findResults(index,'健康').filter(x=>x.kind==='article').map(x=>x.art),['2','10']);assert.doesNotThrow(()=>findResults(index,'[.*<script>'));assert.equal(findResults(index,'[.*<script>').length,0);assert.equal(corpus.length,4);});
