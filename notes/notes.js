/* Native reader for the scoped Notion study-note import. */
((root) => {
  'use strict';
  const normalize = text => String(text || '').normalize('NFKC').toLowerCase();
  const terms = query => [...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
  function ranges(text, queryTerms) {
    let normalized = '', offset = 0;
    const starts = [], ends = [];
    for (const char of text) {
      const folded = normalize(char);
      for (let i = 0; i < folded.length; i++) { normalized += folded[i]; starts.push(offset); ends.push(offset + char.length); }
      offset += char.length;
    }
    const found = [];
    for (const term of queryTerms) {
      for (let at = normalized.indexOf(term); at >= 0; at = normalized.indexOf(term, at + Math.max(term.length, 1))) {
        found.push([starts[at], ends[at + term.length - 1]]);
      }
    }
    found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const hit of found) {
      const last = merged[merged.length - 1];
      if (last && hit[0] <= last[1]) last[1] = Math.max(last[1], hit[1]);
      else merged.push(hit.slice());
    }
    return merged;
  }
  function matches(item, queryTerms, kind) {
    return (!kind || kind === 'all' || (kind === 'main' && !item.parentId) || item.kind === kind) && queryTerms.every(term => item.searchText.includes(term));
  }
  function sort(items, order) {
    return items.slice().sort((a,b) => order === 'title' ? a.title.localeCompare(b.title,'zh-Hant') || a.order-b.order : a.order-b.order);
  }
  const core = { normalize, terms, ranges, matches, sort };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const STORE = 'scholar-notes-v1';
  const labels = { note: '筆記', database: '資料庫', row: '資料庫項目', child: '子頁' };
  const state = { items: [], byId: new Map(), visible: [], current: null, query: '', kind: 'main', order: 'source', sidebarCollapsed: false, promise: null, ready: false };
  const by = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function saved() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { return {}; } }
  function remember() { try { localStorage.setItem(STORE, JSON.stringify({ current: state.current, kind: state.kind, order: state.order, sidebarCollapsed: state.sidebarCollapsed })); } catch (_) { /* Reading still works without storage. */ } }
  function updateSidebar() {
    by('nt-layout').dataset.sidebarCollapsed = String(state.sidebarCollapsed);
    const button = by('nt-sidebar-toggle');
    button.setAttribute('aria-expanded', String(!state.sidebarCollapsed));
    button.textContent = state.sidebarCollapsed ? '展開目錄' : '收起目錄';
  }
  function markText(text, queryTerms) {
    let result = '', end = 0;
    for (const [a, b] of ranges(text, queryTerms)) { result += esc(text.slice(end, a)) + '<mark class="nt-mark">' + esc(text.slice(a, b)) + '</mark>'; end = b; }
    return result + esc(text.slice(end));
  }
  function snippet(item, queryTerms) {
    const hit = ranges(item.text, queryTerms)[0];
    if (!hit) return '';
    const start = Math.max(0, hit[0] - 24), end = Math.min(item.text.length, hit[1] + 65);
    return (start ? '…' : '') + markText(item.text.slice(start, end).replace(/\s+/g, ' '), queryTerms) + (end < item.text.length ? '…' : '');
  }
  function shell(snapshot) {
    by('notes-panel').innerHTML = `
      <div id="nt-layout" class="nt-layout" data-view="list" data-sidebar-collapsed="${state.sidebarCollapsed}">
        <aside id="nt-sidebar" class="nt-side sg-glass" aria-label="筆記目錄">
          <div class="nt-side-head"><h1>職專共筆</h1><p>${esc(snapshot)} 備份 · 109 個主目錄項目</p></div>
          <label class="nt-search-label"><span>搜尋筆記</span><input id="nt-search" class="nt-search" type="search" placeholder="搜尋標題或全文…" autocomplete="off"></label>
          <div class="nt-filters">
            <label><span class="nt-sr">內容類型</span><select id="nt-kind" aria-label="內容類型"><option value="main">主目錄（109）</option><option value="all">全部內容（160）</option><option value="note">筆記（107）</option><option value="database">資料庫（2）</option><option value="row">資料庫項目（50）</option><option value="child">子頁（1）</option></select></label>
            <label><span class="nt-sr">排序</span><select id="nt-order" aria-label="排序"><option value="source">Notion 原順序</option><option value="title">標題順序</option></select></label>
          </div>
          <div id="nt-count" class="nt-count" role="status" aria-live="polite"></div>
          <nav id="nt-list" class="nt-list" aria-label="文章"></nav>
        </aside>
        <section class="nt-reader" aria-label="筆記閱讀區">
          <div class="nt-toolbar">
            <button type="button" class="sg-btn nt-menu" data-nt-action="list">目錄／搜尋</button>
            <button id="nt-sidebar-toggle" type="button" class="sg-btn nt-sidebar-toggle" data-nt-action="sidebar" aria-controls="nt-sidebar" aria-expanded="${!state.sidebarCollapsed}">${state.sidebarCollapsed ? '展開目錄' : '收起目錄'}</button>
            <button id="nt-prev" type="button" class="sg-btn" data-nt-action="prev" aria-label="上一篇">← 上一篇</button>
            <button id="nt-next" type="button" class="sg-btn" data-nt-action="next" aria-label="下一篇">下一篇 →</button>
            <span class="nt-spacer"></span><span id="nt-position" class="nt-position"></span>
          </div>
          <div id="nt-scroll" class="nt-scroll" tabindex="0"><div id="nt-paper" class="nt-paper sg-glass">
            <p id="nt-meta" class="nt-meta"></p>
            <details id="nt-toc" class="nt-toc"><summary>本篇目錄</summary><ul id="nt-headings"></ul></details>
            <article id="nt-content" class="nt-content"></article>
            <a id="nt-source" class="nt-source" target="_blank" rel="noopener noreferrer">查看Notion 原頁</a>
          </div></div>
        </section>
      </div>`;
    by('nt-kind').value = state.kind; by('nt-order').value = state.order;
    let searchTimer;
    by('nt-search').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = by('nt-search').value; renderList(); renderArticle(false); }, 140);
    });
    by('nt-kind').addEventListener('change', () => { state.kind = by('nt-kind').value; renderList(); updatePosition(); remember(); });
    by('nt-order').addEventListener('change', () => { state.order = by('nt-order').value; renderList(); updatePosition(); remember(); });
    by('notes-panel').addEventListener('click', event => {
      const entry = event.target.closest('[data-nt-id]');
      if (entry) { open(entry.dataset.ntId, true); return; }
      const sourceLink = event.target.closest('#nt-content a[href]');
      if (sourceLink && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        const dest = new URL(sourceLink.href);
        const noteId = /^(?:app\.)?notion\.(?:com|so)$/.test(dest.hostname) ? dest.pathname.match(/[a-f0-9]{32}/i)?.[0].toLowerCase() : null;
        if (noteId && !dest.hash && state.byId.has(noteId)) { event.preventDefault(); open(noteId, true); return; }
      }
      const action = event.target.closest('[data-nt-action]')?.dataset.ntAction;
      if (action === 'list') { by('nt-layout').dataset.view = 'list'; by('nt-search').focus(); }
      if (action === 'sidebar') { state.sidebarCollapsed = !state.sidebarCollapsed; updateSidebar(); remember(); }
      if (action === 'prev' || action === 'next') {
        const at = state.visible.findIndex(item => item.id === state.current), next = at + (action === 'next' ? 1 : -1);
        if (at >= 0 && state.visible[next]) open(state.visible[next].id, true);
      }
      const jump = event.target.closest('[data-nt-heading]');
      if (jump) document.getElementById(jump.dataset.ntHeading)?.scrollIntoView({ block: 'start' });
      const anchor = event.target.closest('#nt-content a[href^="#"]');
      if (anchor) { event.preventDefault(); document.getElementById(anchor.getAttribute('href').slice(1))?.scrollIntoView({ block: 'start' }); }
    });
  }
  function renderList() {
    const queryTerms = terms(state.query);
    state.visible = sort(state.items.filter(item => matches(item, queryTerms, state.kind)), state.order);
    by('nt-count').textContent = queryTerms.length ? `找到 ${state.visible.length} 篇／共 ${state.items.length} 篇` : `${state.visible.length} 篇`;
    by('nt-list').innerHTML = state.visible.length ? '<ul>' + state.visible.map(item => `<li><button type="button" class="nt-item" data-nt-id="${esc(item.id)}"${item.id === state.current ? ' aria-current="page"' : ''}>
      <span class="nt-item-title">${markText(item.title, queryTerms)}</span><span class="nt-item-meta">${item.parentId ? "↳ " : ""}${labels[item.kind]}</span>
      ${queryTerms.length ? '<span class="nt-snippet">' + snippet(item, queryTerms) + '</span>' : ''}</button></li>`).join('') + '</ul>' : '<p class="nt-empty">沒有符合的筆記。可縮短關鍵字，或切換內容類型。</p>';
  }
  function updatePosition() {
    const at = state.visible.findIndex(item => item.id === state.current);
    by('nt-position').textContent = at < 0 ? '目前文章未列於搜尋結果' : `${at + 1}／${state.visible.length}`;
    by('nt-prev').disabled = at <= 0;
    by('nt-next').disabled = at < 0 || at >= state.visible.length - 1;
  }
  function highlight(article, queryTerms) {
    if (!queryTerms.length) return;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT), nodes = [];
    let text = '', node;
    while ((node = walker.nextNode())) { nodes.push({ node, start: text.length }); text += node.nodeValue; }
    const found = ranges(text, queryTerms);
    for (const item of nodes) {
      const value = item.node.nodeValue, overlaps = found.filter(([a, b]) => a < item.start + value.length && b > item.start);
      if (!overlaps.length) continue;
      const fragment = document.createDocumentFragment(); let end = 0;
      for (const [a, b] of overlaps) {
        const start = Math.max(0, a - item.start), stop = Math.min(value.length, b - item.start);
        fragment.append(document.createTextNode(value.slice(end, start)));
        const mark = document.createElement('mark'); mark.className = 'nt-mark'; mark.textContent = value.slice(start, stop); fragment.append(mark); end = stop;
      }
      fragment.append(document.createTextNode(value.slice(end))); item.node.replaceWith(fragment);
    }
  }
  function renderArticle(resetScroll = true) {
    const item = state.byId.get(state.current);
    if (!item) return;
    const article = by('nt-content');
    article.innerHTML = item.html; article.setAttribute('aria-label', item.title);
    by('nt-meta').textContent = `${labels[item.kind]} · 職專共筆`;
    if (item.parentId && state.byId.has(item.parentId)) {
      const parent = state.byId.get(item.parentId), back = document.createElement('button');
      back.type = 'button'; back.className = 'nt-parent'; back.dataset.ntId = parent.id;
      back.textContent = '返回「' + parent.title + '」'; by('nt-meta').append(' · ', back);
    }
    by('nt-source').href = item.sourceUrl;
    article.querySelectorAll('a[href]').forEach(a => { a.target='_blank'; a.rel='noopener noreferrer'; });
    article.querySelectorAll('table').forEach(table => { const wrapper = document.createElement('div'); wrapper.className = 'nt-table-wrap'; table.replaceWith(wrapper); wrapper.append(table); });
    const headings = [...article.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(heading => heading.textContent.trim());
    headings.forEach((heading, i) => { if (!heading.id) heading.id = `nt-section-${item.id}-${i}`; });
    by('nt-toc').hidden = !headings.length;
    by('nt-headings').innerHTML = headings.map(heading => '<li><button type="button" data-nt-heading="' + esc(heading.id) + '">' + esc(heading.textContent.trim()) + '</button></li>').join('');
    highlight(article, terms(state.query));
    updatePosition();
    if (resetScroll) by('nt-scroll').scrollTop = 0;
    if (document.body.dataset.game === 'notes') document.title = item.title + ' · 職專共筆';
  }
  function open(id, focus) {
    if (!state.byId.has(id)) return;
    state.current = id; by('nt-layout').dataset.view = 'reader';
    renderList(); renderArticle(); remember();
    const url = new URL(location.href); url.searchParams.set('note', id); url.hash = 'notes';
    try { history.replaceState(null, '', url); } catch (_) { /* standalone preview */ }
    if (focus) by('nt-scroll').focus({ preventScroll: true });
  }
  async function show() {
    if (state.ready) { renderArticle(false); return; }
    if (state.promise) return state.promise;
    const panel = by('notes-panel'); panel.classList.add('nt-app');
    panel.innerHTML = '<p class="nt-message" role="status">正在載入筆記全文…</p>';
    state.promise = (async () => {
      try {
        const response = await fetch('notes/data.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.version !== 1 || !Array.isArray(data.items) || !data.items.length) throw new Error('Invalid notes data');
        const pref = saved();
        state.kind = ['all', 'main', 'note', 'database', 'row', 'child'].includes(pref.kind) ? pref.kind : 'main';
        state.order = ['source', 'title'].includes(pref.order) ? pref.order : 'source';
        state.sidebarCollapsed = pref.sidebarCollapsed === true;
        state.items = data.items.map(item => ({ ...item, searchText: normalize([item.title, item.sourceTitle, item.text].join('\n')) }));
        state.byId = new Map(state.items.map(item => [item.id, item]));
        const requested = new URL(location.href).searchParams.get('note');
        state.current = state.byId.has(requested) ? requested : state.byId.has(pref.current) ? pref.current : sort(state.items, 'source')[0].id;
        shell(data.snapshot); renderList(); renderArticle();
        if (requested && state.byId.has(requested)) by('nt-layout').dataset.view = 'reader';
        state.ready = true;
      } catch (error) {
        state.promise = null;
        panel.innerHTML = '<div class="nt-message"><p>目前無法載入筆記。請確認網路後再試一次。</p><button type="button" class="sg-btn" id="nt-retry">重新載入</button></div>';
        by('nt-retry').addEventListener('click', show, { once: true });
      }
    })();
    return state.promise;
  }
  root.ScholarNotes = { show };
})(typeof window === 'undefined' ? globalThis : window);
