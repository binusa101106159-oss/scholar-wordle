/* Full-text daily review letters. No credentials or mail headers are stored here. */
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
    return (!kind || kind === 'all' || item.kind === kind) && queryTerms.every(term => item.searchText.includes(term));
  }
  function sort(items, order = 'day') {
    return items.slice().sort((a, b) => {
      const byDate = String(b.date).localeCompare(String(a.date));
      const byDay = (a.day ?? 9999) - (b.day ?? 9999);
      const value = order === 'day' ? byDay || -byDate : order === 'oldest' ? -byDate || byDay : byDate || -byDay;
      return value || ({ letter: 0, document: 1, mail: 2 }[a.kind] - { letter: 0, document: 1, mail: 2 }[b.kind]) || a.id.localeCompare(b.id);
    });
  }
  function savedOrder(pref) {
    return pref.orderVersion === 2 && ['newest', 'oldest', 'day'].includes(pref.order) ? pref.order : 'day';
  }
  const core = { normalize, terms, ranges, matches, sort, savedOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const STORE = 'scholar-review-v1';
  const labels = { letter: '每日信', document: 'Google 文件', mail: '郵件封存' };
  const state = { items: [], byId: new Map(), visible: [], current: null, query: '', kind: 'all', order: 'day', sidebarCollapsed: false, promise: null, ready: false };
  const by = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function saved() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { return {}; } }
  function remember() { try { localStorage.setItem(STORE, JSON.stringify({ current: state.current, kind: state.kind, order: state.order, orderVersion: 2, sidebarCollapsed: state.sidebarCollapsed })); } catch (_) { /* Reading still works without storage. */ } }
  function updateSidebar() {
    by('rv-layout').dataset.sidebarCollapsed = String(state.sidebarCollapsed);
    const button = by('rv-sidebar-toggle');
    const expanded = window.matchMedia('(max-width:760px)').matches ? by('rv-layout').dataset.view === 'list' : !state.sidebarCollapsed;
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', expanded ? '收合側欄' : '展開側欄');
    button.title = expanded ? '收合側欄' : '展開側欄';
  }
  function markText(text, queryTerms) {
    let result = '', end = 0;
    for (const [a, b] of ranges(text, queryTerms)) { result += esc(text.slice(end, a)) + '<mark class="rv-mark">' + esc(text.slice(a, b)) + '</mark>'; end = b; }
    return result + esc(text.slice(end));
  }
  function snippet(item, queryTerms) {
    const hit = ranges(item.text, queryTerms)[0];
    if (!hit) return '';
    const start = Math.max(0, hit[0] - 24), end = Math.min(item.text.length, hit[1] + 65);
    return (start ? '…' : '') + markText(item.text.slice(start, end).replace(/\s+/g, ' '), queryTerms) + (end < item.text.length ? '…' : '');
  }
  function shell(snapshot) {
    by('review-panel').innerHTML = `
      <div id="rv-layout" class="rv-layout" data-view="list" data-sidebar-collapsed="${state.sidebarCollapsed}">
        <aside id="rv-sidebar" class="rv-side sg-glass" aria-label="複習信目錄">
          <div class="rv-side-head"><button id="rv-sidebar-toggle" type="button" class="rv-sidebar-toggle" data-rv-action="sidebar" aria-controls="rv-sidebar-content" aria-expanded="${!state.sidebarCollapsed}" aria-label="收合側欄" title="收合側欄"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11.5h1M5.5 15h1"/></svg></button><h1>每日複習信</h1></div>
          <div id="rv-sidebar-content" class="rv-side-content">
          <p class="rv-snapshot">${esc(snapshot)} 備份 · ${state.items.length} 篇全文</p>
          <label class="rv-search-label"><span>搜尋複習信</span><input id="rv-search" class="rv-search" type="search" placeholder="搜尋主題、Day 或全文…" autocomplete="off"></label>
          <div class="rv-filters">
            <label><span class="rv-sr">來源版本</span><select id="rv-kind" aria-label="來源版本"><option value="all">全部版本</option><option value="letter">每日信（99）</option><option value="mail">郵件封存（57）</option><option value="document">Google 文件（2）</option></select></label>
            <label><span class="rv-sr">排序</span><select id="rv-order" aria-label="排序"><option value="day">Day 由小到大</option><option value="oldest">日期由舊到新</option><option value="newest">日期由新到舊</option></select></label>
          </div>
          <div id="rv-count" class="rv-count" role="status" aria-live="polite"></div>
          <nav id="rv-list" class="rv-list" aria-label="文章"></nav>
          </div>
        </aside>
        <section class="rv-reader" aria-label="複習信閱讀區">
          <div class="rv-toolbar">
            <button type="button" class="rv-sidebar-toggle rv-menu" data-rv-action="list" aria-label="展開側欄" title="展開側欄"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11.5h1M5.5 15h1"/></svg></button>
            <button id="rv-prev" type="button" class="sg-btn" data-rv-action="prev" aria-label="上一篇">← 上一篇</button>
            <button id="rv-next" type="button" class="sg-btn" data-rv-action="next" aria-label="下一篇">下一篇 →</button>
            <span class="rv-spacer"></span><span id="rv-position" class="rv-position"></span>
          </div>
          <div id="rv-scroll" class="rv-scroll" tabindex="0"><div id="rv-paper" class="rv-paper sg-glass">
            <p id="rv-meta" class="rv-meta"></p>
            <details id="rv-toc" class="rv-toc"><summary>本篇目錄</summary><ul id="rv-headings"></ul></details>
            <article id="rv-content" class="rv-content"></article>
            <a id="rv-source" class="rv-source" target="_blank" rel="noopener noreferrer">查看來源檔案</a>
          </div></div>
        </section>
      </div>`;
    by('rv-kind').value = state.kind; by('rv-order').value = state.order;
    let searchTimer;
    by('rv-search').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = by('rv-search').value; renderList(); renderArticle(false); }, 140);
    });
    by('rv-kind').addEventListener('change', () => { state.kind = by('rv-kind').value; renderList(); updatePosition(); remember(); });
    by('rv-order').addEventListener('change', () => { state.order = by('rv-order').value; renderList(); updatePosition(); remember(); });
    by('review-panel').addEventListener('click', event => {
      const entry = event.target.closest('[data-rv-id]');
      if (entry) { open(entry.dataset.rvId, true); return; }
      const action = event.target.closest('[data-rv-action]')?.dataset.rvAction;
      if (action === 'list') { by('rv-layout').dataset.view = 'list'; updateSidebar(); by('rv-search').focus(); }
      if (action === 'sidebar') {
        if (window.matchMedia('(max-width:760px)').matches) { by('rv-layout').dataset.view = 'reader'; by('rv-scroll').focus({ preventScroll: true }); }
        else { state.sidebarCollapsed = !state.sidebarCollapsed; remember(); }
        updateSidebar();
      }
      if (action === 'prev' || action === 'next') {
        const at = state.visible.findIndex(item => item.id === state.current), next = at + (action === 'next' ? 1 : -1);
        if (at >= 0 && state.visible[next]) open(state.visible[next].id, true);
      }
      const jump = event.target.closest('[data-rv-heading]');
      if (jump) document.getElementById(jump.dataset.rvHeading)?.scrollIntoView({ block: 'start' });
      const anchor = event.target.closest('#rv-content a[href^="#"]');
      if (anchor) { event.preventDefault(); document.getElementById(anchor.getAttribute('href').slice(1))?.scrollIntoView({ block: 'start' }); }
    });
  }
  function renderList() {
    const queryTerms = terms(state.query);
    state.visible = sort(state.items.filter(item => matches(item, queryTerms, state.kind)), state.order);
    by('rv-count').textContent = queryTerms.length ? `找到 ${state.visible.length} 篇／共 ${state.items.length} 篇` : `${state.visible.length} 篇`;
    by('rv-list').innerHTML = state.visible.length ? '<ul>' + state.visible.map(item => `<li><button type="button" class="rv-item" data-rv-id="${esc(item.id)}"${item.id === state.current ? ' aria-current="page"' : ''}>
      <span class="rv-item-title">${markText(item.title, queryTerms)}</span><span class="rv-item-meta">${esc(item.date)} · ${labels[item.kind]}</span>
      ${queryTerms.length ? '<span class="rv-snippet">' + snippet(item, queryTerms) + '</span>' : ''}</button></li>`).join('') + '</ul>' : '<p class="rv-empty">沒有符合的複習信。可縮短關鍵字，或切換來源版本。</p>';
  }
  function updatePosition() {
    const at = state.visible.findIndex(item => item.id === state.current);
    by('rv-position').textContent = at < 0 ? '目前文章未列於搜尋結果' : `${at + 1}／${state.visible.length}`;
    by('rv-prev').disabled = at <= 0;
    by('rv-next').disabled = at < 0 || at >= state.visible.length - 1;
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
        const mark = document.createElement('mark'); mark.className = 'rv-mark'; mark.textContent = value.slice(start, stop); fragment.append(mark); end = stop;
      }
      fragment.append(document.createTextNode(value.slice(end))); item.node.replaceWith(fragment);
    }
  }
  function renderArticle(resetScroll = true) {
    const item = state.byId.get(state.current);
    if (!item) return;
    const article = by('rv-content');
    article.innerHTML = item.html; article.setAttribute('aria-label', item.title);
    by('rv-meta').textContent = `${item.date} · ${labels[item.kind]} · 複習信全文`;
    by('rv-source').href = item.sourceUrl;
    article.querySelectorAll('table').forEach(table => { const wrapper = document.createElement('div'); wrapper.className = 'rv-table-wrap'; table.replaceWith(wrapper); wrapper.append(table); });
    const headings = [...article.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(heading => heading.textContent.trim());
    if (item.kind === 'document' && !headings.some(heading => heading.tagName === 'H1')) {
      [...article.querySelectorAll('p')].find(p => /^Day\s*\d+/i.test(p.textContent.trim()))?.classList.add('rv-document-title');
    }
    headings.forEach((heading, i) => { if (!heading.id) heading.id = `rv-section-${item.id}-${i}`; });
    by('rv-toc').hidden = !headings.length;
    by('rv-headings').innerHTML = headings.map(heading => '<li><button type="button" data-rv-heading="' + esc(heading.id) + '">' + esc(heading.textContent.trim()) + '</button></li>').join('');
    highlight(article, terms(state.query));
    updatePosition();
    if (resetScroll) by('rv-scroll').scrollTop = 0;
    if (document.body.dataset.game === 'review') document.title = item.title + ' · 每日複習信';
  }
  function open(id, focus) {
    if (!state.byId.has(id)) return;
    state.current = id; by('rv-layout').dataset.view = 'reader'; updateSidebar();
    renderList(); renderArticle(); remember();
    const url = new URL(location.href); url.searchParams.set('letter', id); url.hash = 'review';
    try { history.replaceState(null, '', url); } catch (_) { /* standalone preview */ }
    if (focus) by('rv-scroll').focus({ preventScroll: true });
  }
  async function show() {
    if (state.ready) { renderArticle(false); return; }
    if (state.promise) return state.promise;
    const panel = by('review-panel'); panel.classList.add('rv-app');
    panel.innerHTML = '<p class="rv-message" role="status">正在載入複習信全文…</p>';
    state.promise = (async () => {
      try {
        const response = await fetch('review/data.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.version !== 1 || !Array.isArray(data.items) || !data.items.length) throw new Error('Invalid review data');
        const pref = saved();
        state.kind = ['all', 'letter', 'mail', 'document'].includes(pref.kind) ? pref.kind : 'all';
        state.order = savedOrder(pref);
        state.sidebarCollapsed = pref.sidebarCollapsed === true;
        state.items = data.items.map(item => ({ ...item, searchText: normalize([item.title, item.sourceTitle, item.text].join('\n')) }));
        state.byId = new Map(state.items.map(item => [item.id, item]));
        const requested = new URL(location.href).searchParams.get('letter');
        state.current = state.byId.has(requested) ? requested : state.byId.has(pref.current) ? pref.current : sort(state.items, state.order)[0].id;
        shell(data.snapshot); renderList(); renderArticle();
        if (requested && state.byId.has(requested)) by('rv-layout').dataset.view = 'reader';
        updateSidebar();
        window.matchMedia('(max-width:760px)').addEventListener('change', updateSidebar);
        state.ready = true;
      } catch (error) {
        state.promise = null;
        panel.innerHTML = '<div class="rv-message"><p>目前無法載入複習信。請確認網路後再試一次。</p><button type="button" class="sg-btn" id="rv-retry">重新載入</button></div>';
        by('rv-retry').addEventListener('click', show, { once: true });
      }
    })();
    return state.promise;
  }
  root.ScholarReview = { show };
})(typeof window === 'undefined' ? globalThis : window);
