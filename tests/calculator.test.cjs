'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {calculate}=require('../calculator/calculator.js');
test('calculator respects arithmetic precedence, signs and grouping',()=>{for(const [expression,result] of [['2+3×4','14'],['(2+3)×4','20'],['−(3+2)÷2','-2.5'],['3*-2','-6'],['--2','2'],['12/3/2','2'],['.5+1.25','1.75']])assert.equal(calculate(expression),result,expression);});
test('calculator handles explicit percentages and floating point display',()=>{assert.equal(calculate('200×15%'),'30');assert.equal(calculate('100+10%'),'100.1');assert.equal(calculate('0.1+0.2'),'0.3');assert.equal(calculate('1e+21/1e20'),'10');assert.equal(calculate('-0'),'0');});
test('calculator rejects invalid expressions, zero divisors and nonfinite results',()=>{for(const e of ['', '2+', '(2+3', '2(3)', '2/0', '0/0','1e999','9e300*9e300','alert(1)','2;3','1..2','()','-'.repeat(100)+'1'])assert.throws(()=>calculate(e),undefined,e);});
