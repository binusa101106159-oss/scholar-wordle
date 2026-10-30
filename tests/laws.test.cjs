const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'laws');
const read = p => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
const index = read('index.json');

const S_ORDER = ['勞工健康保護規則', '職業安全衛生法', '勞工職業災害保險及保護法', '勞工職業災害保險職業傷病審查準則',
  '勞工作業環境監測實施辦法', '勞工作業場所容許暴露標準', '職業安全衛生設施規則', '女性勞工母性健康保護實施辦法', '勞動基準法',
  '勞工職業災害保險失能給付標準', '勞工保險失能給付標準', '勞工職業災害保險職業病鑑定作業實施辦法', '危害性化學品標示及通識規則'];

test('law reader script parses and the tab is wired into the page', () => {
  new vm.Script(fs.readFileSync(path.join(dir, 'laws.js'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="game-tab-laws"/);
  assert.match(html, /id="laws-panel"/);
  assert.match(html, /laws\/laws\.js/);
  assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /\.\/laws\/laws\.js/);
});

const B_ORDER = ['游離輻射防護法', '勞動基準法施行細則', '高架作業勞工保護措施標準'];

test('S and B tiers are present in the study order, and every law shows its date', () => {
  assert.deepEqual(index.laws.filter(l => l.tier === 'S').map(l => l.name), S_ORDER);
  assert.deepEqual(index.laws.filter(l => l.tier === 'B').map(l => l.name), B_ORDER);
  for (const l of index.laws) assert.match(l.date, /^民國 \d+ 年 \d\d 月 \d\d 日$/, l.name);
});

test('every law file loads with numbered articles and matches the catalogue', () => {
  for (const meta of index.laws) {
    const law = read('text/' + meta.id + '.json');
    const arts = law.items.filter(i => i.t === 'art');
    assert.equal(arts.length, meta.articles, meta.name);
    assert.ok(arts.length > 0, meta.name);
    const nos = arts.map(a => a.no);
    assert.equal(new Set(nos).size, nos.length, 'unique article numbers in ' + meta.name);
    assert.deepEqual(law.annexes.map(a => a.id), meta.annexes.map(a => a.id));
  }
});

test('every 附表 link points at an annex that exists, and every annex image is shipped', () => {
  const annexIds = new Set(index.laws.flatMap(l => l.annexes.map(a => a.id)));
  let links = 0;
  for (const meta of index.laws) {
    const law = read('text/' + meta.id + '.json');
    const all = law.items.filter(i => i.t === 'art').flatMap(a => a.paras.flatMap(p => p.lines)).concat(law.notes.map((t, k) => ({ text: t, links: law.notesLinks[k] })));
    for (const l of all) for (const [s, e, id] of l.links || []) {
      links++;
      assert.ok(annexIds.has(id), id);
      assert.match(l.text.slice(s, e), /^(附表|表)/);
    }
  }
  assert.ok(links >= 80, 'links found: ' + links);
  for (const id of annexIds) {
    const a = read('annex/' + id + '.json');
    for (const src of JSON.stringify(a).match(/"src":"[^"]+"/g) || []) {
      assert.ok(fs.existsSync(path.join(dir, 'annex/img', src.slice(7, -1))), src);
    }
    assert.ok(a.blocks.length > 0, id);
  }
});

test('tables are rectangular: row and column spans add up', () => {
  const check = (t, where) => {
    const cols = t.widths.length;
    const filled = [];
    t.rows.forEach((row, r) => row.forEach(c => {
      for (let i = 0; i < c.rs; i++) for (let j = 0; j < c.cs; j++) {
        const key = (r + i) + ':' + (c.c + j);
        assert.ok(!filled.includes(key), 'overlap at ' + key + ' in ' + where);
        filled.push(key);
      }
    }));
    assert.ok(filled.every(k => Number(k.split(':')[1]) < cols), 'column overflow in ' + where);
  };
  for (const meta of index.laws) for (const a of meta.annexes) {
    const walk = blocks => blocks.forEach(b => { if (b.t === 'table') { if (b.rows.every(r => r.every(c => c.c != null))) check(b, a.id); b.rows.forEach(r => r.forEach(c => c.blocks && walk(c.blocks))); } });
    walk(read('annex/' + a.id + '.json').blocks);
  }
});
