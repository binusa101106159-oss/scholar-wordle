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

test('every Figure shortcut includes its complete source caption',()=>{
 const captions={};
 for(const entry of Object.values(manifest.chapters))for(const object of packed(entry.file).attachments){
  if(object.kind!=='figure')continue;
  assert.equal(typeof object.caption,'string',object.id);assert.ok(object.caption.trim(),object.id+' missing caption');
  assert.ok(!/^Figure\b/i.test(object.caption),object.id+' duplicates the figure number');captions[object.id]=object.caption;
 }
 assert.equal(captions['f15-13'],'Upper Extremity Range of Motion Record');
 assert.equal(captions['f15-31'],'Upper Extremity Impairment Evaluation Example');
 assert.equal(captions['f16-1'],'Lower Extremity Regions');
 assert.equal(captions['f15-16'],'Flexion of Thumb MCP Joint');
 assert.equal(captions['f15-17'],'Neutral Position of Thumb MCP Joint');
 assert.equal(captions['f15-18'],'Thumb Radial Abduction');
 assert.equal(captions['f15-19'],'Adduction of Thumb');
 assert.ok(captions['f15-6'].endsWith('of the Digit Length'),'long captions must not be cut off');
 assert.equal(captions['f12-10'],'Overlay Grid for Goldman Fields');
});

test('Table captions exclude field labels and footnote markers without cutting continuation lines',()=>{
 const titles={};for(const entry of Object.values(manifest.chapters))for(const a of packed(entry.file).attachments)if(a.kind==='table')titles[a.id]=a.caption;
 assert.equal(titles['t1-4'],'Sample Impairment Functional Classification');
 assert.equal(titles['t4-1'],'NYHA Functional Classification of Cardiac Disease');
 assert.equal(titles['t9-5'],'Criteria for Rating Permanent Impairment due to Anemia');
 assert.equal(titles['t15-12'],'Impairment Values Calculated From Digit Impairment');
 assert.equal(titles['t15-37'],'Activities of Daily Living Questionnaire');
 assert.equal(titles['t16-18'],'Lesser Toe Impairments');
 assert.equal(titles['t16-23'],'Knee Motion Impairments');
 assert.ok(titles['t6-4'].endsWith('Stomach and Duodenum, Small Intestine, and Pancreas) Disease'));
 assert.ok(titles['t13-8'].endsWith('Cognition, and Highest Integrative Function (MSCHIF)'));
});
