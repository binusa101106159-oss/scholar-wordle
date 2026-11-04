/* AAOS Lower Limb Core Scale. Source ranges and exact constants are in aaos.json. */
((root)=>{
 'use strict';
 const round=n=>Math.sign(n)*Math.floor(Math.abs(n)+.5);
 function severityFor(score,data){return data.severity.find(s=>score>=s.min&&score<=s.max)||null;}
 function scoreAAOS(answers,data){
  if(!Array.isArray(answers)||answers.length!==7)throw Error('需要7題答案。');
  let answered=0,valid=0,raw=0;const omitted=[],missing=[],components=[];
  data.questions.forEach((q,i)=>{
   const value=answers[i];
   if(value===null||value===undefined||value===''){omitted.push(i+1);components.push(null);return;}
   const n=Number(value);if(!['number','string'].includes(typeof value)||!Number.isInteger(n)||n<1||n>q.max)throw Error('Q'+(i+1)+'的答案代碼無效。');
   answered++;if(q.missingCode===n){missing.push(i+1);components.push(null);return;}
   const component=(n-1)*q.factor;raw+=component;valid++;components.push(component);
  });
  const base={answered,valid,raw,omitted,missing,components,ready:valid>=data.required};
  if(!base.ready)return base;
  const mean=raw/valid,standardized=Math.max(0,Math.min(100,100-mean*20)),normative=50+10*(standardized-data.populationMean)/data.populationSD,displayScore=round(standardized);
  return {...base,mean,standardized,normative,displayScore,displayNormative:round(normative),severity:severityFor(displayScore,data)};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={scoreAAOS,severityFor,round};
 if(typeof document==='undefined')return;
 const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let data=null,promise=null;
 async function mount(){
  const host=document.getElementById('cl-aaos');if(data||promise)return promise;
  host.innerHTML='<p class="aa-loading" role="status">載入AAOS計分資料…</p>';
  promise=(async()=>{try{
   const response=await fetch('calculator/aaos.json');if(!response.ok)throw Error();data=await response.json();render(host);
  }catch(_){data=null;promise=null;host.innerHTML='<p class="aa-loading" role="status">無法載入計分資料。<button type="button" id="aa-retry">重試</button></p>';document.getElementById('aa-retry').onclick=mount;}})();return promise;
 }
 function render(host){
  host.innerHTML='<div class="aa-heading"><p>AAOS · LOWER LIMB</p><h1>下肢功能量表</h1><div>回想過去一週的情況，選擇各題答案。</div></div><div class="aa-layout"><form id="aa-form" class="aa-form" autocomplete="off"><div class="aa-form-head"><h2>輸入答案</h2><button type="reset">全部清除</button></div><p class="aa-progress" id="aa-progress">已填0／7題 · 有效0題</p><div class="aa-questions">'+data.questions.map((q,i)=>'<div class="aa-question"><label for="aa-'+q.id+'"><span class="aa-number">'+(i+1)+'</span><span>'+esc(q.label)+'</span></label><select id="aa-'+q.id+'" name="'+q.id+'" aria-describedby="aa-original-'+q.id+'"><option value="">尚未作答</option>'+q.options.map(o=>'<option value="'+o.value+'">'+o.value+'｜'+esc(o.label)+'</option>').join('')+'</select><details class="aa-original" id="aa-original-'+q.id+'"><summary>原文</summary><p>'+esc(q.original)+'</p><p>'+q.options.map(o=>o.value+' = '+esc(o.original)).join('<br>')+'</p></details><p class="aa-question-note" id="aa-note-'+q.id+'" hidden>此答案依原表視為缺答，不計入有效題數。</p></div>').join('')+'</div><p class="aa-form-hint">Q3–Q5若同題有多個值，依原表取最高值。代碼7視為缺答。</p><button type="button" id="aa-view-result" class="aa-primary">查看結果</button></form><aside id="aa-result" class="aa-result" tabindex="-1" aria-label="AAOS計分結果"><p class="aa-eyebrow">計分結果</p><div id="aa-result-live" aria-live="polite" aria-atomic="true"></div><div class="aa-result-actions"><button type="button" id="aa-copy" disabled>複製結果</button><span id="aa-copy-status" role="status"></span></div><details class="aa-method"><summary>計分方式與分級</summary><p>至少4題有效才計分；未答及Q3–Q5的代碼7不列入分母。Q1、Q2：(答案−1)×5/4；Q3–Q5、Q7：答案−1；Q6：(答案−1)×5/6。</p><p>標準分數＝100−20×有效題換算值的平均。常模分數＝50＋10×(未取整標準分數−90.5138)÷13.78281。</p><p>分數呈現依原表取至整數；分級使用呈現的標準分數，常模計算保留標準分數精度。</p><table><caption>依提供試算表的分級</caption><thead><tr><th>標準分數</th><th>功能缺損</th></tr></thead><tbody>'+data.severity.map(s=>'<tr><td>'+(s.min===s.max?s.min:s.min+'–'+s.max)+'</td><td>'+esc(s.label)+'<small>'+esc(s.original)+'</small></td></tr>').join('')+'</tbody></table><p class="aa-source">來源：Instructions!A8:A18、A30:C48、A51:B55；Standardized &amp; Normative Scores!J4:L4。</p></details><p class="aa-source"><a href="'+esc(data.source.url)+'" target="_blank" rel="noopener">查看來源試算表</a> · 中文選項為介面翻譯，原文可逐題展開。</p></aside></div>';
  const by=id=>document.getElementById(id),form=by('aa-form'),selects=[...form.querySelectorAll('select')];let current=null;
  function update(){
   current=scoreAAOS(selects.map(s=>s.value),data);by('aa-progress').textContent='已填'+current.answered+'／7題 · 有效'+current.valid+'題';by('aa-copy').disabled=!current.ready;by('aa-copy-status').textContent='';
   data.questions.forEach((q,i)=>by('aa-note-'+q.id).hidden=!(q.missingCode&&Number(selects[i].value)===q.missingCode));
   const remaining=data.required-current.valid;
   if(!current.ready){by('aa-result-live').innerHTML='<p class="aa-empty-score">—<span>／100</span></p><h2>尚未計分</h2><p class="aa-muted">還需要'+remaining+'題有效答案。<br>至少4題有效後，自動顯示分數與功能缺損分級。</p>';return;}
   const s=current.severity,incomplete=current.valid<7;
   by('aa-result-live').innerHTML='<p class="aa-score">'+current.displayScore+'<span>／100</span></p><p class="aa-muted aa-score-label">標準分數 · 越高表示功能越好</p><h2 class="aa-severity">'+esc(s.label)+'</h2><p class="aa-english">'+esc(s.original)+'</p><meter min="0" max="100" value="'+current.displayScore+'" aria-label="標準分數 '+current.displayScore+'，'+esc(s.label)+'"></meter><p class="aa-valid '+(incomplete?'aa-partial':'')+'">依'+current.valid+'題有效答案計分'+(incomplete?' · 尚有未答或排除題目':'')+'</p><div class="aa-norm"><span>常模分數</span><strong>'+current.displayNormative+'</strong><small>一般／健康族群平均為50，越高表示功能越好。</small></div><details class="aa-precision"><summary>查看計算細節</summary><dl><dt>換算值總和</dt><dd>'+current.raw.toFixed(4)+'</dd><dt>有效題平均</dt><dd>'+current.mean.toFixed(4)+'</dd><dt>未取整標準分數</dt><dd>'+current.standardized.toFixed(4)+'</dd><dt>未取整常模分數</dt><dd>'+current.normative.toFixed(4)+'</dd></dl></details>';
  }
  form.addEventListener('change',update);form.addEventListener('reset',()=>{setTimeout(update,0);});
  by('aa-view-result').onclick=()=>{by('aa-result').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});by('aa-result').focus({preventScroll:true});};
  by('aa-copy').onclick=async()=>{if(!current?.ready)return;const answers=selects.map((s,i)=>'Q'+(i+1)+'='+ (s.value||'未答')).join('、'),text='AAOS Lower Limb Core Scale\n'+answers+'\n有效題數：'+current.valid+'/7\n標準分數：'+current.displayScore+'/100\n功能缺損：'+current.severity.label+' ('+current.severity.original+')\n常模分數：'+current.displayNormative+'\n分級依提供試算表，使用取整後標準分數。\n來源：'+data.source.url;
   try{await navigator.clipboard.writeText(text);by('aa-copy-status').textContent='已複製。';}catch(_){const area=document.createElement('textarea');area.className='aa-copy-fallback';area.value=text;area.readOnly=true;by('aa-copy-status').replaceChildren(area);area.focus();area.select();area.setAttribute('aria-label','可複製的計算結果');}
  };
  update();
 }
 root.ScholarAAOS={mount};
})(typeof window==='undefined'?globalThis:window);
