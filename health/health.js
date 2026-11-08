/* Independent special-health reader; source data and settings are separate from 指引. */
(() => {
  'use strict';
  const BASE = 'health/';
  const STORE = 'scholar-health-v1';
  const state = { index: null, byId: new Map(), texts: new Map(), atts: new Map(), current: null, query: '', terms: [],
    scope: 'all', field: null, corpus: null, corpusPromise: null, attOpen: null };
  const compactLayout = matchMedia('(max-width:1099px), (orientation:portrait)');
  const by = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = {
    search: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    x: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    list: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    left: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    right: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    pen: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h5l10.5-10.5a2.1 2.1 0 0 0-3-3L6 17v3"/><path d="M14.5 7.5l3 3"/></svg>',
    aa: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 8 6l5 12M4.8 14h6.4"/><path d="M15 12.5c.6-1 1.6-1.5 2.8-1.5 1.8 0 3.2 1 3.2 3v4M21 15.5c-1-.4-2-.5-3-.4-1.6.2-2.8.9-2.8 2.1 0 1 .8 1.8 2 1.8 1.6 0 3-1.1 3.8-2.4"/></svg>',
    trash: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>'
  };

  function prefs() { try { return JSON.parse(window.ScholarStorage.getItem(STORE)) || {}; } catch (_) { return {}; } }
  function setPrefs(patch) { try { window.ScholarStorage.setItem(STORE, JSON.stringify(Object.assign(prefs(), patch))); } catch (_) { /* private mode */ } }

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
        inner += m ? '<mark class="hx-mark">' + t + '</mark>' : t;
        k = l;
      }
      // '#12' jumps to block 12 of this guide (附錄/附件 sections); anything else opens a 表/圖 window
      out += !id ? inner : id[0] === '#'
        ? '<button type="button" class="hx-ref" data-goto="' + id.slice(1) + '" title="跳到' + esc(text.slice(i, j)) + '">' + inner + '</button>'
        : '<button type="button" class="hx-ref" data-att="' + id + '" title="開啟' + esc(text.slice(i, j)) + '">' + inner + '</button>';
      i = j;
    }
    return out;
  }

  /* ── tables, pictures, column lists ── */
  function scientific(text, sup, terms, sub) {
    const spans = (sup || []).map(([s, e]) => [s, e, 'sup']).concat((sub || []).map(([s, e]) => [s, e, 'sub'])).sort((a, b) => a[0] - b[0]);
    if (!spans.length) return rich(text, null, terms);
    let out = '', at = 0;
    for (const [s, e, tag] of spans) {
      out += rich(text.slice(at, s), null, terms) + '<' + tag + '>' + rich(text.slice(s, e), null, terms) + '</' + tag + '>';
      at = e;
    }
    return out + rich(text.slice(at), null, terms);
  }
  function cellHTML(c, terms, tag, t) {
    if (c.diag) {
      const d = c.diag;
      const span = (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '');
      const lines = d.lines ? d.lines.map(([x1, y1, x2, y2]) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>').join('')
        : d.n === 1 ? '<line x1="0" y1="0" x2="100" y2="100"/>' : '<line x1="55" y1="0" x2="100" y2="100"/><line x1="0" y1="42" x2="100" y2="100"/>';
      const label = name => {
        const pos = d.positions && d.positions[name];
        const style = pos ? ' style="left:' + pos[0] + '%;top:' + pos[1] + '%;right:auto;bottom:auto;transform:translate(-50%,-50%)"' : '';
        return '<span class="hx-d-' + name + '"' + style + '>' + rich(d[name], null, terms) + '</span>';
      };
      return '<' + tag + span + ' class="hx-diag' + (d.n === 1 ? ' hx-diag-1' : '') + '"><svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">' + lines + '</svg>' +
        label('tr') + label('mid') + label('bl') + '</' + tag + '>';
    }
    let inner = scientific(c.text || '', c.sup, terms, c.sub);
    if (c.fraction && c.fraction.join('') === c.text) {
      const formula = text => text.split(/(m3|SiO2)/).map(part => part === 'm3' ? 'm<sup>3</sup>' : part === 'SiO2' ? 'SiO<sub>2</sub>' : rich(part, null, terms)).join('');
      inner = '<span class="hx-fraction"><span>' + formula(c.fraction[0]) + '</span><span>' + formula(c.fraction[1]) + '</span></span>';
    }
    (c.img || []).forEach(im => { inner += '<img src="' + BASE + 'attach/img/' + im.src + '" width="' + Math.round(im.w * 1.25) + '" height="' + Math.round(im.h * 1.25) + '" alt="" loading="lazy">'; });
    if (c.blocks) inner += blocksHTML(c.blocks, terms, { inCell: true });
    const span = (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '');
    let share = 1;
    if (t && c.c != null) { const total = t.widths.reduce((a, b) => a + b, 0) || 1; share = t.widths.slice(c.c, c.c + (c.cs || 1)).reduce((a, b) => a + b, 0) / total; }
    const cls = [];
    if (tag === 'td' && c.text && !c.blocks && (c.rs || 1) <= 4 && share <= 0.16 && c.text.length <= 12) cls.push('hx-narrow');
    if (c.lv != null) cls.push('hx-heat hx-heat-' + c.lv);
    return '<' + tag + span + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + inner + '</' + tag + '>';
  }
  function tableHTML(t, terms, nested) {
    const total = t.widths.reduce((a, b) => a + b, 0) || 1;
    const cols = t.widths.map(w => '<col style="width:' + (w / total * 100).toFixed(2) + '%">').join('');
    const minW = t.widths.length > 4 ? Math.round(total * (nested ? 1.1 : 1.3)) : 0;
    let head = Math.min(t.head || 0, t.rows.length - 1);
    if (head > 0) head = Math.min(t.rows.length - 1, Math.max(head, ...t.rows[0].map(c => c.rs || 1)));
    const rowsHTML = (rows, tag) => rows.map(r => '<tr>' + r.map(c => cellHTML(c, terms, tag, t)).join('') + '</tr>').join('');
    return '<div class="hx-twrap' + (nested ? ' hx-nested' : '') + '"><table class="hx-table" style="min-width:' + minW + 'px"><colgroup>' + cols + '</colgroup>' +
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
    const flush = () => { if (figure) { out.push('<div class="hx-fig">' + figure.join('') + '</div>'); figure = null; } };
    blocks.forEach((b, k) => {
      const aid = (opts.anchor ? ' id="hx-b-' + opts.anchor + '-' + k + '"' : '') + (b.pdf_page ? ' title="' + esc(b.source + ' PDF第' + b.pdf_page + (b.pdf_last !== b.pdf_page ? '–' + b.pdf_last : '') + '頁') + '"' : '');
      if (b.t === 'img' && b.scan) {
        flush();
        out.push('<div class="hx-scan"' + aid + '>' + b.img.map(im => '<img src="' + BASE + 'attach/img/' + im.src + '" width="' + Math.round(im.w * 1.4) + '" height="' + Math.round(im.h * 1.4) + '" alt="原頁影像" loading="lazy">').join('') + '</div>');
        return;
      }
      if (b.t === 'img') {
        (figure = figure || []).push(b.img.map(im => '<img src="' + BASE + 'attach/img/' + im.src + '" width="' + Math.round(im.w * 1.4) + '" height="' + Math.round(im.h * 1.4) + '" alt="" loading="lazy"' + aid + '>').join(''));
        return;
      }
      // one row of labels printed under a row of pictures: put each label under its picture
      if (figure && b.t === 'cols' && b.rows.length === 1 && b.rows[0].length === figure.length) {
        out.push('<div class="hx-fig"' + aid + '>' + figure.map((f, i) => '<figure>' + f + '<figcaption>' + rich(b.rows[0][i], null, terms) + '</figcaption></figure>').join('') + '</div>');
        figure = null; return;
      }
      flush();
      if (b.t === 'h') {
        const content = b.cap && !opts.card ? '<button type="button" class="hx-cap-btn" data-att="' + b.cap + '" title="在視窗中開啟">' + rich(b.text, null, terms) + '</button>' : rich(b.text, b.links, terms);
        out.push('<h' + (b.lv + 1) + ' class="hx-h hx-h' + b.lv + '"' + aid + '>' + content + '</h' + (b.lv + 1) + '>'); return;
      }
      if (b.t === 'p') {
        if (opts.inCell) { out.push('<p class="hx-cell-p">' + rich(b.text, null, terms) + '</p>'); return; }
        if (b.cap && !opts.card) { out.push('<p class="hx-cap"' + aid + '><button type="button" class="hx-cap-btn" data-att="' + b.cap + '" title="在視窗中開啟">' + rich(b.text, null, terms) + '</button></p>'); return; }
        out.push('<p class="hx-p' + (b.cap ? ' hx-cap-text' : '') + '"' + aid + paraStyle(b) + '>' + rich(b.text, b.links, terms) + '</p>');
        return;
      }
      if (b.t === 'cols') {
        const n = Math.max(...b.rows.map(r => r.length));
        out.push('<div class="hx-cols" style="--hx-n:' + n + '"' + aid + '>' + b.rows.map(r => r.map(c => '<span>' + rich(c, null, terms) + '</span>').join('') + '<span></span>'.repeat(n - r.length)).join('') + '</div>');
        return;
      }
      if (b.t === 'table') { out.push('<div class="hx-tblock"' + aid + '>' + tableHTML(b, terms, opts.inCell) + '</div>'); return; }
    });
    flush();
    return out.join('');
  }

  function updateSidebar() {
    const layout = by('hx-layout'); if (!layout) return;
    const expanded = by('health-panel').classList.contains('hx-drawer');
    layout.dataset.sidebarCollapsed = String(!expanded);
    by('hx-sidebar').inert = !expanded;
    by('hx-sidebar').setAttribute('aria-hidden', String(!expanded));
    for (const id of ['hx-side-close', 'hx-menu']) {
      const button = by(id);
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-label', expanded ? '收合目錄' : '展開目錄');
      button.title = expanded ? '收合目錄' : '展開目錄';
    }
  }

  /* ── shell ── */
  function shell() {
    const panel = by('health-panel');
    panel.innerHTML = `
      <div id="hx-layout" class="hx-layout">
        <div class="hx-scrim" id="hx-scrim" aria-hidden="true"></div>
        <aside id="hx-sidebar" class="hx-side sg-glass" aria-label="特做目錄與搜尋">
          <div class="hx-side-head"><button type="button" class="hx-sidebar-toggle" id="hx-side-close" aria-label="收合側欄" title="收合側欄" aria-controls="hx-sidebar-content" aria-expanded="true"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11.5h1M5.5 15h1"/></svg></button><span class="hx-side-heading">特做目錄</span></div>
          <div id="hx-sidebar-content" class="hx-side-content">
          <div class="hx-search">${icon.search}
            <input id="hx-q" type="search" placeholder="搜尋特做名稱或全文" aria-label="關鍵字搜尋" autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button type="button" class="hx-clear" id="hx-clear" aria-label="清除搜尋" hidden>${icon.x}</button>
          </div>
          <div class="hx-opts" id="hx-opts" hidden>
            <div class="sg-segment hx-field" id="hx-field" role="group" aria-label="搜尋對象">
              <button type="button" class="sg-btn" data-field="title" aria-pressed="false">標題<span class="hx-field-n" id="hx-n-title"></span></button>
              <button type="button" class="sg-btn" data-field="body" aria-pressed="true">內文<span class="hx-field-n" id="hx-n-body"></span></button>
            </div>
            <div class="sg-segment hx-scope" id="hx-scope" role="group" aria-label="搜尋範圍">
              <button type="button" class="sg-btn" data-scope="all" aria-pressed="true">全部特做</button>
              <button type="button" class="sg-btn" data-scope="guide" aria-pressed="false">目前這份</button>
            </div>
          </div>
          <div class="hx-list" id="hx-list"><p class="hx-empty">載入中…</p></div>
          </div>
        </aside>
        <section class="hx-reader">
          <div class="hx-bar">
            <button type="button" class="hx-sidebar-toggle hx-menu-btn" id="hx-menu" aria-label="展開側欄" title="展開側欄" aria-controls="hx-sidebar-content" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11.5h1M5.5 15h1"/></svg></button>
            <select class="hx-select" id="hx-chapters" aria-label="跳到章節" hidden></select>
            <button type="button" class="sg-btn hx-conclusion-btn" id="hx-conclusion" title="跳至管理分級" aria-label="跳至管理分級" hidden><span class="hx-wide-only">跳至</span>管理分級</button>
            <button type="button" class="sg-btn" id="hx-version">簡明版速查</button><span class="hx-spacer"></span>
            <button type="button" class="sg-btn hx-tool-btn" id="hx-marks-btn" aria-haspopup="dialog" aria-controls="hx-panel" title="我的畫線">${icon.pen}<span>畫線</span></button>
            <button type="button" class="sg-btn hx-tool-btn" id="hx-style-btn" aria-haspopup="dialog" aria-controls="hx-panel" title="閱讀設定">${icon.aa}<span>閱讀設定</span></button>
          </div>
          <div class="hx-panel" id="hx-panel" role="dialog" aria-label="閱讀設定與畫線" hidden></div>
          <div class="hx-scroll" id="hx-scroll"><article class="hx-doc" id="hx-doc"></article></div>
        </section>
      </div>
      <dialog class="hx-dialog" id="hx-att" aria-labelledby="hx-att-title">
        <div class="hx-dialog-head">
          <div><p class="sg-eyebrow" id="hx-att-guide"></p><h2 class="hx-dialog-title" id="hx-att-title"></h2></div>
          <div class="hx-dialog-tools">
            <button type="button" class="sg-btn hx-icon-btn" data-step="-1" aria-label="上一個表或圖">${icon.left}</button>
            <button type="button" class="sg-btn hx-icon-btn" data-step="1" aria-label="下一個表或圖">${icon.right}</button>
            <button type="button" class="sg-btn hx-icon-btn" data-close aria-label="關閉">${icon.x}</button>
          </div>
        </div>
        <div class="hx-dialog-body" id="hx-att-body"></div>
      </dialog>`;
    wire();
  }

  function wire() {
    by('hx-version').addEventListener('click', () => { const id = state.current?.meta.id; if (id) openGuide((id.startsWith('full') ? 'brief' : 'full') + id.slice(-2)); });
    const q = by('hx-q');
    let timer = 0;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => setQuery(q.value), 180); });
    q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { e.preventDefault(); e.stopPropagation(); q.value = ''; setQuery(''); } });
    q.addEventListener('focus', () => loadCorpus().catch(() => {}), { once: true });
    by('hx-clear').addEventListener('click', () => { q.value = ''; setQuery(''); q.focus(); });
    by('hx-scope').addEventListener('click', e => {
      const b = e.target.closest('[data-scope]'); if (!b) return;
      state.scope = b.dataset.scope; renderSide();
    });
    by('hx-field').addEventListener('click', e => {
      const b = e.target.closest('[data-field]'); if (!b) return;
      state.field = b.dataset.field; renderSide();
    });
    by('hx-list').addEventListener('click', e => {
      const g = e.target.closest('[data-guide]');
      const more = e.target.closest('[data-more]');
      const cat = e.target.closest('[data-cat]');
      if (cat) {
        const open = Object.assign({}, prefs().open);
        open[cat.dataset.cat] = !catOpen(cat.dataset.cat);
        setPrefs({ open }); renderSide();
        by('hx-list').querySelector('[data-cat="' + cat.dataset.cat + '"]').focus({ preventScroll: true }); return;
      }
      if (more) { state.expanded = state.expanded || new Set(); state.expanded.add(more.dataset.more); renderSide(); return; }
      if (!g) return;
      if (g.dataset.openAtt) { if (compactLayout.matches) state.closeDrawer(); openGuide(g.dataset.guide).then(() => openAtt(g.dataset.openAtt)); return; }
      openGuide(g.dataset.guide, { block: g.dataset.block, flash: Boolean(g.dataset.block) });
      if (compactLayout.matches) state.closeDrawer();
    });
    // the drawer gets its own history entry, so the phone's back gesture closes it instead of leaving the page
    const drawerOpen = () => by('health-panel').classList.contains('hx-drawer');
    const openDrawer = () => {
      if (drawerOpen()) return;
      by('health-panel').classList.add('hx-drawer'); updateSidebar();
      if (compactLayout.matches) { try { history.pushState({ hxDrawer: true }, ''); } catch (_) { /* Optional navigation state. */ } }
    };
    const closeDrawer = (replaceHistory = false) => {
      if (!drawerOpen()) return;
      const restoreFocus = by('hx-sidebar').contains(document.activeElement);
      by('health-panel').classList.remove('hx-drawer'); updateSidebar();
      if (restoreFocus && replaceHistory !== true) by('hx-menu').focus({ preventScroll: true });
      if (history.state && history.state.hxDrawer) {
        if (replaceHistory === true) { const next = Object.assign({}, history.state); delete next.hxDrawer; history.replaceState(next, ''); }
        else history.back();
      }
    };
    state.openDrawer = openDrawer; state.closeDrawer = closeDrawer;
    window.addEventListener('popstate', () => { if (compactLayout.matches && drawerOpen()) { by('health-panel').classList.remove('hx-drawer'); updateSidebar(); } });
    by('hx-side-close').addEventListener('click', () => { closeDrawer(); by('hx-menu').focus({ preventScroll: true }); });
    by('hx-scrim').addEventListener('click', closeDrawer);
    by('hx-menu').addEventListener('click', event => {
      if (drawerOpen()) closeDrawer();
      else { openDrawer(); if (event.detail === 0) q.focus({ preventScroll: true }); }
    });
    document.addEventListener('pointerdown', event => {
      if (!compactLayout.matches || !drawerOpen() || by('hx-sidebar').contains(event.target) || by('hx-menu').contains(event.target)) return;
      closeDrawer(Boolean(event.target.closest('[data-game-tab]')));
    });
    by('hx-doc').addEventListener('click', e => {
      const go = e.target.closest('[data-goto]');
      if (go) { e.preventDefault(); scrollToBlock(go.dataset.goto, true); return; }
      const ref = e.target.closest('[data-att]');
      if (ref) { e.preventDefault(); openAtt(ref.dataset.att); }
    });
    by('hx-chapters').addEventListener('change', e => {
      const el = by(e.target.value); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      e.target.value = '';
    });
    by('hx-conclusion').addEventListener('click', () => {
      const block = by('hx-conclusion').dataset.block;
      if (block != null) scrollToBlock(Number(block), true);
    });
    let saveTimer = 0;
    by('hx-scroll').addEventListener('scroll', () => { clearTimeout(saveTimer); saveTimer = setTimeout(rememberPosition, 250); }, { passive: true });
    const dlg = by('hx-att');
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { const r=dlg.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeAtt();return; }
      if (e.target.closest('[data-close]')) closeAtt();
      const step = e.target.closest('[data-step]');
      if (step) stepAtt(Number(step.dataset.step));
    });
    dlg.addEventListener('close', () => { state.attOpen = null; dlg.classList.remove('hx-closing'); dlg.style.transform = ''; });
    dlg.addEventListener('cancel', e => { e.preventDefault(); closeAtt(); });   // Esc: close with the animation
    // drag the card down by its header to dismiss, like a preview
    let drag = null;
    const head = dlg.querySelector('.hx-dialog-head');
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
      if (document.body.dataset.game !== 'health' || dlg.open) return;
      const t = e.target;
      const typing = t && t.closest && t.closest('input,select,textarea');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        state.openDrawer();
        q.focus(); q.select();
      } else if (e.key === 'Escape' && by('health-panel').classList.contains('hx-drawer')) {
        state.closeDrawer();
      }
    });
    const responsiveSidebar = () => {
      closeDrawer(true);
      by('health-panel').classList.toggle('hx-drawer', !compactLayout.matches);
      updateSidebar();
    };
    responsiveSidebar();
    compactLayout.addEventListener('change', responsiveSidebar);
    window.addEventListener('resize', () => { measure(); updateSidebar(); });
    window.addEventListener('load', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.querySelector('.sg-nav-shell') || document.body);
    window.addEventListener('pagehide', rememberPosition);
    wireReading();
  }

  function measure() {
    const panel = by('health-panel');
    if (!panel || panel.hidden) return;
    const top = Math.max(0, Math.round(panel.getBoundingClientRect().top + window.scrollY));
    panel.style.setProperty('--hx-top', top + 'px');
  }

  function rememberPosition() {
    if (!state.current) return;
    const pos = Object.assign({}, prefs().pos);
    pos[state.current.id] = Math.round(by('hx-scroll').scrollTop);
    setPrefs({ guide: state.current.id, pos });
  }

  /* ── sidebar ── */
  function guideButton(g, terms) {
    const n = g.attach.length;
    return '<button type="button" class="hx-guide" data-guide="' + g.id + '"' + (state.current && state.current.id === g.id ? ' aria-current="true"' : '') + '>' +
      '<span class="hx-guide-no">' + g.no + '</span><span>' + (terms ? rich(g.name, null, terms) : esc(g.name)) + '</span>' +
      '<span class="hx-guide-meta">' + (terms ? esc(catPath(g.cat)) + ' · ' : '') + g.pages + ' 頁' + (g.scan ? ' · 掃描影像' : '') + (n ? ' · ' + n + ' 個附件與表圖' : '') + '</span></button>';
  }
  /* 農保／人因性: a category with its parents, for title hits listed outside the tree */
  function catPath(id) {
    const cat = state.index.cats.find(c => c.id === id);
    if (!cat) return '';
    return (cat.parent ? catPath(cat.parent) + '／' : '') + cat.name;
  }
  /* title search: every term in the guide's name (or its official name with the version) */
  function titleHits(terms) {
    return state.index.guides.filter(g => {
      const t = normMap(g.name + ' ' + (g.official || '')).s;
      return terms.every(x => t.includes(x));
    });
  }
  /* a category is open when the reader opened it, or (until they choose) when it holds the guide being read */
  function catOpen(id) {
    const saved = (prefs().open || {})[id];
    if (saved != null) return saved;
    return Boolean(state.current && categoryContains(id, state.current.meta.cat));
  }
  function categoryContains(parent, child) {
    if (parent === child) return true;
    const cat = state.index.cats.find(c => c.id === child);
    return Boolean(cat && cat.parent && categoryContains(parent, cat.parent));
  }
  function renderSide() {
    const list = by('hx-list');
    const idx = state.index;
    if (!idx) return;
    by('hx-clear').hidden = !state.query;
    by('hx-opts').hidden = !state.query;
    by('hx-scope').querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === state.scope)));
    if (!state.query) {
      const categoryHTML = c => {
        const children = idx.cats.filter(child => child.parent === c.id);
        const gs = idx.guides.filter(g => categoryContains(c.id, g.cat));
        const count = c.total > gs.length ? gs.length + ' / ' + c.total + ' 份' : gs.length + ' 份';
        const open = catOpen(c.id);
        return '<button type="button" class="hx-cat" data-cat="' + c.id + '" aria-expanded="' + open + '" aria-controls="hx-cat-' + c.id + '">' +
          '<span class="hx-cat-name">' + icon.right + esc(c.name) + '</span><span>' + count + '</span></button>' +
          '<div class="hx-cat-list" id="hx-cat-' + c.id + '"' + (open ? '' : ' hidden') + '>' +
          (children.length ? '<div class="hx-subcats">' + children.map(categoryHTML).join('') + '</div>' :
            gs.length ? gs.map(guideButton).join('') : '<p class="hx-cat-empty">尚未收錄</p>') + '</div>';
      };
      list.innerHTML = idx.cats.filter(c => !c.parent).map(categoryHTML).join('');
      return;
    }
    // 標題: guide names (no download needed); 內文: the full text. Until the reader picks one, titles show when any match.
    const titles = titleHits(state.terms);
    const hits = state.corpus ? search(state.terms, state.scope === 'guide' && state.current ? state.current.id : null) : null;
    const field = state.field || (titles.length ? 'title' : 'body');
    by('hx-field').querySelectorAll('[data-field]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.field === field)));
    by('hx-n-title').textContent = titles.length;
    by('hx-n-body').textContent = hits ? hits.total : '…';
    by('hx-scope').hidden = field !== 'body';
    if (field === 'title') {
      if (!titles.length) {
        list.innerHTML = '<p class="hx-empty">沒有特做名稱含「' + esc(state.query) + '」。' + (hits && hits.total ? '<br>內文有 ' + hits.total + ' 處符合，可切換到「內文」查看。' : '') + '</p>';
        return;
      }
      list.innerHTML = '<p class="hx-summary">' + titles.length + ' 份特做的名稱符合</p>' + titles.map(g => guideButton(g, state.terms)).join('');
      return;
    }
    if (!hits) { list.innerHTML = '<p class="hx-empty">正在載入全部特做以供搜尋…</p>'; return; }
    if (!hits.total) { list.innerHTML = '<p class="hx-empty">找不到「' + esc(state.query) + '」。<br>可試試較短的關鍵字，或用空格分開多個詞。</p>'; return; }
    let html = '<p class="hx-summary">' + hits.total + ' 處符合 · ' + hits.groups.length + ' 份特做</p>';
    state.expanded = state.expanded || new Set();
    for (const g of hits.groups) {
      const limit = state.expanded.has(g.guide.id) ? Infinity : 6;
      html += '<div class="hx-hits-head"><span class="hx-hits-guide">' + esc(g.guide.name) + '</span><span class="hx-hits-count">' + g.items.length + '</span></div>';
      g.items.slice(0, limit).forEach(h => {
        html += '<button type="button" class="hx-hit" data-guide="' + g.guide.id + '"' + (h.att ? ' data-open-att="' + h.att + '"' : ' data-block="' + h.block + '"') + '>' +
          (h.where ? '<span class="hx-hit-where">' + esc(h.where) + '</span>' : '') + h.snippet + '</button>';
      });
      if (g.items.length > limit) html += '<button type="button" class="hx-more" data-more="' + g.guide.id + '">再顯示 ' + (g.items.length - limit) + ' 筆</button>';
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
      // whole documents published with a guide (Q&A, 修正對照表) are searched as part of it
      const extra = await Promise.all(state.index.guides.flatMap(g => g.attach.filter(a => a.doc).map(a => getAtt(a.id).then(d => [g, a, d]))));
      extra.forEach(([g, a, data]) => data.blocks.forEach((b, k) => {
        const text = blockText(b);
        if (text) docs.push({ guide: g.id, block: 100000 + k, att: a.id, where: a.label, text, norm: normMap(text).s });
      }));
      state.corpus = docs;
      if (state.query) renderSide();
      return docs;
    })().catch(err => { state.corpusPromise = null; by('hx-list').innerHTML = '<p class="hx-empty">無法載入搜尋資料。請確認網路連線後再試一次。</p>'; throw err; });
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
      return { guide: state.byId.get(id), items: docs.map(d => ({ block: d.block, att: d.att, where: d.where, snippet: snippet(d.text, terms) })) };
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
      by('hx-conclusion').hidden = true;
      delete by('hx-conclusion').dataset.block;
      by('hx-doc').innerHTML = '<p class="hx-loading">載入中…</p>';window.ScholarReaderTables?.sync('hx');
      let data;
      try { data = await getText(id); }
      catch (_) { by('hx-doc').innerHTML = '<p class="hx-loading">無法載入這份特做。請確認網路連線後再試一次。</p>'; return; }
      state.current = Object.assign({}, data, { meta });
      setPrefs({ guide: id });
      if (!opts.boot) {
        const open = Object.assign({}, prefs().open);
        let cat = state.index.cats.find(c => c.id === meta.cat);
        while (cat) { open[cat.id] = true; cat = state.index.cats.find(c => c.id === cat.parent); }
        setPrefs({ open });
      }
      renderDoc(state.current, false);
      renderSide();
      const saved = (prefs().pos || {})[id];
      const sc = by('hx-scroll');
      sc.style.scrollBehavior = 'auto';
      sc.scrollTop = opts.block != null ? 0 : (saved || 0);
      sc.style.scrollBehavior = '';
    }
    if (opts.block != null) scrollToBlock(opts.block, opts.flash);
  }
  function scrollToBlock(k, flash) {
    let el = by('hx-b-' + state.current.id + '-' + k);
    if (!el) return false;
    if (el.tagName === 'IMG') el = el.parentElement;
    const sc = by('hx-scroll');
    const target = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 10;
    sc.style.scrollBehavior = 'auto';
    sc.scrollTo({ top: target, behavior: Math.abs(target - sc.scrollTop) > 2500 ? 'auto' : 'smooth' });
    sc.style.scrollBehavior = '';
    if (flash) { el.classList.add('hx-flash'); setTimeout(() => el.classList.remove('hx-flash'), 1400); }
    return true;
  }
  function mergeCover(guide) {
    if(guide.meta.cat!=='full'||guide.blocks[0]?.t!=='p')return;
    const page=guide.blocks[0].pdf_page,cover=[];
    for(let k=0;k<guide.blocks.length;k++){const block=guide.blocks[k];if(block.t!=='p'||block.pdf_page!==page)break;cover.push(k);}
    if(!cover.some(k=>/撰寫者|編寫者|作者/.test(guide.blocks[k].text||'')))return;
    const head=by('hx-doc').querySelector('.hx-head'),front=document.createElement('div');front.className='hx-frontmatter';
    for(const k of cover){const block=by('hx-b-'+guide.id+'-'+k);if(block){block.classList.add('hx-cover-line');front.append(block);}}
    head.insertBefore(front,head.querySelector('.hx-credit'));
    head.classList.add('hx-merged-cover');
    // The next page can repeat its title across several PDF paragraphs.
    // Match the complete title, allowing the source's two title suffixes only.
    const norm=text=>String(text||'').replace(/\s+/g,'').replace(/健康(?:管理分級建議|檢查)指引$/, '健康指引');
    const repeated=[];
    for(let k=cover.length;k<guide.blocks.length&&guide.blocks[k].t==='p';k++)repeated.push(k);
    if(repeated.length&&norm(repeated.map(k=>guide.blocks[k].text||'').join(''))===norm(guide.blocks[0].text)){
      for(const k of repeated)by('hx-b-'+guide.id+'-'+k)?.classList.add('hx-repeated-cover-title');
    }
  }
  function renderDoc(guide, keepScroll) {
    const terms = state.terms, meta = guide.meta;
    const sc = by('hx-scroll'), top = sc.scrollTop;
    by('hx-version').textContent = meta.cat === 'full' ? '簡明版速查' : '查看完整版';
    const cat = state.index.cats.find(c => c.id === meta.cat) || {};
    let html = '<div class="hx-head sg-glass"><p class="sg-eyebrow">' + esc(cat.name || '') + ' · ' + meta.no + ' / ' + (cat.total || '') + '</p>' +
      '<h1 class="hx-title">' + rich(guide.name, null, terms) + '</h1>' +
      guide.cover.map(c => '<p class="hx-cover">' + rich(c, null, terms) + '</p>').join('') +
      '<p class="hx-credit">' + esc(guide.credit) + '</p>' +
      (guide.scan ? '<p class="hx-scan-note">原始 PDF 為掃描影像、沒有文字層，以下為原頁影像，不提供全文搜尋。</p>' : '');
    if (meta.attach.length) {
      html += '<div class="hx-chips">' + meta.attach.map(a => '<button type="button" class="hx-chip" data-att="' + a.id + '">' + esc(a.label) + (a.title ? '<span>' + esc(a.title) + '</span>' : '') + '</button>').join('') + '</div>';
    }
    html += '</div><div class="hx-body">' + blocksHTML(guide.blocks, terms, { anchor: guide.id }) + '</div>';
    by('hx-doc').innerHTML = html;
    mergeCover(guide);
    window.ScholarReaderTables?.sync('hx');
    const conclusion = guide.blocks.findIndex(b => b.t === 'h' && /^[一二三四五六七八九十]+[、.．]?健康檢查結果管理分級建議|^[一二三四五六七八九十]+[、.．]?管理分級建議/.test((b.text || '').normalize('NFKC').replace(/\s+/g, '')));
    by('hx-conclusion').hidden = conclusion < 0;
    if (conclusion >= 0) by('hx-conclusion').dataset.block = String(conclusion);
    else delete by('hx-conclusion').dataset.block;
    const chapters = guide.blocks.map((b, k) => b.t === 'h' ? { id: 'hx-b-' + guide.id + '-' + k, text: b.text, lv: b.lv } : null).filter(Boolean);
    const sel = by('hx-chapters');
    sel.hidden = !chapters.length;
    sel.innerHTML = '<option value="">章節</option>' + chapters.map(c => '<option value="' + c.id + '">' + '　'.repeat(c.lv - 1) + esc(c.text.replace(/\s+/g, ' ')) + '</option>').join('');
    paintMarks();
    if (keepScroll) { sc.style.scrollBehavior = 'auto'; sc.scrollTop = top; sc.style.scrollBehavior = ''; }
    document.title = meta.name + ' · Scholar';
    if (!by('hx-panel').hidden && panelTab === 'marks') renderPanel();
  }

  /* ── 表/圖 window ── */
  function attMeta(id) {
    const g = state.index.guides.find(g => g.attach.some(a => a.id === id));
    const list = g ? g.attach : [];
    return { g, list, pos: list.findIndex(a => a.id === id) };
  }
  async function openAtt(id) {
    const dlg = by('hx-att');
    const { g, list, pos } = attMeta(id);
    if (!g || pos < 0) return;
    const a = list[pos];
    state.attOpen = id;
    by('hx-att-guide').textContent = g.name;
    by('hx-att-title').innerHTML = '<b>' + esc(a.label) + '</b>' + esc(a.title || '');
    dlg.querySelector('[data-step="-1"]').disabled = pos <= 0;
    dlg.querySelector('[data-step="1"]').disabled = pos >= list.length - 1;
    const body=by('hx-att-body'),key=id+'|'+JSON.stringify(state.terms);
    if(body.dataset.renderKey===key) {
      window.ScholarPeek.open(dlg);body.scrollTop=0;
      const mark=body.querySelector('mark.hx-mark');if(mark)mark.scrollIntoView({block:'center'});
      return;
    }
    delete body.dataset.renderKey;
    body.innerHTML = '<p class="hx-loading">載入中…</p>';
    window.ScholarPeek.open(dlg);
    await renderAttBody(id);
  }
  async function renderAttBody(id) {
    delete by('hx-att-body').dataset.renderKey;
    let data;
    try { data = await getAtt(id); }
    catch (_) { by('hx-att-body').innerHTML = '<p class="hx-loading">無法載入這個表或圖。請確認網路連線後再試一次。</p>'; return; }
    if (state.attOpen !== id) return;
    const body = by('hx-att-body');
    // the caption is the window title; show everything else
    body.innerHTML = (data.cover || []).map(c => '<p class="hx-cover">' + rich(c, null, state.terms) + '</p>').join('') +
      blocksHTML(data.blocks.filter(b => !b.cap), state.terms, { card: true });
    body.dataset.renderKey=id+'|'+JSON.stringify(state.terms);
    body.scrollTop = 0;
    const m = body.querySelector('mark.hx-mark');
    if (m) m.scrollIntoView({ block: 'center' });
  }
  function closeAtt() {
    const dlg = by('hx-att');
    window.ScholarPeek.close(dlg);
  }
  function stepAtt(d) {
    if (!state.attOpen) return;
    const { list, pos } = attMeta(state.attOpen);
    const next = list[pos + d];
    if (next) openAtt(next.id);
  }

  /* ── reading settings: size, spacing, font, weight, colour (this device only) ── */
  const FONTS = {
    sans: { label: '黑體', css: "'Noto Sans TC','PingFang TC','Heiti TC','Microsoft JhengHei',system-ui,sans-serif" },
    serif: { label: '明體', css: "'Noto Serif TC','Songti TC','PMingLiU','MingLiU','Source Han Serif TC',serif" },
    kai: { label: '楷體', css: "'Kaiti TC','BiauKai','DFKai-SB','STKaiti','KaiTi',serif" },
    round: { label: '圓體', css: "'Yuanti TC','jf open 粉圓','Hiragino Maru Gothic ProN','PingFang TC',system-ui,sans-serif" }
  };
  const INKS = [['#f1f5f9', '白'], ['#e8e2d4', '米白'], ['#f3e3b5', '暖黃'], ['#cbd5e1', '淺灰'], ['#bfe3d0', '淡綠'], ['#c7d7f5', '淡藍']];
  const WEIGHTS = [[300, '細'], [400, '標準'], [500, '中粗'], [700, '粗']];
  const DEFAULT_STYLE = { size: 15.5, lead: 1.95, font: 'sans', weight: 400, ink: '#f1f5f9', width: 860 };
  // shared by the 法規 and 特做 readers
  const READ_STORE = 'scholar-reading-v1';
  function readPrefs() { try { return JSON.parse(window.ScholarStorage.getItem(READ_STORE)) || {}; } catch (_) { return {}; } }
  function setReadPrefs(patch) { try { window.ScholarStorage.setItem(READ_STORE, JSON.stringify(Object.assign(readPrefs(), patch))); } catch (_) { /* private mode */ } }
  function style() { return Object.assign({}, DEFAULT_STYLE, prefs().style, readPrefs().style); }
  function applyStyle() {
    const st = style();
    const targets = [by('health-panel'), by('hx-att')].filter(Boolean);
    targets.forEach(el => {
      el.style.setProperty('--hx-fs', st.size + 'px');
      el.style.setProperty('--hx-lead', st.lead);
      el.style.setProperty('--hx-font', (FONTS[st.font] || FONTS.sans).css);
      el.style.setProperty('--hx-weight', st.weight);
      el.style.setProperty('--hx-ink', st.ink);
      el.style.setProperty('--hx-width', st.width + 'px');
    });
  }

  /* ── highlights: chosen colour on any run of text, kept per guide (this device only) ── */
  const HL_STORE = 'scholar-health-hl-v1';
  const HL_COLORS = [['yellow', '黃'], ['green', '綠'], ['blue', '藍'], ['pink', '粉紅'], ['orange', '橘']];
  let panelTab = 'style';
  function loadMarks() { try { return JSON.parse(window.ScholarStorage.getItem(HL_STORE)) || {}; } catch (_) { return {}; } }
  function saveMarks(all) { try { window.ScholarStorage.setItem(HL_STORE, JSON.stringify(all)); return true; } catch (_) { return false; } }
  function marksOf(gid) { return loadMarks()[gid] || []; }
  function setMarks(gid, list) { const all = loadMarks(); if (list.length) all[gid] = list; else delete all[gid]; saveMarks(all); }
  const hlColor = () => readPrefs().hlColor || prefs().hlColor || 'yellow';

  // characters before (node, offset) inside el, counting only text
  function textOffset(el, node, offset) {
    const r = document.createRange();
    r.setStart(el, 0); r.setEnd(node, offset);
    return r.toString().length;
  }
  // the text blocks a highlight can sit in, and the key a highlight stores for its block
  const anchors = () => [...by('hx-doc').querySelectorAll('[id^="hx-b-' + state.current.id + '-"]')];
  const keyOf = el => Number(el.id.slice(('hx-b-' + state.current.id + '-').length));
  const elOf = key => by('hx-b-' + state.current.id + '-' + key);
  function blockOf(node) {
    const el = node && (node.nodeType === 3 ? node.parentElement : node);
    const b = el && el.closest('[id^="hx-b-"]');
    return b && by('hx-doc').contains(b) ? b : null;
  }
  // the current selection as pieces of text per block: [{b, s, e, t}]
  function selectionPieces() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !state.current) return [];
    const range = sel.getRangeAt(0);
    const doc = by('hx-doc');
    if (!doc.contains(range.commonAncestorContainer)) return [];
    const blocks = anchors().filter(el => range.intersectsNode(el) && el.textContent.trim());
    const out = [];
    for (const el of blocks) {
      const len = el.textContent.length;
      const s = el.contains(range.startContainer) ? textOffset(el, range.startContainer, range.startOffset) : 0;
      const e = el.contains(range.endContainer) ? textOffset(el, range.endContainer, range.endOffset) : len;
      if (e > s) out.push({ b: keyOf(el), s, e, t: el.textContent.slice(s, e) });
    }
    return out;
  }
  function addMark(color) {
    const pieces = selectionPieces();
    if (!pieces.length) return;
    const gid = state.current.id;
    let list = marksOf(gid);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    pieces.forEach((p, i) => {
      // a new mark replaces the overlapping parts of older marks in the same block
      list = list.flatMap(m => {
        if (m.b !== p.b || m.e <= p.s || m.s >= p.e) return [m];
        const keep = [];
        const el = elOf(m.b), text = el ? el.textContent : '';
        if (m.s < p.s) keep.push(Object.assign({}, m, { e: p.s, t: text.slice(m.s, p.s), id: m.id + 'a' }));
        if (m.e > p.e) keep.push(Object.assign({}, m, { s: p.e, t: text.slice(p.e, m.e), id: m.id + 'b' }));
        return keep;
      });
      list.push({ id: id + (pieces.length > 1 ? '-' + i : ''), g: id, b: p.b, s: p.s, e: p.e, t: p.t, c: color, at: Date.now() });
    });
    const order = new Map(anchors().map((el, i) => [keyOf(el), i]));
    list.sort((a, b) => (order.get(a.b) ?? 1e9) - (order.get(b.b) ?? 1e9) || a.s - b.s);
    setMarks(gid, list);
    setReadPrefs({ hlColor: color });
    window.getSelection().removeAllRanges();
    hideHlBar();
    paintMarks();
    if (!by('hx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  function recolorMark(group, color) {
    const gid = state.current.id;
    setMarks(gid, marksOf(gid).map(m => (m.g || m.id) === group ? Object.assign({}, m, { c: color }) : m));
    setReadPrefs({ hlColor: color });
    hideHlBar(); paintMarks();
    if (!by('hx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  function removeMark(group) {
    const gid = state.current.id;
    setMarks(gid, marksOf(gid).filter(m => (m.g || m.id) !== group));
    hideHlBar(); paintMarks();
    if (!by('hx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  // wrap the stored ranges in <mark>; a mark whose text moved is looked up by its words, or left unpainted
  function paintMarks() {
    if (!state.current) return;
    const doc = by('hx-doc');
    doc.querySelectorAll('mark.hx-hl').forEach(m => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
    for (const m of marksOf(state.current.id)) {
      const el = elOf(m.b);
      if (!el) { m.lost = true; continue; }
      let s = m.s, e = m.e;
      const text = el.textContent;
      if (text.slice(s, e) !== m.t) { const k = text.indexOf(m.t); if (k < 0) { m.lost = true; continue; } s = k; e = k + m.t.length; }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = []; let pos = 0, n;
      while ((n = walker.nextNode())) { nodes.push([n, pos]); pos += n.nodeValue.length; }
      for (const [node, start] of nodes) {
        const a = Math.max(s, start), b = Math.min(e, start + node.nodeValue.length);
        if (a >= b) continue;
        const r = document.createRange();
        r.setStart(node, a - start); r.setEnd(node, b - start);
        const mark = document.createElement('mark');
        mark.className = 'hx-hl hx-hl-' + m.c; mark.dataset.hl = m.g || m.id;
        r.surroundContents(mark);
      }
    }
  }

  // the little colour bar that follows a selection or a tapped highlight
  function hlBar() {
    let bar = by('hx-hlbar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'hx-hlbar'; bar.className = 'hx-hlbar'; bar.hidden = true;
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '畫線顏色');
    document.body.appendChild(bar);
    bar.addEventListener('pointerdown', e => e.preventDefault());     // keep the selection while choosing
    bar.addEventListener('click', e => {
      const c = e.target.closest('[data-color]'), del = e.target.closest('[data-del]');
      if (c) { bar.dataset.group ? recolorMark(bar.dataset.group, c.dataset.color) : addMark(c.dataset.color); }
      else if (del) removeMark(bar.dataset.group);
    });
    return bar;
  }
  function showHlBar(rect, group) {
    const bar = hlBar();
    const current = group ? (marksOf(state.current.id).find(m => (m.g || m.id) === group) || {}).c : hlColor();
    bar.innerHTML = HL_COLORS.map(([c, name]) => '<button type="button" class="hx-swatch hx-hl-' + c + (c === current ? ' hx-on' : '') + '" data-color="' + c + '" aria-label="' + (group ? '改成' : '畫線：') + name + '色"></button>').join('') +
      (group ? '<button type="button" class="hx-hl-del" data-del aria-label="移除這段畫線">' + icon.trash + '</button>' : '');
    if (group) bar.dataset.group = group; else delete bar.dataset.group;
    bar.dataset.at = String(by('hx-scroll').scrollTop);
    bar.hidden = false;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    const phone = window.matchMedia('(pointer: coarse)').matches;
    let top = phone ? rect.bottom + 12 : rect.top - h - 10;      // on phones the system menu sits above the selection
    if (top < 8) top = rect.bottom + 12;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 10);
    top = Math.min(Math.max(8, top), window.innerHeight - h - 8);     // a selection running off screen keeps the bar in view
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, rect.left + rect.width / 2 - w / 2));
    bar.style.top = top + 'px'; bar.style.left = left + 'px';
  }
  function hideHlBar() { const bar = by('hx-hlbar'); if (bar) bar.hidden = true; }

  /* ── the panel: 閱讀設定 / 我的畫線 ── */
  function renderPanel() {
    const panel = by('hx-panel');
    const st = style();
    const tabs = '<div class="sg-segment hx-panel-tabs" role="tablist">' +
      '<button type="button" class="sg-btn" role="tab" data-tab="style" aria-selected="' + (panelTab === 'style') + '" aria-pressed="' + (panelTab === 'style') + '">閱讀設定</button>' +
      '<button type="button" class="sg-btn" role="tab" data-tab="marks" aria-selected="' + (panelTab === 'marks') + '" aria-pressed="' + (panelTab === 'marks') + '">我的畫線</button></div>' +
      '<button type="button" class="sg-btn hx-icon-btn hx-panel-x" data-panel-close aria-label="關閉">' + icon.x + '</button>';
    let body = '';
    if (panelTab === 'style') {
      const chips = (key, items, cur) => '<div class="hx-chiprow">' + items.map(([v, label]) => '<button type="button" class="hx-opt' + (String(v) === String(cur) ? ' hx-on' : '') + '" data-set="' + key + '" data-val="' + v + '">' + label + '</button>').join('') + '</div>';
      body =
        '<div class="hx-field"><div class="hx-field-head"><span>字級</span><b>' + st.size + ' px</b></div><input type="range" min="13" max="24" step="0.5" value="' + st.size + '" data-range="size" aria-label="字級"></div>' +
        '<div class="hx-field"><div class="hx-field-head"><span>行距</span><b>' + st.lead + '</b></div><input type="range" min="1.5" max="2.6" step="0.05" value="' + st.lead + '" data-range="lead" aria-label="行距"></div>' +
        '<div class="hx-field hx-wide-only"><div class="hx-field-head"><span>版面寬度</span><b>' + st.width + ' px</b></div><input type="range" min="560" max="1100" step="20" value="' + st.width + '" data-range="width" aria-label="版面寬度"></div>' +
        '<div class="hx-field"><div class="hx-field-head"><span>字型</span></div>' + chips('font', Object.entries(FONTS).map(([k, f]) => [k, '<span style="font-family:' + f.css.replace(/"/g, '&quot;') + '">' + f.label + '</span>']), st.font) + '</div>' +
        '<div class="hx-field"><div class="hx-field-head"><span>粗細</span></div>' + chips('weight', WEIGHTS.map(([w, l]) => [w, '<span class="hx-w" style="--w:' + w + '">' + l + '</span>']), st.weight) + '</div>' +
        '<div class="hx-field"><div class="hx-field-head"><span>文字顏色</span></div><div class="hx-chiprow">' +
          INKS.map(([c, l]) => '<button type="button" class="hx-ink' + (c === st.ink ? ' hx-on' : '') + '" data-set="ink" data-val="' + c + '" style="--c:' + c + '" aria-label="' + l + '"></button>').join('') +
          '<label class="hx-ink hx-ink-pick" aria-label="自訂顏色"><input type="color" value="' + st.ink + '" data-color-pick></label></div></div>' +
        '<div class="hx-field"><div class="hx-field-head"><span>畫線預設顏色</span></div><div class="hx-chiprow">' +
          HL_COLORS.map(([c, l]) => '<button type="button" class="hx-swatch hx-hl-' + c + (c === hlColor() ? ' hx-on' : '') + '" data-hl-default="' + c + '" aria-label="' + l + '"></button>').join('') + '</div></div>' +
        '<p class="hx-preview">預覽：職業性腕隧道症候群(Carpal Tunnel Syndrome)是手腕部累積性傷害病變的一種。</p>' +
        '<button type="button" class="sg-btn hx-reset" data-reset>恢復預設</button>';
    } else {
      const list = state.current ? marksOf(state.current.id) : [];
      const groups = [];
      list.forEach(m => { const g = groups.find(x => x.g === (m.g || m.id)); if (g) g.t += '…' + m.t; else groups.push({ g: m.g || m.id, b: m.b, c: m.c, t: m.t }); });
      body = '<p class="hx-panel-note">選取內文文字，就會出現顏色列可以畫線；點已畫線的地方可以換色或刪除。畫線存在這台裝置的瀏覽器裡。</p>';
      body += groups.length ? '<div class="hx-marklist">' + groups.map(g => '<div class="hx-markrow"><button type="button" class="hx-markgo" data-go="' + g.b + '"><i class="hx-dot hx-hl-' + g.c + '"></i><span>' + esc(g.t.length > 90 ? g.t.slice(0, 90) + '…' : g.t) + '</span></button><button type="button" class="hx-icon-btn hx-markdel" data-del-mark="' + g.g + '" aria-label="刪除">' + icon.trash + '</button></div>').join('') + '</div>'
        : '<p class="hx-empty">這份特做還沒有畫線。</p>';
      const total = Object.values(loadMarks()).reduce((n, l) => n + new Set(l.map(m => m.g || m.id)).size, 0);
      body += '<div class="hx-panel-foot"><span>全部特做共 ' + total + ' 段</span><button type="button" class="sg-btn" data-export>匯出</button><label class="sg-btn hx-import">匯入<input type="file" accept="application/json,.json" data-import hidden></label></div>';
    }
    panel.innerHTML = '<div class="hx-panel-top">' + tabs + '</div><div class="hx-panel-body">' + body + '</div>';
  }
  function openPanel(tab) {
    panelTab = tab;
    const panel = by('hx-panel');
    renderPanel();
    panel.hidden = false;
    by('hx-style-btn').setAttribute('aria-expanded', String(tab === 'style'));
    by('hx-marks-btn').setAttribute('aria-expanded', String(tab === 'marks'));
  }
  function closePanel() {
    by('hx-panel').hidden = true;
    by('hx-style-btn').setAttribute('aria-expanded', 'false');
    by('hx-marks-btn').setAttribute('aria-expanded', 'false');
  }
  function setStyle(patch) { setReadPrefs({ style: Object.assign({}, style(), patch) }); applyStyle(); }

  function wireReading() {
    applyStyle();
    const panel = by('hx-panel');
    by('hx-style-btn').addEventListener('click', () => (!panel.hidden && panelTab === 'style') ? closePanel() : openPanel('style'));
    by('hx-marks-btn').addEventListener('click', () => (!panel.hidden && panelTab === 'marks') ? closePanel() : openPanel('marks'));
    panel.addEventListener('click', e => {
      const t = e.target;
      const tab = t.closest('[data-tab]'); if (tab) { openPanel(tab.dataset.tab); return; }
      if (t.closest('[data-panel-close]')) { closePanel(); return; }
      const set = t.closest('[data-set]');
      if (set) { const k = set.dataset.set; setStyle({ [k]: k === 'weight' ? Number(set.dataset.val) : set.dataset.val }); renderPanel(); return; }
      const def = t.closest('[data-hl-default]'); if (def) { setReadPrefs({ hlColor: def.dataset.hlDefault }); renderPanel(); return; }
      if (t.closest('[data-reset]')) { setPrefs({ style: {} }); setReadPrefs({ style: {} }); applyStyle(); renderPanel(); return; }
      const go = t.closest('[data-go]');
      if (go) { scrollToBlock(go.dataset.go, true); if (window.matchMedia('(max-width: 900px)').matches) closePanel(); return; }
      const del = t.closest('[data-del-mark]'); if (del) { removeMark(del.dataset.delMark); renderPanel(); return; }
      if (t.closest('[data-export]')) {
        const blob = new Blob([JSON.stringify({ app: 'scholar-health', version: 1, marks: loadMarks() }, null, 1)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '特做畫線.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    });
    panel.addEventListener('input', e => {
      const r = e.target.closest('[data-range]');
      if (r) { setStyle({ [r.dataset.range]: Number(r.value) }); const b = r.parentElement.querySelector('b'); if (b) b.textContent = r.value + (r.dataset.range === 'lead' ? '' : ' px'); return; }
      if (e.target.matches('[data-color-pick]')) setStyle({ ink: e.target.value });
    });
    panel.addEventListener('change', async e => {
      if (e.target.matches('[data-color-pick]')) { renderPanel(); return; }
      if (!e.target.matches('[data-import]') || !e.target.files[0]) return;
      try {
        const data = JSON.parse(await e.target.files[0].text());
        const incoming = data && data.marks;
        if (!incoming || typeof incoming !== 'object') throw new Error('format');
        const all = loadMarks();
        for (const [gid, list] of Object.entries(incoming)) {
          if (!Array.isArray(list)) continue;
          const have = new Set((all[gid] || []).map(m => m.id));
          all[gid] = (all[gid] || []).concat(list.filter(m => m && !have.has(m.id) && typeof m.t === 'string'));
        }
        saveMarks(all); paintMarks(); renderPanel();
      } catch (_) { alertInPanel('這個檔案不是特做畫線的匯出檔。'); }
    });
    function alertInPanel(msg) { const p = document.createElement('p'); p.className = 'hx-panel-note hx-warn'; p.textContent = msg; panel.querySelector('.hx-panel-body').prepend(p); }
    document.addEventListener('pointerdown', e => {
      if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('#hx-style-btn,#hx-marks-btn')) closePanel();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { closePanel(); } });
    // selection -> colour bar; tap on a highlight -> recolour / delete
    let t = 0;
    document.addEventListener('selectionchange', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (document.body.dataset.game !== 'health') { hideHlBar(); return; }
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) { const bar = by('hx-hlbar'); if (bar && !bar.dataset.group) hideHlBar(); return; }
        if (!selectionPieces().length) { hideHlBar(); return; }
        showHlBar(sel.getRangeAt(0).getBoundingClientRect(), null);
      }, 200);
    });
    by('hx-doc').addEventListener('click', e => {
      const m = e.target.closest('mark.hx-hl');
      const sel = window.getSelection();
      if (m && (!sel || sel.isCollapsed) && !e.target.closest('[data-att],[data-goto]')) showHlBar(m.getBoundingClientRect(), m.dataset.hl);
    });
    document.addEventListener('pointerdown', e => {
      const bar = by('hx-hlbar');
      if (bar && !bar.hidden && !bar.contains(e.target) && !e.target.closest('mark.hx-hl')) { if (bar.dataset.group) hideHlBar(); }
    });
    // a tapped highlight's bar goes away once the text has scrolled on (not for the small nudge a tap can cause)
    by('hx-scroll').addEventListener('scroll', () => {
      const bar = by('hx-hlbar');
      if (bar && !bar.hidden && bar.dataset.group && Math.abs(by('hx-scroll').scrollTop - Number(bar.dataset.at || 0)) > 60) hideHlBar();
    }, { passive: true });
  }

  /* ── entry point used by the tab switcher ── */
  let booted = null;
  function show() {
    const panel = by('health-panel');
    if (!panel) return;
    measure();
    if (booted) applyStyle();
    if (!booted) {
      booted = (async () => {
        shell(); measure();
        try { state.index = await fetchJSON('index.json'); }
        catch (_) { by('hx-list').innerHTML = '<p class="hx-empty">無法載入特做目錄。第一次使用需要網路連線，之後可離線閱讀。</p>'; booted = null; return; }
        state.index.guides.forEach(g => state.byId.set(g.id, g));
        renderSide();
        const last = prefs().guide;
        await openGuide(state.byId.has(last) ? last : state.index.guides[0].id, { boot: true });
        // the full-text search index (every guide) loads when the search box is first used, not on every visit
      })();
    } else if (state.current) {
      document.title = state.current.meta.name + ' · Scholar';
    }
    return booted;
  }
  let cloudStyle=JSON.stringify(style());
  window.ScholarSync.subscribe(key=>{if(!state.current)return;if(key===READ_STORE||key===STORE){const next=JSON.stringify(style());if(next!==cloudStyle){cloudStyle=next;applyStyle();}}if(key===HL_STORE)paintMarks();});
  window.ScholarHealth = { show };
})();
