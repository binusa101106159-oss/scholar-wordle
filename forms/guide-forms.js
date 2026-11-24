/* Questionnaires copied from the appendices of the occupational guides (forms/guide-forms.json).
 * Line markup keeps the source wording: [c:key] box, [r:group:value] one-of box,
 * [t:key(:width)] text, [n:key] number, [d:key] date. Identifier fields are not imported.
 * Drafts use ScholarStorage like the other questionnaires; nothing is stored elsewhere.
 */
((root)=>{
 'use strict';
 const TOKEN=/\[([crtnd]):([^\]]+)\]/g;
 function parseLine(text){
  const parts=[];let last=0,match;TOKEN.lastIndex=0;
  while((match=TOKEN.exec(text))){
   if(match.index>last)parts.push({text:text.slice(last,match.index)});
   const [kind,...rest]=[match[1],...match[2].split(':')];
   if(kind==='c')parts.push({kind:'check',key:rest[0]});
   else if(kind==='r')parts.push({kind:'one',key:rest[0],value:rest[1]});
   else parts.push({kind:{t:'text',n:'number',d:'date'}[kind],key:rest[0],width:rest[1]?Number(rest[1]):undefined});
   last=TOKEN.lastIndex;
  }
  if(last<text.length)parts.push({text:text.slice(last)});
  // A box is labelled by the words that follow it on the paper form.
  parts.forEach((part,i)=>{if(part.kind==='check'||part.kind==='one'){const next=parts[i+1];part.label=next&&next.text!==undefined?next.text.trim():'';}});
  parts.forEach((part,i)=>{if(['text','number','date'].includes(part.kind)){let label='';for(let j=i-1;j>=0&&!label;j--)if(parts[j].text!==undefined)label=parts[j].text.trim();part.label=label;}});
  return parts;
 }
 const NMQ_KEYS=form=>{const body=form.blocks.find(b=>b.type==='body');return [...body.left,...body.right].map(([key])=>'part_'+key);};
 function scoreNMQ(form,saved){
  const keys=NMQ_KEYS(form),values=keys.map(key=>saved[key]===undefined||saved[key]===''?null:Number(saved[key]));
  if(values.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>5)))throw Error('部位評分須為0至5分。');
  const answered=values.filter(v=>v!==null),high=keys.filter((key,i)=>values[i]!==null&&values[i]>=3);
  const max=answered.length?Math.max(...answered):null;
  let status='incomplete';
  if(saved.q1==='no')status='ended';
  else if(high.length)status='suspect';
  else if(answered.length===keys.length)status='none';
  return {status,answered:answered.length,total:keys.length,max,high};
 }
 const CONVERT={forward:{1:100,2:75,3:50,4:25,5:0},reverse:{1:0,2:25,3:50,4:75,5:100}};
 function band(bands,score){
  // The guide's ranges share their end points (e.g. 50 is in both "50 分以下" and "50－70 分").
  return bands.filter(b=>(b.lo===null||score>=b.lo)&&(b.hi===null||score<=b.hi));
 }
 function scoreBurnout(form,saved){
  const read=(prefix,n)=>Array.from({length:n},(_,i)=>{const v=saved[prefix+(i+1)];return v===undefined||v===''?null:Number(v);});
  const p=read('p',6),w=read('w',7);
  [...p,...w].forEach(v=>{if(v!==null&&![1,2,3,4,5].includes(v))throw Error('答案須為選項(1)至(5)。');});
  const sub=(values,reverseIndex)=>{
   if(values.some(v=>v===null))return {ready:false,missing:values.map((v,i)=>v===null?i+1:null).filter(Boolean)};
   const points=values.map((v,i)=>(i===reverseIndex?CONVERT.reverse:CONVERT.forward)[v]);
   return {ready:true,score:points.reduce((a,b)=>a+b,0)/values.length};
  };
  const personal=sub(p,-1),work=sub(w,6);
  if(personal.ready)personal.bands=band(form.bands.personal,personal.score);
  if(work.ready)work.bands=band(form.bands.work,work.score);
  return {personal,work};
 }
 const BOX={on:'☑',off:'□'};
 const filledValue=v=>v!==undefined&&v!==null&&v!==''&&v!==false;
 // Text for the medical record: only lines with an answer, in the paper form's order and wording.
 function noteLine(text,saved){
  const parts=parseLine(text),answered=parts.some(p=>p.kind&&(p.kind==='one'?saved[p.key]===p.value:filledValue(saved[p.key])));
  if(!answered)return null;
  const hasBlank=parts.some(p=>['text','number','date'].includes(p.kind));
  if(!hasBlank){
   // Box-only lines keep the words before the first box, then only the ticked choices.
   const first=parts.findIndex(p=>p.kind),lead=parts.slice(0,first).map(p=>p.text).join('').trim();
   const chosen=parts.filter(p=>p.kind==='check'?saved[p.key]===true:p.kind==='one'&&saved[p.key]===p.value).map(p=>p.label);
   return (lead?lead+' ':'')+chosen.join('、');
  }
  return parts.map(p=>p.text!==undefined?p.text:p.kind==='check'?(saved[p.key]===true?BOX.on:BOX.off):p.kind==='one'?(saved[p.key]===p.value?BOX.on:BOX.off):filledValue(saved[p.key])?' '+saved[p.key]+' ':'＿').join('').replace(/\s+/g,' ').trim();
 }
 function nmqSummary(form,saved){
  const r=scoreNMQ(form,saved);
  if(r.status==='ended')return ['第1題答「否」：依原表說明結束此調查表。'];
  const lines=[];if(r.max!==null)lines.push('最高部位評分：'+r.max+' 分（已評 '+r.answered+' / '+r.total+' 個部位）');
  if(r.status==='suspect')lines.push('符合'+form.rule.suspect);else if(r.status==='none')lines.push('符合'+form.rule.none);else if(r.answered)lines.push('尚有 '+(r.total-r.answered)+' 個部位未評分');
  return lines;
 }
 const round=v=>Number(v.toFixed(1)).toLocaleString('en-US',{maximumFractionDigits:1});
 function burnoutSummary(form,saved){
  const r=scoreBurnout(form,saved);
  return [['個人相關過勞',r.personal],['工作相關過勞',r.work]].map(([name,sub])=>!sub.ready?name+'：未完成（第 '+sub.missing.join('、')+' 題未填），不計分':name+'：'+round(sub.score)+' 分，'+sub.bands.map(b=>b.range+' '+b.level).join(' 或 ')+(sub.bands.length>1?'（同時落在兩列，請人工判讀）':''));
 }
 function buildNote(form,saved){
  const out=[];let heading=null,prompt=null;
  const push=line=>{if(heading){out.push(heading);heading=null;}if(prompt){out.push(prompt);prompt=null;}out.push(line);};
  form.blocks.forEach(block=>{
   if(block.type==='h'){heading='【'+block.text+'】';prompt=null;}
   else if(block.type==='p')prompt=block.text;
   else if(block.type==='line'){const line=noteLine(block.text,saved);if(line){if(prompt&&!/\[[tnd]:/.test(block.text)){const q=prompt;prompt=null;push(q+' '+line);}else push(line);}prompt=null;}
   else if(block.type==='grid'){const cells=block.cells.map(c=>noteLine(c,saved)).filter(Boolean);if(cells.length)push(cells.join('；'));prompt=null;}
   else if(block.type==='area'){const v=saved[block.key];if(filledValue(v)){prompt=null;push(block.label.replace(/[：:]$/,'')+'：'+String(v).trim());}}
   else if(block.type==='img'||block.type==='pending'){heading=null;prompt=null;}
   else if(block.type==='body'){const scored=[...block.left,...block.right].filter(([k])=>filledValue(saved['part_'+k])).map(([k,name])=>name+' '+saved['part_'+k]);if(scored.length)push('部位評分（0 不痛－5 極度劇痛）：'+scored.join('、'));}
  });
  if(!out.length)return '';
  const lines=[form.subtitle+'（'+form.source.guideName+' '+form.source.label+'）',...out];
  const summary=form.score==='nmq'?nmqSummary(form,saved):form.score==='burnout'?burnoutSummary(form,saved):[];
  if(summary.length)lines.push('結果：',...summary);
  return lines.join('\n');
 }
 // Shared by the other questionnaires: clipboard first, otherwise a selected read-only box.
 async function copyText(text,section,status,id){
  section.querySelector('.fm-copy-fallback')?.remove();
  try{await navigator.clipboard.writeText(text);status.textContent='已複製。';}
  catch(_){
   if(typeof document==='undefined')return;
   section.closest('.fm-shell')?.classList.remove('fm-menu-open');document.getElementById('fm-menu-toggle')?.setAttribute('aria-expanded','false');
   const box=document.createElement('textarea');box.className='fm-copy-fallback';box.id=id+'-copy-fallback';box.readOnly=true;box.setAttribute('aria-label','待複製結果');box.value=text;section.append(box);box.focus();box.select();status.textContent='無法自動複製，已選取結果，請使用裝置的複製功能。';
  }
 }
 const api={parseLine,scoreNMQ,scoreBurnout,band,buildNote,copyText};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;

 const KEY=id=>'scholar-form-guide-'+id+'-v1';
 const el=(tag,text='',cls='')=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
 function read(id){try{return JSON.parse(root.ScholarStorage.getItem(KEY(id))||'{}')||{};}catch(_){return {};}}
 function write(id,saved){root.ScholarStorage.setItem(KEY(id),JSON.stringify(saved));}

 api.mount=function(form,host){
  const id=form.id,controls=[];let submitted=false;
  const section=el('section','','fm-questionnaire fm-paper fg-form');section.id='fm-'+id;section.lang='zh-Hant';section.hidden=true;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','fm-tab-'+id);
  const heading=el('div','','fm-heading');heading.append(el('h1',form.subtitle||form.name));section.append(heading);
  section.append(el('p',form.source.guideName+'　'+form.source.label,'fm-version'));
  if(form.notice)section.append(el('p',form.notice,'fm-version'));
  const paper=el('div','','fg-paper');let n=0;
  const uid=key=>'fg-'+id+'-'+key.replace(/[^a-z0-9_-]/gi,'_')+'-'+(++n);
  function store(key,value){const saved=read(id);if(value===null||value===''||value===false)delete saved[key];else saved[key]=value;saved.submitted=false;submitted=false;write(id,saved);update();}
  function box(part,line){
   const label=el('label','','fg-box'),input=el('input');input.type='checkbox';input.id=uid(part.key);
   if(part.kind==='one'){input.dataset.group=part.key;input.value=part.value;input.name='fg-'+id+'-'+part.key;}
   input.setAttribute('aria-label',part.label||part.key);
   input.addEventListener('change',()=>{
    if(part.kind==='one'){
     // One answer per group, as on paper; ticking the chosen box again clears it.
     section.querySelectorAll(`input[data-group="${CSS.escape(part.key)}"]`).forEach(other=>{if(other!==input)other.checked=false;});
     store(part.key,input.checked?part.value:null);
    }else store(part.key,input.checked);
   });
   controls.push({part,input});label.append(input,el('span','','fg-mark'));return label;
  }
  function field(part){
   const input=el('input');input.id=uid(part.key);input.className='fg-field fg-'+part.kind;input.autocomplete='off';
   if(part.kind==='number'){input.type='text';input.inputMode='decimal';}else input.type=part.kind==='date'?'date':'text';
   if(part.width)input.style.setProperty('--fg-width',part.width+'em');
   input.setAttribute('aria-label',part.label||part.key);
   const save=()=>store(part.key,input.value);
   input.addEventListener('input',event=>{if(!event.isComposing)save();});
   input.addEventListener('compositionend',save);
   controls.push({part,input});return input;
  }
  function renderLine(text,cls='fg-line'){
   const line=el('div','',cls);
   parseLine(text).forEach(part=>{if(part.text!==undefined)line.append(el('span',part.text));else if(part.kind==='check'||part.kind==='one')line.append(box(part,line));else line.append(field(part));});
   return line;
  }
  function area(block){
   const wrap=el('div','','fg-area'),label=el('label',block.label),input=el('textarea');input.id=uid(block.key);label.htmlFor=input.id;input.rows=3;
   const part={kind:'area',key:block.key};const save=()=>store(block.key,input.value);
   input.addEventListener('input',event=>{if(!event.isComposing)save();});input.addEventListener('compositionend',save);
   controls.push({part,input});wrap.append(label,input);return wrap;
  }
  function body(block){
   const wrap=el('div','','fg-body');
   const column=rows=>{
    const table=el('table','','fg-body-table'),head=el('thead'),tr=el('tr');tr.append(el('th',''));
    block.scale.forEach((v,i)=>{const th=el('th','','fg-body-head');th.scope='col';if(i===0)th.append(el('small',block.low));if(i===block.scale.length-1)th.append(el('small',block.high));th.append(el('span',String(v)));tr.append(th);});
    head.append(tr);table.append(head);const tbody=el('tbody');
    rows.forEach(([key,name])=>{
     const row=el('tr','','fg-body-row');row.id='fm-'+id+'-part-'+key;const th=el('th',name);th.scope='row';row.append(th);
     block.scale.forEach(value=>{const td=el('td'),label=el('label','','fm-paper-number'),input=el('input');input.type='radio';input.name='fg-'+id+'-part_'+key;input.value=String(value);input.id=uid('part_'+key+'_'+value);input.setAttribute('aria-label',name+' '+value+' 分');
      input.addEventListener('change',()=>{if(input.checked)store('part_'+key,value);});
      controls.push({part:{kind:'radio',key:'part_'+key,value},input});label.append(input,el('span',String(value),'fm-paper-value'));td.append(label);row.append(td);});
     tbody.append(row);
    });
    table.append(tbody);return table;
   };
   const figure=el('figure','','fg-body-figure'),img=el('img');img.src=block.img;img.alt=block.alt;img.width=block.w;img.height=block.h;img.loading='lazy';img.decoding='async';figure.append(img);
   wrap.append(column(block.left),figure,column(block.right));
   const clear=el('button','清除部位評分','fg-small');clear.type='button';clear.onclick=()=>{const saved=read(id);Object.keys(saved).filter(k=>k.startsWith('part_')).forEach(k=>delete saved[k]);saved.submitted=false;write(id,saved);hydrate();};
   const box=el('div');box.append(wrap,clear);return box;
  }
  form.blocks.forEach(block=>{
   if(block.type==='h')paper.append(el('h2',block.text,'fm-section-title'));
   else if(block.type==='p')paper.append(el('p',block.text,'fg-text'));
   else if(block.type==='line')paper.append(renderLine(block.text));
   else if(block.type==='grid'){const grid=el('div','','fg-grid');block.cells.forEach(cell=>grid.append(renderLine(cell,'fg-cell')));paper.append(grid);}
   else if(block.type==='area')paper.append(area(block));
   else if(block.type==='pending')paper.append(el('p',block.text,'fm-version'));
   else if(block.type==='img'){const img=el('img','','fg-img');img.src=block.src;img.alt=block.alt;img.width=block.w;img.height=block.h;img.loading='lazy';img.decoding='async';paper.append(img);}
   else if(block.type==='body')paper.append(body(block));
  });
  section.append(paper);
  const footer=el('div','','fm-footer'),progress=el('span','','fm-progress'),reset=el('button','清除本份','fm-reset'),copy=el('button','複製結果','fm-copy');reset.type=copy.type='button';progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');footer.append(progress,copy,reset);
  copy.onclick=()=>{const text=buildNote(form,read(id));if(text)copyText(text,section,progress,'fm-'+id);};
  const result=el('section','','fm-result');result.setAttribute('role','status');result.setAttribute('aria-live','polite');result.hidden=true;
  let submit=null;
  if(form.score){submit=el('button','完成作答','fm-primary');submit.type='button';footer.append(submit);submit.onclick=()=>{document.querySelector('.fm-shell')?.classList.remove('fm-menu-open');document.getElementById('fm-menu-toggle')?.setAttribute('aria-expanded','false');const saved=read(id);saved.submitted=true;write(id,saved);submitted=true;update();result.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});};}
  section.append(result);
  function filled(){const saved=read(id);return Object.keys(saved).filter(k=>k!=='submitted').length;}
  function showNMQ(saved){
   const r=scoreNMQ(form,saved),names=Object.fromEntries([...form.blocks.find(b=>b.type==='body').left,...form.blocks.find(b=>b.type==='body').right].map(([k,v])=>['part_'+k,v]));
   result.append(el('h2','填寫結果'));
   if(r.status==='ended'){result.append(el('p','第1題答「否」：依原表說明結束此調查表。'));return;}
   if(r.max!==null)result.append(el('p','最高部位評分：'+r.max+' 分（已評 '+r.answered+' / '+r.total+' 個部位）','fm-total'));
   if(r.status==='suspect'){result.append(el('p','3 分以上部位：'+r.high.map(k=>names[k]+' '+saved[k]+' 分').join('、')),el('p','符合'+form.rule.suspect,'fm-attention'));}
   else if(r.status==='none')result.append(el('p','符合'+form.rule.none));
   else result.append(el('p','尚有 '+(r.total-r.answered)+' 個部位未評分；目前沒有 3 分以上的部位。'));
   result.append(el('p',form.rule.other,'fm-intro'),el('p','資料來源：'+form.rule.title,'fm-intro'));
  }
  function showBurnout(saved){
   const r=scoreBurnout(form,saved);result.append(el('h2','填寫結果'));
   [['個人相關過勞',r.personal],['工作相關過勞',r.work]].forEach(([name,sub])=>{
    const box=el('div','','fg-score');box.append(el('h3',name));
    if(!sub.ready){box.append(el('p','未完成：第 '+sub.missing.join('、')+' 題未填，不計分。'));result.append(box);return;}
    box.append(el('p',round(sub.score)+' 分','fm-total'));
    if(sub.bands.length>1)box.append(el('p','分數 '+round(sub.score)+' 同時落在指引「'+sub.bands.map(b=>b.range).join('」與「')+'」兩列，請人工判讀。','fm-attention'));
    sub.bands.forEach(b=>box.append(el('p',b.range+'　'+b.level+'：'+b.text)));result.append(box);
   });
   const how=el('details'),summary=el('summary','計分方式（指引附錄二）');how.append(summary,...form.scoring.map(t=>el('p',t)));result.append(how,el('p','請將此畫面交給醫療人員確認。','fm-intro'));
  }
  function update(){
   progress.textContent='已填 '+filled()+' 項';copy.disabled=!filled();section.querySelector('.fm-copy-fallback')?.remove();result.replaceChildren();result.hidden=!submitted;
   if(!submitted)return;const saved=read(id);
   try{if(form.score==='nmq')showNMQ(saved);else if(form.score==='burnout')showBurnout(saved);}catch(error){result.append(el('p',error.message));}
  }
  function hydrate(){
   const saved=read(id);
   controls.forEach(({part,input})=>{
    const value=saved[part.key];
    if(part.kind==='check')input.checked=value===true;
    else if(part.kind==='one')input.checked=value===part.value;
    else if(part.kind==='radio')input.checked=value!==undefined&&Number(value)===part.value;
    else if(document.activeElement!==input)input.value=typeof value==='string'?value:'';
   });
   submitted=saved.submitted===true;update();
  }
  reset.onclick=()=>{if(filled()&&!confirm('清除這份表單的全部答案？'))return;root.ScholarStorage.removeItem(KEY(id));hydrate();};
  host.append(section);hydrate();
  return {section,footer,hydrate,key:KEY(id)};
 };
 root.ScholarGuideForms=api;
})(typeof window==='undefined'?globalThis:window);
