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
    right: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    pen: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h5l10.5-10.5a2.1 2.1 0 0 0-3-3L6 17v3"/><path d="M14.5 7.5l3 3"/></svg>',
    aa: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 8 6l5 12M4.8 14h6.4"/><path d="M15 12.5c.6-1 1.6-1.5 2.8-1.5 1.8 0 3.2 1 3.2 3v4M21 15.5c-1-.4-2-.5-3-.4-1.6.2-2.8.9-2.8 2.1 0 1 .8 1.8 2 1.8 1.6 0 3-1.1 3.8-2.4"/></svg>',
    trash: '<svg class="sg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>'
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
      if (b.t === 'img' && b.scan) {
        flush();
        out.push('<div class="gx-scan"' + aid + '>' + b.img.map(im => '<img src="' + BASE + 'attach/img/' + im.src + '" width="' + Math.round(im.w * 1.4) + '" height="' + Math.round(im.h * 1.4) + '" alt="原頁影像" loading="lazy">').join('') + '</div>');
        return;
      }
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
            <button type="button" class="sg-btn gx-tool-btn" id="gx-marks-btn" aria-haspopup="dialog" aria-controls="gx-panel" title="我的畫線">${icon.pen}<span>畫線</span></button>
            <button type="button" class="sg-btn gx-tool-btn" id="gx-style-btn" aria-haspopup="dialog" aria-controls="gx-panel" title="閱讀設定">${icon.aa}<span>閱讀設定</span></button>
          </div>
          <div class="gx-panel" id="gx-panel" role="dialog" aria-label="閱讀設定與畫線" hidden></div>
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
      const cat = e.target.closest('[data-cat]');
      if (cat) {
        const open = Object.assign({}, prefs().open);
        open[cat.dataset.cat] = !catOpen(cat.dataset.cat);
        setPrefs({ open }); renderSide(); return;
      }
      if (more) { state.expanded = state.expanded || new Set(); state.expanded.add(more.dataset.more); renderSide(); return; }
      if (!g) return;
      if (g.dataset.openAtt) { state.closeDrawer(); openGuide(g.dataset.guide).then(() => openAtt(g.dataset.openAtt)); return; }
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
    wireReading();
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
      '<span class="gx-guide-meta">' + g.pages + ' 頁' + (g.scan ? ' · 掃描影像' : '') + (n ? ' · ' + n + ' 個附件與表圖' : '') + '</span></button>';
  }
  /* a category is open when the reader opened it, or (until they choose) when it holds the guide being read */
  function catOpen(id) {
    const saved = (prefs().open || {})[id];
    if (saved != null) return saved;
    return Boolean(state.current && state.current.meta.cat === id);
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
        const open = catOpen(c.id);
        return '<button type="button" class="gx-cat" data-cat="' + c.id + '" aria-expanded="' + open + '" aria-controls="gx-cat-' + c.id + '">' +
          '<span class="gx-cat-name">' + icon.right + esc(c.name) + '</span><span>' + count + '</span></button>' +
          '<div class="gx-cat-list" id="gx-cat-' + c.id + '"' + (open ? '' : ' hidden') + '>' +
          (gs.length ? gs.map(guideButton).join('') : '<p class="gx-cat-empty">尚未收錄</p>') + '</div>';
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
        html += '<button type="button" class="gx-hit" data-guide="' + g.guide.id + '"' + (h.att ? ' data-open-att="' + h.att + '"' : ' data-block="' + h.block + '"') + '>' +
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
      // whole documents published with a guide (Q&A, 修正對照表) are searched as part of it
      const extra = await Promise.all(state.index.guides.flatMap(g => g.attach.filter(a => a.doc).map(a => getAtt(a.id).then(d => [g, a, d]))));
      extra.forEach(([g, a, data]) => data.blocks.forEach((b, k) => {
        const text = blockText(b);
        if (text) docs.push({ guide: g.id, block: 100000 + k, att: a.id, where: a.label, text, norm: normMap(text).s });
      }));
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
      by('gx-doc').innerHTML = '<p class="gx-loading">載入中…</p>';
      let data;
      try { data = await getText(id); }
      catch (_) { by('gx-doc').innerHTML = '<p class="gx-loading">無法載入這份指引。請確認網路連線後再試一次。</p>'; return; }
      state.current = Object.assign({}, data, { meta });
      setPrefs({ guide: id });
      if (!opts.boot && !catOpen(meta.cat)) setPrefs({ open: Object.assign({}, prefs().open, { [meta.cat]: true }) });
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
      '<p class="gx-credit">' + esc(guide.credit) + '</p>' +
      (guide.scan ? '<p class="gx-scan-note">原始 PDF 為掃描影像、沒有文字層，以下為原頁影像，不提供全文搜尋。</p>' : '');
    if (meta.attach.length) {
      html += '<div class="gx-chips">' + meta.attach.map(a => '<button type="button" class="gx-chip" data-att="' + a.id + '">' + esc(a.label) + (a.title ? '<span>' + esc(a.title) + '</span>' : '') + '</button>').join('') + '</div>';
    }
    html += '</div><div class="gx-body">' + blocksHTML(guide.blocks, terms, { anchor: guide.id }) + '</div>';
    by('gx-doc').innerHTML = html;
    const chapters = guide.blocks.map((b, k) => b.t === 'h' ? { id: 'gx-b-' + guide.id + '-' + k, text: b.text, lv: b.lv } : null).filter(Boolean);
    const sel = by('gx-chapters');
    sel.hidden = !chapters.length;
    sel.innerHTML = '<option value="">章節</option>' + chapters.map(c => '<option value="' + c.id + '">' + '　'.repeat(c.lv - 1) + esc(c.text.replace(/\s+/g, ' ')) + '</option>').join('');
    paintMarks();
    if (keepScroll) { sc.style.scrollBehavior = 'auto'; sc.scrollTop = top; sc.style.scrollBehavior = ''; }
    document.title = meta.name + ' · Scholar';
    if (!by('gx-panel').hidden && panelTab === 'marks') renderPanel();
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
    body.innerHTML = (data.cover || []).map(c => '<p class="gx-cover">' + rich(c, null, state.terms) + '</p>').join('') +
      blocksHTML(data.blocks.filter(b => !b.cap), state.terms, { card: true });
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
  // shared by the 法規 and 指引 readers
  const READ_STORE = 'scholar-reading-v1';
  function readPrefs() { try { return JSON.parse(localStorage.getItem(READ_STORE)) || {}; } catch (_) { return {}; } }
  function setReadPrefs(patch) { try { localStorage.setItem(READ_STORE, JSON.stringify(Object.assign(readPrefs(), patch))); } catch (_) { /* private mode */ } }
  function style() { return Object.assign({}, DEFAULT_STYLE, prefs().style, readPrefs().style); }
  function applyStyle() {
    const st = style();
    const targets = [by('guides-panel'), by('gx-att')].filter(Boolean);
    targets.forEach(el => {
      el.style.setProperty('--gx-fs', st.size + 'px');
      el.style.setProperty('--gx-lead', st.lead);
      el.style.setProperty('--gx-font', (FONTS[st.font] || FONTS.sans).css);
      el.style.setProperty('--gx-weight', st.weight);
      el.style.setProperty('--gx-ink', st.ink);
      el.style.setProperty('--gx-width', st.width + 'px');
    });
  }

  /* ── highlights: chosen colour on any run of text, kept per guide (this device only) ── */
  const HL_STORE = 'scholar-guides-hl-v1';
  const HL_COLORS = [['yellow', '黃'], ['green', '綠'], ['blue', '藍'], ['pink', '粉紅'], ['orange', '橘']];
  let panelTab = 'style';
  function loadMarks() { try { return JSON.parse(localStorage.getItem(HL_STORE)) || {}; } catch (_) { return {}; } }
  function saveMarks(all) { try { localStorage.setItem(HL_STORE, JSON.stringify(all)); return true; } catch (_) { return false; } }
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
  const anchors = () => [...by('gx-doc').querySelectorAll('[id^="gx-b-' + state.current.id + '-"]')];
  const keyOf = el => Number(el.id.slice(('gx-b-' + state.current.id + '-').length));
  const elOf = key => by('gx-b-' + state.current.id + '-' + key);
  function blockOf(node) {
    const el = node && (node.nodeType === 3 ? node.parentElement : node);
    const b = el && el.closest('[id^="gx-b-"]');
    return b && by('gx-doc').contains(b) ? b : null;
  }
  // the current selection as pieces of text per block: [{b, s, e, t}]
  function selectionPieces() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !state.current) return [];
    const range = sel.getRangeAt(0);
    const doc = by('gx-doc');
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
    if (!by('gx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  function recolorMark(group, color) {
    const gid = state.current.id;
    setMarks(gid, marksOf(gid).map(m => (m.g || m.id) === group ? Object.assign({}, m, { c: color }) : m));
    setReadPrefs({ hlColor: color });
    hideHlBar(); paintMarks();
    if (!by('gx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  function removeMark(group) {
    const gid = state.current.id;
    setMarks(gid, marksOf(gid).filter(m => (m.g || m.id) !== group));
    hideHlBar(); paintMarks();
    if (!by('gx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  // wrap the stored ranges in <mark>; a mark whose text moved is looked up by its words, or left unpainted
  function paintMarks() {
    if (!state.current) return;
    const doc = by('gx-doc');
    doc.querySelectorAll('mark.gx-hl').forEach(m => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
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
        mark.className = 'gx-hl gx-hl-' + m.c; mark.dataset.hl = m.g || m.id;
        r.surroundContents(mark);
      }
    }
  }

  // the little colour bar that follows a selection or a tapped highlight
  function hlBar() {
    let bar = by('gx-hlbar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'gx-hlbar'; bar.className = 'gx-hlbar'; bar.hidden = true;
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
    bar.innerHTML = HL_COLORS.map(([c, name]) => '<button type="button" class="gx-swatch gx-hl-' + c + (c === current ? ' gx-on' : '') + '" data-color="' + c + '" aria-label="' + (group ? '改成' : '畫線：') + name + '色"></button>').join('') +
      (group ? '<button type="button" class="gx-hl-del" data-del aria-label="移除這段畫線">' + icon.trash + '</button>' : '');
    if (group) bar.dataset.group = group; else delete bar.dataset.group;
    bar.dataset.at = String(by('gx-scroll').scrollTop);
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
  function hideHlBar() { const bar = by('gx-hlbar'); if (bar) bar.hidden = true; }

  /* ── the panel: 閱讀設定 / 我的畫線 ── */
  function renderPanel() {
    const panel = by('gx-panel');
    const st = style();
    const tabs = '<div class="sg-segment gx-panel-tabs" role="tablist">' +
      '<button type="button" class="sg-btn" role="tab" data-tab="style" aria-selected="' + (panelTab === 'style') + '" aria-pressed="' + (panelTab === 'style') + '">閱讀設定</button>' +
      '<button type="button" class="sg-btn" role="tab" data-tab="marks" aria-selected="' + (panelTab === 'marks') + '" aria-pressed="' + (panelTab === 'marks') + '">我的畫線</button></div>' +
      '<button type="button" class="sg-btn gx-icon-btn gx-panel-x" data-panel-close aria-label="關閉">' + icon.x + '</button>';
    let body = '';
    if (panelTab === 'style') {
      const chips = (key, items, cur) => '<div class="gx-chiprow">' + items.map(([v, label]) => '<button type="button" class="gx-opt' + (String(v) === String(cur) ? ' gx-on' : '') + '" data-set="' + key + '" data-val="' + v + '">' + label + '</button>').join('') + '</div>';
      body =
        '<div class="gx-field"><div class="gx-field-head"><span>字級</span><b>' + st.size + ' px</b></div><input type="range" min="13" max="24" step="0.5" value="' + st.size + '" data-range="size" aria-label="字級"></div>' +
        '<div class="gx-field"><div class="gx-field-head"><span>行距</span><b>' + st.lead + '</b></div><input type="range" min="1.5" max="2.6" step="0.05" value="' + st.lead + '" data-range="lead" aria-label="行距"></div>' +
        '<div class="gx-field gx-wide-only"><div class="gx-field-head"><span>版面寬度</span><b>' + st.width + ' px</b></div><input type="range" min="560" max="1100" step="20" value="' + st.width + '" data-range="width" aria-label="版面寬度"></div>' +
        '<div class="gx-field"><div class="gx-field-head"><span>字型</span></div>' + chips('font', Object.entries(FONTS).map(([k, f]) => [k, '<span style="font-family:' + f.css.replace(/"/g, '&quot;') + '">' + f.label + '</span>']), st.font) + '</div>' +
        '<div class="gx-field"><div class="gx-field-head"><span>粗細</span></div>' + chips('weight', WEIGHTS.map(([w, l]) => [w, '<span class="gx-w" style="--w:' + w + '">' + l + '</span>']), st.weight) + '</div>' +
        '<div class="gx-field"><div class="gx-field-head"><span>文字顏色</span></div><div class="gx-chiprow">' +
          INKS.map(([c, l]) => '<button type="button" class="gx-ink' + (c === st.ink ? ' gx-on' : '') + '" data-set="ink" data-val="' + c + '" style="--c:' + c + '" aria-label="' + l + '"></button>').join('') +
          '<label class="gx-ink gx-ink-pick" aria-label="自訂顏色"><input type="color" value="' + st.ink + '" data-color-pick></label></div></div>' +
        '<div class="gx-field"><div class="gx-field-head"><span>畫線預設顏色</span></div><div class="gx-chiprow">' +
          HL_COLORS.map(([c, l]) => '<button type="button" class="gx-swatch gx-hl-' + c + (c === hlColor() ? ' gx-on' : '') + '" data-hl-default="' + c + '" aria-label="' + l + '"></button>').join('') + '</div></div>' +
        '<p class="gx-preview">預覽：職業性腕隧道症候群(Carpal Tunnel Syndrome)是手腕部累積性傷害病變的一種。</p>' +
        '<button type="button" class="sg-btn gx-reset" data-reset>恢復預設</button>';
    } else {
      const list = state.current ? marksOf(state.current.id) : [];
      const groups = [];
      list.forEach(m => { const g = groups.find(x => x.g === (m.g || m.id)); if (g) g.t += '…' + m.t; else groups.push({ g: m.g || m.id, b: m.b, c: m.c, t: m.t }); });
      body = '<p class="gx-panel-note">選取內文文字，就會出現顏色列可以畫線；點已畫線的地方可以換色或刪除。畫線存在這台裝置的瀏覽器裡。</p>';
      body += groups.length ? '<div class="gx-marklist">' + groups.map(g => '<div class="gx-markrow"><button type="button" class="gx-markgo" data-go="' + g.b + '"><i class="gx-dot gx-hl-' + g.c + '"></i><span>' + esc(g.t.length > 90 ? g.t.slice(0, 90) + '…' : g.t) + '</span></button><button type="button" class="gx-icon-btn gx-markdel" data-del-mark="' + g.g + '" aria-label="刪除">' + icon.trash + '</button></div>').join('') + '</div>'
        : '<p class="gx-empty">這份指引還沒有畫線。</p>';
      const total = Object.values(loadMarks()).reduce((n, l) => n + new Set(l.map(m => m.g || m.id)).size, 0);
      body += '<div class="gx-panel-foot"><span>全部指引共 ' + total + ' 段</span><button type="button" class="sg-btn" data-export>匯出</button><label class="sg-btn gx-import">匯入<input type="file" accept="application/json,.json" data-import hidden></label></div>';
    }
    panel.innerHTML = '<div class="gx-panel-top">' + tabs + '</div><div class="gx-panel-body">' + body + '</div>';
  }
  function openPanel(tab) {
    panelTab = tab;
    const panel = by('gx-panel');
    renderPanel();
    panel.hidden = false;
    by('gx-style-btn').setAttribute('aria-expanded', String(tab === 'style'));
    by('gx-marks-btn').setAttribute('aria-expanded', String(tab === 'marks'));
  }
  function closePanel() {
    by('gx-panel').hidden = true;
    by('gx-style-btn').setAttribute('aria-expanded', 'false');
    by('gx-marks-btn').setAttribute('aria-expanded', 'false');
  }
  function setStyle(patch) { setReadPrefs({ style: Object.assign({}, style(), patch) }); applyStyle(); }

  function wireReading() {
    applyStyle();
    const panel = by('gx-panel');
    by('gx-style-btn').addEventListener('click', () => (!panel.hidden && panelTab === 'style') ? closePanel() : openPanel('style'));
    by('gx-marks-btn').addEventListener('click', () => (!panel.hidden && panelTab === 'marks') ? closePanel() : openPanel('marks'));
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
        const blob = new Blob([JSON.stringify({ app: 'scholar-guides', version: 1, marks: loadMarks() }, null, 1)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '指引畫線.json'; a.click();
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
      } catch (_) { alertInPanel('這個檔案不是指引畫線的匯出檔。'); }
    });
    function alertInPanel(msg) { const p = document.createElement('p'); p.className = 'gx-panel-note gx-warn'; p.textContent = msg; panel.querySelector('.gx-panel-body').prepend(p); }
    document.addEventListener('pointerdown', e => {
      if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('#gx-style-btn,#gx-marks-btn')) closePanel();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { closePanel(); } });
    // selection -> colour bar; tap on a highlight -> recolour / delete
    let t = 0;
    document.addEventListener('selectionchange', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (document.body.dataset.game !== 'guides') { hideHlBar(); return; }
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) { const bar = by('gx-hlbar'); if (bar && !bar.dataset.group) hideHlBar(); return; }
        if (!selectionPieces().length) { hideHlBar(); return; }
        showHlBar(sel.getRangeAt(0).getBoundingClientRect(), null);
      }, 200);
    });
    by('gx-doc').addEventListener('click', e => {
      const m = e.target.closest('mark.gx-hl');
      const sel = window.getSelection();
      if (m && (!sel || sel.isCollapsed) && !e.target.closest('[data-att],[data-goto]')) showHlBar(m.getBoundingClientRect(), m.dataset.hl);
    });
    document.addEventListener('pointerdown', e => {
      const bar = by('gx-hlbar');
      if (bar && !bar.hidden && !bar.contains(e.target) && !e.target.closest('mark.gx-hl')) { if (bar.dataset.group) hideHlBar(); }
    });
    // a tapped highlight's bar goes away once the text has scrolled on (not for the small nudge a tap can cause)
    by('gx-scroll').addEventListener('scroll', () => {
      const bar = by('gx-hlbar');
      if (bar && !bar.hidden && bar.dataset.group && Math.abs(by('gx-scroll').scrollTop - Number(bar.dataset.at || 0)) > 60) hideHlBar();
    }, { passive: true });
  }

  /* ── entry point used by the tab switcher ── */
  let booted = null;
  function show() {
    const panel = by('guides-panel');
    if (!panel) return;
    measure();
    if (booted) applyStyle();
    if (!booted) {
      booted = (async () => {
        shell(); measure();
        try { state.index = await fetchJSON('index.json'); }
        catch (_) { by('gx-list').innerHTML = '<p class="gx-empty">無法載入指引目錄。第一次使用需要網路連線，之後可離線閱讀。</p>'; booted = null; return; }
        state.index.guides.forEach(g => state.byId.set(g.id, g));
        renderSide();
        const last = prefs().guide;
        await openGuide(state.byId.has(last) ? last : state.index.guides[0].id, { boot: true });
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
