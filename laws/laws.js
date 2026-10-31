/* 法規 tab: native reader for the study-list laws and their 附表. Data lives in laws/*.json. */
(() => {
  'use strict';
  const BASE = 'laws/';
  const STORE = 'scholar-laws-v1';
  const TIER_NAMES = { S: '熟練應用', A: '常見個案與專題', B: '特定場景查用', C: '支付、歷史與過渡' };
  const state = { index: null, byId: new Map(), texts: new Map(), annexes: new Map(), current: null, query: '', terms: [],
    scope: 'all', field: null, corpus: null, corpusPromise: null, ready: false, annexOpen: null };
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
        const t = esc(text.slice(k, l)).replace(/[\uF000-\uF0FF]/g, c => '<span style="font-family:Symbol,serif!important">' + c + '</span>');
        inner += m ? '<mark class="lx-mark">' + t + '</mark>' : t;
        k = l;
      }
      out += id ? '<button type="button" class="lx-ref" data-annex="' + id + '" title="開啟' + esc(text.slice(i, j)) + '">' + inner + '</button>' : inner;
      i = j;
    }
    return out;
  }

  /* ── tables & formulas ── */
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
        return '<span class="lx-d-' + name + '"' + style + '>' + rich(d[name], null, terms) + '</span>';
      };
      return '<' + tag + span + ' class="lx-diag' + (d.n === 1 ? ' lx-diag-1' : '') + '"><svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">' + lines + '</svg>' +
        label('tr') + label('mid') + label('bl') + '</' + tag + '>';
    }
    let inner = scientific(c.text || '', c.sup, terms, c.sub);
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
    // only many-column tables need a minimum width (and sideways scrolling on phones)
    const minW = t.widths.length > 4 ? Math.round(total * (nested ? 1.1 : 1.3)) : 0;
    // a header cell that spans down (e.g. a diagonal corner) pulls the rows it covers into the header
    let head = Math.min(t.head || 0, t.rows.length - 1);
    if (head > 0) head = Math.min(t.rows.length - 1, Math.max(head, ...t.rows[0].map(c => c.rs || 1)));
    const rowsHTML = (rows, tag) => rows.map(r => '<tr>' + r.map(c => cellHTML(c, terms, tag, t)).join('') + '</tr>').join('');
    return '<div class="lx-twrap' + (nested ? ' lx-nested' : '') + '"><table class="lx-table" style="min-width:' + minW + 'px"><colgroup>' + cols + '</colgroup>' +
      (head > 0 ? '<thead' + (head > 1 ? ' class="lx-multi-head"' : '') + '>' + rowsHTML(t.rows.slice(0, head), 'th') + '</thead>' : '') +
      '<tbody>' + rowsHTML(t.rows.slice(head), 'td') + '</tbody></table></div>';
  }
  function formulaHTML(rows, terms) {
    return '<div class="lx-formula" role="math">' + rows.map(r => '<div class="lx-frow">' + r.map(tok => typeof tok === 'string'
      ? '<span>' + rich(tok, null, terms) + '</span>'
      : '<span class="lx-frac"><span>' + rich(tok.num, null, terms) + '</span><span>' + rich(tok.den, null, terms) + '</span></span>').join('') + '</div>').join('') + '</div>';
  }
  function blocksHTML(blocks, terms, inCell) {
    return blocks.map(b => {
      if (b.t === 'p') return '<p class="' + (inCell ? 'lx-cell-p' : 'lx-ap' + (b.center ? ' lx-center' : '')) + '">' + scientific(b.text, b.sup, terms, b.sub) + '</p>';
      if (b.t === 'table') return tableHTML(b, terms, inCell);
      if (b.t === 'diagram') return '<svg viewBox="0 0 ' + b.w + ' ' + b.h + '" width="' + (b.w * 1.4) + '" height="' + (b.h * 1.4) + '" style="display:block;max-width:100%;margin:10px 0" xmlns="http://www.w3.org/2000/svg">' +
        (b.paths || []).map(p => '<path d="' + p.d + '" stroke="' + (p.stroke === false ? 'none' : 'currentColor') + '" stroke-width="' + p.width + '" fill="' + (p.fill ? 'currentColor' : 'none') + '"' + (p.dash ? ' stroke-dasharray="' + p.dash + '"' : '') + '/>').join('') +
        b.runs.map(r => '<text x="' + r.x + '" y="' + r.y + '" font-size="' + r.size + '" style="font-family:' + (r.font || 'Times New Roman,serif') + '!important' + (r.italic ? ';font-style:italic' : '') + '" fill="currentColor">' + esc(r.text) + '</text>').join('') + '</svg>';
      if (b.t === 'img') return b.img.map(im => '<img class="lx-annex-img" src="' + BASE + 'annex/img/' + im.src + '" width="' + Math.round(im.w * 1.4) + '" alt="">').join('');
      return '';
    }).join('');
  }

  /* ── shell ── */
  function shell() {
    const panel = by('laws-panel');
    panel.innerHTML = `
      <div class="lx-layout">
        <div class="lx-scrim" id="lx-scrim" aria-hidden="true"></div>
        <aside class="lx-side sg-glass" aria-label="法規目錄與搜尋">
          <div class="lx-side-head"><span>法規目錄</span><button type="button" class="sg-btn lx-icon-btn" id="lx-side-close" aria-label="關閉目錄">${icon.x}</button></div>
          <div class="lx-search">${icon.search}
            <input id="lx-q" type="search" placeholder="搜尋法規名稱、條文與附表" aria-label="關鍵字搜尋" autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button type="button" class="lx-clear" id="lx-clear" aria-label="清除搜尋" hidden>${icon.x}</button>
          </div>
          <div class="lx-opts" id="lx-opts" hidden>
            <div class="sg-segment lx-field" id="lx-field" role="group" aria-label="搜尋對象">
              <button type="button" class="sg-btn" data-field="title" aria-pressed="false">標題<span class="lx-field-n" id="lx-n-title"></span></button>
              <button type="button" class="sg-btn" data-field="body" aria-pressed="true">內文<span class="lx-field-n" id="lx-n-body"></span></button>
            </div>
            <div class="sg-segment lx-scope" id="lx-scope" role="group" aria-label="搜尋範圍">
              <button type="button" class="sg-btn" data-scope="all" aria-pressed="true">全部法規</button>
              <button type="button" class="sg-btn" data-scope="law" aria-pressed="false">目前這部</button>
            </div>
          </div>
          <div class="lx-list" id="lx-list"><p class="lx-empty">載入中…</p></div>
        </aside>
        <section class="lx-reader">
          <div class="lx-bar">
            <button type="button" class="sg-btn lx-menu-btn" id="lx-menu">${icon.list}法規目錄</button>
            <label class="lx-jump">第<input id="lx-jump" inputmode="numeric" aria-label="跳到第幾條" placeholder="" autocomplete="off">條</label>
            <select class="lx-select" id="lx-chapters" aria-label="跳到章節" hidden></select>
            <span class="lx-spacer"></span>
            <button type="button" class="sg-btn lx-tool-btn" id="lx-marks-btn" aria-haspopup="dialog" aria-controls="lx-panel" title="我的畫線">${icon.pen}<span>畫線</span></button>
            <button type="button" class="sg-btn lx-tool-btn" id="lx-style-btn" aria-haspopup="dialog" aria-controls="lx-panel" title="閱讀設定">${icon.aa}<span>閱讀設定</span></button>
          </div>
          <div class="lx-panel" id="lx-panel" role="dialog" aria-label="閱讀設定與畫線" hidden></div>
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
    by('lx-field').addEventListener('click', e => {
      const b = e.target.closest('[data-field]'); if (!b) return;
      state.field = b.dataset.field; renderSide();
    });
    by('lx-list').addEventListener('click', e => {
      const law = e.target.closest('[data-law]');
      const more = e.target.closest('[data-more]');
      const tier = e.target.closest('[data-tier]');
      if (tier) {
        const open = Object.assign({}, prefs().open);
        open[tier.dataset.tier] = !tierOpen(tier.dataset.tier);
        setPrefs({ open }); renderSide(); return;
      }
      if (more) { state.expanded = state.expanded || new Set(); state.expanded.add(more.dataset.more); renderSide(); return; }
      if (!law) return;
      const annex = law.dataset.openAnnex;
      if (annex) { openAnnex(annex); return; }
      openLaw(law.dataset.law, { art: law.dataset.art, flash: Boolean(law.dataset.art) });
      state.closeDrawer();
    });
    // the drawer gets its own history entry, so the phone's back gesture closes it instead of leaving the page
    const drawerOpen = () => by('laws-panel').classList.contains('lx-drawer');
    const openDrawer = () => {
      if (drawerOpen()) return;
      by('laws-panel').classList.add('lx-drawer');
      try { history.pushState({ lxDrawer: true }, ''); } catch (_) { /* file:// */ }
    };
    const closeDrawer = () => {
      if (!drawerOpen()) return;
      by('laws-panel').classList.remove('lx-drawer');
      if (history.state && history.state.lxDrawer) history.back();
    };
    state.openDrawer = openDrawer; state.closeDrawer = closeDrawer;
    window.addEventListener('popstate', () => { if (drawerOpen()) by('laws-panel').classList.remove('lx-drawer'); });
    by('lx-side-close').addEventListener('click', () => { closeDrawer(); by('lx-menu').focus({ preventScroll: true }); });
    by('lx-scrim').addEventListener('click', closeDrawer);
    by('lx-menu').addEventListener('click', () => drawerOpen() ? closeDrawer() : openDrawer());
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
      if (e.target === dlg) { closeAnnex(); return; }
      if (e.target.closest('[data-close]')) closeAnnex();
      const step = e.target.closest('[data-step]');
      if (step) stepAnnex(Number(step.dataset.step));
    });
    dlg.addEventListener('close', () => { state.annexOpen = null; dlg.classList.remove('lx-closing'); dlg.style.transform = ''; });
    dlg.addEventListener('cancel', e => { e.preventDefault(); closeAnnex(); });   // Esc: close with the animation
    // drag the card down by its header to dismiss, like a preview
    let drag = null;
    const head = dlg.querySelector('.lx-dialog-head');
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
      if (far) closeAnnex(); else dlg.style.transform = '';
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
    window.addEventListener('keydown', e => {
      if (document.body.dataset.game !== 'laws' || dlg.open) return;
      const t = e.target;
      const typing = t && t.closest && t.closest('input,select,textarea');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (window.matchMedia('(max-width: 900px)').matches) state.openDrawer();
        q.focus(); q.select();
      } else if (e.key === 'Escape' && by('laws-panel').classList.contains('lx-drawer')) {
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
  function lawButton(l, n, terms) {
    const annexN = l.annexes.length;
    const tier = terms ? state.index.tiers.find(t => t.id === l.tier) : null;
    return '<button type="button" class="lx-law" data-law="' + l.id + '"' + (state.current && state.current.id === l.id ? ' aria-current="true"' : '') + '>' +
      '<span class="lx-law-no">' + n + '</span><span>' + (terms ? rich(l.name, null, terms) : esc(l.name)) + '</span>' +
      '<span class="lx-law-meta">' + (tier ? esc([tier.id, tier.name].filter(Boolean).join(' ')) + ' · ' : '') + l.articles + ' 條' + (annexN ? ' · ' + annexN + ' 個附表' : '') + '</span></button>';
  }
  /* title search: every term in the law's name */
  function titleHits(terms) {
    return state.index.laws.filter(l => { const t = normMap(l.name).s; return terms.every(x => t.includes(x)); });
  }
  /* a tier is open when the reader opened it, or (until they choose) when it holds the law being read */
  function tierOpen(id) {
    const saved = (prefs().open || {})[id];
    if (saved != null) return saved;
    return Boolean(state.current && state.current.meta.tier === id);
  }
  function renderSide() {
    const list = by('lx-list');
    const idx = state.index;
    if (!idx) return;
    by('lx-clear').hidden = !state.query;
    by('lx-opts').hidden = !state.query;
    by('lx-scope').querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === state.scope)));
    if (!state.query) {
      list.innerHTML = idx.tiers.map(t => {
        const laws = idx.laws.filter(l => l.tier === t.id);
        const count = t.total && t.total > laws.length ? laws.length + ' / ' + t.total + ' 部' : laws.length + ' 部';
        const open = tierOpen(t.id);
        return '<button type="button" class="lx-tier" data-tier="' + t.id + '" aria-expanded="' + open + '" aria-controls="lx-tier-' + t.id + '">' +
          '<span class="lx-tier-name">' + icon.right + '<b>' + t.id + '</b>' + esc(t.name) + '</span><span>' + count + '</span></button>' +
          '<div class="lx-tier-list" id="lx-tier-' + t.id + '"' + (open ? '' : ' hidden') + '>' + laws.map((l, i) => lawButton(l, l.no || i + 1)).join('') + '</div>';
      }).join('');
      return;
    }
    // 標題: law names (no download needed); 內文: articles and 附表. Until the reader picks one, titles show when any match.
    const titles = titleHits(state.terms);
    const hits = state.corpus ? search(state.terms, state.scope === 'law' && state.current ? state.current.id : null) : null;
    const field = state.field || (titles.length ? 'title' : 'body');
    by('lx-field').querySelectorAll('[data-field]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.field === field)));
    by('lx-n-title').textContent = titles.length;
    by('lx-n-body').textContent = hits ? hits.total : '…';
    by('lx-scope').hidden = field !== 'body';
    if (field === 'title') {
      if (!titles.length) {
        list.innerHTML = '<p class="lx-empty">沒有法規名稱含「' + esc(state.query) + '」。' + (hits && hits.total ? '<br>內文有 ' + hits.total + ' 處符合，可切換到「內文」查看。' : '') + '</p>';
        return;
      }
      list.innerHTML = '<p class="lx-summary">' + titles.length + ' 部法規的名稱符合</p>' + titles.map(l => lawButton(l, l.no || state.index.laws.filter(x => x.tier === l.tier).indexOf(l) + 1, state.terms)).join('');
      return;
    }
    if (!hits) { list.innerHTML = '<p class="lx-empty">正在載入全部條文以供搜尋…</p>'; return; }
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
    return blocks.map(b => b.t === 'p' ? b.text : b.t === 'diagram' ? b.runs.map(r => r.text).join('') : b.t === 'table'
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
      if (!opts.boot && !tierOpen(meta.tier)) setPrefs({ open: Object.assign({}, prefs().open, { [meta.tier]: true }) });
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
    const tierInfo = state.index.tiers.find(t => t.id === meta.tier) || {};
    let html = '<div class="lx-head sg-glass"><p class="sg-eyebrow">' + [meta.tier, esc(tierInfo.name || TIER_NAMES[meta.tier] || ''), (meta.no || tierLaws.indexOf(meta) + 1) + ' / ' + (tierInfo.total || tierLaws.length)].filter(Boolean).join(' · ') + '</p>' +
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
    paintMarks();
    if (keepScroll) { sc.style.scrollBehavior = 'auto'; sc.scrollTop = top; sc.style.scrollBehavior = ''; }
    document.title = meta.name + ' · Scholar';
    if (!by('lx-panel').hidden && panelTab === 'marks') renderPanel();
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
  function closeAnnex() {
    const dlg = by('lx-annex');
    if (!dlg.open || dlg.classList.contains('lx-closing')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { dlg.close(); return; }
    dlg.classList.add('lx-closing');
    setTimeout(() => { if (dlg.open) dlg.close(); }, 170);
  }
  function stepAnnex(d) {
    if (!state.annexOpen) return;
    const { list, pos } = annexMeta(state.annexOpen);
    const next = list[pos + d];
    if (next) openAnnex(next.id);
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
    const targets = [by('laws-panel'), by('lx-annex')].filter(Boolean);
    targets.forEach(el => {
      el.style.setProperty('--lx-fs', st.size + 'px');
      el.style.setProperty('--lx-lead', st.lead);
      el.style.setProperty('--lx-font', (FONTS[st.font] || FONTS.sans).css);
      el.style.setProperty('--lx-weight', st.weight);
      el.style.setProperty('--lx-ink', st.ink);
      el.style.setProperty('--lx-width', st.width + 'px');
    });
  }

  /* ── highlights: chosen colour on any run of text, kept per guide (this device only) ── */
  const HL_STORE = 'scholar-laws-hl-v1';
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
  const anchors = () => [...by('lx-doc').querySelectorAll('[id^="lx-a-' + state.current.id + '-"], [id^="lx-ch-' + state.current.id + '-"]')];
  const keyOf = el => el.id;
  const elOf = key => by(key);
  function scrollToKey(key) {
    const el = by(key); if (!el) return;
    const sc = by('lx-scroll');
    sc.scrollTo({ top: el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 6, behavior: 'smooth' });
    el.classList.add('lx-flash'); setTimeout(() => el.classList.remove('lx-flash'), 1400);
  }
  function blockOf(node) {
    const el = node && (node.nodeType === 3 ? node.parentElement : node);
    const b = el && el.closest('[id^="lx-a-"], [id^="lx-ch-"]');
    return b && by('lx-doc').contains(b) ? b : null;
  }
  // the current selection as pieces of text per block: [{b, s, e, t}]
  function selectionPieces() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !state.current) return [];
    const range = sel.getRangeAt(0);
    const doc = by('lx-doc');
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
    if (!by('lx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  function recolorMark(group, color) {
    const gid = state.current.id;
    setMarks(gid, marksOf(gid).map(m => (m.g || m.id) === group ? Object.assign({}, m, { c: color }) : m));
    setReadPrefs({ hlColor: color });
    hideHlBar(); paintMarks();
    if (!by('lx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  function removeMark(group) {
    const gid = state.current.id;
    setMarks(gid, marksOf(gid).filter(m => (m.g || m.id) !== group));
    hideHlBar(); paintMarks();
    if (!by('lx-panel').hidden && panelTab === 'marks') renderPanel();
  }
  // wrap the stored ranges in <mark>; a mark whose text moved is looked up by its words, or left unpainted
  function paintMarks() {
    if (!state.current) return;
    const doc = by('lx-doc');
    doc.querySelectorAll('mark.lx-hl').forEach(m => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
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
        mark.className = 'lx-hl lx-hl-' + m.c; mark.dataset.hl = m.g || m.id;
        r.surroundContents(mark);
      }
    }
  }

  // the little colour bar that follows a selection or a tapped highlight
  function hlBar() {
    let bar = by('lx-hlbar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'lx-hlbar'; bar.className = 'lx-hlbar'; bar.hidden = true;
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
    bar.innerHTML = HL_COLORS.map(([c, name]) => '<button type="button" class="lx-swatch lx-hl-' + c + (c === current ? ' lx-on' : '') + '" data-color="' + c + '" aria-label="' + (group ? '改成' : '畫線：') + name + '色"></button>').join('') +
      (group ? '<button type="button" class="lx-hl-del" data-del aria-label="移除這段畫線">' + icon.trash + '</button>' : '');
    if (group) bar.dataset.group = group; else delete bar.dataset.group;
    bar.dataset.at = String(by('lx-scroll').scrollTop);
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
  function hideHlBar() { const bar = by('lx-hlbar'); if (bar) bar.hidden = true; }

  /* ── the panel: 閱讀設定 / 我的畫線 ── */
  function renderPanel() {
    const panel = by('lx-panel');
    const st = style();
    const tabs = '<div class="sg-segment lx-panel-tabs" role="tablist">' +
      '<button type="button" class="sg-btn" role="tab" data-tab="style" aria-selected="' + (panelTab === 'style') + '" aria-pressed="' + (panelTab === 'style') + '">閱讀設定</button>' +
      '<button type="button" class="sg-btn" role="tab" data-tab="marks" aria-selected="' + (panelTab === 'marks') + '" aria-pressed="' + (panelTab === 'marks') + '">我的畫線</button></div>' +
      '<button type="button" class="sg-btn lx-icon-btn lx-panel-x" data-panel-close aria-label="關閉">' + icon.x + '</button>';
    let body = '';
    if (panelTab === 'style') {
      const chips = (key, items, cur) => '<div class="lx-chiprow">' + items.map(([v, label]) => '<button type="button" class="lx-opt' + (String(v) === String(cur) ? ' lx-on' : '') + '" data-set="' + key + '" data-val="' + v + '">' + label + '</button>').join('') + '</div>';
      body =
        '<div class="lx-field"><div class="lx-field-head"><span>字級</span><b>' + st.size + ' px</b></div><input type="range" min="13" max="24" step="0.5" value="' + st.size + '" data-range="size" aria-label="字級"></div>' +
        '<div class="lx-field"><div class="lx-field-head"><span>行距</span><b>' + st.lead + '</b></div><input type="range" min="1.5" max="2.6" step="0.05" value="' + st.lead + '" data-range="lead" aria-label="行距"></div>' +
        '<div class="lx-field lx-wide-only"><div class="lx-field-head"><span>版面寬度</span><b>' + st.width + ' px</b></div><input type="range" min="560" max="1100" step="20" value="' + st.width + '" data-range="width" aria-label="版面寬度"></div>' +
        '<div class="lx-field"><div class="lx-field-head"><span>字型</span></div>' + chips('font', Object.entries(FONTS).map(([k, f]) => [k, '<span style="font-family:' + f.css.replace(/"/g, '&quot;') + '">' + f.label + '</span>']), st.font) + '</div>' +
        '<div class="lx-field"><div class="lx-field-head"><span>粗細</span></div>' + chips('weight', WEIGHTS.map(([w, l]) => [w, '<span class="lx-w" style="--w:' + w + '">' + l + '</span>']), st.weight) + '</div>' +
        '<div class="lx-field"><div class="lx-field-head"><span>文字顏色</span></div><div class="lx-chiprow">' +
          INKS.map(([c, l]) => '<button type="button" class="lx-ink' + (c === st.ink ? ' lx-on' : '') + '" data-set="ink" data-val="' + c + '" style="--c:' + c + '" aria-label="' + l + '"></button>').join('') +
          '<label class="lx-ink lx-ink-pick" aria-label="自訂顏色"><input type="color" value="' + st.ink + '" data-color-pick></label></div></div>' +
        '<div class="lx-field"><div class="lx-field-head"><span>畫線預設顏色</span></div><div class="lx-chiprow">' +
          HL_COLORS.map(([c, l]) => '<button type="button" class="lx-swatch lx-hl-' + c + (c === hlColor() ? ' lx-on' : '') + '" data-hl-default="' + c + '" aria-label="' + l + '"></button>').join('') + '</div></div>' +
        '<p class="lx-preview">預覽：字級、行距與字型的樣子 Aa 123。</p>' +
        '<button type="button" class="sg-btn lx-reset" data-reset>恢復預設</button>';
    } else {
      const list = state.current ? marksOf(state.current.id) : [];
      const groups = [];
      list.forEach(m => { const g = groups.find(x => x.g === (m.g || m.id)); if (g) g.t += '…' + m.t; else groups.push({ g: m.g || m.id, b: m.b, c: m.c, t: m.t }); });
      body = '<p class="lx-panel-note">選取內文文字，就會出現顏色列可以畫線；點已畫線的地方可以換色或刪除。畫線存在這台裝置的瀏覽器裡。</p>';
      body += groups.length ? '<div class="lx-marklist">' + groups.map(g => '<div class="lx-markrow"><button type="button" class="lx-markgo" data-go="' + g.b + '"><i class="lx-dot lx-hl-' + g.c + '"></i><span>' + esc(g.t.length > 90 ? g.t.slice(0, 90) + '…' : g.t) + '</span></button><button type="button" class="lx-icon-btn lx-markdel" data-del-mark="' + g.g + '" aria-label="刪除">' + icon.trash + '</button></div>').join('') + '</div>'
        : '<p class="lx-empty">這部法規還沒有畫線。</p>';
      const total = Object.values(loadMarks()).reduce((n, l) => n + new Set(l.map(m => m.g || m.id)).size, 0);
      body += '<div class="lx-panel-foot"><span>全部法規共 ' + total + ' 段</span><button type="button" class="sg-btn" data-export>匯出</button><label class="sg-btn lx-import">匯入<input type="file" accept="application/json,.json" data-import hidden></label></div>';
    }
    panel.innerHTML = '<div class="lx-panel-top">' + tabs + '</div><div class="lx-panel-body">' + body + '</div>';
  }
  function openPanel(tab) {
    panelTab = tab;
    const panel = by('lx-panel');
    renderPanel();
    panel.hidden = false;
    by('lx-style-btn').setAttribute('aria-expanded', String(tab === 'style'));
    by('lx-marks-btn').setAttribute('aria-expanded', String(tab === 'marks'));
  }
  function closePanel() {
    by('lx-panel').hidden = true;
    by('lx-style-btn').setAttribute('aria-expanded', 'false');
    by('lx-marks-btn').setAttribute('aria-expanded', 'false');
  }
  function setStyle(patch) { setReadPrefs({ style: Object.assign({}, style(), patch) }); applyStyle(); }

  function wireReading() {
    applyStyle();
    const panel = by('lx-panel');
    by('lx-style-btn').addEventListener('click', () => (!panel.hidden && panelTab === 'style') ? closePanel() : openPanel('style'));
    by('lx-marks-btn').addEventListener('click', () => (!panel.hidden && panelTab === 'marks') ? closePanel() : openPanel('marks'));
    panel.addEventListener('click', e => {
      const t = e.target;
      const tab = t.closest('[data-tab]'); if (tab) { openPanel(tab.dataset.tab); return; }
      if (t.closest('[data-panel-close]')) { closePanel(); return; }
      const set = t.closest('[data-set]');
      if (set) { const k = set.dataset.set; setStyle({ [k]: k === 'weight' ? Number(set.dataset.val) : set.dataset.val }); renderPanel(); return; }
      const def = t.closest('[data-hl-default]'); if (def) { setReadPrefs({ hlColor: def.dataset.hlDefault }); renderPanel(); return; }
      if (t.closest('[data-reset]')) { setPrefs({ style: {} }); setReadPrefs({ style: {} }); applyStyle(); renderPanel(); return; }
      const go = t.closest('[data-go]');
      if (go) { scrollToKey(go.dataset.go); if (window.matchMedia('(max-width: 900px)').matches) closePanel(); return; }
      const del = t.closest('[data-del-mark]'); if (del) { removeMark(del.dataset.delMark); renderPanel(); return; }
      if (t.closest('[data-export]')) {
        const blob = new Blob([JSON.stringify({ app: 'scholar-laws', version: 1, marks: loadMarks() }, null, 1)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '法規畫線.json'; a.click();
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
      } catch (_) { alertInPanel('這個檔案不是法規畫線的匯出檔。'); }
    });
    function alertInPanel(msg) { const p = document.createElement('p'); p.className = 'lx-panel-note lx-warn'; p.textContent = msg; panel.querySelector('.lx-panel-body').prepend(p); }
    document.addEventListener('pointerdown', e => {
      if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('#lx-style-btn,#lx-marks-btn')) closePanel();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { closePanel(); } });
    // selection -> colour bar; tap on a highlight -> recolour / delete
    let t = 0;
    document.addEventListener('selectionchange', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (document.body.dataset.game !== 'laws') { hideHlBar(); return; }
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) { const bar = by('lx-hlbar'); if (bar && !bar.dataset.group) hideHlBar(); return; }
        if (!selectionPieces().length) { hideHlBar(); return; }
        showHlBar(sel.getRangeAt(0).getBoundingClientRect(), null);
      }, 200);
    });
    by('lx-doc').addEventListener('click', e => {
      const m = e.target.closest('mark.lx-hl');
      const sel = window.getSelection();
      if (m && (!sel || sel.isCollapsed) && !e.target.closest('[data-att],[data-goto]')) showHlBar(m.getBoundingClientRect(), m.dataset.hl);
    });
    document.addEventListener('pointerdown', e => {
      const bar = by('lx-hlbar');
      if (bar && !bar.hidden && !bar.contains(e.target) && !e.target.closest('mark.lx-hl')) { if (bar.dataset.group) hideHlBar(); }
    });
    // a tapped highlight's bar goes away once the text has scrolled on (not for the small nudge a tap can cause)
    by('lx-scroll').addEventListener('scroll', () => {
      const bar = by('lx-hlbar');
      if (bar && !bar.hidden && bar.dataset.group && Math.abs(by('lx-scroll').scrollTop - Number(bar.dataset.at || 0)) > 60) hideHlBar();
    }, { passive: true });
  }

  /* ── entry point used by the tab switcher ── */
  let booted = null;
  function show() {
    const panel = by('laws-panel');
    if (!panel) return;
    measure();
    if (booted) applyStyle();
    if (!booted) {
      booted = (async () => {
        shell(); measure();
        try { state.index = await fetchJSON('index.json'); }
        catch (_) { by('lx-list').innerHTML = '<p class="lx-empty">無法載入法規目錄。第一次使用需要網路連線，之後可離線閱讀。</p>'; booted = null; return; }
        state.index.laws.forEach(l => state.byId.set(l.id, l));
        renderSide();
        const last = prefs().law;
        await openLaw(state.byId.has(last) ? last : state.index.laws[0].id, { boot: true });
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
