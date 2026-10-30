/* 法規 tab: native reader for the study-list laws and their 附表. Data lives in laws/*.json. */
(() => {
  'use strict';
  const BASE = 'laws/';
  const STORE = 'scholar-laws-v1';
  const TIER_NAMES = { S: '熟練應用', A: '常見個案與專題', B: '特定場景查用', C: '支付、歷史與過渡' };
  const state = { index: null, byId: new Map(), texts: new Map(), annexes: new Map(), current: null, query: '', terms: [],
    scope: 'all', corpus: null, corpusPromise: null, ready: false, annexOpen: null };
  const by = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = {
    search: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    x: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    list: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    left: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    right: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'
  };

  function prefs() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { return {}; } }
  function setPrefs(patch) { try { localStorage.setItem(STORE, JSON.stringify(Object.assign(prefs(), patch))); } catch (_) { /* private mode */ } }

  async function fetchJSON(path) {
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error(path + ': ' + res.status);
    return res.json();
  }
  function cached(map, key, path) {
    if (!map.has(key)) map.set(key, fetchJSON(path).catch(err => { map.delete(key); throw err; }));
    return map.get(key);
  }
  const getText = id => cached(state.texts, id, 'text/' + id + '.json');
  const getAnnex = id => cached(state.annexes, id, 'annex/' + id + '.json');

  /* ── text search helpers: NFKC + lower-case, mapped back to original positions ── */
  function normMap(text) {
    let s = ''; const map = [];
    for (let i = 0; i < text.length; i++) {
      const n = text[i].normalize('NFKC').toLowerCase();
      for (let k = 0; k < n.length; k++) { s += n[k]; map.push(i); }
    }
    return { s, map };
  }
  function parseTerms(q) {
    return [...new Set(q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  }
  function ranges(text, terms) {
    if (!terms.length || !text) return [];
    const { s, map } = normMap(text); const out = [];
    for (const t of terms) {
      let i = s.indexOf(t);
      while (i !== -1) { out.push([map[i], map[i + t.length - 1] + 1]); i = s.indexOf(t, i + t.length); }
    }
    return out;
  }

  /* text with 附表 links and search marks */
  function rich(text, links, terms) {
    const n = text.length;
    if (!n) return '';
    const link = new Array(n).fill(null), mk = new Uint8Array(n);
    (links || []).forEach(([s, e, id]) => { for (let i = s; i < e && i < n; i++) link[i] = id; });
    ranges(text, terms).forEach(([s, e]) => { for (let i = s; i < e; i++) mk[i] = 1; });
    let out = '';
    for (let i = 0; i < n;) {
      const id = link[i]; let j = i;
      while (j < n && link[j] === id) j++;
      let inner = '';
      for (let k = i; k < j;) {
        const m = mk[k]; let l = k;
        while (l < j && mk[l] === m) l++;
        const t = esc(text.slice(k, l));
        inner += m ? '<mark class="lx-mark">' + t + '</mark>' : t;
        k = l;
      }
      out += id ? '<button type="button" class="lx-ref" data-annex="' + id + '" title="開啟' + esc(text.slice(i, j)) + '">' + inner + '</button>' : inner;
      i = j;
    }
    return out;
  }

  /* ── tables & formulas ── */
  function cellHTML(c, terms, tag, t) {
    if (c.diag) {
      const d = c.diag;
      return '<' + tag + ' class="lx-diag"><svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100"><line x1="55" y1="0" x2="100" y2="100"/><line x1="0" y1="42" x2="100" y2="100"/></svg>' +
        '<span class="lx-d-tr">' + rich(d.tr, null, terms) + '</span><span class="lx-d-mid">' + rich(d.mid, null, terms) + '</span><span class="lx-d-bl">' + rich(d.bl, null, terms) + '</span></' + tag + '>';
    }
    let inner = rich(c.text || '', null, terms);
    (c.img || []).forEach(im => { inner += '<img src="' + BASE + 'annex/img/' + im.src + '" width="' + Math.round(im.w * 1.25) + '" height="' + Math.round(im.h * 1.25) + '" alt="" loading="lazy">'; });
    if (c.blocks) inner += blocksHTML(c.blocks, terms, true);
    const span = (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '');
    // centre short entries in narrow columns (numbers, codes, grades); forms and prose stay left-aligned
    let share = 1;
    if (t && c.c != null) { const total = t.widths.reduce((a, b) => a + b, 0) || 1; share = t.widths.slice(c.c, c.c + (c.cs || 1)).reduce((a, b) => a + b, 0) / total; }
    const cls = [];
    if (tag === 'td' && c.text && !c.blocks && (c.rs || 1) <= 4 && share <= 0.16 && c.text.length <= 12) cls.push('lx-narrow');
    if (c.lv != null) cls.push('lx-heat lx-heat-' + c.lv);
    return '<' + tag + span + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + inner + '</' + tag + '>';
  }
  function tableHTML(t, terms, nested) {
    const total = t.widths.reduce((a, b) => a + b, 0) || 1;
    const cols = t.widths.map(w => '<col style="width:' + (w / total * 100).toFixed(2) + '%">').join('');
    const minW = Math.round(total * (nested ? 1.1 : 1.3));
    const head = Math.min(t.head || 0, t.rows.length - 1);
    const rowsHTML = (rows, tag) => rows.map(r => '<tr>' + r.map(c => cellHTML(c, terms, tag, t)).join('') + '</tr>').join('');
    return '<div class="lx-twrap' + (nested ? ' lx-nested' : '') + '"><table class="lx-table" style="min-width:' + minW + 'px"><colgroup>' + cols + '</colgroup>' +
      (head > 0 ? '<thead>' + rowsHTML(t.rows.slice(0, head), 'th') + '</thead>' : '') +
      '<tbody>' + rowsHTML(t.rows.slice(head), 'td') + '</tbody></table></div>';
  }
  function formulaHTML(rows, terms) {
    return '<div class="lx-formula" role="math">' + rows.map(r => '<div class="lx-frow">' + r.map(tok => typeof tok === 'string'
      ? '<span>' + rich(tok, null, terms) + '</span>'
      : '<span class="lx-frac"><span>' + rich(tok.num, null, terms) + '</span><span>' + rich(tok.den, null, terms) + '</span></span>').join('') + '</div>').join('') + '</div>';
  }
  function blocksHTML(blocks, terms, inCell) {
    return blocks.map(b => {
      if (b.t === 'p') return '<p class="' + (inCell ? 'lx-cell-p' : 'lx-ap' + (b.center ? ' lx-center' : '')) + '">' + rich(b.text, null, terms) + '</p>';
      if (b.t === 'table') return tableHTML(b, terms, inCell);
      if (b.t === 'img') return b.img.map(im => '<img class="lx-annex-img" src="' + BASE + 'annex/img/' + im.src + '" width="' + Math.round(im.w * 1.4) + '" alt="">').join('');
      return '';
    }).join('');
  }

  /* ── shell ── */
  function shell() {
    const panel = by('laws-panel');
    panel.innerHTML = `
      <div class="lx-layout">
        <aside class="lx-side sg-glass" aria-label="法規目錄與搜尋">
          <div class="lx-search">${icon.search}
            <input id="lx-q" type="search" placeholder="搜尋條文與附表" aria-label="關鍵字搜尋" autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button type="button" class="lx-clear" id="lx-clear" aria-label="清除搜尋" hidden>${icon.x}</button>
          </div>
          <div class="sg-segment lx-scope" id="lx-scope" role="group" aria-label="搜尋範圍" hidden>
            <button type="button" class="sg-btn" data-scope="all" aria-pressed="true">全部法規</button>
            <button type="button" class="sg-btn" data-scope="law" aria-pressed="false">目前這部</button>
          </div>
          <div class="lx-list" id="lx-list"><p class="lx-empty">載入中…</p></div>
        </aside>
        <section class="lx-reader">
          <div class="lx-bar">
            <button type="button" class="sg-btn lx-menu-btn" id="lx-menu">${icon.list}法規目錄</button>
            <label class="lx-jump">第<input id="lx-jump" inputmode="numeric" aria-label="跳到第幾條" placeholder="" autocomplete="off">條</label>
            <select class="lx-select" id="lx-chapters" aria-label="跳到章節" hidden></select>
            <span class="lx-spacer"></span>
          </div>
          <div class="lx-scroll" id="lx-scroll"><article class="lx-doc" id="lx-doc"></article></div>
        </section>
      </div>
      <dialog class="lx-dialog" id="lx-annex" aria-labelledby="lx-annex-title">
        <div class="lx-dialog-head">
          <div><p class="sg-eyebrow" id="lx-annex-law"></p><h2 class="lx-dialog-title" id="lx-annex-title"></h2></div>
          <div class="lx-dialog-tools">
            <button type="button" class="sg-btn lx-icon-btn" data-step="-1" aria-label="上一個附表">${icon.left}</button>
            <button type="button" class="sg-btn lx-icon-btn" data-step="1" aria-label="下一個附表">${icon.right}</button>
            <button type="button" class="sg-btn lx-icon-btn" data-close aria-label="關閉">${icon.x}</button>
          </div>
        </div>
        <div class="lx-dialog-body" id="lx-annex-body"></div>
      </dialog>`;
    wire();
  }

  function wire() {
    const q = by('lx-q');
    let timer = 0;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => setQuery(q.value), 180); });
    q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { e.preventDefault(); e.stopPropagation(); q.value = ''; setQuery(''); } });
    q.addEventListener('focus', () => loadCorpus().catch(() => {}), { once: true });
    by('lx-clear').addEventListener('click', () => { q.value = ''; setQuery(''); q.focus(); });
    by('lx-scope').addEventListener('click', e => {
      const b = e.target.closest('[data-scope]'); if (!b) return;
      state.scope = b.dataset.scope; renderSide();
    });
    by('lx-list').addEventListener('click', e => {
      const law = e.target.closest('[data-law]');
      const more = e.target.closest('[data-more]');
      if (more) { state.expanded = state.expanded || new Set(); state.expanded.add(more.dataset.more); renderSide(); return; }
      if (!law) return;
      const annex = law.dataset.openAnnex;
      if (annex) { openAnnex(annex); return; }
      openLaw(law.dataset.law, { art: law.dataset.art, flash: Boolean(law.dataset.art) });
      by('laws-panel').classList.remove('lx-drawer');
    });
    by('lx-menu').addEventListener('click', () => {
      by('laws-panel').classList.toggle('lx-drawer');
      if (by('laws-panel').classList.contains('lx-drawer')) by('lx-q').focus({ preventScroll: true });
    });
    by('lx-doc').addEventListener('click', e => {
      const ref = e.target.closest('[data-annex]');
      if (ref) { e.preventDefault(); openAnnex(ref.dataset.annex); }
    });
    by('lx-chapters').addEventListener('change', e => {
      const el = by(e.target.value); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const jump = by('lx-jump');
    jump.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = jump.value.normalize('NFKC').replace(/[^\d-]/g, '').replace(/^-+|-+$/g, '');
      if (!v || !state.current) return;
      if (!scrollToArticle(v, true)) { jump.select(); jump.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 180); }
    });
    let saveTimer = 0;
    by('lx-scroll').addEventListener('scroll', () => { clearTimeout(saveTimer); saveTimer = setTimeout(rememberPosition, 250); }, { passive: true });
    const dlg = by('lx-annex');
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { dlg.close(); return; }
      if (e.target.closest('[data-close]')) dlg.close();
      const step = e.target.closest('[data-step]');
      if (step) stepAnnex(Number(step.dataset.step));
    });
    dlg.addEventListener('close', () => { state.annexOpen = null; });
    window.addEventListener('keydown', e => {
      if (document.body.dataset.game !== 'laws' || dlg.open) return;
      const t = e.target;
      const typing = t && t.closest && t.closest('input,select,textarea');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (window.matchMedia('(max-width: 900px)').matches) by('laws-panel').classList.add('lx-drawer');
        q.focus(); q.select();
      } else if (e.key === 'Escape' && by('laws-panel').classList.contains('lx-drawer')) {
        by('laws-panel').classList.remove('lx-drawer');
      }
    });
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.querySelector('.sg-nav-shell') || document.body);
    window.addEventListener('pagehide', rememberPosition);
  }

  function measure() {
    const panel = by('laws-panel');
    if (!panel || panel.hidden) return;
    const top = Math.max(0, Math.round(panel.getBoundingClientRect().top + window.scrollY));
    panel.style.setProperty('--lx-top', top + 'px');
  }

  function rememberPosition() {
    if (!state.current) return;
    const pos = Object.assign({}, prefs().pos);
    pos[state.current.id] = Math.round(by('lx-scroll').scrollTop);
    setPrefs({ law: state.current.id, pos });
  }

  /* ── sidebar ── */
  function lawButton(l, n) {
    const annexN = l.annexes.length;
    return '<button type="button" class="lx-law" data-law="' + l.id + '"' + (state.current && state.current.id === l.id ? ' aria-current="true"' : '') + '>' +
      '<span class="lx-law-no">' + n + '</span><span>' + esc(l.name) + '</span>' +
      '<span class="lx-law-meta">' + l.articles + ' 條' + (annexN ? ' · ' + annexN + ' 個附表' : '') + '</span></button>';
  }
  function renderSide() {
    const list = by('lx-list');
    const idx = state.index;
    if (!idx) return;
    by('lx-clear').hidden = !state.query;
    by('lx-scope').hidden = !state.query;
    by('lx-scope').querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === state.scope)));
    if (!state.query) {
      list.innerHTML = idx.tiers.map(t => {
        const laws = idx.laws.filter(l => l.tier === t.id);
        return '<div class="lx-tier"><span><b>' + t.id + '</b>' + esc(t.name) + '</span><span>' + laws.length + ' 部</span></div>' +
          laws.map((l, i) => lawButton(l, i + 1)).join('');
      }).join('');
      return;
    }
    if (!state.corpus) { list.innerHTML = '<p class="lx-empty">正在載入全部條文以供搜尋…</p>'; return; }
    const hits = search(state.terms, state.scope === 'law' && state.current ? state.current.id : null);
    if (!hits.total) { list.innerHTML = '<p class="lx-empty">找不到「' + esc(state.query) + '」。<br>可試試較短的關鍵字，或用空格分開多個詞。</p>'; return; }
    let html = '<p class="lx-summary">' + hits.total + ' 處符合 · ' + hits.groups.length + ' 部法規</p>';
    state.expanded = state.expanded || new Set();
    for (const g of hits.groups) {
      const limit = state.expanded.has(g.law.id) ? Infinity : 6;
      html += '<div class="lx-hits-head"><span class="lx-hits-law">' + esc(g.law.name) + '</span><span class="lx-hits-count">' + g.items.length + '</span></div>';
      g.items.slice(0, limit).forEach(h => {
        html += '<button type="button" class="lx-hit" data-law="' + g.law.id + '"' + (h.annex ? ' data-open-annex="' + h.annex + '"' : ' data-art="' + esc(h.art) + '"') + '>' +
          '<span class="lx-hit-where' + (h.annex ? ' lx-annex-where' : '') + '">' + esc(h.where) + '</span>' + h.snippet + '</button>';
      });
      if (g.items.length > limit) html += '<button type="button" class="lx-more" data-more="' + g.law.id + '">再顯示 ' + (g.items.length - limit) + ' 筆</button>';
    }
    list.innerHTML = html;
  }

  /* ── search corpus ── */
  function lineText(l) {
    if (l.text != null) return l.text;
    if (l.table) return l.table.rows.map(r => r.map(c => c.text).join(' ')).join('\n');
    if (l.formula) return l.formula.map(r => r.map(t => typeof t === 'string' ? t : t.num + ' ／ ' + t.den).join(' ')).join('\n');
    return '';
  }
  function annexText(blocks) {
    return blocks.map(b => b.t === 'p' ? b.text : b.t === 'table'
      ? b.rows.map(r => r.map(c => c.text + (c.diag ? [c.diag.tr, c.diag.mid, c.diag.bl].join(' ') : '') + (c.blocks ? '\n' + annexText(c.blocks) : '')).join(' ')).join('\n') : '').join('\n');
  }
  function loadCorpus() {
    if (state.corpusPromise) return state.corpusPromise;
    state.corpusPromise = (async () => {
      const docs = [];
      await Promise.all(state.index.laws.map(async law => {
        const data = await getText(law.id);
        data.items.forEach(it => {
          if (it.t !== 'art') return;
          const text = it.paras.map(p => p.lines.map(lineText).join('\n')).join('\n');
          docs.push({ law: law.id, art: it.no, where: '第 ' + it.no + ' 條', text, norm: normMap(text).s, order: docs.length });
        });
        await Promise.all(law.annexes.map(async a => {
          const ad = await getAnnex(a.id);
          const text = annexText(ad.blocks);
          docs.push({ law: law.id, annex: a.id, where: a.label, text, norm: normMap(text).s });
        }));
      }));
      state.corpus = docs;
      if (state.query) renderSide();
      return docs;
    })().catch(err => { state.corpusPromise = null; by('lx-list').innerHTML = '<p class="lx-empty">無法載入搜尋資料。請確認網路連線後再試一次。</p>'; throw err; });
    return state.corpusPromise;
  }
  function snippet(text, terms) {
    const r = ranges(text, terms);
    const first = r.length ? Math.min(...r.map(x => x[0])) : 0;
    const start = Math.max(0, first - 22), end = Math.min(text.length, first + 64);
    const piece = text.slice(start, end).replace(/\s+/g, ' ');
    return (start > 0 ? '…' : '') + rich(piece, null, terms) + (end < text.length ? '…' : '');
  }
  function artKey(no) { return no.split('-').map(Number); }
  function search(terms, onlyLaw) {
    const groups = new Map();
    let total = 0;
    for (const d of state.corpus) {
      if (onlyLaw && d.law !== onlyLaw) continue;
      if (!terms.every(t => d.norm.includes(t))) continue;
      if (!groups.has(d.law)) groups.set(d.law, []);
      groups.get(d.law).push(d); total++;
    }
    const order = state.index.laws.map(l => l.id);
    const out = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([id, docs]) => {
      docs.sort((a, b) => (a.annex ? 1 : 0) - (b.annex ? 1 : 0) || (a.annex ? Number(a.annex.split('-')[1]) - Number(b.annex.split('-')[1])
        : (artKey(a.art)[0] - artKey(b.art)[0]) || ((artKey(a.art)[1] || 0) - (artKey(b.art)[1] || 0))));
      return { law: state.byId.get(id), items: docs.map(d => ({ art: d.art, annex: d.annex, where: d.where, snippet: snippet(d.text, terms) })) };
    });
    return { total, groups: out };
  }
  function setQuery(q) {
    state.query = q.trim();
    state.terms = parseTerms(state.query);
    state.expanded = new Set();
    renderSide();
    if (state.query) loadCorpus().catch(() => {});
    if (state.current) renderDoc(state.current, true);
    if (state.annexOpen) renderAnnexBody(state.annexOpen);
  }

  /* ── reader ── */
  async function openLaw(id, opts = {}) {
    const meta = state.byId.get(id);
    if (!meta) return;
    if (!state.current || state.current.id !== id) {
      rememberPosition();
      by('lx-doc').innerHTML = '<p class="lx-loading">載入中…</p>';
      let data;
      try { data = await getText(id); }
      catch (_) { by('lx-doc').innerHTML = '<p class="lx-loading">無法載入這部法規。請確認網路連線後再試一次。</p>'; return; }
      state.current = Object.assign({}, data, { meta });
      setPrefs({ law: id });
      renderDoc(state.current, false);
      renderSide();
      const saved = (prefs().pos || {})[id];
      const sc = by('lx-scroll');
      sc.style.scrollBehavior = 'auto';
      sc.scrollTop = opts.art ? 0 : (saved || 0);
      sc.style.scrollBehavior = '';
    }
    if (opts.art) scrollToArticle(opts.art, opts.flash);
  }
  function scrollToArticle(no, flash) {
    const el = by('lx-a-' + state.current.id + '-' + no);
    if (!el) return false;
    const sc = by('lx-scroll');
    const target = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 6;
    sc.style.scrollBehavior = 'auto';
    sc.scrollTo({ top: target, behavior: Math.abs(target - sc.scrollTop) > 2500 ? 'auto' : 'smooth' });
    sc.style.scrollBehavior = '';
    if (flash) { el.classList.add('lx-flash'); setTimeout(() => el.classList.remove('lx-flash'), 1400); }
    return true;
  }
  function renderDoc(law, keepScroll) {
    const terms = state.terms, meta = law.meta;
    const sc = by('lx-scroll'), top = sc.scrollTop;
    const tierLaws = state.index.laws.filter(l => l.tier === meta.tier);
    let html = '<div class="lx-head sg-glass"><p class="sg-eyebrow">' + meta.tier + ' · ' + esc(TIER_NAMES[meta.tier] || '') + ' · ' + (tierLaws.indexOf(meta) + 1) + ' / ' + tierLaws.length + '</p>' +
      '<h1 class="lx-title">' + rich(meta.name, null, terms) + '</h1>' +
      '<p class="lx-meta">' + (law.date ? '<span>' + esc(law.dateLabel) + ' ' + esc(law.date) + '</span>' : '') + '<span>' + meta.articles + ' 條</span></p>' +
      (law.status ? '<p class="lx-status">' + esc(law.status) + '</p>' : '') +
      law.notes.map((n, i) => '<p class="lx-note">' + rich(n, (law.notesLinks || [])[i], terms) + '</p>').join('');
    if (law.annexes.length) {
      html += '<div class="lx-chips">' + law.annexes.map(a => '<button type="button" class="lx-chip" data-annex="' + a.id + '">' + esc(a.label) + (a.title ? '<span>' + esc(a.title) + '</span>' : '') + '</button>').join('') + '</div>';
    }
    html += '</div>';
    const chapters = [];
    law.items.forEach((it, k) => {
      if (it.t === 'ch') {
        const kind = (it.text.match(/^第\s*\S+?\s*([編章節款目])/) || [])[1];
        const level = kind === '節' ? 2 : kind === '款' || kind === '目' ? 3 : 1;
        const hid = 'lx-ch-' + law.id + '-' + k;
        chapters.push({ id: hid, text: it.text, level });
        html += '<h2 class="lx-ch lx-ch-' + level + '" id="' + hid + '">' + rich(it.text, null, terms) + '</h2>';
        return;
      }
      html += '<section class="lx-art" id="lx-a-' + law.id + '-' + it.no + '"><h3 class="lx-art-no">第 ' + it.no + ' 條</h3><div class="lx-art-body">';
      it.paras.forEach(p => {
        html += '<div class="lx-para' + (p.n ? ' lx-numbered' : '') + '">' + (p.n ? '<span class="lx-pn" aria-label="第' + p.n + '項">' + p.n + '</span>' : '');
        p.lines.forEach(l => {
          if (l.table) html += tableHTML(l.table, terms, false);
          else if (l.formula) html += formulaHTML(l.formula, terms);
          else html += '<p class="lx-l lx-lv' + (l.lv || 0) + (l.notice ? ' lx-notice' : '') + '">' + rich(l.text, l.links, terms) + '</p>';
        });
        html += '</div>';
      });
      html += '</div></section>';
    });
    by('lx-doc').innerHTML = html;
    const sel = by('lx-chapters');
    sel.hidden = !chapters.length;
    sel.innerHTML = '<option value="">章節</option>' + chapters.map(c => '<option value="' + c.id + '">' + '　'.repeat(c.level - 1) + esc(c.text.replace(/\s+/g, ' ')) + '</option>').join('');
    by('lx-jump').value = '';
    if (keepScroll) { sc.style.scrollBehavior = 'auto'; sc.scrollTop = top; sc.style.scrollBehavior = ''; }
    document.title = meta.name + ' · Scholar';
  }

  /* ── 附表 window ── */
  function annexMeta(id) {
    const lawId = id.split('-')[0];
    const law = state.byId.get(lawId);
    const list = law ? law.annexes : [];
    return { law, list, pos: list.findIndex(a => a.id === id) };
  }
  async function openAnnex(id) {
    const dlg = by('lx-annex');
    const { law, list, pos } = annexMeta(id);
    if (!law || pos < 0) return;
    const a = list[pos];
    state.annexOpen = id;
    by('lx-annex-law').textContent = law.name;
    by('lx-annex-title').innerHTML = '<b>' + esc(a.label) + '</b>' + esc(a.title || '');
    dlg.querySelector('[data-step="-1"]').disabled = pos <= 0;
    dlg.querySelector('[data-step="1"]').disabled = pos >= list.length - 1;
    by('lx-annex-body').innerHTML = '<p class="lx-loading">載入中…</p>';
    if (!dlg.open) dlg.showModal();
    await renderAnnexBody(id);
  }
  async function renderAnnexBody(id) {
    let data;
    try { data = await getAnnex(id); }
    catch (_) { by('lx-annex-body').innerHTML = '<p class="lx-loading">無法載入這個附表。請確認網路連線後再試一次。</p>'; return; }
    if (state.annexOpen !== id) return;
    const body = by('lx-annex-body');
    body.innerHTML = blocksHTML(data.blocks, state.terms, false);
    body.scrollTop = 0;
    const m = body.querySelector('mark.lx-mark');
    if (m) m.scrollIntoView({ block: 'center' });
  }
  function stepAnnex(d) {
    if (!state.annexOpen) return;
    const { list, pos } = annexMeta(state.annexOpen);
    const next = list[pos + d];
    if (next) openAnnex(next.id);
  }

  /* ── entry point used by the tab switcher ── */
  let booted = null;
  function show() {
    const panel = by('laws-panel');
    if (!panel) return;
    measure();
    if (!booted) {
      booted = (async () => {
        shell(); measure();
        try { state.index = await fetchJSON('index.json'); }
        catch (_) { by('lx-list').innerHTML = '<p class="lx-empty">無法載入法規目錄。第一次使用需要網路連線，之後可離線閱讀。</p>'; booted = null; return; }
        state.index.laws.forEach(l => state.byId.set(l.id, l));
        renderSide();
        const last = prefs().law;
        await openLaw(state.byId.has(last) ? last : state.index.laws[0].id);
        // warm the cache for offline use and instant search
        const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1500));
        idle(() => loadCorpus().catch(() => {}));
      })();
    } else if (state.current) {
      document.title = state.current.meta.name + ' · Scholar';
    }
    return booted;
  }
  window.ScholarLaws = { show };
})();
