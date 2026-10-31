const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'guides');
const read = p => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
const index = read('index.json');

// 人因性危害 in the order of the official OSHA list
const PHYS_ORDER = ['職業性聽力損失診斷認定參考指引', '職業曝露游離輻射引起之疾病認定參考指引', '職業暴露全身振動引起之腰椎椎間盤突出認定參考指引',
  '職業暴露熱危害引起之職業疾病認定參考指引', '職業暴露非游離輻射引起之視網膜傷害認定參考指引(視網膜光傷害等症)', '雷諾氏症候群之認定參考指引',
  '低溫引起之職業病認定參考指引', '職業性白內障認定參考指引', '異常氣壓（含潛水伕病）作業引起之職業疾病認定參考指引', '異常氣壓作業意外事件認定參考指引',
  '職業性光照性角結膜炎認定基準參考指引'];
const PSY_ORDER = ['工作相關心理壓力事件引起精神疾病認定參考指引', '職業相關之創傷後壓力症候群認定參考指引', '職業促發腦心血管疾病認定參考指引'];
const ERGO_ORDER = ['職業性腕隧道症候群認定參考指引', '職業性旋轉肌袖症候群認定參考指引', '職業性肌腱炎認定參考指引',
  '職業性長期以蹲跪姿勢工作引起之膝關節半月狀軟骨病變認定參考指引', '職業因素罹患肘隧道症候群與橈隧道症候群之認定參考指引',
  '職業性腰椎椎間盤突出認定參考指引', '長期以蹲跪姿勢工作引起之膝關節骨關節炎認定參考指引', '職業性頸椎椎間盤突出認定參考指引',
  '職業性肌腱腱鞘炎認定參考指引', '長期壓迫引起之關節滑囊病變認定參考指引'];

test('guide reader script parses and the tab is wired into the page', () => {
  new vm.Script(fs.readFileSync(path.join(dir, 'guides.js'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="game-tab-guides"/);
  assert.match(html, /id="guides-panel"/);
  assert.match(html, /guides\/guides\.js/);
  assert.match(html, /location\.hash === '#guides'/);
  assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /\.\/guides\/guides\.js/);
});

test('guides follow the official order and numbering, one section per category', () => {
  const e = index.guides.filter(g => g.cat === 'e');
  assert.deepEqual(e.map(g => g.name), ERGO_ORDER.filter(n => e.some(g => g.name === n)));
  e.forEach(g => assert.equal(g.no, ERGO_ORDER.indexOf(g.name) + 1, g.name));
  // 化學性、生物性危害: ids follow the official list (c001, b01 = first entry), so the number shown is the id's number
  index.guides.filter(g => g.cat === 'c' || g.cat === 'b').forEach(g => assert.equal(g.no, Number(g.id.slice(1)), g.id));
  for (const [cat, order] of [['p', PHYS_ORDER], ['s', PSY_ORDER]]) {
    const gs = index.guides.filter(g => g.cat === cat);
    assert.deepEqual(gs.map(g => g.name), order.filter(n => gs.some(g => g.name === n)));
    gs.forEach(g => assert.equal(g.no, order.indexOf(g.name) + 1, g.name));
  }
  // The five official categories keep their order, followed by the additional study categories.
  assert.deepEqual(index.cats.filter(c => !c.parent).map(c => c.name), ['人因性危害', '化學性危害', '物理性危害', '生物性危害', '社會、心理性危害', '農保', '四大計畫']);
  assert.deepEqual(index.cats.filter(c => c.parent === 'farm').map(c => c.name), ['人因性', '化學性', '物理性', '生物性']);
  for (const g of index.guides) assert.ok(index.cats.some(c => c.id === g.cat), g.id);
  for (const c of index.cats) assert.ok(c.total >= index.guides.filter(g => g.cat === c.id).length, c.name);
  assert.equal(new Set(index.cats.map(c => c.name)).size, index.cats.length);
  for (const c of index.cats) assert.doesNotMatch(c.name, /part|第\s*\d+\s*批/i);
});

test('every guide file loads, credits its source and has headings', () => {
  for (const meta of index.guides) {
    const g = read('text/' + meta.id + '.json');
    assert.equal(g.name, meta.name);
    assert.match(g.credit, meta.cat.startsWith('farm-') || meta.cat === 'plans' ? /資料來源：使用者提供之「.+」PDF。/ : /勞動部職業安全衛生署.*政府資料開放授權條款第1版/);
    if (g.scan) {
      // a scanned PDF: one page picture per page, nothing retyped
      assert.equal(meta.scan, true, meta.name);
      assert.equal(g.blocks.length, meta.pages, meta.name);
      assert.ok(g.blocks.every(b => b.t === 'img' && b.scan), meta.name);
      continue;
    }
    assert.ok(g.blocks.filter(b => b.t === 'h').length >= 5, meta.name);
    assert.ok(g.blocks.length > 20, meta.name);
    // no private-use glyphs (Wingdings bullets) left in the text
    assert.doesNotMatch(JSON.stringify(g), /[-]/, meta.name);
  }
});

test('farm guides are grouped by hazard and the four prevention plans are complete', () => {
  for (const [cat, count] of [['farm-e', 2], ['farm-c', 4], ['farm-p', 3], ['farm-b', 9], ['plans', 4]]) {
    assert.equal(index.guides.filter(g => g.cat === cat).length, count, cat);
  }
  assert.equal(index.cats.find(c => c.id === 'farm').total, 18);
  assert.ok(!index.cats.some(c => c.id === 'public' || c.name === '公保'));
  for (const c of index.cats.filter(c => c.parent)) assert.ok(index.cats.some(parent => parent.id === c.parent));
});

test('tables that the farm PDFs print as pictures or without inner rules are native tables', () => {
  const table = id => read('attach/' + id + '.json').blocks.find(b => b.t === 'table');
  // 熱指數表 (picture in the PDF, transcribed): 16 temperatures × 13 humidities, every value cell shaded 1–4
  const heat = table('farm-p03-t2');
  assert.equal(heat.rows.length, 18);
  const values = heat.rows.slice(0, 16).flatMap(r => r.filter(c => c.c >= 3));
  assert.equal(values.length, 16 * 13);
  assert.ok(values.every(c => [1, 2, 3, 4].includes(c.lv)));
  assert.ok(!read('attach/farm-p03-t2.json').blocks.some(b => b.t === 'img'));
  assert.equal(table('farm-p03-t3').rows.length, 5);
  // 有機磷中毒分級: one row per grade under the header
  assert.deepEqual(table('farm-c02-t2').rows.map(r => r[0].text), ['中毒分級', '無症狀', '輕微中毒', '中度中毒', '重度中毒']);
  // 常見肌肉骨骼傷病分析工具: one category cell spanning its tools
  assert.deepEqual(table('plans01-t4').rows.filter(r => r[0].c === 0 && r[0].rs > 1).map(r => [r[0].text, r[0].rs]), [['上肢', 7], ['下背部', 5], ['全身', 3]]);
});

test('every 表/圖 link and caption points at an attachment that exists, and every picture is shipped', () => {
  let links = 0;
  for (const meta of index.guides) {
    const ids = new Set(meta.attach.map(a => a.id));
    const g = read('text/' + meta.id + '.json');
    for (const b of g.blocks) {
      for (const [s, e, id] of b.links || []) {
        links++;
        if (id[0] === '#') { const h = g.blocks[Number(id.slice(1))]; assert.ok(h && h.t === 'h', id); assert.match(b.text.slice(s, e), /^附[錄件]/); continue; }
        assert.ok(ids.has(id), id); assert.match(b.text.slice(s, e), /^(附)?[表圖]/);
      }
      if (b.cap) assert.ok(ids.has(b.cap), b.cap);
      if (b.att) assert.ok(ids.has(b.att), b.att);
    }
    for (const id of ids) {
      const a = read('attach/' + id + '.json');
      if (a.doc) { assert.ok(a.blocks.length > 0, id); continue; }   // a whole document published with the guide
      assert.ok(a.blocks.some(b => b.t === 'table' || b.t === 'img'), id);
      assert.ok(a.blocks.some(b => b.cap === id), 'caption in ' + id);
    }
    for (const src of JSON.stringify(g).match(/"src":"[^"]+"/g) || []) {
      assert.ok(fs.existsSync(path.join(dir, 'attach/img', src.slice(7, -1))), src);
    }
  }
  assert.ok(links >= 2, 'links found: ' + links);
});

test('tables are rectangular: row and column spans add up', () => {
  const check = (t, where) => {
    const cols = t.widths.length;
    const filled = new Set();
    t.rows.forEach((row, r) => row.forEach(c => {
      for (let i = 0; i < c.rs; i++) for (let j = 0; j < c.cs; j++) {
        const key = (r + i) + ':' + (c.c + j);
        assert.ok(!filled.has(key), 'overlap at ' + key + ' in ' + where);
        filled.add(key);
      }
    }));
    assert.ok([...filled].every(k => Number(k.split(':')[1]) < cols), 'column overflow in ' + where);
  };
  for (const meta of index.guides) {
    const walk = blocks => blocks.forEach(b => { if (b.t === 'table') { if (b.rows.every(r => r.every(c => c.c != null))) check(b, meta.id); b.rows.forEach(r => r.forEach(c => c.blocks && walk(c.blocks))); } });
    walk(read('text/' + meta.id + '.json').blocks);
  }
});
