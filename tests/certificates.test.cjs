const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../certificates/certificates.js');
const data=JSON.parse(fs.readFileSync(require.resolve('../certificates/templates.json'),'utf8'));
test('the 14 user templates are grouped by doctor in file order, with no case facts prefilled',()=>{
 assert.equal(C.validate(data),data);assert.equal(data.templates.length,14);
 assert.deepEqual(data.categories,['朱醫師','魏醫師','李醫師','黃醫師','宗延醫師','陳秉暉醫師']);
 assert.deepEqual(data.categories.map(category=>data.templates.filter(t=>t.category===category).length),[4,1,2,2,4,1]);
 assert.deepEqual(data.templates.map(t=>t.title),['職業傷害——繼續休養','職業傷害——已經超過合理休養期，有點工作能力，將要做工作能力評估','疑似職業病','職業病診斷書','（無標題）復健休養與適任性評估','休養','WPI','（無標題）復健休養並安排工作能力評估','（無標題）暫避免搬抬並安排工作能力評估','可以勝任某工作的診斷書','盡量避免工作壓力','今天能開WPI診斷書','今天不能開WPI診斷書','今天能開WPI診斷書']);
 // Wording the user's file has that must survive as-is, including its own punctuation.
 assert.ok(data.templates[10].body.startsWith('個案主訴因{{壓力來源}}. 導致{{身心症狀}}並已於{{就醫醫院}}就醫治療及休養, 於{{門診日期}}於本院環境職業醫學部就診. '));
 assert.ok(data.templates[6].body.includes('輔以本院職業醫學科門診病史 (含工作經歷、內容等職業史) 詢問'));
 assert.ok(data.templates[3].body.endsWith('的貢獻度可大於50%，建議可認定為職業病。'));
 for(const template of data.templates){assert.ok(C.variables(template.body).length);assert.doesNotMatch(template.body,/202[0-9]|11[123]年|3\.86|8\.5|19\.3|三軍|臺北醫院|竹南診所|店長|設計師/);assert.ok(!C.generate(template.body).includes('{{'));}
});
test('repeated variables are filled consistently and remaining values stay blank',()=>{
 const body='於{{日期}}就診，{{診斷}}。{{日期}}回診。{{比例}}%。';
 assert.deepEqual(C.variables(body),['日期','診斷','比例']);assert.equal(C.generate(body,{日期:' 113年1月2日 ',診斷:'測試診斷'}),'於113年1月2日就診，測試診斷。113年1月2日回診。＿＿＿＿%。');
 assert.equal(C.generate('{{內容}}',{內容:'$& <script> {{別的欄位}}'}),'$& <script> {{別的欄位}}');
 const visual=data.templates.find(t=>t.id==='t14');const result=C.generate(visual.body,{'校正後損傷比':'二十三'});assert.equal((result.match(/百分之二十三/g)||[]).length,2);
});
test('each blank template can be completely filled without changing its sentence structure',()=>{
 for(const template of data.templates){const fields=C.variables(template.body),values=Object.fromEntries(fields.map((key,i)=>[key,'測試值'+i]));const result=C.generate(template.body,values);assert.ok(!result.includes(C.BLANK));assert.ok(!result.includes('{{'));for(const value of Object.values(values))assert.ok(result.includes(value));}
 assert.throws(()=>C.validate({...data,templates:[data.templates[0],data.templates[0]]}));
});
