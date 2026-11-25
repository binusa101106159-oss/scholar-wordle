/* Patient saves require an authenticated, server-confirmed Firestore write. */
(() => {
  'use strict';
  const STORE = 'scholar-cases-v1';
  const fields = [
    ['name', '姓名'], ['mrn', '病歷號'], ['vs', 'VS'], ['purpose', '回診目的'],
    ['diagnosis', '診斷'], ['followup', '回診時間'], ['notes', '備註']
  ];
  const recordFields = [...fields.map(([key]) => key), 'followupPeriod'];
  const sortFields=[...fields,['reportCompleted','報告完成']];
  const collator=new Intl.Collator('zh-Hant-TW',{numeric:true,sensitivity:'base'});
  const periodLabels = {AM: '上午', PM: '下午'};
  const weekdayFor = typeof module === 'object' && module.exports
    ? require('../calculator/calculator.js').followupWeekday
    : raw => window.ScholarCalculator.followupWeekday(raw);
  const dateFor = typeof module === 'object' && module.exports
    ? require('../calculator/calculator.js').followupDate
    : raw => window.ScholarCalculator.followupDate(raw);
  const completeFor = typeof module === 'object' && module.exports
    ? require('../calculator/calculator.js').completeFollowupYear
    : (raw, today) => window.ScholarCalculator.completeFollowupYear(raw, today);
  // Applied when a typed follow-up date is saved, so the stored text carries the year it was meant for.
  function completeFollowup(raw, today = new Date()) {
    const done = completeFor(raw, today);
    return done ? done.text : raw;
  }
  function followupPreview(raw, today = new Date()) {
    const done = dateFor(raw) ? null : completeFor(raw, today);
    if (done) return '未輸入年份，儲存為最接近今天的日期：' + followupPreview(done.text);
    const date = dateFor(raw);
    if (!date) return '';
    const [year, month, day] = date.split('-'), rocYear = Number(year) - 1911;
    const roc = rocYear > 0 ? '民國 ' + rocYear : '民國前 ' + (1 - rocYear);
    return '西元 ' + [year, month, day].join('/') + '（' + weekdayFor(raw) + '） · ' + roc + '/' + month + '/' + day;
  }
  function followupText(row) {
    const raw = row.followup || '', label = periodLabels[row.followupPeriod], weekday = weekdayFor(raw);
    let text = label ? raw.replace(/上午|下午|\bAM\b|\bPM\b/gi, '').trim() : raw;
    if (weekday) {
      text = text.replace(/^(\s*(?:民國\s*)?)([\d０-９]{3,4})([\d０-９]{2})([\d０-９]{2})(?:日|號)?/, '$1$2/$3/$4');
      const prefix = text.match(/^\s*(?:民國\s*)?[\d０-９]{3,4}\s*(?:年|[.／/－-])\s*[\d０-９]{1,2}\s*(?:月|[.／/－-])\s*[\d０-９]{1,2}(?:日|號)?/);
      if (prefix) {
        const rest = text.slice(prefix[0].length).replace(/^\s*[（(](?:星期|週|周)?[一二三四五六日天][）)]/, '');
        text = prefix[0] + '（' + weekday + '）' + rest;
      } else text += '（' + weekday + '）';
    }
    return [text, label].filter(Boolean).join(' · ');
  }
  function parseRecords(raw) {
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.records)) throw new Error('Invalid records');
    const ids = new Set();
    for (const row of data.records) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
          fields.some(([key]) => typeof row[key] !== 'string' && !(key === 'vs' && row[key] === undefined))) throw new Error('Invalid record');
      if (row.followupPeriod !== undefined && !['', 'AM', 'PM'].includes(row.followupPeriod)) throw new Error('Invalid follow-up period');
      if (row.archived !== undefined && typeof row.archived !== 'boolean') throw new Error('Invalid archive status');
      if (row.lostFollowup !== undefined && typeof row.lostFollowup !== 'boolean') throw new Error('Invalid lost follow-up status');
      if (row.reportCompleted !== undefined && typeof row.reportCompleted !== 'boolean') throw new Error('Invalid report completion status');
      ids.add(row.id);
    }
    const rows = data.records.map(row => row.vs === undefined ? { ...row, vs: '' } : row);
    return rows.some(row => Number.isFinite(row.sortOrder)) ? rows.sort((a,b)=>(a.sortOrder ?? -(a.createdAt||0))-(b.sortOrder ?? -(b.createdAt||0)) || b.id.localeCompare(a.id)) : rows;
  }
  function upsert(records, record) {
    if (!record.name.trim()) throw new Error('請填寫姓名。');
    const next = records.slice(), at = next.findIndex(row => row.id === record.id);
    if ((at < 0 || (record.followupPeriod !== undefined && record.followupPeriod !== '')) && !['AM', 'PM'].includes(record.followupPeriod)) throw new Error('請選擇回診時段：上午或下午。');
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
      const haystack = [...fields.map(([key]) => row[key]), row.followupPeriod || '', followupText(row)].join('\n').normalize('NFKC').toLocaleLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  }
  function recordsForView(records, view = false) {
    const selected=view===true?'archive':view===false?'active':view;
    return records.filter(row => selected==='archive'?row.archived===true:selected==='lost'?row.archived!==true&&row.lostFollowup===true:row.archived!==true&&row.lostFollowup!==true);
  }
  function sortRecords(records,key='',direction='asc') {
    if(!sortFields.some(([field])=>field===key))return records.slice();
    const sign=direction==='desc'?-1:1;
    return records.map((row,index)=>({row,index})).sort((a,b)=>{
      let left,right,result=0;
      if(key==='followup'){
        left=dateFor(a.row.followup);right=dateFor(b.row.followup);
        if(!left||!right)return left?-1:right?1:a.index-b.index;
        result=left.localeCompare(right);
        if(!result){const periods={AM:0,PM:1},x=periods[a.row.followupPeriod],y=periods[b.row.followupPeriod];if(x===undefined||y===undefined)return x===undefined?(y===undefined?a.index-b.index:1):-1;result=x-y;}
      }else if(key==='reportCompleted')result=Number(a.row.reportCompleted===true)-Number(b.row.reportCompleted===true);
      else{
        left=String(a.row[key]??'').trim();right=String(b.row[key]??'').trim();
        if(!left||!right)return left?-1:right?1:a.index-b.index;
        result=collator.compare(left,right);
      }
      return sign*result||a.index-b.index;
    }).map(({row})=>row);
  }
  function setArchived(records, id, archived) {
    if (!records.some(row => row.id === id)) throw Error('此個案已在其他裝置刪除，未重新建立。');
    return records.map(row => row.id === id ? { ...row, archived, lostFollowup:false } : row);
  }
  function setLostFollowup(records,id,lostFollowup) {
    if (!records.some(row => row.id === id)) throw Error('此個案已在其他裝置刪除，未重新建立。');
    return records.map(row=>row.id===id?{...row,lostFollowup,archived:false}:row);
  }
  function setReportCompleted(records,id,reportCompleted) {
    if (!records.some(row => row.id === id)) throw Error('此個案已在其他裝置刪除，未重新建立。');
    return records.map(row=>row.id===id?{...row,reportCompleted}:row);
  }
  if (typeof module === 'object' && module.exports) module.exports = { fields, parseRecords, upsert, filterRecords, moveRecord, followupText, followupPreview, completeFollowup, recordsForView, sortRecords, setArchived, setLostFollowup, setReportCompleted };
  if (typeof document === 'undefined') return;
  const by = id => document.getElementById(id);
  let booted = false, records = [], editing = null, editingBase = null, deleting = null, saving = false, readable = true, sorting = false, drag = null, caseView = 'active', archiving = false, suspendedDraft = null, pendingReport = null;
  let sortBy='',sortDirection='asc';
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
    records = read(); render();
  }
  function render() {
    by('ct-add').disabled = !readable || archiving;
    const rows = recordsForView(records, caseView), shown = sortRecords(filterRecords(rows, by('ct-search').value),sortBy,sortDirection);
    by('ct-sort').value=sortBy?sortBy+':'+sortDirection:'';by('ct-sort').disabled=sorting||archiving;
    for(const button of by('ct-table-wrap').querySelectorAll('[data-sort-field]')){
      const selected=button.dataset.sortField===sortBy,label=sortFields.find(([key])=>key===button.dataset.sortField)[1];
      button.closest('th').setAttribute('aria-sort',selected?(sortDirection==='asc'?'ascending':'descending'):'none');
      button.querySelector('.ct-sort-arrow').textContent=selected?(sortDirection==='asc'?'↑':'↓'):'↕';
      button.setAttribute('aria-label',label+'，'+(selected?(sortDirection==='asc'?'目前升冪，按下改為降冪':'目前降冪，按下恢復預設順序'):'按下升冪排序'));button.disabled=sorting||archiving;
    }
    for (const id of ['active','lost','archive']) {
      const button = by('ct-tab-' + id), selected = caseView === id && by('ct-tab-maternal')?.getAttribute('aria-selected') !== 'true';
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      button.disabled = sorting || archiving;
      by('ct-' + id + '-count').textContent = recordsForView(records, id).length;
    }
    by('ct-list').setAttribute('aria-labelledby', 'ct-tab-'+caseView);
    const body = by('ct-rows'); body.replaceChildren();
    by('ct-count').textContent = shown.length === rows.length ? rows.length + ' 筆個案' : shown.length + ' / ' + rows.length + ' 筆個案';
    by('ct-table-wrap').hidden = !shown.length;
    by('ct-empty').hidden = Boolean(shown.length);
    by('ct-empty').textContent = readable ? (rows.length ? '找不到符合的個案。' : caseView==='archive' ? '尚無結案個案。' : caseView==='lost'?'尚無失聯個案。':'尚無追蹤中的個案，按「新增個案」開始。') : '';
    for (const row of shown) {
      const tr = document.createElement('tr'); tr.dataset.id = row.id;
      const gripCell = document.createElement('td'); gripCell.className = 'ct-grip-cell';
      const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'ct-grip';
      grip.dataset.id = row.id; grip.textContent = '⠿'; grip.disabled = !readable || sorting || archiving || Boolean(sortBy);
      grip.title = sortBy?'切回預設排序後可拖曳':'拖曳調整順序，或按上下方向鍵'; grip.setAttribute('aria-label', '調整' + row.name + '的順序');
      gripCell.append(grip); tr.append(gripCell);
      for (const [key, label] of fields) {
        const td = document.createElement('td');
        td.dataset.label = label; td.className = 'ct-' + key;
        if (key === 'mrn' && row[key]) {
          const copy = document.createElement('button');
          copy.type = 'button'; copy.className = 'ct-copy-mrn'; copy.dataset.action = 'copy-mrn'; copy.dataset.id = row.id;
          copy.textContent = row[key]; copy.title = '點擊複製病歷號'; copy.setAttribute('aria-label', '複製病歷號 ' + row[key]); td.append(copy);
        } else td.textContent = (key === 'followup' ? followupText(row) : row[key]) || '—';
        tr.append(td);
      }
      const report=document.createElement('td');report.className='ct-report';report.dataset.label='報告完成';
      const reportLabel=document.createElement('label'),checkbox=document.createElement('input'),reportText=document.createElement('span');
      checkbox.type='checkbox';checkbox.dataset.reportCompleted=row.id;checkbox.checked=pendingReport?.id===row.id?pendingReport.value:row.reportCompleted===true;checkbox.disabled=!readable||archiving||sorting||saving;checkbox.setAttribute('aria-label',row.name+'的報告完成');reportText.textContent=pendingReport?.id===row.id?'儲存中…':'完成';reportLabel.append(checkbox,reportText);report.append(reportLabel);tr.append(report);
      const actions = document.createElement('td'); actions.className = 'ct-actions'; actions.dataset.label = '操作';
      const rowActions=[['edit','編輯'],...(caseView!=='active'?[['restore','恢復追蹤']]:[]),...(caseView!=='archive'?[['archive','結案']]:[]),...(caseView==='active'?[['lost','失聯']]:[]),['delete','刪除']];
      for (const [action, label] of rowActions) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'sg-btn'; button.dataset.action = action; button.dataset.id = row.id;
        button.textContent = label; button.disabled = !readable || archiving;
        button.setAttribute('aria-label', label + row.name + '的個案'); actions.append(button);
      }
      tr.append(actions); body.append(tr);
    }
  }
  function setSort(key='',direction='asc') {
    if(sorting||archiving||drag){by('ct-sort').value=sortBy?sortBy+':'+sortDirection:'';return;}
    sortBy=sortFields.some(([field])=>field===key)?key:'';sortDirection=direction==='desc'?'desc':'asc';render();
  }
  function selectView(view, focus = false) {
    if (sorting || archiving || drag) return;
    window.ScholarMaternalCalls.hide();
    by('ct-m-panel').hidden = true;
    by('ct-list').hidden = false; by('ct-status').hidden = false;
    by('cases-panel').querySelector('.ct-head').hidden = false;
    by('ct-tab-maternal').setAttribute('aria-selected', 'false'); by('ct-tab-maternal').tabIndex = -1;
    caseView = view===true?'archive':view===false?'active':view; render();
    if (focus) by('ct-tab-'+caseView).focus();
  }
  async function archiveRecord(id, archived) {
    if (saving || sorting || archiving || !readable) return;
    archiving = true; render();
    try {
      await commit(setArchived(read(), id, archived));
      announce(archived ? '已結案並移至 Archive。' : '已恢復追蹤。');
    } catch (error) {
      announce((archived ? '結案' : '恢復追蹤') + '未儲存成功，請重試。' + error.message, true);
    } finally { archiving = false; render(); }
  }
  async function markLost(id) {
    if(saving||sorting||archiving||!readable)return;
    archiving=true;render();
    try{await commit(setLostFollowup(read(),id,true));announce('已移至 Lost follow-up（失聯），可隨時恢復追蹤。');}
    catch(error){announce('失聯狀態未儲存成功，請重試。'+error.message,true);}
    finally{archiving=false;render();}
  }
  async function markReport(id,value) {
    if(saving||sorting||archiving||!readable){render();return;}
    const restoreFocus=document.activeElement?.dataset.reportCompleted===id;
    archiving=true;pendingReport={id,value};render();
    try{await commit(setReportCompleted(read(),id,value));announce(value?'已儲存：報告完成。':'已儲存：報告尚未完成。');}
    catch(error){announce('報告完成狀態未儲存成功，原狀態仍保留。'+error.message,true);}
    finally{pendingReport=null;archiving=false;render();if(restoreFocus&&document.activeElement===document.body)[...by('ct-rows').querySelectorAll('[data-report-completed]')].find(input=>input.dataset.reportCompleted===id)?.focus({preventScroll:true});}
  }
  async function saveOrder(id, target, after) {
    if (sortBy || sorting || archiving || !readable) return;
    const latest = read(), next = moveRecord(latest, id, target, after);
    if (next === latest || next.every((row,i)=>row.id===latest[i].id)) { render(); return; }
    sorting = true;
    try { await commit(next); announce('順序已儲存至雲端。'); }
    catch (_) { records = read(); render(); announce('排序未儲存成功，請重試。', true); }
    finally { sorting = false; render(); }
  }
  function setupReorder() {
    const body = by('ct-rows'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let landing = false;
    const duration = () => reduced.matches ? 0 : 240;
    body.addEventListener('keydown', event => {
      const grip = event.target.closest('.ct-grip');
      if (!grip || !['ArrowUp','ArrowDown'].includes(event.key) || sortBy || sorting || landing || drag) return;
      event.preventDefault();
      const shown = filterRecords(recordsForView(records, caseView), by('ct-search').value), at = shown.findIndex(row=>row.id===grip.dataset.id);
      const target = shown[at + (event.key === 'ArrowUp' ? -1 : 1)];
      if (target) saveOrder(grip.dataset.id, target.id, event.key==='ArrowDown').then(()=>{
        [...body.querySelectorAll('.ct-grip')].find(el=>el.dataset.id===grip.dataset.id)?.focus();
      });
    });
    body.addEventListener('pointerdown', event => {
      const grip = event.target.closest('.ct-grip');
      if (!grip || !readable || sortBy || sorting || archiving || landing || drag || event.button!==0) return;
      event.preventDefault();
      grip.focus({preventScroll:true});
      grip.setPointerCapture(event.pointerId);
      drag = {grip, pointer:event.pointerId, id:grip.dataset.id, startY:event.clientY, startX:event.clientX,
        x:event.clientX, y:event.clientY, active:false, index:-1};
    });
    function lift() {
      const d=drag, row=d.grip.closest('tr'), rect=row.getBoundingClientRect();
      d.rows=[...body.rows].map(el=>{const r=el.getBoundingClientRect();return {el,id:el.dataset.id,top:r.top+scrollY,height:r.height};});
      d.source=d.rows.find(item=>item.id===d.id); d.offset=d.startY-rect.top;
      d.gap=d.rows.length>1 ? Math.max(0,d.rows[1].top-d.rows[0].top-d.rows[0].height) : 0;
      const ghost=document.createElement('div'); ghost.className='ct-drag-preview'; ghost.setAttribute('aria-hidden','true'); ghost.inert=true;
      const left=Math.max(8,rect.left), width=Math.min(rect.width,innerWidth-left-8);
      Object.assign(ghost.style,{left:left+'px',top:'0',width:width+'px',height:rect.height+'px'});
      const table=document.createElement('table'); table.className='ct-table'; table.style.width=rect.width+'px'; table.style.minWidth=rect.width+'px';
      const clone=row.cloneNode(true); clone.removeAttribute('data-id');
      clone.querySelectorAll('[data-id]').forEach(el=>el.removeAttribute('data-id'));
      if (innerWidth>900) {
        table.style.tableLayout='fixed';
        const cols=document.createElement('colgroup');
        [...row.cells].forEach(cell=>{const col=document.createElement('col');col.style.width=cell.getBoundingClientRect().width+'px';cols.append(col);}); table.append(cols);
      }
      const tbody=document.createElement('tbody');tbody.append(clone);table.append(tbody);ghost.append(table);document.body.append(ghost);
      d.ghost=ghost; d.active=true; row.classList.add('ct-dragging'); body.classList.add('ct-reordering');
      ghost.animate([{opacity:.4},{opacity:1}],{duration:reduced.matches?0:140});
      preview(); d.frame=requestAnimationFrame(tick);
    }
    function preview() {
      const d=drag, others=d.rows.filter(row=>row.id!==d.id);
      const index=others.filter(row=>d.y+scrollY>row.top+row.height/2).length;
      d.ghost.style.transform='translate3d('+((d.x-d.startX)*.06)+'px,'+(d.y-d.offset)+'px,0) scale(1.012)';
      if (index===d.index) return;
      d.index=index;
      const ordered=others.slice();ordered.splice(index,0,d.source);
      let top=d.rows[0].top;
      for (const row of ordered) {
        if (row===d.source) d.dropTop=top;
        else row.el.style.transform='translate3d(0,'+(top-row.top)+'px,0)';
        top+=row.height+d.gap;
      }
      d.target=others[index]?.id || others[others.length-1]?.id; d.after=index===others.length;
    }
    function tick() {
      if (!drag?.active) return;
      const edge=75, distance=drag.y<edge ? drag.y-edge : drag.y>innerHeight-edge ? drag.y-(innerHeight-edge) : 0;
      const now=performance.now(), dt=drag.lastTime?Math.min(32,now-drag.lastTime):16;drag.lastTime=now;
      if (distance) window.scrollBy(0,Math.sign(distance)*Math.min(14,Math.abs(distance)*.2)*dt/16);
      preview(); drag.frame=requestAnimationFrame(tick);
    }
    body.addEventListener('pointermove', event => {
      if (!drag || event.pointerId!==drag.pointer) return;
      drag.y=event.clientY; drag.x=event.clientX;
      if (!drag.active && Math.abs(drag.y-drag.startY)>5) lift();
    });
    async function end(event) {
      if (!drag || event.pointerId!==drag.pointer) return;
      if (drag.active) preview();
      const done=drag; drag=null; cancelAnimationFrame(done.frame);
      if (done.grip.hasPointerCapture(done.pointer)) done.grip.releasePointerCapture(done.pointer);
      if (!done.active) return;
      landing=true;
      const dropped=event.type==='pointerup' && done.target;
      const top=(dropped?done.dropTop:done.source.top)-scrollY;
      if (!dropped) done.rows.forEach(row=>row.el.style.transform='');
      const animation=done.ghost.animate([
        {transform:done.ghost.style.transform,opacity:1},
        {transform:'translate3d(0,'+top+'px,0) scale(1)',opacity:1}
      ],{duration:duration(),easing:'cubic-bezier(.22,.8,.25,1)',fill:'forwards'});
      try { await animation.finished; } catch (_) { /* Interrupted animation still cleans up. */ }
      done.ghost.remove(); body.classList.remove('ct-reordering');
      done.rows.forEach(row=>{row.el.classList.remove('ct-dragging');row.el.style.transform='';});
      if (dropped) {
        // Keep the landed arrangement visible while the server confirms the save.
        records=moveRecord(records,done.id,done.target,done.after);render();
        await saveOrder(done.id,done.target,done.after);
      }
      landing=false;
    }
    body.addEventListener('pointerup',end);body.addEventListener('pointercancel',end);body.addEventListener('lostpointercapture',end);
    window.addEventListener('blur',()=>{if(drag)end({type:'pointercancel',pointerId:drag.pointer});});
    window.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();end({type:'pointercancel',pointerId:drag.pointer});}});
  }
  function edit(id = null) {
    if (!readable) return;
    const row = id ? records.find(item => item.id === id) : null;
    if (id && !row) return;
    editing = id;
    editingBase = row ? structuredClone(row) : null;
    by('ct-form').reset(); by('ct-form-error').textContent = '';
    for (const key of recordFields) by('ct-' + key).value = row?.[key] || '';
    by('ct-followupPeriod').required = !row;
    by('ct-period-required').hidden = Boolean(row);
    updateWeekday();
    by('ct-editor-title').textContent = row ? '編輯個案' : '新增個案';
    window.ScholarPeek.open(by('ct-editor'));
    by('ct-name').focus({ preventScroll: true });
  }
  function updateWeekday() {
    const raw = by('ct-followup').value, weekday = weekdayFor(raw) || weekdayFor(completeFollowup(raw));
    by('ct-followup-weekday').textContent = weekday ? '（' + weekday + '）' : '';
    const preview = by('ct-followup-preview');
    preview.textContent = followupPreview(raw);
    preview.hidden = !preview.textContent;
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
        <header class="ct-head"><h1>個案追蹤</h1>
          <div class="ct-tools"><input id="ct-search" type="search" aria-label="搜尋個案" placeholder="搜尋姓名、病歷號、VS、回診目的、診斷或備註" autocomplete="off"><label class="ct-sort-control">排序<select id="ct-sort" aria-describedby="ct-sort-hint"><option value="">預設（手動順序）</option>${sortFields.map(([key,label])=>'<option value="'+key+':asc">'+label+'：升冪</option><option value="'+key+':desc">'+label+'：降冪</option>').join('')}</select></label><span id="ct-count"></span><span id="ct-sort-hint" class="ct-sr">預設保留已儲存的手動順序；切回預設後可拖曳調整順序。</span></div>
          <button class="sg-btn sg-primary" id="ct-add" type="button">＋ 新增個案</button>
          <p>登入後儲存至私人雲端，其他裝置使用同一帳號即可接續。儲存成功前請勿關閉此頁。</p></header>
        <div class="ct-tabs" role="tablist" aria-label="個案狀態"><button id="ct-tab-active" type="button" role="tab" aria-controls="ct-list" aria-selected="true">追蹤中 <span id="ct-active-count">0</span></button><button id="ct-tab-lost" type="button" role="tab" aria-controls="ct-list" aria-selected="false" tabindex="-1">Lost follow-up（失聯） <span id="ct-lost-count">0</span></button><button id="ct-tab-archive" type="button" role="tab" aria-controls="ct-list" aria-selected="false" tabindex="-1">Archive（結案） <span id="ct-archive-count">0</span></button></div>
        <p id="ct-status" class="ct-status" role="status" aria-live="polite"></p>
        <section id="ct-list" role="tabpanel" aria-labelledby="ct-tab-active">
        <p id="ct-empty" class="ct-empty"></p>
        <div class="ct-table-wrap" id="ct-table-wrap" hidden><table class="ct-table"><caption class="ct-sr">個案追蹤清單</caption><thead><tr>
          <th scope="col"><span class="ct-sr">排序</span></th>${sortFields.map(([key,label])=>'<th scope="col" aria-sort="none"><button type="button" class="ct-sort-header" data-sort-field="'+key+'">'+label+' <span class="ct-sort-arrow" aria-hidden="true">↕</span></button></th>').join('')}<th scope="col">操作</th>
        </tr></thead><tbody id="ct-rows"></tbody></table></div></section>
      </div>
      <dialog id="ct-editor" class="ct-dialog" aria-labelledby="ct-editor-title">
        <div class="ct-dialog-head"><h2 id="ct-editor-title">新增個案</h2><button type="button" class="sg-btn" id="ct-editor-close" aria-label="關閉">關閉</button></div>
        <form id="ct-form" autocomplete="off"><div class="ct-fields">
          <label>姓名 <span class="ct-required">*</span><input id="ct-name" name="name" required maxlength="120" autocomplete="off"></label>
          <label>病歷號<input id="ct-mrn" name="mrn" maxlength="80" autocomplete="off" spellcheck="false"></label>
          <label>VS<input id="ct-vs" name="vs" maxlength="120" autocomplete="off"></label>
          <div class="ct-full ct-followup-fields"><label>回診日期 <span id="ct-followup-weekday"></span><input id="ct-followup" name="followup" placeholder="20261113 或 1151113" aria-describedby="ct-followup-preview" maxlength="120" autocomplete="off"></label>
            <label>回診時段 <span id="ct-period-required" class="ct-required">*</span><select id="ct-followupPeriod" name="followupPeriod" required><option value="">請選擇</option><option value="AM">上午 AM</option><option value="PM">下午 PM</option></select></label>
            <div class="ct-full ct-date-help"><p id="ct-followup-preview" aria-live="polite" hidden></p></div></div>
          <label class="ct-full">回診目的<textarea id="ct-purpose" name="purpose" rows="2" maxlength="500"></textarea></label>
          <label class="ct-full">診斷<textarea id="ct-diagnosis" name="diagnosis" rows="2" maxlength="4000"></textarea></label>
          <label class="ct-full">備註<textarea id="ct-notes" name="notes" rows="3" maxlength="8000"></textarea></label>
        </div><p id="ct-form-error" class="ct-error" role="alert"></p>
        <div class="ct-form-actions"><button type="button" class="sg-btn" id="ct-cancel">取消</button><button type="submit" class="sg-btn sg-primary" id="ct-save">儲存</button></div></form>
      </dialog>
      <dialog id="ct-delete" class="ct-dialog ct-confirm" aria-labelledby="ct-delete-title"><h2 id="ct-delete-title">刪除此個案？</h2><p>刪除後無法復原。</p>
        <p id="ct-delete-error" class="ct-error" role="alert"></p><div class="ct-form-actions"><button class="sg-btn" type="button" id="ct-delete-cancel">取消</button><button class="sg-btn ct-danger" type="button" id="ct-delete-confirm">刪除</button></div></dialog>`;
    const maternalTab = document.createElement('button');
    maternalTab.id = 'ct-tab-maternal'; maternalTab.type = 'button'; maternalTab.setAttribute('role', 'tab');
    maternalTab.setAttribute('aria-controls', 'ct-m-panel'); maternalTab.setAttribute('aria-selected', 'false'); maternalTab.tabIndex = -1;
    maternalTab.textContent = '母性保護回電 ';
    const maternalCount = document.createElement('span'); maternalCount.id = 'ct-maternal-count'; maternalTab.append(maternalCount);
    by('ct-tab-archive').after(maternalTab);
    window.ScholarMaternalCalls.mount();
    function selectMaternal(focus = false) {
      if (sorting || archiving || drag) return;
      by('ct-list').hidden = true; by('ct-status').hidden = true;
      by('cases-panel').querySelector('.ct-head').hidden = true;
      by('ct-m-panel').hidden = false;
      for (const id of ['active', 'lost', 'archive', 'maternal']) {
        by('ct-tab-'+id).setAttribute('aria-selected', String(id === 'maternal'));
        by('ct-tab-'+id).tabIndex = id === 'maternal' ? 0 : -1;
      }
      window.ScholarMaternalCalls.show();
      if (focus) maternalTab.focus();
    }
    maternalTab.addEventListener('click', () => selectMaternal());
    by('cases-panel').querySelector('.ct-tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const tabs = ['active','lost','archive','maternal'], at = tabs.findIndex(id => by('ct-tab-'+id).getAttribute('aria-selected') === 'true');
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (at + (event.key === 'ArrowRight' ? 1 : tabs.length-1)) % tabs.length;
      if (tabs[next] === 'maternal') selectMaternal(true); else selectView(tabs[next], true);
    }, true);
    setupReorder();
    by('ct-add').addEventListener('click', () => { if (archiving) return; selectView(false); edit(); });
    for (const id of ['active','lost','archive']) by('ct-tab-' + id).addEventListener('click', () => selectView(id));
    by('ct-rows').addEventListener('change',event=>{if(event.target.matches('input[data-report-completed]'))markReport(event.target.dataset.reportCompleted,event.target.checked);});
    by('ct-search').addEventListener('input', render);
    by('ct-sort').addEventListener('change',()=>{const [key,direction]=by('ct-sort').value.split(':');setSort(key,direction);});
    by('ct-table-wrap').querySelector('thead').addEventListener('click',event=>{const button=event.target.closest('[data-sort-field]');if(!button)return;const key=button.dataset.sortField;if(sortBy!==key)setSort(key,'asc');else if(sortDirection==='asc')setSort(key,'desc');else setSort();});
    by('ct-followup').addEventListener('input', updateWeekday);
    by('ct-editor-close').addEventListener('click', closeEditor); by('ct-cancel').addEventListener('click', closeEditor);
    by('ct-editor').addEventListener('close', () => { if(suspendedDraft||by('ct-editor').open)return;by('ct-form').reset(); editing = null; });
    by('ct-rows').addEventListener('click', async event => {
      const button = event.target.closest('[data-action]'); if (!button || !readable) return;
      if (button.dataset.action === 'copy-mrn') {
        const row = records.find(item => item.id === button.dataset.id);
        if (!row?.mrn) return;
        try { await navigator.clipboard.writeText(row.mrn); announce('病歷號已複製。'); }
        catch (_) { announce('無法複製病歷號，請允許剪貼簿存取後再試。', true); }
      } else if (button.dataset.action === 'edit') edit(button.dataset.id);
      else if (['archive', 'restore'].includes(button.dataset.action)) await archiveRecord(button.dataset.id, button.dataset.action === 'archive');
      else if (button.dataset.action === 'lost') await markLost(button.dataset.id);
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
        for (const key of recordFields) record[key] = by('ct-' + key).value.trim();
        if (!editingBase || record.followup !== (editingBase.followup || '')) record.followup = completeFollowup(record.followup);
        const latest = read();
        if (editing && editingBase) {
          const current = latest.find(row => row.id === editing);
          if (!current) throw Error('此個案已在其他裝置刪除，未重新建立。');
          for (const key of recordFields) if (record[key] === (editingBase[key] || '')) {
            if (current[key] === undefined) delete record[key]; else record[key] = current[key];
          }
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
    let identity=window.ScholarSync.status().user?.uid;
    window.addEventListener('scholar-sync-status',()=>{const next=window.ScholarSync.status().user?.uid;if(identity!==next){identity=next;refresh();}});
    window.addEventListener('beforeunload', event => {
      if ((by('ct-editor').open||suspendedDraft) && recordFields.some(key=>by('ct-'+key).value.trim() !== (editingBase?.[key] || ''))) {
        event.preventDefault();event.returnValue='';
      }
    });
  }
  function show() {
    if (!booted) { shell(); booted = true; }
    refresh();
    if (by('ct-tab-maternal').getAttribute('aria-selected') === 'true') {
      for (const id of ['active','lost','archive']) { by('ct-tab-'+id).setAttribute('aria-selected','false'); by('ct-tab-'+id).tabIndex=-1; }
      window.ScholarMaternalCalls.show();
    }
    if(suspendedDraft&&readable){
      const draft=suspendedDraft;suspendedDraft=null;
      window.ScholarPeek.open(by('ct-editor'));
      const field=by(draft.focus)||by('ct-name');field.focus({preventScroll:true});
      if(draft.start!==null&&field.setSelectionRange)try{field.setSelectionRange(draft.start,draft.end);}catch(_){}
    }
  }
  function hide() {
    if (!booted) return;
    window.ScholarMaternalCalls.hide();
    if(by('ct-editor').open&&!saving){const field=document.activeElement;suspendedDraft={focus:field?.id,start:field?.selectionStart??null,end:field?.selectionEnd??null};}
    for (const id of ['ct-editor', 'ct-delete']) if (by(id).open) by(id).close();
    deleting = null;
  }
  window.ScholarCases = { show, hide, followupText, followupPreview };
})();

