'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {validate, combine, covers, dayParts} = require('../calendar/calendar.js');
const event = (id, extra={}) => ({id, title:'事件', date:'2026-11-12', endDate:'2026-11-12', startTime:'', endTime:'', period:'PM', notes:'', source:'manual', ...extra});
test('calendar rejects impossible dates and reversed time ranges but allows overnight events', () => {
  for (const extra of [{date:'2026-11-31'}, {endDate:'2026-11-11'}, {title:'  '}, {startTime:'24:00'}, {endTime:'10:00'}, {startTime:'14:00',endTime:'13:00'}]) assert.throws(()=>validate(event('one',extra)));
  assert.equal(validate(event('one',{startTime:'23:00',endTime:'01:00',endDate:'2026-11-13'})).endDate,'2026-11-13');
  assert.equal(validate(event('past',{date:'2025-10-31',endDate:'2025-10-31'})).date,'2025-10-31');
  assert.equal(validate(event('two',{startTime:'09:30'})).startTime,'09:30');
});
test('roster updates preserve manual events, edits and deletions without stale removed assignments', () => {
  const imported = event('roster-a',{source:'roster'}), removed=event('roster-removed',{source:'roster'});
  const edited={...imported,title:'自己的修改'}, personal=event('manual-one');
  assert.deepEqual(combine([imported],{[imported.id]:edited,[removed.id]:removed,[personal.id]:personal}).map(e=>e.id).sort(),['manual-one','roster-a']);
  assert.equal(combine([imported],{[imported.id]:edited})[0].title,'自己的修改');
  assert.deepEqual(combine([imported],{[imported.id]:{id:imported.id,deleted:true}}),[]);
});
test('monthly roles include both endpoint days, outside dates excluded', () => {
  const role=event('role',{date:'2026-12-01',endDate:'2026-12-31'});
  assert.ok(covers(role,'2026-12-01')); assert.ok(covers(role,'2026-12-31')); assert.ok(!covers(role,'2027-01-01'));
});
test('initial roster contains only this owner from November onward, with provisional December', () => {
  const feed=require('../calendar/roster.json');
  assert.equal(feed.owner,'其家'); assert.equal(feed.months['2026-11'].count,15); assert.equal(feed.months['2026-12'].count,5);
  assert.ok(feed.events.every(e=>e.date>='2026-11-01' && !e.title.includes('門診')));
  assert.equal(feed.events.filter(e=>e.title==='照會').length,5);
  assert.ok(feed.events.filter(e=>e.date.startsWith('2026-12')).every(e=>e.provisional));
  feed.events.forEach(validate);
});

test('day halves handle source periods, noon crossings and overnight events', () => {
  const date='2026-11-12';
  assert.deepEqual(dayParts(event('pm'),date),['PM']);
  assert.deepEqual(dayParts(event('all',{period:''}),date),[]);
  assert.deepEqual(dayParts(event('morning',{startTime:'09:00',endTime:'12:00'}),date),['AM']);
  assert.deepEqual(dayParts(event('noon',{startTime:'11:00',endTime:'13:00'}),date),['AM','PM']);
  assert.deepEqual(dayParts(event('afternoon',{startTime:'12:00',endTime:'13:00'}),date),['PM']);
  const night=event('night',{startTime:'23:00',endTime:'01:00',endDate:'2026-11-13'});
  assert.deepEqual(dayParts(night,date),['PM']);
  assert.deepEqual(dayParts(night,'2026-11-13'),['AM']);
});
