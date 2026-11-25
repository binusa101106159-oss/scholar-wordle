/* Always revalidate same-origin runtime files; private external APIs are untouched. */
(() => {
 if(typeof window.fetch!=='function')return;
 const networkFetch=window.fetch.bind(window);
 window.fetch=(input,options={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
  const method=String(options.method||(typeof input==='object'&&input.method)||'GET').toUpperCase();
  return networkFetch(input,url.origin===location.origin&&method==='GET'?{...options,cache:'no-store'}:options);
 };
})();
/* Load feature code once, only when its tab is opened. Shared dependencies keep source order. */
(() => {
 const files=new Map();
 function install(nodes){
  async function load(group){
   const selected=nodes.filter(n=>(n.dataset.lazy||'').split(' ').includes(group));
   await Promise.all(selected.map(n=>{const url=n.dataset.cloudSrc;if(!files.has(url))files.set(url,fetch(new URL(url,location.href),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('載入失敗');return r.text()}).catch(e=>{files.delete(url);throw e}));return files.get(url)}));
   for(const node of selected){if(node.dataset.executed)continue;const script=document.createElement('script');script.textContent=await files.get(node.dataset.cloudSrc)+'\n//# sourceURL='+node.dataset.cloudSrc;document.body.append(script);node.dataset.executed='true';}
  }
  const names={certificates:'ScholarCertificates',maternal:'ScholarMaternalSnippets',checkup:'ScholarCheckup',laws:'ScholarLaws',guides:'ScholarGuides',ama:'ScholarAMA',health:'ScholarHealth',calculator:'ScholarCalculator',forms:'ScholarForms',cases:'ScholarCases',calendar:'ScholarCalendar',iarc:'ScholarIARC',ilo:'ScholarILO',notes:'ScholarNotes',review:'ScholarReview',minigames:'ScholarMiniGames'};
  for(const [group,name]of Object.entries(names)){
   const proxy={hide(){},async show(...args){
    const panel=document.getElementById(group+'-panel');
    try{await load(group);if(!panel.hidden&&window[name]!==proxy)return await window[name].show(...args);}
    catch(_){if(panel.hidden)return;const message=document.createElement('p'),retry=document.createElement('button');message.textContent='暫時無法載入，請檢查連線。';retry.textContent='重試';retry.onclick=()=>proxy.show(...args);panel.replaceChildren(message,retry);}
   }};window[name]=proxy;
  }
 }
 window.ScholarAppLoader={install};
})();
