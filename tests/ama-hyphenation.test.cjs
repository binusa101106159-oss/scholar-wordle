const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../ama/ama.js'),'utf8'),context={};
vm.runInNewContext(source.slice(source.indexOf('  const AMA_HYPHEN_SPLITS='),source.indexOf('  function repairHyphens('))+';this.edits=hyphenEdits;',context);
const clean=text=>{let result=text;for(const e of [...context.edits(text)].reverse())result=result.slice(0,e.start)+result.slice(e.end);return result;};
test('all reviewed line-break words are repaired, including uppercase and inline gaps',()=>{
 const decisions=require('../tools/ama-build/hyphen-decisions.json');
 for(const split of decisions.join){assert.equal(clean(split),split.replace('-',''));assert.equal(clean(split.toUpperCase()),split.replace('-','').toUpperCase());assert.equal(clean(split.replace('-','-\n ')),split.replace('-',''));}
});
test('genuine compounds, ranges and diagnostic abbreviations retain their hyphens',()=>{
 for(const text of [...require('../tools/ama-build/hyphen-decisions.json').preserveReviewed,'long-term','well-documented','whole-person','day-to-day','follow-up','A-E','A-P','G-E','BEHAV-EMOT','x-ray','beta-thalassemias','trimethoprim-sulfamethoxazole'])assert.equal(clean(text),text);
});
test('a split inside a genuine compound is repaired without removing the compound boundary',()=>{
 assert.equal(clean('state-sup-ported; weight-bear-ing; hemoglobin-bind-ing'),'state-supported; weight-bearing; hemoglobin-binding');
 assert.equal(clean('Moderate palpa-tory findings, consistently docu-mented, and sup-ported by observed abnormalities'),'Moderate palpatory findings, consistently documented, and supported by observed abnormalities');
 assert.equal(clean('palpa\u2010tory docu\u00admented'),'palpatory documented');
});
test('the compressed search index contains the same repaired sentence as the public table',()=>{
 const path=require('node:path'),zlib=require('node:zlib'),root=path.dirname(require.resolve('../ama/ama.js')),index=JSON.parse(fs.readFileSync(path.join(root,'fast/index.json'),'utf8'));
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'..',index.search))));const page=data.find(c=>c.id==='c15').pages.find(p=>p.page===408);
 assert.match(page.text,/Moderate palpatory findings, consistently documented, and supported by observed abnormalities/);assert.doesNotMatch(page.text,/palpa-tory|docu-mented|sup-ported/);
});
