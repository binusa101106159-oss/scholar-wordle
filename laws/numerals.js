/* 法規條文「阿拉伯數字」顯示：只改畫面上的字，原始資料、搜尋索引與「原文」模式的畫線都不動。
 * Converted: 第六條第三項 → 第 6 條第 3 項；三個月 → 3 個月；一百十五年六月二十六日 → 115 年 6 月 26 日；
 * 二分之一 → 1/2；百分之五十 → 50%；午後十時至翌晨六時 → 10:00PM 至翌晨 6:00AM.
 * Left alone: 一、／（一）款目編號、附表一 等名稱、一般／一定／之一 等詞語、附表連結範圍內的文字. */
((root)=>{
 'use strict';
 const N='[〇零一二三四五六七八九十百千萬兩]+';
 const DIGIT={'〇':0,'零':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
 const UNIT={'十':10,'百':100,'千':1000};
 function cnToNumber(s){
  if(!/[十百千萬]/.test(s))return s.length>1?Number([...s].map(c=>DIGIT[c]).join('')):DIGIT[s];
  let total=0,section=0,num=0;
  for(const c of s){
   if(c in DIGIT)num=DIGIT[c];
   else if(c in UNIT){section+=(num||1)*UNIT[c];num=0;}
   else if(c==='萬'){total+=(section+num)*10000;section=0;num=0;}
  }
  return total+section+num;
 }
 const group=n=>n>=10000?n.toLocaleString('en-US'):n;
 const UNITS='個月|小時|分鐘|星期|公斤|公克|毫克|公尺|公分|毫米|公升|毫升|立方公尺|平方公尺|分貝|萬元|週歲|年|月|日|週|天|秒|人|名|次|回|項|款|目|條|類|級|種|歲|倍|元|層|樓|台|臺|張|份|件|處|床|頁|號|度';
 const PM=new Set(['午後','下午','晚上','晚間','夜間']),AM=new Set(['午前','上午','早上','凌晨','清晨']),KEEP=new Set(['翌晨','翌日']);
 const RULES=[
  // 第十五條之一 → 第 15 條之 1
  [new RegExp('第('+N+')條之('+N+')','g'),m=>['第',cnToNumber(m[1]),'條之',cnToNumber(m[2])]],
  [new RegExp('百分之('+N+')','g'),m=>[cnToNumber(m[1])+'%']],
  [new RegExp('千分之('+N+')','g'),m=>[cnToNumber(m[1])+'‰']],
  [new RegExp('('+N+')分之('+N+')','g'),m=>[cnToNumber(m[2])+'/'+cnToNumber(m[1])]],
  // Clock times need an AM/PM word before them or a range word after, so 臨時／同時 never match.
  [new RegExp('(午前|上午|早上|午後|下午|晚上|晚間|夜間|凌晨|清晨|翌晨|翌日)?('+N+')時(?:('+N+')分)?(?=(.?))','g'),(m,text)=>{
   const word=m[1]||'',h=cnToNumber(m[2]),min=m[3]?cnToNumber(m[3]):0;
   if(!(h>=0&&h<=24&&min<60))return null;
   // Without 午後／翌晨…, only the two ends of a range count: 八時至… or …至十七時.
   if(!word&&!/^(至|到|起|止)$/.test(m[4]||'')&&!/[至到]$/.test(text.slice(0,m.index)))return null;
   const mm=String(min).padStart(2,'0');
   if(PM.has(word))return [h===12?'12:'+mm+'AM':(h>12?h-12:h)+':'+mm+'PM'];
   if(AM.has(word))return [(h===0?12:h)+':'+mm+'AM'];
   if(KEEP.has(word))return [word,(h<12?(h===0?12:h)+':'+mm+'AM':(h===12?12:h-12)+':'+mm+'PM')];
   return [h+':'+mm];
  }],
  [new RegExp('第('+N+')','g'),m=>['第',cnToNumber(m[1])]],
  // A lone 零 is a word (畸零), not a number.
  [new RegExp('('+N+')(?=('+UNITS+'))','g'),m=>/^[零〇]$/.test(m[1])?null:[group(cnToNumber(m[1]))]]
 ];
 const CJK=/[㐀-鿿]/;
 // Returns the shown text plus a function that moves an offset in the original text to the shown text.
 function toArabic(text,skip=[]){
  const hits=[];
  for(const [re,make] of RULES){
   re.lastIndex=0;let m;
   while((m=re.exec(text))){
    const s=m.index,e=s+m[0].length;
    if(hits.some(h=>s<h.e&&e>h.s)||skip.some(([a,b])=>s<b&&e>a))continue;
    const parts=make(m,text);if(parts)hits.push({s,e,parts});
   }
  }
  hits.sort((a,b)=>a.s-b.s);
  let out='',at=0;const segs=[];
  const isText=p=>typeof p==='string'&&!/^[\d,:./%‰APM]+$/.test(p);
  for(const h of hits){
   segs.push({o:at,n:out.length,len:h.s-at});out+=text.slice(at,h.s);
   let piece='';
   h.parts.forEach((p,i)=>{
    const value=String(p),numeric=!isText(p);
    if(numeric){const before=i?piece.slice(-1):(out.slice(-1));if(before&&CJK.test(before))piece+=' ';piece+=value;const next=i<h.parts.length-1?String(h.parts[i+1])[0]:text[h.e];if(next&&CJK.test(next))piece+=' ';}
    else piece+=value;
   });
   segs.push({o:h.s,n:out.length,len:h.e-h.s,to:piece.length,changed:true});out+=piece;at=h.e;
  }
  segs.push({o:at,n:out.length,len:text.length-at});out+=text.slice(at);
  const map=i=>{for(const s of segs){if(i>=s.o&&i<=s.o+s.len)return s.changed?s.n+(i===s.o?0:s.to):s.n+(i-s.o);}return out.length;};
  return {text:out,map,changed:hits.length>0};
 }
 const api={cnToNumber,toArabic};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.ScholarNumerals=api;
})(typeof window==='undefined'?globalThis:window);
