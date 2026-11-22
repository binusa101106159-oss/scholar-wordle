const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.join(__dirname,'..'),load=id=>JSON.parse(fs.readFileSync(path.join(root,'ama',id+'.json'),'utf8'));
const c12=load('c12'),text=html=>html.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
test('all reader pages have unique element anchors, including split caption continuations',()=>{
 let pages=0,objects=0;for(const id of [...Array.from({length:17},(_,i)=>'c'+String(i+1).padStart(2,'0')),'california']){const chapter=load(id);objects+=chapter.attachments.length;for(const page of chapter.pages){pages++;const ids=[...page.html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,id+' p'+page.page);}}
 assert.equal(pages,683);assert.equal(objects,385);
});
test('reading-acuity notes are complete and cannot escape as duplicated text fragments',()=>{
 const html=c12.pages.find(p=>p.page===310).html;for(const id of ['p310-b431-0','p310-b432-0'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 const table=c12.attachments.find(a=>a.id==='t12-11').html;assert.match(text(table),/upper number in each/);assert.match(text(table),/Note that the visual acuity/);assert.match(text(table),/different combinations/);assert.doesNotMatch(html,/>\s*(?:in e|at t bina)\s*<\/p>/);
});
test('visual-function ranges retain the six original rows and complete words in the correct column',()=>{
 const html=c12.pages.find(p=>p.page===289).html,table=html.match(/<table\b[^>]*class="ax-table ax-visual-ranges".*?<\/table>/s)[0];const rows=[...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map(r=>[...r[1].matchAll(/<td>(.*?)<\/td>/gs)].map(c=>text(c[1])));
 assert.equal(rows.length,6);assert.deepEqual(rows.map(r=>r[1]),['Range of normal','Mild loss','Moderate loss','Severe loss','Profound loss','Near-total or total loss']);rows.forEach(r=>{assert.equal(r.length,3);assert.match(r[0],/^\d+ ± 10$/);});
});
test('cross-page overlays have normal text captions and one actual drawing, never a magnified caption strip',()=>{
 for(const id of ['f12-10','f12-11']){const object=c12.attachments.find(a=>a.id===id);assert.equal((object.html.match(/<svg\b/g)||[]).length,1);assert.match(object.html,/ax-restored-figure-caption/);assert.match(object.html,/ax-source-overlay/);assert.match(object.html,/<image\b[^>]*href="data:image\//);assert.doesNotMatch(object.html,/viewBox="321 (?:532|615) 219 (?:23|21)"/);}
 const figure=c12.attachments.find(a=>a.id==='f12-10');const box=figure.html.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);assert.ok(box[2]/box[3]>.9&&box[2]/box[3]<1.1);assert.match(c12.pages.find(p=>p.page===314).html,/ax-figure-cross-reference/);
});
test('compressed reader, source data and lazy attachment assets stay synchronized',()=>{
 const index=JSON.parse(fs.readFileSync(path.join(root,'ama/fast/index.json'),'utf8'));
 for(const id of ['c12','c13']){const meta=index.chapters[id],source=fs.readFileSync(path.join(root,'ama',id+'.json'),'utf8').replace(/\r\n/g,'\n');assert.equal(meta.sourceSHA256,crypto.createHash('sha256').update(source).digest('hex'));const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,meta.file))));assert.equal(data.id,id);for(const a of data.attachments)assert.ok(fs.existsSync(path.join(root,a.file)),a.file);}
});
