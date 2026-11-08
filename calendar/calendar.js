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
  function dayParts(event, date) {
    if (!event.startTime) return ['AM', 'PM'].includes(event.period) ? [event.period] : [];
    const start = date === event.date ? event.startTime : '00:00';
    const end = date === event.endDate ? event.endTime || (event.date === event.endDate ? start : '23:59') : '23:59';
    return [start < '12:00' ? 'AM' : null, end > '12:00' || start >= '12:00' ? 'PM' : null].filter(Boolean);
  }
  if (typeof module === 'object' && module.exports) module.exports = {validate, combine, covers, dayParts};
  if (typeof document === 'undefined') return;
  const by = id => document.getElementById(id);
  const localDate = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-'); };
  let feed = null, loading = null, mounted = false, selected = localDate() < FIRST + '-01' ? FIRST + '-01' : localDate();
  let month = selected.slice(0,7), editing = null, saving = false, readable = true;
  const weekOfMonth = value => { const [year, month] = value.split('-').map(Number); return window.ScholarCalculator.monthWeek(year * 12 + month - 1); };
  const keyOfDate = value => value.year + '-' + String(value.month + 1).padStart(2, '0') + '-' + String(value.day).padStart(2, '0');
  const FIRST_WEEK = weekOfMonth(FIRST);
  let startWeek = Math.max(FIRST_WEEK, weekOfMonth(month) - 28), weekCount = 24, pendingWeek = weekOfMonth(month), scrollFrame = 0;
  let holidays = null, holidayLoading = null, holidayError = false;
  function readAppointments() {
    const result = {dates: new Map(), missing: 0, error: false};
    if (!window.ScholarSync.status().user) return result;
    try {
      const data = JSON.parse(window.ScholarStorage.getItem('scholar-cases-v1') || '{"version":1,"records":[]}');
      if (data.version !== 1 || !Array.isArray(data.records)) throw Error('Invalid cases');
      for (const row of data.records) {
        if (!row.followup?.trim()) continue;
        const date = window.ScholarCalculator.followupDate(row.followup);
        if (!date) { result.missing++; continue; }
        if (!result.dates.has(date)) result.dates.set(date, []);
        result.dates.get(date).push(row);
      }
    } catch (_) { result.dates.clear(); result.error = true; }
    return result;
  }
  function loadHolidays() {
    if (holidays || holidayLoading) return;
    holidayLoading = fetch('calculator/taiwan-calendar.json').then(response => {
      if (!response.ok) throw Error('Holiday data unavailable'); return response.json();
    }).then(data => { holidays = data; holidayError = false; render(); }).catch(() => {
      holidayError = true; render();
    }).finally(() => { holidayLoading = null; });
  }
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
    return event.startTime ? event.startTime + (event.endTime ? '–' + event.endTime : '') : event.period ? '時間未定' : '全天／時間未指定';
  }
  function element(tag, text, className) {
    const node = document.createElement(tag); node.textContent = text;
    if (className) node.className = className; return node;
  }
  function prepareDate(date) {
    selected = date; month = date.slice(0, 7);
    pendingWeek = weekOfMonth(month); startWeek = Math.max(FIRST_WEEK, pendingWeek - 28); weekCount = 24;
  }
  function setMonth(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value < FIRST) return;
    prepareDate(value + '-01'); render();
  }
  function refreshMonth() {
    by('cal-month').value = month; by('cal-prev').disabled = month === FIRST;
    const info = feed?.months?.[month];
    by('cal-source-state').textContent = info ? `其家 · ${info.provisional ? '暫定班表' : '班表'} · ${info.sheet} · 已排除門診` : '此月尚無匯入班表，可自行新增事件。';
  }
  function scrollWeeks() {
    scrollFrame = 0;
    const viewport = by('cal-scroll'); if (!viewport.clientHeight) return;
    const rows = [...by('cal-days').children];
    const active = rows.find(row => row.offsetTop + row.offsetHeight > viewport.scrollTop + 20);
    if (active && active.dataset.month !== month) { month = active.dataset.month; refreshMonth(); }
    if (viewport.scrollTop < 300 && startWeek > FIRST_WEEK) {
      const added = Math.min(12, (startWeek - FIRST_WEEK) / 7); startWeek -= added * 7; weekCount += added;
      weekCount = Math.min(52, weekCount); render();
    } else if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 300) {
      weekCount += 12;
      if (weekCount > 52) { startWeek += (weekCount - 52) * 7; weekCount = 52; }
      render();
    }
  }
  function shift(step) {
    const [y,m] = month.split('-').map(Number), next = new Date(y, m-1+step, 1);
    setMonth(next.getFullYear() + '-' + String(next.getMonth()+1).padStart(2,'0'));
  }
  function render() {
    let all;
    try { all = events(); readable = true; }
    catch (error) { readable = false; say(error.message); all = feed?.events || []; }
    refreshMonth();
    by('cal-add').disabled = !readable;
    const appointments = readAppointments();
    const warning = by('cal-cases-warning'); warning.replaceChildren();
    if (appointments.error) warning.textContent = '無法讀取回診資料，原有個案資料仍保留。';
    else if (appointments.missing) {
      const link = element('a', appointments.missing + ' 筆回診時間需確認完整日期'); link.href = '#cases'; warning.append(link);
    }
    warning.hidden = !warning.textContent;
    by('cal-holiday-source').textContent = holidays ? `臺灣辦公日曆 ${holidays.years[0]}–${holidays.years.at(-1)}` : holidayError ? '假日資料暫無法載入' : '假日資料載入中…';
    const grid = by('cal-days'), viewport = by('cal-scroll');
    const previousTop = viewport.scrollTop;
    const anchor = [...grid.children].find(row => row.offsetTop + row.offsetHeight > previousTop);
    const anchorStart = anchor?.dataset.start, anchorOffset = anchor ? previousTop - anchor.offsetTop : 0;
    const fragment = document.createDocumentFragment();
    for (let week = 0; week < weekCount; week++) {
      const dates = window.ScholarCalculator.weekDates(startWeek + week * 7), context = dates.find(date => date.day === 1) || dates[0];
      const row = element('div', '', 'cal-week'); row.dataset.start = startWeek + week * 7; row.dataset.month = keyOfDate(context).slice(0, 7);
      for (const dateObject of dates) {
      const day = dateObject.day, date = keyOfDate(dateObject), list = all.filter(event => covers(event, date));
      const info = window.ScholarCalculator.dayInfo(date, holidays), patients = appointments.dates.get(date) || [];
      const button = element('button','', 'cal-day'); button.type = 'button'; button.dataset.date = date;
      button.setAttribute('aria-label', `${date}，${list.length} 件事件` + (info.label ? '，' + info.label : '') + (patients.length ? `，${patients.length} 筆回診` : '')); button.setAttribute('aria-pressed', String(date === selected));
      if (info.off) button.classList.add('cal-holiday');
      if (info.makeup) button.classList.add('cal-makeup');
      if (date === localDate()) button.classList.add('cal-today');
      if (list.some(event => event.title.trim() === '照會')) button.classList.add('cal-consult');
      const heading = element('span', '', 'cal-day-heading');
      heading.append(element('span', String(day), 'cal-number'));
      if (day === 1) heading.append(element('span', date.slice(0, 7).replace('-', '/'), 'cal-month-marker'));
      if (patients.length) {
        const dot = element('span', '', 'cal-appointment-dot'); dot.setAttribute('aria-hidden', 'true'); heading.append(dot);
      }
      if (info.makeup || (info.label && info.label !== '週末')) heading.append(element('span', info.makeup ? '補班' : info.label, 'cal-holiday-label'));
      const allDay = list.filter(event => !dayParts(event, date).length);
      if (allDay.length) heading.append(element('span', allDay.map(event => event.title).join(' · '), 'cal-all-day'));
      button.append(heading);
      for (const part of ['AM', 'PM']) {
        const half = element('span', '', 'cal-half ' + (part === 'AM' ? 'cal-morning' : 'cal-afternoon'));
        half.setAttribute('aria-label', part === 'AM' ? '上午' : '下午');
        const entries = list.filter(event => dayParts(event, date).includes(part));
        entries.slice(0, 2).forEach(event => half.append(element('span', (event.startTime ? event.startTime + ' ' : '') + event.title, 'cal-preview')));
        if (entries.length > 2) half.append(element('span', '+' + (entries.length - 2), 'cal-more'));
        const followups = patients.filter(row => row.followupPeriod === part);
        if (followups.length) half.append(element('span', followups.length + ' 回診', 'cal-followup-count'));
        button.append(half);
      }
      button.onclick = () => { selected = date; render(); }; row.append(button);
      }
      fragment.append(row);
    }
    grid.replaceChildren(fragment);
    const restored = pendingWeek !== null ? grid.querySelector(`[data-start="${pendingWeek}"]`) : anchorStart ? grid.querySelector(`[data-start="${anchorStart}"]`) : null;
    viewport.scrollTop = restored ? restored.offsetTop + (pendingWeek !== null ? 0 : anchorOffset) : previousTop;
    pendingWeek = null;
    by('cal-selected').textContent = selected;
    const selectedInfo = window.ScholarCalculator.dayInfo(selected, holidays);
    by('cal-holiday').textContent = !holidays ? holidayError ? '假日資料暫無法載入' : '假日資料載入中…' : selectedInfo.known ? selectedInfo.label || '上班日' : (selectedInfo.label ? selectedInfo.label + ' · ' : '') + '此年份尚無官方假日資料';
    const patientList = by('cal-patients'); patientList.replaceChildren();
    const patients = appointments.dates.get(selected) || [];
    for (const row of patients) {
      const item = element('li', '', 'cal-patient');
      item.append(element('strong', row.name || '未填姓名'));
      if (row.mrn) {
        const copy = element('button', row.mrn, 'cal-patient-mrn'); copy.type = 'button'; copy.title = '複製病歷號';
        copy.onclick = async () => {
          try { await navigator.clipboard.writeText(row.mrn); by('cal-patient-status').textContent = '已複製病歷號。'; }
          catch (_) { by('cal-patient-status').textContent = '無法自動複製，請選取病歷號後複製。'; }
        }; item.append(copy);
      }
      item.append(element('span', (row.vs ? 'VS ' + row.vs + ' · ' : '') + (window.ScholarCases?.followupText?.(row) || row.followup))); patientList.append(item);
    }
    if (!patients.length) patientList.append(element('li', appointments.error ? '回診資料暫無法讀取。' : window.ScholarSync.status().user ? '當天沒有已標示的回診個案。' : '登入後可查看回診個案。', 'cal-muted'));
    by('cal-patient-status').textContent = '';
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
      if (!remove) prepareDate(event.date);
      by('cal-dialog').close(); render(); say(remove ? '已刪除事件。' : '事件已儲存至帳號。');
    } catch (error) { by('cal-error').textContent = error.message || '無法儲存，填寫內容仍保留。'; }
    finally { saving = false; by('cal-save').disabled = false; by('cal-delete').disabled = false; }
  }
  function mount() {
    by('calendar-panel').innerHTML = `
      <section class="cal-shell"><header class="cal-head"><div><h1>行事曆</h1><p>其家 · 2026 年 11 月起</p></div><button id="cal-add" class="sg-btn sg-primary" type="button">＋ 新增事件</button></header>
        <div class="cal-tools"><button id="cal-prev" class="sg-btn" type="button" aria-label="上個月">‹</button><label>月份 <input id="cal-month" type="month" min="2026-11"></label><button id="cal-next" class="sg-btn" type="button" aria-label="下個月">›</button><button id="cal-today" class="sg-btn" type="button">今天</button></div>
        <p id="cal-source-state" class="cal-muted"></p><p class="cal-muted">上下捲動可連續瀏覽月份。每日上半格為上午，下半格為下午；黃色表示照會。個人新增與修改須登入後儲存。</p><p class="cal-legend"><a id="cal-holiday-source" href="https://data.gov.tw/dataset/14718" target="_blank" rel="noopener noreferrer"></a><span>紅色：假日 · 藍點：病人回診</span></p><p id="cal-cases-warning" hidden></p><p id="cal-status" role="status" aria-live="polite"></p>
        <div class="cal-layout"><div class="cal-month-grid"><div class="cal-weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div id="cal-scroll" tabindex="0" role="region" aria-label="行事曆，上下捲動瀏覽月份"><div id="cal-days" class="cal-days" aria-label="選擇日期"></div></div></div><section class="cal-detail" aria-labelledby="cal-selected"><h2 id="cal-selected"></h2><p id="cal-holiday" class="cal-muted"></p><section class="cal-patient-section" aria-labelledby="cal-patients-title"><h3 id="cal-patients-title">病人回診</h3><ul id="cal-patients"></ul><p id="cal-patient-status" role="status"></p><a href="#cases">個案追蹤</a></section><div id="cal-agenda"></div></section></div>
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
    by('cal-today').onclick = () => { prepareDate(localDate() < FIRST + '-01' ? FIRST + '-01' : localDate()); render(); };
    by('cal-scroll').addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(scrollWeeks); }, {passive: true});
    by('cal-date').onchange = () => { if (by('cal-endDate').value < by('cal-date').value) by('cal-endDate').value = by('cal-date').value; };
    by('cal-form').onsubmit = event => { event.preventDefault(); save(); };
    by('cal-delete').onclick = () => save(true);
    by('cal-cancel').onclick = () => { if (!saving) by('cal-dialog').close(); };
    by('cal-dialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    window.ScholarSync.subscribe(key => { if (key === KEY || key === 'scholar-cases-v1') render(); });
    let identity = window.ScholarSync.status().user?.uid;
    window.addEventListener('scholar-sync-status', () => {
      const next = window.ScholarSync.status().user?.uid;
      if (next !== identity) { identity = next; render(); }
    });
    mounted = true;
  }
  async function show() {
    if (!mounted) mount(); render(); loadHolidays();
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
