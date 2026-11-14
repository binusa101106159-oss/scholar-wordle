/* Load feature code once, only when its tab is opened. Shared dependencies keep source order. */
(() => {
 const files=new Map();
 function install(nodes){
  async function load(group){
   const selected=nodes.filter(n=>(n.dataset.lazy||'').split(' ').includes(group));
   await Promise.all(selected.map(n=>{const url=n.dataset.cloudSrc;if(!files.has(url))files.set(url,fetch(new URL(url,location.href)).then(r=>{if(!r.ok)throw Error('載入失敗');return r.text()}).catch(e=>{files.delete(url);throw e}));return files.get(url)}));
   for(const node of selected){if(node.dataset.executed)continue;const script=document.createElement('script');script.textContent=await files.get(node.dataset.cloudSrc)+'\n//# sourceURL='+node.dataset.cloudSrc;document.body.append(script);node.dataset.executed='true';}
  }
  const names={laws:'ScholarLaws',guides:'ScholarGuides',ama:'ScholarAMA',health:'ScholarHealth',calculator:'ScholarCalculator',forms:'ScholarForms',cases:'ScholarCases',calendar:'ScholarCalendar',iarc:'ScholarIARC',ilo:'ScholarILO',notes:'ScholarNotes',review:'ScholarReview'};
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
