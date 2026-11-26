const test=require('node:test'),assert=require('node:assert/strict');
const {toArabic,cnToNumber}=require('../laws/numerals.js');
const show=t=>toArabic(t).text;

test('the user examples read with Arabic numerals, clock times and fractions',()=>{
 assert.equal(show('本規則依職業安全衛生法（以下簡稱本法）第六條第三項、第二十條第三項、第二十一條第三項及第二十二條第三項規定訂定之。'),'本規則依職業安全衛生法（以下簡稱本法）第 6 條第 3 項、第 20 條第 3 項、第 21 條第 3 項及第 22 條第 3 項規定訂定之。');
 assert.equal(show('三、臨時性作業：指正常作業以外之作業，其作業期間不超過三個月，且一年內不再重複者。'),'三、臨時性作業：指正常作業以外之作業，其作業期間不超過 3 個月，且 1 年內不再重複者。');
 assert.equal(show('（一）於午後十時至翌晨六時期間工作三小時以上之工作日數，達當月工作日數二分之一，且累計達六個月以上。'),'（一）於 10:00PM 至翌晨 6:00AM 期間工作 3 小時以上之工作日數，達當月工作日數 1/2，且累計達 6 個月以上。');
 assert.equal(show('（二）於午後十時至翌晨六時期間工作之工作時數，累計達七百小時以上。'),'（二）於 10:00PM 至翌晨 6:00AM 期間工作之工作時數，累計達 700 小時以上。');
 assert.equal(show('二、第一類事業、第二類事業及第三類事業：指職業安全衛生管理辦法第二條及其附表所定之事業。'),'二、第 1 類事業、第 2 類事業及第 3 類事業：指職業安全衛生管理辦法第 2 條及其附表所定之事業。');
});

test('list markers, 附表 names and ordinary words stay as written',()=>{
 for(const t of ['一、特別危害健康作業：指符合附表一之物理性及化學性危害之作業。','四、長期夜間工作：指勞工於前一年度有下列情形之一者：'.replace('前一年度','前年度'),'五、勞工健康服務人員：指從事勞工健康服務之醫師、護理人員、心理師、物理治療師、職能治療師或公共衛生師。','同時、臨時、一時之間、一般、一定、統一、畸零日數'])assert.equal(show(t),t);
 assert.equal(show('於前一年度有下列情形之一者'),'於前 1 年度有下列情形之一者');
});

test('dates, articles with 之, percentages, ranges of hours and large amounts',()=>{
 assert.equal(show('一百十五年六月二十六日修正'),'115 年 6 月 26 日修正');
 assert.equal(show('第十五條之一'),'第 15 條之 1');
 assert.equal(show('百分之五十以上'),'50% 以上');assert.equal(show('千分之五'),'5‰');
 assert.equal(show('每日八時至十七時'),'每日 8:00 至 17:00');assert.equal(show('下午二時三十分'),'2:30PM');
 assert.equal(show('新臺幣十五萬元以下'),'新臺幣 150,000 元以下');
 assert.deepEqual(['一百十五','二十','十','七百','一萬二千','一一五'].map(cnToNumber),[115,20,10,700,12000,115]);
});

test('every law line keeps its 附表 links on the same words after conversion',()=>{
 const index=require('../laws/index.json');let lines=0,changed=0;
 for(const law of index.laws){
  const text=require('../laws/text/'+law.id+'.json');
  const all=[...(text.notes||[]).map((n,i)=>({text:n,links:(text.notesLinks||[])[i]||[]}))];
  for(const it of text.items){if(it.t==='ch')all.push(it);if(it.t==='art')for(const p of it.paras)for(const l of p.lines)if(typeof l.text==='string')all.push(l);}
  for(const l of all){
   lines++;const r=toArabic(l.text,(l.links||[]).map(([a,b])=>[a,b]));if(r.changed)changed++;
   for(const [a,b] of l.links||[])assert.equal(r.text.slice(r.map(a),r.map(b)),l.text.slice(a,b),law.id);
  }
 }
 assert.ok(lines>18000&&changed>6000,lines+' '+changed);
});
