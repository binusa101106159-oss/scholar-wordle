/* Roster is read-only; personal events and overrides use the existing account store. */
(() => {
  'use strict';
  const KEY = 'scholar-calendar-events-v1', FIRST = '2026-11';
  const dateOK = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  function validate(event) {
    if (!event.title?.trim()) throw Error('請填寫事件名稱。');
    if (!dateOK(event.date) || !dateOK(event.endDate) || event.date < FIRST + '-01' || event.endDate < event.date) throw Error('請確認日期與結束日期（自 2026 年 11 月起）。');
    for (const field of ['startTime', 'endTime']) if (event[field] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event[field])) throw Error('請確認時間。');
    if (event.endTime && !event.startTime) throw Error('請先填寫開始時間。');
    if (event.date === event.endDate && event.endTime && event.endTime <= event.startTime) throw Error('結束時間須晚於開始時間。跨夜事件請調整結束日期。');
    return event;
  }
  function combine(imported, saved) {
    const result = new Map(imported.map(event => [event.id, event]));
    for (const [id, event] of Object.entries(saved)) {
      if (event.deleted) result.delete(id);
      else if (event.source === 'manual' || result.has(id)) result.set(id, event);
    }
    return [...result.values()].sort((a,b) => a.date.localeCompare(b.date) || (a.startTime || (a.period === 'PM' ? '13:00' : '')).localeCompare(b.startTime || (b.period === 'PM' ? '13:00' : '')) || a.title.localeCompare(b.title));
  }
  const covers = (event, date) => event.date <= date && event.endDate >= date;
  if (typeof module === 'object' && module.exports) module.exports = {validate, combine, covers};
  if (typeof document === 'undefined') return;
  const by = id => document.getElementById(id);
  const localDate = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-'); };
  let feed = null, loading = null, mounted = false, selected = localDate() < FIRST + '-01' ? FIRST + '-01' : localDate();
  let month = selected.slice(0,7), editing = null, saving = false, readable = true;
  function read() {
    const raw = window.ScholarStorage.getItem(KEY), data = raw === null ? {} : JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('無法讀取事件。原資料已保留，暫停儲存。');
    for (const [id, event] of Object.entries(data)) {
      if (!event || event.id !== id) throw Error('事件資料格式異常。原資料已保留，暫停儲存。');
      if (!event.deleted) validate(event);
    }
    return data;
  }
  function events() { return combine(feed?.events || [], read()); }
  function say(message) { by('cal-status').textContent = message; }
  function timing(event) {
    return event.startTime ? event.startTime + (event.endTime ? '–' + event.endTime : '') : event.period === 'AM' ? '上午（時間未定）' : event.period === 'PM' ? '下午（時間未定）' : '全天／時間未指定';
  }
  function element(tag, text, className) {
    const node = document.createElement(tag); node.textContent = text;
    if (className) node.className = className; return node;
  }
  function setMonth(value) {
    if (!/^\d{4}-\d{2}$/.test(value) || value < FIRST) return;
    month = value; selected = month + '-01'; render();
  }
  function shift(step) {
    const [y,m] = month.split('-').map(Number), next = new Date(y, m-1+step, 1);
    setMonth(next.getFullYear() + '-' + String(next.getMonth()+1).padStart(2,'0'));
  }
  function render() {
    let all;
    try { all = events(); readable = true; }
    catch (error) { readable = false; say(error.message); all = feed?.events || []; }
    by('cal-month').value = month; by('cal-prev').disabled = month === FIRST;
    by('cal-add').disabled = !readable;
    const info = feed?.months?.[month];
    by('cal-source-state').textContent = info ? `其家 · ${info.provisional ? '暫定班表' : '班表'} · ${info.sheet} · 已排除門診` : '此月尚無匯入班表，可自行新增事件。';
    const [y,m] = month.split('-').map(Number), offset = new Date(y,m-1,1).getDay(), count = new Date(y,m,0).getDate();
    const grid = by('cal-days'); grid.replaceChildren();
    for (let blank=0;blank<offset;blank++) { const cell = element('div','', 'cal-blank'); cell.setAttribute('aria-hidden','true'); grid.append(cell); }
    for (let day=1;day<=count;day++) {
      const date = month + '-' + String(day).padStart(2,'0'), list = all.filter(event => covers(event,date));
      const button = element('button','', 'cal-day'); button.type = 'button'; button.dataset.date = date;
      button.setAttribute('aria-label', `${date}，${list.length} 件事件`); button.setAttribute('aria-pressed', String(date === selected));
      if (date === localDate()) button.classList.add('cal-today');
      button.append(element('span', String(day), 'cal-number'));
      list.slice(0,2).forEach(event => button.append(element('span', (event.startTime || (event.period === 'AM' ? '上午' : event.period === 'PM' ? '下午' : '')) + ' ' + event.title, 'cal-preview')));
      if (list.length > 2) button.append(element('span', '+' + (list.length-2), 'cal-more'));
      button.onclick = () => { selected = date; render(); }; grid.append(button);
    }
    by('cal-selected').textContent = selected;
    const agenda = by('cal-agenda'); agenda.replaceChildren();
    const list = all.filter(event => covers(event,selected));
    if (!list.length) agenda.append(element('p', '當日尚無事件。', 'cal-muted'));
    for (const event of list) {
      const card = element('article','', 'cal-event');
      card.append(element('p', timing(event), 'cal-time'), element('h3', event.title));
      if (event.date !== event.endDate) card.append(element('p', `${event.date} 至 ${event.endDate}`, 'cal-muted'));
      if (event.notes) card.append(element('p', event.notes, 'cal-event-notes'));
      if (event.source === 'roster') {
        const source = element('a', `${event.provisional ? '暫定 · ' : ''}班表 ${event.sheet} · ${event.sourceCell}`, 'cal-source');
        source.href = feed.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; card.append(source);
      }
      const edit = element('button', '編輯事件', 'sg-btn'); edit.type = 'button'; edit.disabled = !readable;
      edit.onclick = () => openEditor(event); card.append(edit); agenda.append(card);
    }
  }
  function openEditor(event = null) {
    editing = event; by('cal-form').reset(); by('cal-error').textContent = '';
    by('cal-editor-title').textContent = event ? '編輯事件' : '新增事件';
    for (const field of ['title','date','endDate','startTime','endTime','period','notes']) by('cal-' + field).value = event?.[field] || (field === 'date' || field === 'endDate' ? selected : '');
    by('cal-delete').hidden = !event;
    by('cal-dialog').showModal(); by('cal-title').focus();
  }
  async function persist(event) {
    if (!window.ScholarSync.status().user) throw Error('請先登入，才能儲存個人事件並跨裝置同步。');
    const data = read(); data[event.id] = event;
    await window.ScholarStorage.setConfirmed(KEY, JSON.stringify(data));
  }
  async function save(remove = false) {
    if (saving) return;
    if (remove && !confirm('刪除此事件？匯入事件刪除後會在你的帳號中隱藏。')) return;
    saving = true; by('cal-save').disabled = true; by('cal-delete').disabled = true;
    try {
      const event = { ...(editing || {}), id: editing?.id || crypto.randomUUID(), source: editing?.source || 'manual' };
      if (remove) event.deleted = true;
      else {
        for (const field of ['title','date','endDate','startTime','endTime','period','notes']) event[field] = by('cal-' + field).value.trim();
        validate(event);
      }
      await persist(event);
      if (!remove) { selected = event.date; month = selected.slice(0,7); }
      by('cal-dialog').close(); render(); say(remove ? '已刪除事件。' : '事件已儲存至帳號。');
    } catch (error) { by('cal-error').textContent = error.message || '無法儲存，填寫內容仍保留。'; }
    finally { saving = false; by('cal-save').disabled = false; by('cal-delete').disabled = false; }
  }
  function mount() {
    by('calendar-panel').innerHTML = `
      <section class="cal-shell"><header class="cal-head"><div><h1>行事曆</h1><p>其家 · 2026 年 11 月起</p></div><button id="cal-add" class="sg-btn sg-primary" type="button">＋ 新增事件</button></header>
        <div class="cal-tools"><button id="cal-prev" class="sg-btn" type="button" aria-label="上個月">‹</button><label>月份 <input id="cal-month" type="month" min="2026-11"></label><button id="cal-next" class="sg-btn" type="button" aria-label="下個月">›</button><button id="cal-today" class="sg-btn" type="button">今天</button></div>
        <p id="cal-source-state" class="cal-muted"></p><p class="cal-muted">班表未提供確切時間時保留上午／下午。個人新增與修改須登入後儲存。</p><p id="cal-status" role="status" aria-live="polite"></p>
        <div class="cal-layout"><div class="cal-month-grid"><div class="cal-weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div id="cal-days" class="cal-days" aria-label="選擇日期"></div></div><section class="cal-detail" aria-labelledby="cal-selected"><h2 id="cal-selected"></h2><div id="cal-agenda"></div></section></div>
      </section>
      <dialog id="cal-dialog" class="cal-dialog" aria-labelledby="cal-editor-title"><form id="cal-form"><h2 id="cal-editor-title">新增事件</h2><div class="cal-fields">
        <label class="cal-full">事件名稱<input id="cal-title" required maxlength="250"></label>
        <label>日期<input id="cal-date" type="date" min="2026-11-01" required></label><label>結束日期<input id="cal-endDate" type="date" min="2026-11-01" required></label>
        <label>開始時間<input id="cal-startTime" type="time"></label><label>結束時間<input id="cal-endTime" type="time"></label>
        <label class="cal-full">未指定時間的時段<select id="cal-period"><option value="">全天／未指定</option><option value="AM">上午</option><option value="PM">下午</option></select></label>
        <label class="cal-full">備註<textarea id="cal-notes" rows="3" maxlength="4000"></textarea></label>
      </div><p id="cal-error" role="alert"></p><div class="cal-actions"><button id="cal-delete" type="button" class="sg-btn" hidden>刪除</button><button id="cal-cancel" type="button" class="sg-btn">取消</button><button id="cal-save" type="submit" class="sg-btn sg-primary">儲存</button></div></form></dialog>`;
    by('cal-add').onclick = () => openEditor(); by('cal-prev').onclick = () => shift(-1); by('cal-next').onclick = () => shift(1);
    by('cal-month').onchange = event => setMonth(event.target.value);
    by('cal-today').onclick = () => { selected = localDate() < FIRST + '-01' ? FIRST + '-01' : localDate(); month = selected.slice(0,7); render(); };
    by('cal-date').onchange = () => { if (by('cal-endDate').value < by('cal-date').value) by('cal-endDate').value = by('cal-date').value; };
    by('cal-form').onsubmit = event => { event.preventDefault(); save(); };
    by('cal-delete').onclick = () => save(true);
    by('cal-cancel').onclick = () => { if (!saving) by('cal-dialog').close(); };
    by('cal-dialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    window.ScholarSync.subscribe(key => { if (key === KEY) render(); });
    mounted = true;
  }
  async function show() {
    if (!mounted) mount(); render();
    if (feed) return;
    try {
      say('讀取班表…');
      if (!loading) loading = fetch('calendar/roster.json', {cache:'no-cache'}).then(response => { if (!response.ok) throw Error('無法載入班表'); return response.json(); });
      feed = await loading;
      if (feed.version !== 1 || !Array.isArray(feed.events)) throw Error('班表格式異常');
      render(); say('');
    } catch (_) { feed = null; loading = null; say('無法載入班表。請重新開啟行事曆重試；你的個人事件仍保留。'); }
  }
  function hide() { if (mounted && by('cal-dialog').open && !saving) by('cal-dialog').close(); }
  window.ScholarCalendar = {show, hide};
})();
