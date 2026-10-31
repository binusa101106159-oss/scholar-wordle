/* AMA chapter catalogue, separate from the law and guide readers. */
(() => {
  'use strict';
  const STORE = 'scholar-ama-v1';
  const mobile = matchMedia('(max-width: 900px)');
  const by = id => document.getElementById(id);
  let catalogue, loading, menuOpen = false;

  function measure() {
    const panel = by('ama-panel');
    if (panel && !panel.hidden) panel.style.setProperty('--ax-top', Math.max(0, panel.getBoundingClientRect().top) + 'px');
  }
  function revealSelection() {
    if (by('ax-side').hidden) return;
    const list = by('ax-list'), selected = list.querySelector('[aria-selected="true"]');
    if (!selected) return;
    const item = selected.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }
  function menu(open) {
    menuOpen = mobile.matches && open;
    by('ax-side').hidden = mobile.matches && !menuOpen;
    by('ax-menu').setAttribute('aria-expanded', String(menuOpen));
    revealSelection();
  }
  function selectChapter(id, options = {}) {
    const chapter = catalogue.chapters.find(c => c.id === id);
    if (!chapter) return;
    document.querySelectorAll('.ax-chapter').forEach(button => {
      const selected = button.dataset.chapter === id;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    by('ax-content').setAttribute('aria-labelledby', 'ax-tab-' + id);
    by('ax-kicker').textContent = 'Chapter ' + chapter.no;
    by('ax-title').textContent = chapter.title;
    by('ax-meta').textContent = '原書第 ' + chapter.start + '–' + chapter.end + ' 頁 · ' + chapter.pages + ' 頁';
    by('ax-location').textContent = '第 ' + chapter.no + ' 章／共 ' + catalogue.chapters.length + ' 章';
    by('ax-scroll').scrollTop = 0;
    try { localStorage.setItem(STORE, JSON.stringify({ chapter: id })); } catch (_) { /* Reading remains available without storage. */ }
    if (mobile.matches && options.closeMenu !== false) menu(false);
    else revealSelection();
    if (options.focusTab) by('ax-tab-' + id).focus();
    else if (options.focusHeading && mobile.matches) by('ax-title').focus({ preventScroll: true });
  }
  async function boot() {
    const response = await fetch('ama/index.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('AMA catalogue unavailable');
    catalogue = await response.json();
    const panel = by('ama-panel');
    panel.innerHTML = '<div class="ax-layout">' +
      '<aside id="ax-side" class="ax-side sg-glass" aria-label="AMA 章節選單">' +
      '<div class="ax-side-head"><p>AMA Guides · Sixth Edition</p><h2>章節<span id="ax-count"></span></h2></div>' +
      '<div id="ax-list" class="ax-list" role="tablist" aria-label="AMA 章節" aria-orientation="vertical"></div></aside>' +
      '<div class="ax-reader"><div class="ax-bar"><button id="ax-menu" class="sg-btn" type="button" aria-controls="ax-side" aria-expanded="false">章節</button>' +
      '<span id="ax-location" class="ax-location"></span></div>' +
      '<div id="ax-scroll" class="ax-scroll"><article id="ax-content" role="tabpanel" tabindex="0">' +
      '<div class="ax-head sg-glass"><p id="ax-kicker" class="ax-kicker"></p><h1 id="ax-title" class="ax-title" tabindex="-1"></h1><p id="ax-meta" class="ax-meta"></p></div>' +
      '<div class="ax-pending sg-glass"><p>正文準備中。</p><p>本章正文與圖表尚未匯入。</p></div>' +
      '</article></div></div></div>';
    by('ax-count').textContent = catalogue.chapters.length + ' 章';
    for (const chapter of catalogue.chapters) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = 'ax-tab-' + chapter.id; button.className = 'ax-chapter';
      button.dataset.chapter = chapter.id;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'ax-content');
      for (const [cls, value] of [['ax-number', chapter.no], ['ax-name', chapter.title], ['ax-pages', chapter.pages + ' 頁']]) {
        const span = document.createElement('span'); span.className = cls; span.textContent = value; button.append(span);
      }
      button.addEventListener('click', () => selectChapter(chapter.id, { focusHeading: true }));
      by('ax-list').append(button);
    }
    by('ax-list').addEventListener('keydown', event => {
      const button = event.target.closest('.ax-chapter');
      if (!button || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const chapters = catalogue.chapters, index = chapters.findIndex(c => c.id === button.dataset.chapter);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? chapters.length - 1 :
        (index + (event.key === 'ArrowDown' ? 1 : -1) + chapters.length) % chapters.length;
      selectChapter(chapters[next].id, { focusTab: true, closeMenu: false });
    });
    by('ax-menu').addEventListener('click', () => menu(!menuOpen));
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menuOpen) { menu(false); by('ax-menu').focus(); }
    });
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE) || '{}').chapter; } catch (_) { /* Start at chapter one. */ }
    selectChapter(catalogue.chapters.some(c => c.id === saved) ? saved : catalogue.chapters[0].id);
    menu(false); measure();
  }
  function show() {
    measure();
    if (!loading) loading = boot().catch(() => {
      by('ama-panel').textContent = '無法載入 AMA 章節目錄，請稍後再試。';
      loading = null;
    });
    else if (catalogue) menu(false);
    return loading;
  }
  mobile.addEventListener('change', () => { if (catalogue) menu(false); });
  window.addEventListener('resize', measure);
  window.ScholarAMA = { show };
})();
