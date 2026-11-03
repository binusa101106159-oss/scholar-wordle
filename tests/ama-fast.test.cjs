'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'ama/fast/index.json'),'utf8'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const digest=value=>hash(JSON.stringify(value));
function packed(file){
 const bytes=fs.readFileSync(path.join(root,file));
 assert.ok(file.endsWith('-'+hash(bytes).slice(0,16)+'.json.gz'),'immutable filename must match content: '+file);
 return JSON.parse(gunzipSync(bytes));
}
test('AMA compact readers preserve every original page and section',()=>{
 for(const [id,entry] of Object.entries(manifest.chapters)){
  const bytes=fs.readFileSync(path.join(root,'ama',id+'.json'));
  assert.equal(hash(bytes.toString('utf8').replace(/\r\n/g,'\n')),entry.sourceSHA256,'rebuild compact assets after source changes: '+id);
  const source=JSON.parse(bytes),reader=packed(entry.file);
  assert.equal(digest(reader.pages),digest(source.pages),id+' page HTML');
  assert.equal(digest(reader.sections),digest(source.sections),id+' sections');
 }
});
test('AMA lazy attachments preserve complete source objects and ordering',()=>{
 for(const [id,entry] of Object.entries(manifest.chapters)){
  const source=JSON.parse(fs.readFileSync(path.join(root,'ama',id+'.json'),'utf8')),reader=packed(entry.file);
  assert.equal(reader.attachments.length,source.attachments.length,id);
  reader.attachments.forEach((meta,i)=>{
   assert.equal(meta.id,source.attachments[i].id,id+' attachment order');
   assert.equal(digest(packed(meta.file)),digest(source.attachments[i]),meta.id+' complete source');
  });
 }
});
test('AMA compact search index covers every source page in study order',()=>{
 const search=packed(manifest.search);
 assert.deepEqual(search.map(c=>c.id),Object.keys(manifest.chapters));
 for(const chapter of search){
  const source=JSON.parse(fs.readFileSync(path.join(root,'ama',chapter.id+'.json'),'utf8'));
  assert.deepEqual(chapter.pages.map(p=>p.page),source.pages.map(p=>p.page),chapter.id);
  assert.ok(chapter.pages.every(p=>typeof p.text==='string'),chapter.id+' searchable text');
 }
});
