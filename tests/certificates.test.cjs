const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../certificates/certificates.js');
const data=JSON.parse(fs.readFileSync(require.resolve('../certificates/templates.json'),'utf8'));
test('all 15 user templates are grouped by purpose with no case facts prefilled',()=>{
 assert.equal(C.validate(data),data);assert.equal(data.templates.length,15);
 assert.deepEqual(data.categories,['復工','休養','工作限制','職業病','勞動能力減損']);
 assert.deepEqual(data.categories.map(category=>data.templates.filter(t=>t.category===category).length),[3,3,2,2,5]);
 for(const template of data.templates){assert.ok(C.variables(template.body).length);assert.doesNotMatch(template.body,/202[0-9]|11[123]年|3\.86|8\.5|19\.3|三軍|臺北醫院|竹南診所|店長|設計師/);assert.ok(!C.generate(template.body).includes('{{'));}
});
test('repeated variables are filled consistently and remaining values stay blank',()=>{
 const body='於{{日期}}就診，{{診斷}}。{{日期}}回診。{{比例}}%。';
 assert.deepEqual(C.variables(body),['日期','診斷','比例']);assert.equal(C.generate(body,{日期:' 113年1月2日 ',診斷:'測試診斷'}),'於113年1月2日就診，測試診斷。113年1月2日回診。＿＿＿＿%。');
 assert.equal(C.generate('{{內容}}',{內容:'$& <script> {{別的欄位}}'}),'$& <script> {{別的欄位}}');
 const visual=data.templates.find(t=>t.id==='impairment-visual');const result=C.generate(visual.body,{'加州調整百分比':'23'});assert.equal((result.match(/百分之23/g)||[]).length,2);
});
test('each blank template can be completely filled without changing its sentence structure',()=>{
 for(const template of data.templates){const fields=C.variables(template.body),values=Object.fromEntries(fields.map((key,i)=>[key,'測試值'+i]));const result=C.generate(template.body,values);assert.ok(!result.includes(C.BLANK));assert.ok(!result.includes('{{'));for(const value of Object.values(values))assert.ok(result.includes(value));}
 assert.throws(()=>C.validate({...data,templates:[data.templates[0],data.templates[0]]}));
});
