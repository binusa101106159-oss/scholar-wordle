/* Patient saves require an authenticated, server-confirmed Firestore write. */
(() => {
  'use strict';
  const STORE = 'scholar-cases-v1';
  const fields = [
    ['name', '姓名'], ['mrn', '病歷號'], ['vs', 'VS'], ['purpose', '回診目的'],
    ['diagnosis', '診斷'], ['followup', '回診時間'], ['notes', '備註']
  ];
  function parseRecords(raw) {
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.records)) throw new Error('Invalid records');
    const ids = new Set();
    for (const row of data.records) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
          fields.some(([key]) => typeof row[key] !== 'string' && !(key === 'vs' && row[key] === undefined))) throw new Error('Invalid record');
      ids.add(row.id);
    }
    const rows = data.records.map(row => row.vs === undefined ? { ...row, vs: '' } : row);
    return rows.some(row => Number.isFinite(row.sortOrder)) ? rows.sort((a,b)=>(a.sortOrder ?? -(a.createdAt||0))-(b.sortOrder ?? -(b.createdAt||0)) || b.id.localeCompare(a.id)) : rows;
  }
  function upsert(records, record) {
    if (!record.name.trim()) throw new Error('請填寫姓名。');
    const next = records.slice(), at = next.findIndex(row => row.id === record.id);
    if (at < 0) {
      const ordered = records.filter(row => Number.isFinite(row.sortOrder));
      next.unshift(ordered.length ? { ...record, sortOrder: Math.min(...ordered.map(row=>row.sortOrder))-1 } : record);
    } else next[at] = { ...next[at], ...record };
    return next;
  }
  function moveRecord(records, id, target, after = false) {
    if (id === target) return records;
    const row = records.find(item=>item.id===id);
    if (!row || !records.some(item=>item.id===target)) return records;
    const next = records.filter(item=>item.id!==id), at = next.findIndex(item=>item.id===target);
    next.splice(at + (after ? 1 : 0), 0, row);
    return next.map((item, sortOrder)=>({ ...item, sortOrder }));
  }
  function filterRecords(records, query) {
    const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return records.filter(row => {
      const haystack = fields.map(([key]) => row[key]).join('\n').normalize('NFKC').toLocaleLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  }
  if (typeof module === 'object' && module.exports) module.exports = { fields, parseRecords, upsert, filterRecords, moveRecord };
  if (typeof document === 'undefined') return;
  const by = id => document.getElementById(id);
  let booted = false, records = [], editing = null, editingBase = null, deleting = null, saving = false, readable = true, sorting = false, drag = null;
  const read = () => parseRecords(window.ScholarStorage.getItem(STORE));
  function announce(message, error = false) {
    by('ct-status').textContent = message;
    by('ct-status').classList.toggle('ct-error', error);
  }
  function refresh() {
    if(!window.ScholarSync.status().user){records=[];readable=false;by('ct-add').disabled=true;announce('請先登入，才能讀取與儲存雲端個案。');render();return;}
    try {
      const recovered = !readable;
      records = read(); readable = true; by('ct-add').disabled = false;
      if (recovered) announce('已重新讀取雲端個案。');
    } catch (_) {
      readable = false; by('ct-add').disabled = true;
      announce('無法讀取已儲存的個案。原有資料仍保留，已暫停修改以避免覆寫。', true);
    }
    render();
  }
  async function commit(next) {
    window.ScholarSync.requireAccount();
    await window.ScholarStorage.setConfirmed(STORE, JSON.stringify({ version: 1, records: next }));
    records = next; render();
  }
  function render() {
    const shown = filterRecords(records, by('ct-search').value);
    const body = by('ct-rows'); body.replaceChildren();
    by('ct-count').textContent = shown.length === records.length ? records.length + ' 筆個案' : shown.length + ' / ' + records.length + ' 筆個案';
    by('ct-table-wrap').hidden = !shown.length;
    by('ct-empty').hidden = Boolean(shown.length);
    by('ct-empty').textContent = readable ? (records.length ? '找不到符合的個案。' : '尚無個案，按「新增個案」開始。') : '';
    for (const row of shown) {
      const tr = document.createElement('tr'); tr.dataset.id = row.id;
      const gripCell = document.createElement('td'); gripCell.className = 'ct-grip-cell';
      const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'ct-grip';
      grip.dataset.id = row.id; grip.textContent = '⠿'; grip.disabled = !readable || sorting;
      grip.title = '拖曳調整順序，或按上下方向鍵'; grip.setAttribute('aria-label', '調整' + row.name + '的順序');
      gripCell.append(grip); tr.append(gripCell);
      for (const [key, label] of fields) {
        const td = document.createElement('td');
        td.dataset.label = label; td.className = 'ct-' + key;
        if (key === 'mrn' && row[key]) {
          const copy = document.createElement('button');
          copy.type = 'button'; copy.className = 'ct-copy-mrn'; copy.dataset.action = 'copy-mrn'; copy.dataset.id = row.id;
          copy.textContent = row[key]; copy.title = '點擊複製病歷號'; copy.setAttribute('aria-label', '複製病歷號 ' + row[key]); td.append(copy);
        } else td.textContent = row[key] || '—';
        tr.append(td);
      }
      const actions = document.createElement('td'); actions.className = 'ct-actions'; actions.dataset.label = '操作';
      for (const [action, label] of [['edit', '編輯'], ['delete', '刪除']]) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'sg-btn'; button.dataset.action = action; button.dataset.id = row.id;
        button.textContent = label; button.disabled = !readable;
        button.setAttribute('aria-label', label + row.name + '的個案'); actions.append(button);
      }
      tr.append(actions); body.append(tr);
    }
  }
  async function saveOrder(id, target, after) {
    if (sorting || !readable) return;
    const latest = read(), next = moveRecord(latest, id, target, after);
    if (next === latest || next.every((row,i)=>row.id===latest[i].id)) { render(); return; }
    sorting = true;
    try { await commit(next); announce('順序已儲存至雲端。'); }
    catch (_) { records = read(); render(); announce('排序未儲存成功，請重試。', true); }
    finally { sorting = false; render(); }
  }
  function setupReorder() {
    const body = by('ct-rows');
    body.addEventListener('keydown', event => {
      const grip = event.target.closest('.ct-grip');
      if (!grip || !['ArrowUp','ArrowDown'].includes(event.key) || sorting) return;
      event.preventDefault();
      const shown = filterRecords(records, by('ct-search').value), at = shown.findIndex(row=>row.id===grip.dataset.id);
      const target = shown[at + (event.key === 'ArrowUp' ? -1 : 1)];
      if (target) saveOrder(grip.dataset.id, target.id, event.key==='ArrowDown').then(()=>{
        [...body.querySelectorAll('.ct-grip')].find(el=>el.dataset.id===grip.dataset.id)?.focus();
      });
    });
    body.addEventListener('pointerdown', event => {
      const grip = event.target.closest('.ct-grip');
      if (!grip || !readable || sorting || drag || event.button!==0) return;
      grip.setPointerCapture(event.pointerId);
      drag = {grip, pointer:event.pointerId, id:grip.dataset.id, startY:event.clientY, x:event.clientX, y:event.clientY, active:false};
    });
    function preview() {
      if (!drag?.active) return;
      const rows = [...body.querySelectorAll('tr')];
      const target = rows.find(row=>{const r=row.getBoundingClientRect();return drag.y>=r.top&&drag.y<=r.bottom;});
      body.querySelectorAll('.ct-drop-before,.ct-drop-after').forEach(row=>row.classList.remove('ct-drop-before','ct-drop-after'));
      if (target && target.dataset.id!==drag.id) {
        drag.target = target.dataset.id; drag.after = drag.y > target.getBoundingClientRect().top + target.getBoundingClientRect().height/2;
        target.classList.add(drag.after ? 'ct-drop-after' : 'ct-drop-before');
      } else drag.target = null;
    }
    function scroll() {
      if (!drag?.active) return;
      const speed = drag.y < 75 ? -12 : drag.y > innerHeight-75 ? 12 : 0;
      if (speed) { window.scrollBy(0,speed); preview(); }
      drag.frame = requestAnimationFrame(scroll);
    }
    body.addEventListener('pointermove', event => {
      if (!drag || event.pointerId!==drag.pointer) return;
      drag.y=event.clientY;
      if (!drag.active && Math.abs(drag.y-drag.startY)>5) {
        drag.active=true; drag.grip.closest('tr').classList.add('ct-dragging'); drag.frame=requestAnimationFrame(scroll);
      }
      preview();
    });
    function end(event) {
      if (!drag || event.pointerId!==drag.pointer) return;
      const done=drag; drag=null; cancelAnimationFrame(done.frame);
      body.querySelectorAll('.ct-dragging,.ct-drop-before,.ct-drop-after').forEach(row=>row.classList.remove('ct-dragging','ct-drop-before','ct-drop-after'));
      if (done.grip.hasPointerCapture(done.pointer)) done.grip.releasePointerCapture(done.pointer);
      if (event.type==='pointerup' && done.active && done.target) saveOrder(done.id,done.target,done.after);
    }
    body.addEventListener('pointerup',end); body.addEventListener('pointercancel',end); body.addEventListener('lostpointercapture',end);
  }
  function edit(id = null) {
    if (!readable) return;
    const row = id ? records.find(item => item.id === id) : null;
    if (id && !row) return;
    editing = id;
    editingBase = row ? structuredClone(row) : null;
    by('ct-form').reset(); by('ct-form-error').textContent = '';
    for (const [key] of fields) by('ct-' + key).value = row ? row[key] : '';
    by('ct-editor-title').textContent = row ? '編輯個案' : '新增個案';
    window.ScholarPeek.open(by('ct-editor'));
    by('ct-name').focus({ preventScroll: true });
  }
  async function closeEditor() {
    if (saving) return;
    if (await window.ScholarPeek.close(by('ct-editor'))) {
      by('ct-form').reset(); editing = null;
    }
  }
  function shell() {
    const panel = by('cases-panel');
    panel.innerHTML = `
      <div class="ct-shell">
        <header class="ct-head"><div><h1>個案追蹤</h1><p>登入後儲存至私人雲端，其他裝置使用同一帳號即可接續。儲存成功前請勿關閉此頁。</p></div>
          <button class="sg-btn sg-primary" id="ct-add" type="button">＋ 新增個案</button></header>
        <div class="ct-tools"><input id="ct-search" type="search" aria-label="搜尋個案" placeholder="搜尋姓名、病歷號、VS、回診目的、診斷或備註" autocomplete="off"><span id="ct-count"></span></div>
        <p id="ct-status" class="ct-status" role="status" aria-live="polite"></p>
        <p id="ct-empty" class="ct-empty"></p>
        <div class="ct-table-wrap" id="ct-table-wrap" hidden><table class="ct-table"><caption class="ct-sr">個案追蹤清單</caption><thead><tr>
          <th scope="col"><span class="ct-sr">排序</span></th>${fields.map(([, label]) => '<th scope="col">' + label + '</th>').join('')}<th scope="col">操作</th>
        </tr></thead><tbody id="ct-rows"></tbody></table></div>
      </div>
      <dialog id="ct-editor" class="ct-dialog" aria-labelledby="ct-editor-title">
        <div class="ct-dialog-head"><h2 id="ct-editor-title">新增個案</h2><button type="button" class="sg-btn" id="ct-editor-close" aria-label="關閉">關閉</button></div>
        <form id="ct-form" autocomplete="off"><div class="ct-fields">
          <label>姓名 <span class="ct-required">*</span><input id="ct-name" name="name" required maxlength="120" autocomplete="off"></label>
          <label>病歷號<input id="ct-mrn" name="mrn" maxlength="80" autocomplete="off" spellcheck="false"></label>
          <label>VS<input id="ct-vs" name="vs" maxlength="120" autocomplete="off"></label>
          <label>回診時間<input id="ct-followup" name="followup" placeholder="例如 2026/11/18 上午" maxlength="120" autocomplete="off"></label>
          <label class="ct-full">回診目的<input id="ct-purpose" name="purpose" maxlength="500" autocomplete="off"></label>
          <label class="ct-full">診斷<textarea id="ct-diagnosis" name="diagnosis" rows="2" maxlength="4000"></textarea></label>
          <label class="ct-full">備註<textarea id="ct-notes" name="notes" rows="3" maxlength="8000"></textarea></label>
        </div><p id="ct-form-error" class="ct-error" role="alert"></p>
        <div class="ct-form-actions"><button type="button" class="sg-btn" id="ct-cancel">取消</button><button type="submit" class="sg-btn sg-primary" id="ct-save">儲存</button></div></form>
      </dialog>
      <dialog id="ct-delete" class="ct-dialog ct-confirm" aria-labelledby="ct-delete-title"><h2 id="ct-delete-title">刪除此個案？</h2><p>刪除後無法復原。</p>
        <p id="ct-delete-error" class="ct-error" role="alert"></p><div class="ct-form-actions"><button class="sg-btn" type="button" id="ct-delete-cancel">取消</button><button class="sg-btn ct-danger" type="button" id="ct-delete-confirm">刪除</button></div></dialog>`;
    setupReorder();
    by('ct-add').addEventListener('click', () => edit());
    by('ct-search').addEventListener('input', render);
    by('ct-editor-close').addEventListener('click', closeEditor); by('ct-cancel').addEventListener('click', closeEditor);
    by('ct-editor').addEventListener('close', () => { by('ct-form').reset(); editing = null; });
    by('ct-rows').addEventListener('click', async event => {
      const button = event.target.closest('[data-action]'); if (!button || !readable) return;
      if (button.dataset.action === 'copy-mrn') {
        const row = records.find(item => item.id === button.dataset.id);
        if (!row?.mrn) return;
        try { await navigator.clipboard.writeText(row.mrn); announce('病歷號已複製。'); }
        catch (_) { announce('無法複製病歷號，請允許剪貼簿存取後再試。', true); }
      } else if (button.dataset.action === 'edit') edit(button.dataset.id);
      else {
        deleting = button.dataset.id; by('ct-delete-error').textContent = '';
        const row = records.find(item => item.id === deleting);
        by('ct-delete-title').textContent = row ? '刪除「' + row.name + '」的個案？' : '刪除此個案？';
        window.ScholarPeek.open(by('ct-delete'));
      }
    });
    by('ct-form').addEventListener('submit', async event => {
      event.preventDefault(); if (saving || !readable) return;
      saving = true; by('ct-save').disabled = true;
      try {
        const record = { id: editing || crypto.randomUUID(), createdAt: editingBase?.createdAt || Date.now() };
        for (const [key] of fields) record[key] = by('ct-' + key).value.trim();
        const latest = read();
        if (editing && editingBase) {
          const current = latest.find(row => row.id === editing);
          if (!current) throw Error('此個案已在其他裝置刪除，未重新建立。');
          for (const [key] of fields) if (record[key] === editingBase[key]) record[key] = current[key];
        }
        await commit(upsert(latest, record)); editing = record.id;
        announce('已儲存至雲端。');
        await window.ScholarPeek.close(by('ct-editor'));
      } catch (error) {
        by('ct-form-error').textContent = '雲端儲存未確認，填寫內容仍保留。'+error.message;
      } finally { saving = false; by('ct-save').disabled = false; }
    });
    by('ct-delete-cancel').addEventListener('click', () => window.ScholarPeek.close(by('ct-delete')));
    by('ct-delete-confirm').addEventListener('click', async () => {
      if (!deleting || !readable) return;
      try {
        await commit(read().filter(row => row.id !== deleting)); deleting = null;
        announce('已刪除個案。'); await window.ScholarPeek.close(by('ct-delete'));
      } catch (_) { by('ct-delete-error').textContent = '無法儲存刪除結果，個案仍保留。'; }
    });
    window.addEventListener('storage', event => { if (event.key === STORE || event.key === null) refresh(); });
    window.addEventListener('beforeunload', event => {
      if (by('ct-editor').open && fields.some(([key])=>by('ct-'+key).value.trim() !== (editingBase?.[key] || ''))) {
        event.preventDefault();event.returnValue='';
      }
    });
  }
  function show() {
    if (!booted) { shell(); booted = true; }
    refresh();
  }
  function hide() {
    if (!booted) return;
    for (const id of ['ct-editor', 'ct-delete']) if (by(id).open) by(id).close();
    deleting = null;
  }
  window.ScholarCases = { show, hide };
})();
