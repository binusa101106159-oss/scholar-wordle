const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script id="scholar-puzzle-core">([\s\S]*?)<\/script>/)[1];
const context = { module: { exports: {} } };
vm.runInNewContext(code, context);
const P = context.module.exports;

test('all inline scripts parse, including the retained Wordle', () => {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  assert.match(html, /id="game-tab-crossword"/);
  assert.match(html, /id="game-tab-sudoku"/);
});

test('Sudoku solver rejects contradictions and detects multiple solutions', () => {
  const invalid = Array(81).fill(0); invalid[0] = 1; invalid[8] = 1;
  assert.equal(P.countSolutions(invalid), 0);
  assert.equal(P.countSolutions(Array(81).fill(0)), 2);
  assert.equal(P.countSolutions([1, 2]), 0);
});

for (const difficulty of ['easy', 'medium', 'hard']) {
  test(difficulty + ' Sudoku puzzles have exactly one valid solution', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = P.generateSudoku(difficulty, P.seededRandom(seed));
      assert.equal(P.countSolutions(p.givens), 1);
      assert.equal(P.countSolutions(p.solution), 1);
      assert.equal(p.solution.length, 81);
      p.givens.forEach((n, i) => { if (n) assert.equal(n, p.solution[i]); });
      assert.ok(p.clues >= { easy: 42, medium: 34, hard: 28 }[difficulty]);
      assert.ok(p.clues <= { easy: 42, medium: 34, hard: 31 }[difficulty]);
      for (let r = 0; r < 9; r++) {
        assert.equal(new Set(p.solution.slice(r * 9, r * 9 + 9)).size, 9);
        assert.equal(new Set(Array.from({ length: 9 }, (_, c) => p.solution[c * 9 + r])).size, 9);
      }
    }
  });
}

for (const size of [9, 13]) {
  test(size + '×' + size + ' crosswords have connected, correctly numbered, unambiguous entries', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = P.generateCrossword(size, P.seededRandom(seed));
      assert.ok(p.entries.length >= (size === 9 ? 8 : 15), 'enough clues, seed ' + seed);
      assert.equal(new Set(p.entries.map(e => e.answer)).size, p.entries.length);
      const coverage = new Set();
      const starts = [...new Set(p.entries.map(e => e.cells[0]))].sort((a, b) => a - b);
      for (const e of p.entries) {
        assert.ok(e.answer.length >= 3);
        assert.equal(e.cells.map(i => p.solution[i]).join(''), e.answer);
        assert.equal(e.number, starts.indexOf(e.cells[0]) + 1);
        e.cells.forEach((i, k) => { assert.ok(i >= 0 && i < size * size); coverage.add(i); if (k) assert.equal(i - e.cells[k - 1], e.direction === 'down' ? size : 1); });
      }
      p.solution.forEach((v, i) => { assert.equal(coverage.has(i), Boolean(v)); });
      const reached = new Set([0]);
      for (let pass = 0; pass < p.entries.length; pass++) p.entries.forEach((e, i) => { if (p.entries.some((other, j) => reached.has(j) && other.cells.some(cell => e.cells.includes(cell)))) reached.add(i); });
      assert.equal(reached.size, p.entries.length, 'all words are connected');
      for (const direction of ['across', 'down']) {
        for (let line = 0; line < size; line++) {
          let run = [];
          const check = () => { if (run.length > 1) assert.ok(p.entries.some(e => e.direction === direction && e.cells.length === run.length && e.cells.every((v, i) => v === run[i])), 'every letter run has a clue'); run = []; };
          for (let k = 0; k < size; k++) { const i = direction === 'across' ? line * size + k : k * size + line; if (p.solution[i]) run.push(i); else check(); }
          check();
        }
      }
    }
  });
}
