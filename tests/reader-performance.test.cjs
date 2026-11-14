'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(memory=8){
 const raf=[];
 class Container{
  constructor(){this.children=[];this.dataset={};}
  append(node){if(node.parent){node.parent.children.splice(node.parent.children.indexOf(node),1);}this.children.push(node);node.parent=this;}
  replaceChildren(...nodes){this.children.forEach(n=>n.parent=null);this.children=[];for(const n of nodes){if(n instanceof Container){while(n.firstChild)this.append(n.firstChild);}else this.append(n);}}
  get firstChild(){return this.children[0]||null}get childElementCount(){return this.children.length}
  querySelectorAll(){return {length:this.children.reduce((n,c)=>n+c.count,0)}}
 }
 const window={},document={createDocumentFragment:()=>new Container()};
 vm.runInNewContext(fs.readFileSync(require.resolve('../reader-performance.js'),'utf8'),{window,document,navigator:{deviceMemory:memory},WeakMap,WeakSet,Set,Math,requestAnimationFrame:fn=>raf.push(fn),matchMedia:()=>({matches:false})});
 const body=()=>new Container(),fill=(b,key,count=10)=>{const node={count};b.replaceChildren(node);b.dataset.renderKey=key;return node};
 return {cache:window.ScholarPopupCache,scroll:window.ScholarReaderScroll,body,fill,raf};
}
test('A/B/A restores original table nodes; different search keys cannot reuse the wrong highlighting',()=>{
 const h=harness(),b=h.body(),a=h.fill(b,'A|term');assert.equal(h.cache.restore(b,'B'),false);h.fill(b,'B');assert.equal(h.cache.restore(b,'A|other'),false);assert.equal(h.cache.restore(b,'A|term'),true);assert.equal(b.firstChild,a);
});
test('popup cache evicts old tables rather than retaining an unbounded history',()=>{
 const h=harness(),b=h.body();for(const key of ['A','B','C']){h.fill(b,key);h.cache.release(b)}assert.equal(h.cache.restore(b,'A'),false);assert.equal(h.cache.restore(b,'C'),true);
});
test('table cache budget applies across all reader bodies and is smaller on low-memory devices',()=>{
 for(const [memory,count]of [[8,4],[2,2]]){const h=harness(memory),bodies=Array.from({length:count},()=>h.body());bodies.forEach((b,i)=>{h.fill(b,'table'+i,8000);h.cache.release(b)});assert.equal(h.cache.restore(bodies[0],'table0'),false);assert.equal(h.cache.restore(bodies.at(-1),'table'+(count-1)),true);}
});
test('an oversized table is displayed normally without being retained in the detached cache',()=>{
 const h=harness(2),b=h.body(),node=h.fill(b,'large',12000);h.cache.release(b);assert.equal(b.firstChild,node);assert.equal(h.cache.restore(b,'large'),false);
});
test('long jumps settle against the content anchor after offscreen layout changes',()=>{
 const h=harness();let shift=0;const sc={scrollTop:0,style:{scrollBehavior:''},contains:()=>true,addEventListener(){},getBoundingClientRect:()=>({top:0})};const el={isConnected:true,getBoundingClientRect:()=>({top:10000+shift-sc.scrollTop})};h.scroll.to(sc,el,6);shift=300;while(h.raf.length)h.raf.shift()();assert.equal(el.getBoundingClientRect().top,6);
});
