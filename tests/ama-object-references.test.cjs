'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../ama/ama.js'),'utf8'),context={};
vm.runInNewContext(source.slice(source.indexOf('  function scopeObjectIds('),source.indexOf('  function naturalSourceLabels('))+';this.scope=scopeObjectIds;',context);
const node=(id,values={})=>({id,attributes:Object.entries(values).map(([name,value])=>({name,localName:name.split(':').at(-1),value,namespaceURI:name.includes(':')?'http://www.w3.org/1999/xlink':null})),setAttributeNS(ns,name,value){const a=this.attributes.find(a=>a.name===name);assert.equal(a.namespaceURI,ns);a.value=value;}});

test('popup stencils, clips, gradients, markers and linked images follow renamed definitions',()=>{
 const defs=['stencil','clip','gradient','marker','picture'].map(id=>node(id));
 const graphic=node('',{mask:'url(#stencil)','clip-path':'url("#clip")',fill:"url('#gradient')",'marker-end':'url(#marker)',href:'#picture','xlink:href':'#picture',style:'mask:url(#stencil);filter:url(#gradient)'});
 const root={querySelectorAll(selector){return selector==='[id]'?defs:[...defs,graphic];}};
 context.scope(root);
 for(const d of defs)assert.ok(d.id.startsWith('ax-popup-'));
 for(const a of graphic.attributes)assert.ok(a.value.includes('#ax-popup-'),a.name+' retained a broken page reference');
});

test('popup scoping preserves source colors and external image references',()=>{
 const def=node('mask'),graphic=node('',{fill:'#ffffff',href:'data:image/png;base64,AAAA',style:'filter:url(https://example.test/filter.svg#mask)'});
 const before=graphic.attributes.map(a=>a.value);
 context.scope({querySelectorAll:s=>s==='[id]'?[def]:[def,graphic]});
 assert.deepEqual(graphic.attributes.map(a=>a.value),before);
});
