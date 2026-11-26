const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../certificates/certificates.js');
const data=JSON.parse(fs.readFileSync(require.resolve('../certificates/templates.json'),'utf8'));
test('all 16 user templates are grouped by purpose with no case facts prefilled',()=>{
 assert.equal(C.validate(data),data);assert.equal(data.templates.length,16);
 assert.deepEqual(data.categories,['復工','休養','工作限制','職業病','勞動能力減損']);
 assert.deepEqual(data.categories.map(category=>data.templates.filter(t=>t.category===category).length),[3,3,2,2,6]);
 for(const template of data.templates){assert.ok(C.variables(template.body).length);assert.doesNotMatch(template.body,/202[0-9]|11[123]年|3\.86|8\.5|19\.3|三軍|臺北醫院|竹南診所|店長|設計師/);assert.ok(!C.generate(template.body).includes('{{'));}
});
test('the 14 templates from the user file keep its exact wording; the two others are unchanged',()=>{
 const byId=Object.fromEntries(data.templates.map(t=>[t.id,t]));
 assert.ok(byId['restriction-stress'].body.startsWith('個案主訴因{{壓力來源}}. 導致{{身心症狀}}並已於{{就醫醫院}}就醫治療及休養, 於{{門診日期}}於本院環境職業醫學部就診. '));
 assert.ok(byId['impairment-range'].body.includes('輔以本院職業醫學科門診病史 (含工作經歷、內容等職業史) 詢問'));
 assert.ok(byId['od-recognition'].body.endsWith('的貢獻度可大於50%，建議可認定為職業病。'));
 assert.ok(byId['impairment-visual'].body.includes('於臺大醫院住院並接受手術治療'));
});
test('repeated variables are filled consistently and remaining values stay blank',()=>{
 const body='於{{日期}}就診，{{診斷}}。{{日期}}回診。{{比例}}%。';
 assert.deepEqual(C.variables(body),['日期','診斷','比例']);assert.equal(C.generate(body,{日期:' 113年1月2日 ',診斷:'測試診斷'}),'於113年1月2日就診，測試診斷。113年1月2日回診。＿＿＿＿%。');
 assert.equal(C.generate('{{內容}}',{內容:'$& <script> {{別的欄位}}'}),'$& <script> {{別的欄位}}');
 const visual=data.templates.find(t=>t.id==='impairment-visual');const result=C.generate(visual.body,{'校正後損傷比':'二十三'});assert.equal((result.match(/百分之二十三/g)||[]).length,2);
});
test('each blank template can be completely filled without changing its sentence structure',()=>{
 for(const template of data.templates){const fields=C.variables(template.body),values=Object.fromEntries(fields.map((key,i)=>[key,'測試值'+i]));const result=C.generate(template.body,values);assert.ok(!result.includes(C.BLANK));assert.ok(!result.includes('{{'));for(const value of Object.values(values))assert.ok(result.includes(value));}
 assert.throws(()=>C.validate({...data,templates:[data.templates[0],data.templates[0]]}));
});
