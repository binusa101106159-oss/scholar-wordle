/* Private, server-confirmed maternal callbacks. Same storage and dialog flow as cases. */
(() => {
  'use strict';
  const STORE = 'scholar-maternal-calls-v1';
  const fields = [['name','姓名'],['employeeId','員工編號'],['unit','單位'],['caseNumber','案件編號'],['phone','聯絡電話'],['status','狀態說明'],['referralDate','轉介日期'],['deadline','審查期限'],['callDate','回電日期'],['level','初判等級'],['progress','進度'],['notes','備註']];
  const levels = ['未定','第一級','第二級','第三級'];
  const progresses = ['待回電','已回電','已報主治確核','已完成'];
  const dates = ['referralDate','deadline','callDate'];
  const keys = [...fields.map(([key])=>key),'asks','confirms'];
  const calculator = typeof module === 'object' && module.exports ? require('../calculator/calculator.js') : null;
  const dateFor = raw => (calculator || window.ScholarCalculator).followupDate(raw);
  const preview = raw => typeof module === 'object' && module.exports ? require('./cases.js').followupPreview(raw) : window.ScholarCases.followupPreview(raw);
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function parseRecords(raw) {
    if (raw === null) return [];
    const data = JSON.parse(raw), ids = new Set();
    if (data?.version !== 1 || !Array.isArray(data.records)) throw Error('Invalid maternal list');
    for (const row of data.records) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || fields.some(([key])=>typeof row[key] !== 'string') || !row.name.trim() || !levels.includes(row.level) || !progresses.includes(row.progress)) throw Error('Invalid maternal record');
      ids.add(row.id);
      for (const key of ['asks','confirms']) {
        const seen = new Set();
        if (!Array.isArray(row[key])) throw Error('Invalid items');
        for (const item of row[key]) {
          if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || typeof item.text !== 'string' || !item.text.trim() || typeof item.done !== 'boolean' || typeof item.reply !== 'string') throw Error('Invalid item');
          seen.add(item.id);
        }
      }
    }
    return data.records;
  }
  function itemsFromText(text, previous = [], uuid = () => crypto.randomUUID()) {
    const available = previous.slice();
    return text.split(/\r\n|\r|\n/).map(line=>line.trim()).filter(Boolean).map(text=>{
      const at = available.findIndex(item=>item.text === text);
      return at < 0 ? {id:uuid(),text,done:false,reply:''} : {...available.splice(at,1)[0]};
    });
  }
  function defaultDeadline(raw) {
    const date = dateFor(raw);
    if (!date) return '';
    const next = new Date(date+'T00:00:00Z'); next.setUTCDate(next.getUTCDate()+7);
    return next.toISOString().slice(0,10).replaceAll('-','');
  }
  function deadlineState(row, today = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})) {
    const date = dateFor(row.deadline);
    if (!date || row.progress === '已完成') return {className:'',text:''};
    const days = Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
    return days < 0 ? {className:'ct-overdue',text:'逾期 '+(-days)+' 天'} : days <= 2 ? {className:'ct-due',text:days === 0 ? '今日到期' : '剩 '+days+' 天'} : {className:'',text:''};
  }
  function sortRecords(records) {
    const stamp = row => dateFor(row.deadline) || '9999-12-31';
    return records.slice().sort((a,b)=>Number(Boolean(a.callDate.trim()))-Number(Boolean(b.callDate.trim())) || stamp(a).localeCompare(stamp(b)) || a.id.localeCompare(b.id));
  }
  function filterRecords(records, query) {
    const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return records.filter(row=>{
      const text = [...fields.map(([key])=>row[key]), ...dates.map(key=>preview(row[key])), ...['asks','confirms'].flatMap(key=>row[key].flatMap(item=>[item.text,item.reply]))].join('\n').normalize('NFKC').toLocaleLowerCase();
      return terms.every(term=>text.includes(term));
    });
  }
  // Preserve remote values for untouched fields, including each item's done/reply.
  function mergeDraft(base, draft, current) {
    if (!current) throw Error('此紀錄已在其他裝置刪除，未重新建立。');
    const next = {...current};
    for (const key of keys) {
      if (equal(draft[key],base[key])) continue;
      if (!['asks','confirms'].includes(key)) { next[key] = draft[key]; continue; }
      next[key] = draft[key].flatMap(item=>{
        const before = base[key].find(old=>old.id===item.id), remote = current[key].find(old=>old.id===item.id);
        if (before && !remote) return [];
        if (!before) return [item];
        return [Object.fromEntries(Object.keys(item).map(k=>[k,equal(item[k],before[k]) ? remote[k] : item[k]]))];
      });
      for (const remote of current[key]) if (!base[key].some(item=>item.id===remote.id) && !next[key].some(item=>item.id===remote.id)) next[key].push(remote);
    }
    return next;
  }
  const api = {STORE,fields,levels,progresses,parseRecords,itemsFromText,defaultDeadline,deadlineState,sortRecords,filterRecords,mergeDraft};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  const by = id => document.getElementById(id);
  const el = (tag,text,className) => {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  let rows = [], base = null, editing = null, deleting = null, busy = false, readable = false, mounted = false, suspended = false, deadlineManual = false;
  const inline = new Map(); // Unsaved checklist drafts survive redraws and failed requests, in memory only.
  const read = () => parseRecords(window.ScholarStorage.getItem(STORE));
  const announce = (message,error=false) => {by('ct-m-message').textContent=message;by('ct-m-message').classList.toggle('ct-error',error);};
  function refresh() {
    if (!mounted) return;
    if (!window.ScholarSync.status().user) { rows=[];readable=false;announce('請先登入，才能讀取與儲存母性保護回電。'); }
    else try {rows=read();readable=true;} catch (_) {readable=false;announce('無法讀取回電紀錄，已暫停修改以避免覆寫。',true);}
    render();
  }
  async function commit(next) {
    window.ScholarSync.requireAccount();
    const uid=window.ScholarSync.status().user.uid;
    await window.ScholarStorage.setConfirmed(STORE,JSON.stringify({version:1,records:next}));
    if (window.ScholarSync.status().user?.uid !== uid) throw Error('登入帳號已變更。');
    rows=read(); // Use the server-merged acknowledgement, never the submitted draft.
  }
  function setBusy(value) {
    busy=value;
    for (const id of ['ct-m-editor','ct-m-delete']) by(id).querySelectorAll('button,input,textarea,select').forEach(node=>node.disabled=value);
    render();
  }
  function render() {
    by('ct-m-add').disabled=!readable||busy;
    const completed=by('ct-m-filter').value==='completed';
    const filtered=rows.filter(row=>(row.progress==='已完成')===completed), shown=sortRecords(filterRecords(filtered,by('ct-m-search').value));
    by('ct-m-count').textContent=shown.length+' / '+filtered.length+' 筆';
    by('ct-maternal-count').textContent=rows.filter(row=>row.progress!=='已完成').length;
    by('ct-m-empty').hidden=Boolean(shown.length);by('ct-m-table-wrap').hidden=!shown.length;
    by('ct-m-empty').textContent=readable ? (filtered.length?'找不到符合的紀錄。':completed?'尚無已完成紀錄。':'尚無待處理回電，按「新增回電」開始。') : '';
    const body=by('ct-m-rows');body.replaceChildren();
    for (const row of shown) {
      const tr=el('tr'), due=deadlineState(row);tr.className=due.className;
      const cell=(label)=>{const td=el('td');td.dataset.label=label;tr.append(td);return td;};
      const identity=cell('員工／案件');
      for (const key of ['name','employeeId','unit','caseNumber','phone','status']) identity.append(el('div',(fields.find(([k])=>k===key)[1])+'：'+(row[key]||'—')));
      const timing=cell('日期／進度');
      for (const key of dates) timing.append(el('div',fields.find(([k])=>k===key)[1]+'：'+(preview(row[key])||row[key]||'尚未填寫')));
      if(due.text)timing.append(el('strong',due.text,'ct-deadline-badge'));
      timing.append(el('div',row.level+' · '+row.progress));
      const draft=inline.get(row.id)?.draft || row;
      const checklist=cell('詢問／確認');checklist.className='ct-m-checklists';
      const counts=key=>draft[key].filter(item=>item.done).length+'/'+draft[key].length;
      checklist.append(el('p','詢問 '+counts('asks')+'、確認 '+counts('confirms'),'ct-m-progress'));
      for (const [key,title] of [['asks','詢問事項'],['confirms','確認事項']]) {
        const group=el('fieldset'),legend=el('legend',title);group.append(legend);
        for (const item of draft[key]) {
          const line=el('div',undefined,'ct-m-item'),label=el('label'),check=el('input');check.type='checkbox';check.checked=item.done;
          check.setAttribute('aria-label',(key==='asks'?'已問：':'已確認：')+item.text);label.append(check,el('span',item.text));
          const replyLabel=el('label','回覆'),reply=el('input');reply.type='text';reply.value=item.reply;reply.maxLength=8000;reply.autocomplete='off';reply.setAttribute('aria-label','回覆：'+item.text);replyLabel.append(reply);
          const change=(field,value)=>{
            if(!inline.has(row.id))inline.set(row.id,{base:structuredClone(row),draft:structuredClone(row)});
            const state=inline.get(row.id);state.draft[key].find(i=>i.id===item.id)[field]=value;
            checklist.querySelector('.ct-m-progress').textContent='詢問 '+state.draft.asks.filter(i=>i.done).length+'/'+state.draft.asks.length+'、確認 '+state.draft.confirms.filter(i=>i.done).length+'/'+state.draft.confirms.length+' · 尚未儲存';
          };
          check.onchange=()=>change('done',check.checked);reply.oninput=()=>change('reply',reply.value);
          check.disabled=reply.disabled=!readable||busy;line.append(label,replyLabel);group.append(line);
        }
        if(!draft[key].length)group.append(el('p','尚無事項'));
        checklist.append(group);
      }
      const actions=cell('操作');actions.className='ct-actions';
      const button=(label,action)=>{const node=el('button',label,'sg-btn');node.type='button';node.disabled=!readable||busy;node.onclick=action;actions.append(node);};
      button('儲存回覆',()=>saveInline(row.id));button('編輯',()=>edit(row.id));
      button(completed?'恢復待回電':'完成',()=>changeProgress(row.id,completed?'待回電':'已完成'));
      button('刪除',()=>{deleting=row.id;by('ct-m-delete-title').textContent='刪除「'+row.name+'」的回電紀錄？';by('ct-m-delete-error').textContent='';window.ScholarPeek.open(by('ct-m-delete'));});
      if(inline.has(row.id))actions.append(el('p','回覆尚未儲存','ct-error'));
      if(row.notes)actions.append(el('p',row.notes,'ct-m-notes'));
      body.append(tr);
    }
  }
  function mergedInline(id, latest) {
    const current=latest.find(row=>row.id===id);
    if(!current)throw Error('此紀錄已在其他裝置刪除，未重新建立。');
    const state=inline.get(id);return state?mergeDraft(state.base,state.draft,current):current;
  }
  async function saveInline(id, progress) {
    if(busy||!readable)return;
    setBusy(true);
    try {
      const latest=read(),record=mergedInline(id,latest);
      await commit(latest.map(row=>row.id===id?(progress?{...record,progress}:record):row));
      inline.delete(id);announce('已儲存至雲端。');
    } catch(error){announce('雲端儲存未確認，回覆草稿仍保留。'+error.message,true);}
    finally{setBusy(false);}
  }
  const changeProgress=(id,progress)=>saveInline(id,progress);
  function updateDates() {for(const key of dates)by('ct-m-'+key+'-preview').textContent=preview(by('ct-m-'+key).value);}
  function edit(id=null) {
    if(busy||!readable)return;
    window.ScholarSync.requireAccount();
    let row=null;
    if(id)try{row=mergedInline(id,read());}catch(error){announce(error.message,true);return;}
    // Inline replies are committed separately; their baseline must remain intact.
    if(id&&inline.has(id)){announce('請先儲存清單上的回覆，再編輯紀錄。',true);return;}
    editing=id;base=row?structuredClone(row):null;deadlineManual=Boolean(row?.deadline);by('ct-m-form').reset();
    for(const [key]of fields)by('ct-m-'+key).value=row?.[key]??(key==='level'?'未定':key==='progress'?'待回電':'');
    for(const key of ['asks','confirms'])by('ct-m-'+key).value=(row?.[key]||[]).map(item=>item.text).join('\n');
    by('ct-m-form-error').textContent='';by('ct-m-editor-title').textContent=id?'編輯母性保護回電':'新增母性保護回電';updateDates();
    window.ScholarPeek.open(by('ct-m-editor'));by('ct-m-name').focus({preventScroll:true});
  }
  async function closeEditor() {if(!busy)await window.ScholarPeek.close(by('ct-m-editor'));}
  function mount() {
    if(mounted)return;mounted=true;
    const panel=el('section');panel.id='ct-m-panel';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','ct-tab-maternal');
    // Only static markup is assigned as HTML. Every user value uses textContent/value.
    panel.innerHTML=`<header class="ct-head ct-m-head"><h2>母性保護回電</h2><div class="ct-tools"><input id="ct-m-search" type="search" aria-label="搜尋回電紀錄" placeholder="搜尋員工、事項或回覆" autocomplete="off"><span id="ct-m-count"></span></div><button type="button" id="ct-m-add" class="sg-btn sg-primary">＋ 新增回電</button><p>登入後儲存至私人雲端。勾選與回覆填寫後，請按「儲存回覆」。</p></header><label class="ct-m-filter">顯示 <select id="ct-m-filter"><option value="active">待處理</option><option value="completed">已完成</option></select></label><p id="ct-m-message" class="ct-status" role="status" aria-live="polite"></p><p id="ct-m-empty" class="ct-empty"></p><div id="ct-m-table-wrap" class="ct-table-wrap" hidden><table class="ct-table ct-m-table"><caption class="ct-sr">母性保護回電紀錄</caption><thead><tr><th scope="col">員工／案件</th><th scope="col">日期／進度</th><th scope="col">詢問／確認</th><th scope="col">操作／備註</th></tr></thead><tbody id="ct-m-rows"></tbody></table></div>`;
    by('ct-list').after(panel);
    const editor=el('dialog');editor.id='ct-m-editor';editor.className='ct-dialog';editor.setAttribute('aria-labelledby','ct-m-editor-title');
    editor.innerHTML=`<div class="ct-dialog-head"><h2 id="ct-m-editor-title">新增母性保護回電</h2><button type="button" id="ct-m-close" class="sg-btn">關閉</button></div><form id="ct-m-form" autocomplete="off"><div class="ct-fields"></div><p id="ct-m-form-error" class="ct-error" role="alert"></p><div class="ct-form-actions"><button type="button" id="ct-m-cancel" class="sg-btn">取消</button><button type="submit" class="sg-btn sg-primary">儲存</button></div></form>`;
    const container=editor.querySelector('.ct-fields');
    for(const [key,title]of [...fields,['asks','詢問事項（一行一題）'],['confirms','確認事項（一行一題）']]){
      const label=el('label',title+(key==='name'?' *':''));
      const multiline=['status','notes','asks','confirms'].includes(key),options=key==='level'?levels:key==='progress'?progresses:null;
      const input=el(options?'select':multiline?'textarea':'input');input.id='ct-m-'+key;input.name=key;
      if(options)for(const value of options){const option=el('option',value);option.value=value;input.append(option);}
      else {input.maxLength=['asks','confirms'].includes(key)?16000:multiline?8000:120;input.autocomplete='off';if(multiline)input.rows=3;else input.type='text';}
      if(key==='name')input.required=true;
      if(multiline)label.className='ct-full';label.append(input);container.append(label);
      if(dates.includes(key)){
        input.placeholder='20261116 或 1151116';
        const help=el('span','西元 8 碼／民國 7 碼，亦可用 / 分隔。','ct-date-help');const hint=el('span',undefined,'ct-m-date-preview');hint.id=input.id+'-preview';hint.setAttribute('aria-live','polite');input.setAttribute('aria-describedby',hint.id);label.append(help,hint);
        input.oninput=()=>{if(key==='deadline')deadlineManual=Boolean(input.value);if(key==='referralDate'&&!deadlineManual)by('ct-m-deadline').value=defaultDeadline(input.value);updateDates();};
      }
    }
    by('cases-panel').append(editor);
    const confirm=el('dialog');confirm.id='ct-m-delete';confirm.className='ct-dialog ct-confirm';confirm.setAttribute('aria-labelledby','ct-m-delete-title');
    confirm.innerHTML='<h2 id="ct-m-delete-title">刪除回電紀錄？</h2><p>刪除後無法復原。</p><p id="ct-m-delete-error" class="ct-error" role="alert"></p><div class="ct-form-actions"><button type="button" id="ct-m-delete-cancel" class="sg-btn">取消</button><button type="button" id="ct-m-delete-confirm" class="sg-btn ct-danger">刪除</button></div>';
    by('cases-panel').append(confirm);
    by('ct-m-search').oninput=render;by('ct-m-filter').onchange=render;by('ct-m-add').onclick=()=>edit();
    by('ct-m-close').onclick=closeEditor;by('ct-m-cancel').onclick=closeEditor;
    for(const dialog of [editor,confirm])dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation();}},true);
    editor.addEventListener('close',()=>{if(!suspended&&!editor.open){by('ct-m-form').reset();base=null;editing=null;}});
    by('ct-m-form').onsubmit=async event=>{
      event.preventDefault();if(busy||!readable)return;setBusy(true);
      try{
        const record={id:editing||crypto.randomUUID(),createdAt:base?.createdAt||Date.now()};
        for(const [key]of fields)record[key]=by('ct-m-'+key).value;
        if(!record.name.trim())throw Error('請填寫姓名。');
        for(const key of dates)if(record[key].trim()&&!dateFor(record[key]))throw Error('請輸入有效的'+fields.find(([k])=>k===key)[1]+'。');
        for(const key of ['asks','confirms'])record[key]=itemsFromText(by('ct-m-'+key).value,base?.[key]);
        const latest=read(),next=editing?mergeDraft(base,record,latest.find(row=>row.id===editing)):record;
        await commit(editing?latest.map(row=>row.id===editing?next:row):[...latest,next]);announce('已儲存至雲端。');
        await window.ScholarPeek.close(editor);
      }catch(error){by('ct-m-form-error').textContent='雲端儲存未確認，填寫內容仍保留。'+error.message;}
      finally{setBusy(false);}
    };
    by('ct-m-delete-cancel').onclick=()=>{if(!busy)window.ScholarPeek.close(confirm);};
    by('ct-m-delete-confirm').onclick=async()=>{
      if(busy||!readable||!deleting)return;setBusy(true);
      try{await commit(read().filter(row=>row.id!==deleting));inline.delete(deleting);deleting=null;announce('已刪除回電紀錄。');await window.ScholarPeek.close(confirm);}
      catch(error){by('ct-m-delete-error').textContent='雲端刪除未確認，紀錄仍保留。'+error.message;}
      finally{setBusy(false);}
    };
    window.addEventListener('storage',event=>{if(event.key===STORE||event.key===null)refresh();});
    let identity=window.ScholarSync.status().user?.uid;
    window.addEventListener('scholar-sync-status',()=>{const next=window.ScholarSync.status().user?.uid;if(next!==identity){identity=next;inline.clear();suspended=false;editor.close();confirm.close();by('ct-m-form').reset();base=null;editing=null;refresh();}});
    window.addEventListener('beforeunload',event=>{if(inline.size||((editor.open||suspended)&&keys.some(key=>['asks','confirms'].includes(key)?by('ct-m-'+key).value!==(base?.[key]||[]).map(i=>i.text).join('\n'):by('ct-m-'+key).value!==(base?.[key]??(key==='level'?'未定':key==='progress'?'待回電':''))))){event.preventDefault();event.returnValue='';}});
    refresh();
  }
  function hide(){if(!mounted)return;if(by('ct-m-editor').open&&!busy){suspended=true;by('ct-m-editor').close();}if(by('ct-m-delete').open&&!busy)by('ct-m-delete').close();}
  function show(){refresh();if(suspended&&readable){suspended=false;window.ScholarPeek.open(by('ct-m-editor'));}}
  window.ScholarMaternalCalls={mount,show,hide};
})();
