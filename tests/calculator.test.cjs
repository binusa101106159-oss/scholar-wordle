'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {calculate,monthGrid,weekDates,monthWeek}=require('../calculator/calculator.js');
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
