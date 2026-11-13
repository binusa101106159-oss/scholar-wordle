'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {calculate,monthGrid,weekDates,monthWeek,followupDate,dayInfo}=require('../calculator/calculator.js');
test('calculator respects arithmetic precedence, signs and grouping',()=>{for(const [expression,result] of [['2+3×4','14'],['(2+3)×4','20'],['−(3+2)÷2','-2.5'],['3*-2','-6'],['--2','2'],['12/3/2','2'],['.5+1.25','1.75']])assert.equal(calculate(expression),result,expression);});
test('calculator handles explicit percentages and floating point display',()=>{assert.equal(calculate('200×15%'),'30');assert.equal(calculate('100+10%'),'100.1');assert.equal(calculate('0.1+0.2'),'0.3');assert.equal(calculate('1e+21/1e20'),'10');assert.equal(calculate('-0'),'0');});
test('calculator rejects invalid expressions, zero divisors and nonfinite results',()=>{for(const e of ['', '2+', '(2+3', '2(3)', '2/0', '0/0','1e999','9e300*9e300','alert(1)','2;3','1..2','()','-'.repeat(100)+'1'])assert.throws(()=>calculate(e),undefined,e);});

test('monthly calendar aligns weekdays and handles leap years and year boundaries',()=>{
 for(const [year,month,length,weekday] of [[2026,10,30,0],[2024,1,29,4],[1900,1,28,4],[2000,1,29,2],[2027,0,31,5]]){
  const grid=monthGrid(year*12+month),days=grid.days.filter(day=>day!==null);
  assert.equal(grid.year,year);assert.equal(grid.month,month);assert.equal(grid.days.length,42);
  assert.equal(days.length,length);assert.equal(grid.days.indexOf(1),weekday);
  assert.deepEqual(days,Array.from({length},(_,i)=>i+1));
 }
 assert.equal(monthGrid(2026*12+12).year,2027);
 assert.throws(()=>monthGrid(NaN));assert.throws(()=>monthGrid(-1));
});

test('continuous calendar weeks contain adjacent dates across months and leap days',()=>{
 const leap=weekDates(monthWeek(2024*12+1)+28);
 assert.deepEqual(leap.map(d=>[d.month+1,d.day]),[[2,25],[2,26],[2,27],[2,28],[2,29],[3,1],[3,2]]);
 const year=weekDates(monthWeek(2027*12));
 assert.deepEqual(year.map(d=>[d.year,d.month+1,d.day]),[[2026,12,27],[2026,12,28],[2026,12,29],[2026,12,30],[2026,12,31],[2027,1,1],[2027,1,2]]);
});

test('follow-up markers accept explicit Gregorian or ROC dates without guessing missing years',()=>{
 for(const text of ['2026/11/18 上午','2026-11-18T09:00','2026年11月18日 下午','115/11/18','民國115年11月18日','２０２６／１１／１８'])assert.equal(followupDate(text),'2026-11-18',text);
 assert.equal(followupDate('2024/2/29'),'2024-02-29');
 for(const text of ['11/18 上午','下週','2026/2/29','2026/13/1','2026/11/18取消','2026/11/18改11/19','2026/11/180'])assert.equal(followupDate(text),null,text);
});
test('compact Gregorian and ROC follow-up dates identify the same calendar day',()=>{
 for(const text of ['20261113','1151113','２０２６１１１３','１１５１１１３','民國1151113',' 20261113 ', '1151113 下午', '20261113（五）', '20261113T09:00'])assert.equal(followupDate(text),'2026-11-13',text);
 for(const [text,date] of [['20240229','2024-02-29'],['1130229','2024-02-29'],['0990101','2010-01-01'],['0010101','1912-01-01'],['20261231','2026-12-31'],['1160101','2027-01-01']])assert.equal(followupDate(text),date,text);
 for(const text of ['20260229','1150229','20260431','1151131','20260013','1151301','20261100','0001113','202611','115111','202611130','11511130','20261113取消','1151113改11/14','20261113或20261114'])assert.equal(followupDate(text),null,text);
});
test('official Taiwan calendar distinguishes holidays, substitute days and working Saturdays',()=>{
 const data=require('../calculator/taiwan-calendar.json');
 assert.deepEqual(data.years,[2023,2024,2025,2026,2027]);
 assert.equal(data.sources.reduce((sum,item)=>sum+item.rows,0),1826);
 assert.equal(dayInfo('2023-01-07',data).makeup,true);
 assert.equal(dayInfo('2024-02-17',data).off,false);
 assert.equal(dayInfo('2026-05-01',data).label,'勞動節');assert.equal(dayInfo('2026-05-01',data).off,true);
 assert.equal(dayInfo('2026-12-25',data).label,'行憲紀念日');
 assert.equal(dayInfo('2026-02-27',data).label,'補假');
 assert.equal(dayInfo('2027-01-04',data).off,false);
 assert.equal(dayInfo('2028-01-01',data).known,false);
 for(const item of data.sources){assert.match(item.url,/^https:\/\/www\.dgpa\.gov\.tw\//);assert.match(item.sha256,/^[a-f0-9]{64}$/);}
});

