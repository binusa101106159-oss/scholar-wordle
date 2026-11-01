const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../review/review.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../review/data.json'), 'utf8'));
const items = data.items.map(item => ({ ...item, searchText: core.normalize([item.title, item.sourceTitle, item.text].join('\n')) }));

test('all source versions are retained and each entry has a usable title', () => {
  assert.equal(items.length, 158);
  assert.equal(new Set(items.map(item => item.id)).size, 158);
  for (const [kind, count] of [['letter', 99], ['document', 2], ['mail', 57]]) assert.equal(items.filter(item => item.kind === kind).length, count);
  for (const item of items) { assert.ok(item.title.trim(), item.id); assert.ok(item.text.trim(), item.id); }
});

test('the complete 751 source tables remain available for the native reader', () => {
  assert.equal(items.reduce((count, item) => count + (item.html.match(/<table(?:\s|>)/g) || []).length, 0), 751);
  assert.ok(items.some(item => /rowspan=|colspan=/.test(item.html)));
});

test('mail headers and active HTML are excluded from the reader dataset', () => {
  for (const item of items) {
    assert.doesNotMatch(item.text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, item.id);
    assert.doesNotMatch(item.html, /<(?:script|iframe|object|embed|form)\b|\son\w+\s*=|href\s*=\s*["']javascript:/i, item.id);
    assert.ok(!Object.hasOwn(item, 'email_headers'));
  }
});

test('search finds body text outside titles and combines query terms with AND', () => {
  const article = items.find(item => item.day === 106);
  assert.equal(core.matches(article, core.terms('creatinine 稀釋尿'), 'all'), true);
  assert.equal(core.matches(article, core.terms('creatinine 不存在的關鍵字'), 'all'), false);
  assert.equal(core.matches(article, core.terms('creatinine'), 'mail'), false);
  assert.ok(items.filter(item => core.matches(item, core.terms('Day106'), 'all')).length);
});

test('highlight positions map width variants and subscripts back to original characters', () => {
  assert.deepEqual(core.ranges('CO₂ 與 ＣＯ２', core.terms('co2')), [[0, 3], [6, 9]]);
  assert.deepEqual(core.ranges('HAVS', core.terms('havs av')), [[0, 4]]);
  assert.deepEqual(core.ranges('no match', core.terms('鉛')), []);
});

test('date and Day sorting remain stable with duplicate versions and absent Day numbers', () => {
  const newest = core.sort(items, 'newest');
  assert.equal(newest[0].day, 106);
  assert.equal(newest[0].kind, 'letter');
  const oldest = core.sort(items, 'oldest');
  assert.equal(oldest[0].day, 6);
  assert.equal(core.sort(items, 'day')[0].day, 6);
  assert.equal(core.sort(items, 'newest').length, items.length);
});
