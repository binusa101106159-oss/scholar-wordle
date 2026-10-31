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
const C_ORDER = ['勞工職業災害保險醫療給付項目及支付標準', '職業災害勞工保護法'];
const A_ORDER = ['職業安全衛生法施行細則', '職業安全衛生管理辦法', '辦理勞工體格與健康檢查醫療機構認可及管理辦法',
  '職業傷病診治醫療機構認可管理補助及職業傷病通報辦法', '勞工保險條例', '勞工職業災害保險及保護法施行細則', '勞動事件法',
  '特定化學物質危害預防標準', '有機溶劑中毒預防規則', '粉塵危害預防標準', '危害性化學品評估及分級管理辦法', '職場霸凌防治措施準則',
  '妊娠與分娩後女性及未滿十八歲勞工禁止從事危險性或有害性工作認定標準', '性別平等工作法', '鉛中毒預防規則', '缺氧症預防規則',
  '高溫作業勞工作息時間標準', '游離輻射防護安全標準', '職業醫學科專科醫師及地區醫院以上之醫院專科醫師開具職業病門診單辦法', '勞工請假規則'];

test('S, B and C tiers are present in the study order, and every law shows its date', () => {
  assert.deepEqual(index.laws.filter(l => l.tier === 'S').map(l => l.name), S_ORDER);
  assert.deepEqual(index.laws.filter(l => l.tier === 'B').map(l => l.name), B_ORDER);
  assert.deepEqual(index.laws.filter(l => l.tier === 'C').map(l => l.name), C_ORDER);
  // tier A is one section in study order, numbered by its place in the full list (even while partly added)
  const a = index.laws.filter(l => l.tier === 'A');
  assert.deepEqual(a.map(l => l.name), A_ORDER.filter(n => a.some(l => l.name === n)));
  a.forEach(l => assert.equal(l.no, A_ORDER.indexOf(l.name) + 1, l.name));
  assert.deepEqual(index.tiers.map(t => t.id), ['S', 'A', 'B', 'C', '公保']);
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

test('public-service laws and their image-only retirement table are native and complete', () => {
  const laws = index.laws.filter(l => l.tier === '公保');
  assert.equal(laws.length, 7);
  assert.equal(laws.reduce((n, l) => n + l.annexes.length, 0), 9);
  const annex = read('annex/pub04-3.json');
  assert.ok(!JSON.stringify(annex).includes('"src"'));
  const table = annex.blocks.find(b => b.t === 'table');
  assert.equal(table.widths.length, 12);
  assert.equal(table.rows.length, 27);
  assert.equal(table.rows[0][0].diag.bl, '任職年資');
  assert.equal(table.rows[1][1].text, '77.5%');
  assert.equal(table.rows[26][11].text, '30.0%');
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

test('radiation tables preserve every column across page joins', () => {
  for (const id of ['a18-1', 'a18-3', 'a18-4']) {
    for (const [i, table] of read('annex/' + id + '.json').blocks.entries()) {
      if (table.t !== 'table') continue;
      const occupied = new Set();
      table.rows.forEach((row, r) => row.forEach(cell => {
        // Annex four prints a separate cell for each isotope, unlike annex three's lists.
        assert.ok(id !== 'a18-4' || (cell.text.match(/[A-Z][a-z]?[-−]\d+m?\b/g) || []).length <= 1,
          'combined isotope labels in ' + id + ' table ' + i + ' row ' + r);
        for (let y = r; y < r + cell.rs; y++) for (let x = cell.c; x < cell.c + cell.cs; x++) {
          assert.ok(y < table.rows.length, 'row overflow in ' + id);
          occupied.add(y + ':' + x);
        }
      }));
      for (let r = 0; r < table.rows.length; r++) for (let c = 0; c < table.widths.length; c++) {
        assert.ok(occupied.has(r + ':' + c), 'missing cell in ' + id + ' table ' + i + ' at ' + r + ':' + c);
      }
    }
  }
});
