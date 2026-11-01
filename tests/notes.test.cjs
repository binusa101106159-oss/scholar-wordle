const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('../notes/notes.js');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'notes/data.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'notes/import-manifest.json'),'utf8'));
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
test('the import ends at the requested mnemonic page and includes complete databases and child pages',()=>{
 assert.equal(manifest.inventory.length,108);
 assert.ok(!data.items.some(i=>i.id==='4000e05cff3081e88ac1cce8f1b9524c'));
 assert.ok(!manifest.inventory.some(i=>i.id==='4000e05cff3081e88ac1cce8f1b9524c'));
 assert.equal(manifest.inventory.at(-1).id,'8190e05cff3082ce94a381eddaccfaff');
 assert.equal(data.items.length,159);
 assert.equal(data.items.filter(i=>i.kind==='database').length,2);
 assert.equal(data.items.filter(i=>i.kind==='row').length,50);
 assert.equal(data.items.filter(i=>i.kind==='child').length,1);
 assert.ok(!data.items.some(i=>i.id==='5ca0e05cff308260be4d8112e3487a06'));
});
test('every source hyperlink is retained, including the link to the original source book',()=>{
 const links=new Set(data.items.flatMap(i=>[...i.html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map(m=>decode(m[1]))));
 assert.equal(manifest.hyperlinks.length,263);
 for(const url of manifest.hyperlinks)assert.ok(links.has(url),'Missing link '+url);
 assert.ok(links.has('https://app.notion.com/p/5ca0e05cff308260be4d8112e3487a06'));
});
test('all images and the PDF have local, byte-verified copies',()=>{
 const imagePaths=data.items.flatMap(i=>[...i.html.matchAll(/<img\b[^>]*src="([^"]*)"/g)].map(m=>decode(m[1])));
 assert.equal(imagePaths.length,419);
 assert.ok(imagePaths.every(p=>p.startsWith('notes/assets/')));
 const unique=new Map(Object.values(manifest.assets).map(a=>[a.path,a]));
 assert.equal(unique.size,418);
 for(const [p,a] of unique){const bytes=fs.readFileSync(path.join(root,p));assert.equal(bytes.length,a.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),a.sha256);}
 assert.equal([...unique.keys()].filter(p=>p.endsWith('.pdf')).length,1);
});
test('full-text search and the original Notion order include database content',()=>{
 const items=data.items.map(i=>({...i,searchText:core.normalize(i.title+'\n'+i.text)}));
 assert.ok(items.some(i=>i.kind==='database'&&core.matches(i,core.terms('mercapturic'),'all')));
 assert.equal(core.sort(items,'source').filter(i=>!i.parentId).at(-1).id,'8190e05cff3082ce94a381eddaccfaff');
 assert.equal(items.filter(i=>core.matches(i,[],'main')).length,108);
});
