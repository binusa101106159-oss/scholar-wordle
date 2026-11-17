/* Static public phrases; composed text is intentionally never persisted. */
(() => {
  'use strict';
  const alternatives=['經常／偶爾','站立／靜坐','極端姿勢／重複性動作'];
  function flatten(data){return data.sections.flatMap(section=>section.groups.flatMap(group=>group.snippets.map(snippet=>({...snippet,section:section.title,group:group.id,groupTitle:group.title}))));}
  function placeholders(text){return text.match(/【[^【】]*】/gu)||[];}
  function compose(items){
    const rows=items.filter(item=>item.text.trim());let text='';
    rows.forEach((item,i)=>{
      if(i){
        if(!/[，：]$/u.test(text)){
          if(rows[i-1].group===item.group)text=text.replace(/[。；;]+$/u,'')+'；';
          else if(!/[。！？]$/u.test(text))text=text.replace(/[；;]+$/u,'')+'。';
        }
      }
      text+=item.text.trim();
    });
    return text ? text.replace(/[，：；;]+$/u,'')+(/[。！？]$/u.test(text)?'':'。') : '';
  }
  function filterSnippets(rows,query){const terms=query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);return rows.filter(row=>terms.every(term=>[row.text,row.label||'',row.section,row.groupTitle].join('\n').normalize('NFKC').toLocaleLowerCase().includes(term)));}
  function choose(text,choices){for(const token of alternatives)if(token.split('／').includes(choices[token]))text=text.replaceAll(token,choices[token]);return text;}
  function move(items,id,target){const from=items.findIndex(item=>item.id===id),to=items.findIndex(item=>item.id===target);if(from<0||to<0||from===to)return items;const next=items.slice();next.splice(to,0,next.splice(from,1)[0]);return next;}
  if(typeof module==='object'&&module.exports)module.exports={flatten,placeholders,compose,filterSnippets,choose,move};
  if(typeof document==='undefined')return;
  const by=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  let mounted=false,catalog=null,loading=null,items=[],drag=null,serial=0;
  const selections=new Map(),mobile=matchMedia('(max-width:900px)');
  const announce=(text,error=false)=>{by('ct-sn-status').textContent=text;by('ct-sn-status').classList.toggle('ct-error',error);};
  const button=(text,action)=>{const node=el('button',text,'sg-btn');node.type='button';node.onclick=action;return node;};
  function highlight(node,text){node.replaceChildren();let start=0;for(const match of text.matchAll(/【[^【】]*】/gu)){node.append(document.createTextNode(text.slice(start,match.index)),el('mark',match[0]));start=match.index+match[0].length;}node.append(document.createTextNode(text.slice(start)));}
  async function copy(text,all=false){
    if(!text)return;
    if(all&&placeholders(text).length&&!confirm('組合內容仍有未替換的【】佔位符，確定全部複製？'))return;
    try{await navigator.clipboard.writeText(text);announce(all?'已複製完整段落。':'已複製這一則。');}
    catch(_){announce('複製失敗，請允許剪貼簿權限後重試，或自行選取預覽文字複製。',true);}
  }
  function preview(){
    const text=compose(items);highlight(by('ct-sn-preview'),text);
    by('ct-sn-count').textContent=items.length+' 則';
    by('ct-sn-warning').textContent=placeholders(text).length?'仍有 '+placeholders(text).length+' 個【】佔位符待替換。':'';
    by('ct-sn-copy-all').disabled=!text;by('ct-sn-clear').disabled=!items.length;
    by('ct-sn-composer-empty').hidden=Boolean(items.length);
  }
  function renderComposition(focusId){
    const list=by('ct-sn-items');list.replaceChildren();
    for(const [index,item]of items.entries()){
      const card=el('li',undefined,'ct-sn-composed');card.dataset.id=item.id;
      const head=el('div',undefined,'ct-sn-item-head');head.append(el('span',String(index+1)+' · '+item.groupTitle));
      const grip=button('⠿',()=>{});grip.className='ct-grip';grip.dataset.grip=item.id;grip.setAttribute('aria-label','拖曳調整第 '+(index+1)+' 則順序，也可用上下方向鍵');
      head.prepend(grip);card.append(head);
      const label=el('label','編輯第 '+(index+1)+' 則'),input=el('textarea');input.rows=4;input.value=item.text;input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','編輯第 '+(index+1)+' 則');
      input.oninput=()=>{item.text=input.value;preview();};label.append(input);card.append(label);
      const actions=el('div',undefined,'ct-sn-actions');
      for(const [name,delta]of [['上移',-1],['下移',1]]){const control=button(name,()=>{items=move(items,item.id,items[index+delta].id);renderComposition(item.id);});control.disabled=!items[index+delta];actions.append(control);}
      actions.append(button('刪除此則',()=>{items=items.filter(row=>row.id!==item.id);renderComposition();}));card.append(actions);list.append(card);
    }
    preview();if(focusId)list.querySelector('[data-grip="'+focusId+'"]')?.focus();
  }
  function renderLibrary(){
    if(!catalog)return;
    const host=by('ct-sn-library'),open=new Map([...host.querySelectorAll('details')].map(node=>[node.dataset.group,node.open]));host.replaceChildren();
    const matches=filterSnippets(flatten(catalog),by('ct-sn-search').value),ids=new Set(matches.map(row=>row.id));
    by('ct-sn-results').textContent=matches.length+' / '+flatten(catalog).length+' 則';
    for(const section of catalog.sections){
      const block=el('section'),heading=el('h2',section.title);block.append(heading);let visible=false;
      for(const group of section.groups){
        const shown=group.snippets.filter(row=>ids.has(row.id));if(!shown.length)continue;visible=true;
        const details=el('details',undefined,'ct-sn-group');details.dataset.group=group.id;details.open=by('ct-sn-search').value.trim()?true:open.get(group.id)??true;
        details.append(el('summary',group.title+' · '+shown.length+' 則'));
        for(const snippet of shown){
          const card=el('article',undefined,'ct-sn-card');card.dataset.snippet=snippet.id;
          if(snippet.label)card.append(el('h3',snippet.label));
          const text=el('p',snippet.text);card.append(text);
          const choices=selections.get(snippet.id)||{};selections.set(snippet.id,choices);
          const toggles=el('div',undefined,'ct-sn-choices');
          for(const token of alternatives.filter(token=>snippet.text.includes(token))){
            const toggle=button(choices[token]||token,()=>{const values=token.split('／');choices[token]=values[(values.indexOf(choices[token])+1)%values.length];toggle.textContent=choices[token];toggle.setAttribute('aria-label',token+'，目前選擇'+choices[token]+'，點擊切換');text.textContent=choose(snippet.text,choices);});
            toggle.classList.add('ct-sn-choice');toggle.setAttribute('aria-label',token+'，點擊選擇');toggles.append(toggle);
          }
          text.textContent=choose(snippet.text,choices);card.append(toggles);
          const actions=el('div',undefined,'ct-sn-actions');actions.append(button('複製',()=>copy(choose(snippet.text,choices))),button('加入',()=>{items.push({id:'snippet-'+(++serial),sourceId:snippet.id,group:group.id,groupTitle:group.title,text:choose(snippet.text,choices)});renderComposition();announce('已加入組合區。');}));card.append(actions);details.append(card);
        }
        block.append(details);
      }
      if(visible)host.append(block);
    }
    if(!matches.length)host.append(el('p','找不到符合的片段。','ct-empty'));
  }
  function setupReorder(){
    const list=by('ct-sn-items');
    list.addEventListener('keydown',event=>{const grip=event.target.closest('[data-grip]');if(!grip||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const at=items.findIndex(item=>item.id===grip.dataset.grip),target=items[at+(event.key==='ArrowUp'?-1:1)];if(target){items=move(items,grip.dataset.grip,target.id);renderComposition(grip.dataset.grip);}});
    list.addEventListener('pointerdown',event=>{const grip=event.target.closest('[data-grip]');if(!grip||event.button!==0)return;event.preventDefault();grip.setPointerCapture(event.pointerId);drag={id:grip.dataset.grip,grip,pointer:event.pointerId,target:null};grip.closest('li').classList.add('ct-sn-dragging');});
    list.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;const cards=[...list.children];let target=cards.find(card=>{const rect=card.getBoundingClientRect();return event.clientY>=rect.top&&event.clientY<=rect.bottom;});if(!target)return;drag.target=target.dataset.id;cards.forEach(card=>card.classList.toggle('ct-sn-drop',card===target));});
    const end=event=>{if(!drag||event.pointerId!==drag.pointer)return;const done=drag;drag=null;if(done.grip.hasPointerCapture(done.pointer))done.grip.releasePointerCapture(done.pointer);if(event.type==='pointerup'&&done.target)items=move(items,done.id,done.target);renderComposition(done.id);};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])list.addEventListener(type,end);
  }
  function mount(){
    if(mounted)return;mounted=true;
    const panel=el('section');panel.id='ct-sn-panel';panel.className='ct-shell';
    panel.innerHTML='<header class="ct-head ct-sn-head"><h1>母保罐頭</h1><div class="ct-tools"><input id="ct-sn-search" type="search" aria-label="搜尋母保罐頭" placeholder="搜尋所有片段文字" autocomplete="off"><span id="ct-sn-results"></span></div><p>組合內容不會儲存，離開頁面即清除</p></header><p id="ct-sn-status" class="ct-status" role="status" aria-live="polite"></p><div class="ct-sn-layout"><div id="ct-sn-library"></div><details id="ct-sn-composer" class="ct-sn-composer"><summary>組合區 <span id="ct-sn-count">0 則</span><span class="ct-sn-expand">展開／收合</span></summary><div class="ct-sn-composer-body"><p id="ct-sn-composer-empty">從左側（手機上方）加入片段，可直接編輯、拖曳排序或刪除。</p><ol id="ct-sn-items"></ol><h2>完整段落預覽</h2><p id="ct-sn-preview" class="ct-sn-preview"></p><p id="ct-sn-warning" class="ct-error" role="status" aria-live="polite"></p><div class="ct-sn-actions"><button type="button" id="ct-sn-copy-all" class="sg-btn sg-primary">全部複製</button><button type="button" id="ct-sn-clear" class="sg-btn">清空</button></div></div></details></div>';
    by('maternal-panel').replaceChildren(panel);by('ct-sn-composer').open=!mobile.matches;
    mobile.addEventListener('change',()=>{by('ct-sn-composer').open=!mobile.matches;});
    by('ct-sn-search').oninput=renderLibrary;by('ct-sn-copy-all').onclick=()=>copy(compose(items),true);
    by('ct-sn-clear').onclick=()=>{items=[];renderComposition();announce('組合區已清空。');};setupReorder();preview();
    window.addEventListener('pagehide',clear);
    let identity=window.ScholarSync.status().user?.uid;window.addEventListener('scholar-sync-status',()=>{const next=window.ScholarSync.status().user?.uid;if(identity!==next){identity=next;clear();}});
  }
  function clear(){if(!mounted)return;items=[];drag=null;selections.clear();by('ct-sn-search').value='';renderComposition();by('ct-sn-status').textContent='';if(catalog)renderLibrary();}
  async function show(){
    mount();
    if(catalog){renderLibrary();return;}
    if(loading)return loading;
    announce('載入罐頭…');
    loading=(async()=>{try{const response=await fetch('cases/maternal-snippets.json');if(!response.ok)throw Error('無法載入罐頭');catalog=await response.json();renderLibrary();announce('');}catch(_){announce('罐頭載入失敗，請檢查連線後重試。',true);by('ct-sn-library').replaceChildren(button('重試',show));}finally{loading=null;}})();return loading;
  }
  window.ScholarMaternalSnippets={mount,show,hide:clear};
})();
