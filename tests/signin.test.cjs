const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const client=fs.readFileSync(path.join(__dirname,'../sync/client.js'),'utf8');
function mount(signInWithPopup){
 const nodes=new Map(),listeners=new Map();let status={phase:'guest',user:null,pending:0,error:null};
 const document={createElement(){return {dataset:{},setAttribute(){}}},body:{append(){}},getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)}};
 const sync={status:()=>status,error(message){status={...status,phase:'error',error:message};listeners.get('scholar-sync-status')()}};
 const context={document,window:{addEventListener:(name,fn)=>listeners.set(name,fn)},sync,signingIn:false,accountReady:true,auth:{},A:{GoogleAuthProvider:class{},signInWithPopup}};
 vm.createContext(context);vm.runInContext(client.slice(client.indexOf('function mount()'),client.indexOf('function prepareApps()'))+';mount();',context);
 return {nodes,click:()=>nodes.get('cloud-signin').onclick(),context};
}
test('blocked sign-in reports actionable Safari instructions visibly and permits retry',async()=>{
 const h=mount(async()=>{throw Object.assign(Error('Firebase hidden detail'),{code:'auth/popup-blocked'})});await h.click();
 assert.equal(h.nodes.get('cloud-error').hidden,false);assert.match(h.nodes.get('cloud-error').textContent,/Safari.*Pop-up Windows.*Allow/);
 assert.equal(h.nodes.get('cloud-signin').disabled,false);assert.equal(h.nodes.get('cloud-signin').textContent,'Sign in');
});
test('sign-in opens within the click, shows progress, and prevents duplicate popups',async()=>{
 let release,calls=0;const h=mount(()=>{calls++;return new Promise(resolve=>release=resolve)}),pending=h.click();
 assert.equal(calls,1);assert.equal(h.nodes.get('cloud-signin').disabled,true);assert.match(h.nodes.get('cloud-status').textContent,/Google sign-in window/);
 await h.click();assert.equal(calls,1);release();await pending;assert.equal(h.nodes.get('cloud-signin').disabled,false);
});
test('missing auth and dismissed popups display the reason without trapping the button',async()=>{
 const h=mount(async()=>{throw Object.assign(Error('closed'),{code:'auth/popup-closed-by-user'})});await h.click();assert.match(h.nodes.get('cloud-error').textContent,/closed/);
 h.context.auth=null;await h.click();assert.match(h.nodes.get('cloud-error').textContent,/not loaded/);assert.equal(h.nodes.get('cloud-signin').disabled,false);
});

