/* 指引 tab: native reader for the 職業病認定參考指引 and their 表/圖. Data lives in guides/*.json. */
(() => {
  'use strict';
  const BASE = 'guides/';
  const STORE = 'scholar-guides-v1';
  const state = { index: null, byId: new Map(), texts: new Map(), atts: new Map(), current: null, query: '', terms: [],
    scope: 'all', corpus: null, corpusPromise: null, attOpen: null };
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
  const getAtt = id => cached(state.atts, id, 'attach/' + id + '.json');

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

  /* text with 表/圖 links and search marks */
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
        inner += m ? '<mark class="gx-mark">' + t + '</mark>' : t;
        k = l;
      }
      // '#12' jumps to block 12 of this guide (附錄/附件 sections); anything else opens a 表/圖 window
      out += !id ? inner : id[0] === '#'
        ? '<button type="button" class="gx-ref" data-goto="' + id.slice(1) + '" title="跳到' + esc(text.slice(i, j)) + '">' + inner + '</button>'
        : '<button type="button" class="gx-ref" data-att="' + id + '" title="開啟' + esc(text.slice(i, j)) + '">' + inner + '</button>';
      i = j;
    }
    return out;
  }

  /* ── tables, pictures, column lists ── */
  function cellHTML(c, terms, tag, t) {
    if (c.diag) {
      const d = c.diag;
      const span = (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '');
      const lines = d.lines ? d.lines.map(([x1, y1, x2, y2]) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>').join('')
        : d.n === 1 ? '<line x1="0" y1="0" x2="100" y2="100"/>' : '<line x1="55" y1="0" x2="100" y2="100"/><line x1="0" y1="42" x2="100" y2="100"/>';
      const label = name => {
        const pos = d.positions && d.positions[name];
        const style = pos ? ' style="left:' + pos[0] + '%;top:' + pos[1] + '%;right:auto;bottom:auto;transform:translate(-50%,-50%)"' : '';
        return '<span class="gx-d-' + name + '"' + style + '>' + rich(d[name], null, terms) + '</span>';
      };
      return '<' + tag + span + ' class="gx-diag' + (d.n === 1 ? ' gx-diag-1' : '') + '"><svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">' + lines + '</svg>' +
        label('tr') + label('mid') + label('bl') + '</' + tag + '>';
    }
    let inner = rich(c.text || '', null, terms);
    (c.img || []).forEach(im => { inner += '<img src="' + BASE + 'attach/img/' + im.src + '" width="' + Math.round(im.w * 1.25) + '" height="' + Math.round(im.h * 1.25) + '" alt="" loading="lazy">'; });
    if (c.blocks) inner += blocksHTML(c.blocks, terms, { inCell: true });
    const span = (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '');
    let share = 1;
    if (t && c.c != null) { const total = t.widths.reduce((a, b) => a + b, 0) || 1; share = t.widths.slice(c.c, c.c + (c.cs || 1)).reduce((a, b) => a + b, 0) / total; }
    const cls = [];
    if (tag === 'td' && c.text && !c.blocks && (c.rs || 1) <= 4 && share <= 0.16 && c.text.length <= 12) cls.push('gx-narrow');
    return '<' + tag + span + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + inner + '</' + tag + '>';
  }
  function tableHTML(t, terms, nested) {
    const total = t.widths.reduce((a, b) => a + b, 0) || 1;
    const cols = t.widths.map(w => '<col style="width:' + (w / total * 100).toFixed(2) + '%">').join('');
    const minW = t.widths.length > 4 ? Math.round(total * (nested ? 1.1 : 1.3)) : 0;
    let head = Math.min(t.head || 0, t.rows.length - 1);
    if (head > 0) head = Math.min(t.rows.length - 1, Math.max(head, ...t.rows[0].map(c => c.rs || 1)));
    const rowsHTML = (rows, tag) => rows.map(r => '<tr>' + r.map(c => cellHTML(c, terms, tag, t)).join('') + '</tr>').join('');
    return '<div class="gx-twrap' + (nested ? ' gx-nested' : '') + '"><table class="gx-table" style="min-width:' + minW + 'px"><colgroup>' + cols + '</colgroup>' +
      (head > 0 ? '<thead>' + rowsHTML(t.rows.slice(0, head), 'th') + '</thead>' : '') +
      '<tbody>' + rowsHTML(t.rows.slice(head), 'td') + '</tbody></table></div>';
  }
  function paraStyle(b) {
    const s = [];
    if (b.ind) s.push('padding-left:' + b.ind + 'em');
    if (b.hang) s.push('text-indent:' + b.hang + 'em');
    return s.length ? ' style="' + s.join(';') + '"' : '';
  }
  /* opts: { inCell, anchor: gid (body blocks get ids), card: true inside the 表/圖 window } */
  function blocksHTML(blocks, terms, opts = {}) {
    const out = [];
    let figure = null;           // consecutive pictures of one figure sit side by side
    const flush = () => { if (figure) { out.push('<div class="gx-fig">' + figure.join('') + '</div>'); figure = null; } };
    blocks.forEach((b, k) => {
      const aid = opts.anchor ? ' id="gx-b-' + opts.anchor + '-' + k + '"' : '';
      if (b.t === 'img') {
        (figure = figure || []).push(b.img.map(im => '<img src="' + BASE + 'attach/img/' + im.src + '" width="' + Math.round(im.w * 1.4) + '" height="' + Math.round(im.h * 1.4) + '" alt="" loading="lazy"' + aid + '>').join(''));
        return;
      }
      // one row of labels printed under a row of pictures: put each label under its picture
      if (figure && b.t === 'cols' && b.rows.length === 1 && b.rows[0].length === figure.length) {
        out.push('<div class="gx-fig"' + aid + '>' + figure.map((f, i) => '<figure>' + f + '<figcaption>' + rich(b.rows[0][i], null, terms) + '</figcaption></figure>').join('') + '</div>');
        figure = null; return;
      }
      flush();
      if (b.t === 'h') { out.push('<h' + (b.lv + 1) + ' class="gx-h gx-h' + b.lv + '"' + aid + '>' + rich(b.text, b.links, terms) + '</h' + (b.lv + 1) + '>'); return; }
      if (b.t === 'p') {
        if (opts.inCell) { out.push('<p class="gx-cell-p">' + rich(b.text, null, terms) + '</p>'); return; }
        if (b.cap && !opts.card) { out.push('<p class="gx-cap"' + aid + '><button type="button" class="gx-cap-btn" data-att="' + b.cap + '" title="在視窗中開啟">' + rich(b.text, null, terms) + '</button></p>'); return; }
        out.push('<p class="gx-p' + (b.cap ? ' gx-cap-text' : '') + '"' + aid + paraStyle(b) + '>' + rich(b.text, b.links, terms) + '</p>');
        return;
      }
      if (b.t === 'cols') {
        const n = Math.max(...b.rows.map(r => r.length));
        out.push('<div class="gx-cols" style="--gx-n:' + n + '"' + aid + '>' + b.rows.map(r => r.map(c => '<span>' + rich(c, null, terms) + '</span>').join('') + '<span></span>'.repeat(n - r.length)).join('') + '</div>');
        return;
      }
      if (b.t === 'table') { out.push('<div class="gx-tblock"' + aid + '>' + tableHTML(b, terms, opts.inCell) + '</div>'); return; }
    });
    flush();
    return out.join('');
  }

  /* ── shell ── */
  function shell() {
    const panel = by('guides-panel');
    panel.innerHTML = `
      <div class="gx-layout">
        <div class="gx-scrim" id="gx-scrim" aria-hidden="true"></div>
        <aside class="gx-side sg-glass" aria-label="指引目錄與搜尋">
          <div class="gx-side-head"><span>指引目錄</span><button type="button" class="sg-btn gx-icon-btn" id="gx-side-close" aria-label="關閉目錄">${icon.x}</button></div>
          <div class="gx-search">${icon.search}
            <input id="gx-q" type="search" placeholder="搜尋指引全文" aria-label="關鍵字搜尋" autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button type="button" class="gx-clear" id="gx-clear" aria-label="清除搜尋" hidden>${icon.x}</button>
          </div>
          <div class="sg-segment gx-scope" id="gx-scope" role="group" aria-label="搜尋範圍" hidden>
            <button type="button" class="sg-btn" data-scope="all" aria-pressed="true">全部指引</button>
            <button type="button" class="sg-btn" data-scope="guide" aria-pressed="false">目前這份</button>
          </div>
          <div class="gx-list" id="gx-list"><p class="gx-empty">載入中…</p></div>
        </aside>
        <section class="gx-reader">
          <div class="gx-bar">
            <button type="button" class="sg-btn gx-menu-btn" id="gx-menu">${icon.list}指引目錄</button>
            <select class="gx-select" id="gx-chapters" aria-label="跳到章節" hidden></select>
            <span class="gx-spacer"></span>
          </div>
          <div class="gx-scroll" id="gx-scroll"><article class="gx-doc" id="gx-doc"></article></div>
        </section>
      </div>
      <dialog class="gx-dialog" id="gx-att" aria-labelledby="gx-att-title">
        <div class="gx-dialog-head">
          <div><p class="sg-eyebrow" id="gx-att-guide"></p><h2 class="gx-dialog-title" id="gx-att-title"></h2></div>
          <div class="gx-dialog-tools">
            <button type="button" class="sg-btn gx-icon-btn" data-step="-1" aria-label="上一個表或圖">${icon.left}</button>
            <button type="button" class="sg-btn gx-icon-btn" data-step="1" aria-label="下一個表或圖">${icon.right}</button>
            <button type="button" class="sg-btn gx-icon-btn" data-close aria-label="關閉">${icon.x}</button>
          </div>
        </div>
        <div class="gx-dialog-body" id="gx-att-body"></div>
      </dialog>`;
    wire();
  }

  function wire() {
    const q = by('gx-q');
    let timer = 0;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => setQuery(q.value), 180); });
    q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { e.preventDefault(); e.stopPropagation(); q.value = ''; setQuery(''); } });
    q.addEventListener('focus', () => loadCorpus().catch(() => {}), { once: true });
    by('gx-clear').addEventListener('click', () => { q.value = ''; setQuery(''); q.focus(); });
    by('gx-scope').addEventListener('click', e => {
      const b = e.target.closest('[data-scope]'); if (!b) return;
      state.scope = b.dataset.scope; renderSide();
    });
    by('gx-list').addEventListener('click', e => {
      const g = e.target.closest('[data-guide]');
      const more = e.target.closest('[data-more]');
      if (more) { state.expanded = state.expanded || new Set(); state.expanded.add(more.dataset.more); renderSide(); return; }
      if (!g) return;
      openGuide(g.dataset.guide, { block: g.dataset.block, flash: Boolean(g.dataset.block) });
      state.closeDrawer();
    });
    // the drawer gets its own history entry, so the phone's back gesture closes it instead of leaving the page
    const drawerOpen = () => by('guides-panel').classList.contains('gx-drawer');
    const openDrawer = () => {
      if (drawerOpen()) return;
      by('guides-panel').classList.add('gx-drawer');
      try { history.pushState({ gxDrawer: true }, ''); } catch (_) { /* file:// */ }
    };
    const closeDrawer = () => {
      if (!drawerOpen()) return;
      by('guides-panel').classList.remove('gx-drawer');
      if (history.state && history.state.gxDrawer) history.back();
    };
    state.openDrawer = openDrawer; state.closeDrawer = closeDrawer;
    window.addEventListener('popstate', () => { if (drawerOpen()) by('guides-panel').classList.remove('gx-drawer'); });
    by('gx-side-close').addEventListener('click', () => { closeDrawer(); by('gx-menu').focus({ preventScroll: true }); });
    by('gx-scrim').addEventListener('click', closeDrawer);
    by('gx-menu').addEventListener('click', () => drawerOpen() ? closeDrawer() : openDrawer());
    by('gx-doc').addEventListener('click', e => {
      const go = e.target.closest('[data-goto]');
      if (go) { e.preventDefault(); scrollToBlock(go.dataset.goto, true); return; }
      const ref = e.target.closest('[data-att]');
      if (ref) { e.preventDefault(); openAtt(ref.dataset.att); }
    });
    by('gx-chapters').addEventListener('change', e => {
      const el = by(e.target.value); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      e.target.value = '';
    });
    let saveTimer = 0;
    by('gx-scroll').addEventListener('scroll', () => { clearTimeout(saveTimer); saveTimer = setTimeout(rememberPosition, 250); }, { passive: true });
    const dlg = by('gx-att');
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { closeAtt(); return; }
      if (e.target.closest('[data-close]')) closeAtt();
      const step = e.target.closest('[data-step]');
      if (step) stepAtt(Number(step.dataset.step));
    });
    dlg.addEventListener('close', () => { state.attOpen = null; dlg.classList.remove('gx-closing'); dlg.style.transform = ''; });
    dlg.addEventListener('cancel', e => { e.preventDefault(); closeAtt(); });   // Esc: close with the animation
    // drag the card down by its header to dismiss, like a preview
    let drag = null;
    const head = dlg.querySelector('.gx-dialog-head');
    head.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || e.target.closest('button')) return;
      drag = { y: e.clientY, dy: 0 }; head.setPointerCapture(e.pointerId); dlg.style.transition = 'none';
    });
    head.addEventListener('pointermove', e => {
      if (!drag) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      dlg.style.transform = 'translateY(' + drag.dy + 'px) scale(' + (1 - Math.min(drag.dy, 300) / 3000) + ')';
    });
    const endDrag = () => {
      if (!drag) return;
      const far = drag.dy > 90; drag = null;
      dlg.style.transition = 'transform .25s cubic-bezier(.2, 1.2, .4, 1)';
      if (far) closeAtt(); else dlg.style.transform = '';
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
    window.addEventListener('keydown', e => {
      if (document.body.dataset.game !== 'guides' || dlg.open) return;
      const t = e.target;
      const typing = t && t.closest && t.closest('input,select,textarea');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (window.matchMedia('(max-width: 900px)').matches) state.openDrawer();
        q.focus(); q.select();
      } else if (e.key === 'Escape' && by('guides-panel').classList.contains('gx-drawer')) {
        state.closeDrawer();
      }
    });
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.querySelector('.sg-nav-shell') || document.body);
    window.addEventListener('pagehide', rememberPosition);
  }

  function measure() {
    const panel = by('guides-panel');
    if (!panel || panel.hidden) return;
    const top = Math.max(0, Math.round(panel.getBoundingClientRect().top + window.scrollY));
    panel.style.setProperty('--gx-top', top + 'px');
  }

  function rememberPosition() {
    if (!state.current) return;
    const pos = Object.assign({}, prefs().pos);
    pos[state.current.id] = Math.round(by('gx-scroll').scrollTop);
    setPrefs({ guide: state.current.id, pos });
  }

  /* ── sidebar ── */
  function guideButton(g) {
    const n = g.attach.length;
    return '<button type="button" class="gx-guide" data-guide="' + g.id + '"' + (state.current && state.current.id === g.id ? ' aria-current="true"' : '') + '>' +
      '<span class="gx-guide-no">' + g.no + '</span><span>' + esc(g.name) + '</span>' +
      '<span class="gx-guide-meta">' + g.pages + ' 頁' + (n ? ' · ' + n + ' 個表圖' : '') + '</span></button>';
  }
  function renderSide() {
    const list = by('gx-list');
    const idx = state.index;
    if (!idx) return;
    by('gx-clear').hidden = !state.query;
    by('gx-scope').hidden = !state.query;
    by('gx-scope').querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === state.scope)));
    if (!state.query) {
      list.innerHTML = idx.cats.map(c => {
        const gs = idx.guides.filter(g => g.cat === c.id);
        const count = c.total > gs.length ? gs.length + ' / ' + c.total + ' 份' : gs.length + ' 份';
        return '<div class="gx-cat"><span>' + esc(c.name) + '</span><span>' + count + '</span></div>' + gs.map(guideButton).join('');
      }).join('');
      return;
    }
    if (!state.corpus) { list.innerHTML = '<p class="gx-empty">正在載入全部指引以供搜尋…</p>'; return; }
    const hits = search(state.terms, state.scope === 'guide' && state.current ? state.current.id : null);
    if (!hits.total) { list.innerHTML = '<p class="gx-empty">找不到「' + esc(state.query) + '」。<br>可試試較短的關鍵字，或用空格分開多個詞。</p>'; return; }
    let html = '<p class="gx-summary">' + hits.total + ' 處符合 · ' + hits.groups.length + ' 份指引</p>';
    state.expanded = state.expanded || new Set();
    for (const g of hits.groups) {
      const limit = state.expanded.has(g.guide.id) ? Infinity : 6;
      html += '<div class="gx-hits-head"><span class="gx-hits-guide">' + esc(g.guide.name) + '</span><span class="gx-hits-count">' + g.items.length + '</span></div>';
      g.items.slice(0, limit).forEach(h => {
        html += '<button type="button" class="gx-hit" data-guide="' + g.guide.id + '" data-block="' + h.block + '">' +
          (h.where ? '<span class="gx-hit-where">' + esc(h.where) + '</span>' : '') + h.snippet + '</button>';
      });
      if (g.items.length > limit) html += '<button type="button" class="gx-more" data-more="' + g.guide.id + '">再顯示 ' + (g.items.length - limit) + ' 筆</button>';
    }
    list.innerHTML = html;
  }

  /* ── search corpus: one entry per block, labelled with its section ── */
  function blockText(b) {
    if (b.t === 'p' || b.t === 'h') return b.text;
    if (b.t === 'cols') return b.rows.map(r => r.join(' ')).join('\n');
    if (b.t === 'table') return b.rows.map(r => r.map(c => c.text + (c.diag ? [c.diag.tr, c.diag.mid, c.diag.bl].join(' ') : '') +
      (c.blocks ? '\n' + c.blocks.map(blockText).join('\n') : '')).join(' ')).join('\n');
    return '';
  }
  function loadCorpus() {
    if (state.corpusPromise) return state.corpusPromise;
    state.corpusPromise = (async () => {
      const docs = [];
      const all = await Promise.all(state.index.guides.map(g => getText(g.id).then(d => [g, d])));
      all.forEach(([g, data]) => {
        let where = '';
        data.blocks.forEach((b, k) => {
          if (b.t === 'h') where = b.text;
          const text = blockText(b);
          if (text) docs.push({ guide: g.id, block: k, where: b.t === 'h' ? '' : where, text, norm: normMap(text).s });
        });
      });
      state.corpus = docs;
      if (state.query) renderSide();
      return docs;
    })().catch(err => { state.corpusPromise = null; by('gx-list').innerHTML = '<p class="gx-empty">無法載入搜尋資料。請確認網路連線後再試一次。</p>'; throw err; });
    return state.corpusPromise;
  }
  function snippet(text, terms) {
    const r = ranges(text, terms);
    const first = r.length ? Math.min(...r.map(x => x[0])) : 0;
    const start = Math.max(0, first - 22), end = Math.min(text.length, first + 64);
    const piece = text.slice(start, end).replace(/\s+/g, ' ');
    return (start > 0 ? '…' : '') + rich(piece, null, terms) + (end < text.length ? '…' : '');
  }
  function search(terms, onlyGuide) {
    const groups = new Map();
    let total = 0;
    for (const d of state.corpus) {
      if (onlyGuide && d.guide !== onlyGuide) continue;
      if (!terms.every(t => d.norm.includes(t))) continue;
      if (!groups.has(d.guide)) groups.set(d.guide, []);
      groups.get(d.guide).push(d); total++;
    }
    const order = state.index.guides.map(g => g.id);
    const out = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([id, docs]) => {
      docs.sort((a, b) => a.block - b.block);
      return { guide: state.byId.get(id), items: docs.map(d => ({ block: d.block, where: d.where, snippet: snippet(d.text, terms) })) };
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
    if (state.attOpen) renderAttBody(state.attOpen);
  }

  /* ── reader ── */
  async function openGuide(id, opts = {}) {
    const meta = state.byId.get(id);
    if (!meta) return;
    if (!state.current || state.current.id !== id) {
      rememberPosition();
      by('gx-doc').innerHTML = '<p class="gx-loading">載入中…</p>';
      let data;
      try { data = await getText(id); }
      catch (_) { by('gx-doc').innerHTML = '<p class="gx-loading">無法載入這份指引。請確認網路連線後再試一次。</p>'; return; }
      state.current = Object.assign({}, data, { meta });
      setPrefs({ guide: id });
      renderDoc(state.current, false);
      renderSide();
      const saved = (prefs().pos || {})[id];
      const sc = by('gx-scroll');
      sc.style.scrollBehavior = 'auto';
      sc.scrollTop = opts.block != null ? 0 : (saved || 0);
      sc.style.scrollBehavior = '';
    }
    if (opts.block != null) scrollToBlock(opts.block, opts.flash);
  }
  function scrollToBlock(k, flash) {
    let el = by('gx-b-' + state.current.id + '-' + k);
    if (!el) return false;
    if (el.tagName === 'IMG') el = el.parentElement;
    const sc = by('gx-scroll');
    const target = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 10;
    sc.style.scrollBehavior = 'auto';
    sc.scrollTo({ top: target, behavior: Math.abs(target - sc.scrollTop) > 2500 ? 'auto' : 'smooth' });
    sc.style.scrollBehavior = '';
    if (flash) { el.classList.add('gx-flash'); setTimeout(() => el.classList.remove('gx-flash'), 1400); }
    return true;
  }
  function renderDoc(guide, keepScroll) {
    const terms = state.terms, meta = guide.meta;
    const sc = by('gx-scroll'), top = sc.scrollTop;
    const cat = state.index.cats.find(c => c.id === meta.cat) || {};
    let html = '<div class="gx-head sg-glass"><p class="sg-eyebrow">' + esc(cat.name || '') + ' · ' + meta.no + ' / ' + (cat.total || '') + '</p>' +
      '<h1 class="gx-title">' + rich(guide.name, null, terms) + '</h1>' +
      guide.cover.map(c => '<p class="gx-cover">' + rich(c, null, terms) + '</p>').join('') +
      '<p class="gx-credit">' + esc(guide.credit) + '</p>';
    if (meta.attach.length) {
      html += '<div class="gx-chips">' + meta.attach.map(a => '<button type="button" class="gx-chip" data-att="' + a.id + '">' + esc(a.label) + (a.title ? '<span>' + esc(a.title) + '</span>' : '') + '</button>').join('') + '</div>';
    }
    html += '</div><div class="gx-body">' + blocksHTML(guide.blocks, terms, { anchor: guide.id }) + '</div>';
    by('gx-doc').innerHTML = html;
    const chapters = guide.blocks.map((b, k) => b.t === 'h' ? { id: 'gx-b-' + guide.id + '-' + k, text: b.text, lv: b.lv } : null).filter(Boolean);
    const sel = by('gx-chapters');
    sel.hidden = !chapters.length;
    sel.innerHTML = '<option value="">章節</option>' + chapters.map(c => '<option value="' + c.id + '">' + '　'.repeat(c.lv - 1) + esc(c.text.replace(/\s+/g, ' ')) + '</option>').join('');
    if (keepScroll) { sc.style.scrollBehavior = 'auto'; sc.scrollTop = top; sc.style.scrollBehavior = ''; }
    document.title = meta.name + ' · Scholar';
  }

  /* ── 表/圖 window ── */
  function attMeta(id) {
    const g = state.byId.get(id.split('-')[0]);
    const list = g ? g.attach : [];
    return { g, list, pos: list.findIndex(a => a.id === id) };
  }
  async function openAtt(id) {
    const dlg = by('gx-att');
    const { g, list, pos } = attMeta(id);
    if (!g || pos < 0) return;
    const a = list[pos];
    state.attOpen = id;
    by('gx-att-guide').textContent = g.name;
    by('gx-att-title').innerHTML = '<b>' + esc(a.label) + '</b>' + esc(a.title || '');
    dlg.querySelector('[data-step="-1"]').disabled = pos <= 0;
    dlg.querySelector('[data-step="1"]').disabled = pos >= list.length - 1;
    by('gx-att-body').innerHTML = '<p class="gx-loading">載入中…</p>';
    if (!dlg.open) dlg.showModal();
    await renderAttBody(id);
  }
  async function renderAttBody(id) {
    let data;
    try { data = await getAtt(id); }
    catch (_) { by('gx-att-body').innerHTML = '<p class="gx-loading">無法載入這個表或圖。請確認網路連線後再試一次。</p>'; return; }
    if (state.attOpen !== id) return;
    const body = by('gx-att-body');
    // the caption is the window title; show everything else
    body.innerHTML = blocksHTML(data.blocks.filter(b => !b.cap), state.terms, { card: true });
    body.scrollTop = 0;
    const m = body.querySelector('mark.gx-mark');
    if (m) m.scrollIntoView({ block: 'center' });
  }
  function closeAtt() {
    const dlg = by('gx-att');
    if (!dlg.open || dlg.classList.contains('gx-closing')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { dlg.close(); return; }
    dlg.classList.add('gx-closing');
    setTimeout(() => { if (dlg.open) dlg.close(); }, 170);
  }
  function stepAtt(d) {
    if (!state.attOpen) return;
    const { list, pos } = attMeta(state.attOpen);
    const next = list[pos + d];
    if (next) openAtt(next.id);
  }

  /* ── entry point used by the tab switcher ── */
  let booted = null;
  function show() {
    const panel = by('guides-panel');
    if (!panel) return;
    measure();
    if (!booted) {
      booted = (async () => {
        shell(); measure();
        try { state.index = await fetchJSON('index.json'); }
        catch (_) { by('gx-list').innerHTML = '<p class="gx-empty">無法載入指引目錄。第一次使用需要網路連線，之後可離線閱讀。</p>'; booted = null; return; }
        state.index.guides.forEach(g => state.byId.set(g.id, g));
        renderSide();
        const last = prefs().guide;
        await openGuide(state.byId.has(last) ? last : state.index.guides[0].id);
        const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1500));
        idle(() => loadCorpus().catch(() => {}));
      })();
    } else if (state.current) {
      document.title = state.current.meta.name + ' · Scholar';
    }
    return booted;
  }
  window.ScholarGuides = { show };
})();
