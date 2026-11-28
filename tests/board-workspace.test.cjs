const {test}=require('node:test'),assert=require('node:assert/strict');
require('../src/board-workspace-core.js');require('../src/board-workspace-store.js');
const C=globalThis.JbpBoardWorkspaceCore;
test('personal filters preserve unknown data and explain actual exclusions',()=>{
 assert.deepEqual(C.matches({key:'DEMO-1'},{team:'Alpha'}),{visible:true,reasons:[],unknown:['Команда']});
 assert.equal(C.matches({key:'DEMO-1',team:'beta'},{team:'Alpha'}).visible,false);
 assert.equal(C.matches({key:'DEMO-1',team:'ALPHA',assignee:''},{team:'alpha',assignee:'__empty'}).visible,true);
 assert.equal(C.matches({key:'DEMO-1',summary:null},{text:'DEMO-1'}).visible,true);
 assert.equal(C.matches({key:'DEMO-1',summary:null},{text:'unknown'}).visible,true);
 assert.equal(C.matches({key:'DEMO-1',summary:'Known'},{text:'unknown'}).visible,false);
});
test('due dates include missing vs unknown and UTC day boundary',()=>{
 assert.equal(C.matches({key:'D-1',due:'2026-11-28'},{due:'overdue'},'2026-11-28').visible,false);
 assert.equal(C.matches({key:'D-1',due:'2026-11-27'},{due:'overdue'},'2026-11-28').visible,true);
 assert.equal(C.matches({key:'D-1',due:''},{due:'none'}).visible,true);
 assert.equal(C.matches({key:'D-1'},{due:'none'}).unknown.length,1);
});
test('visibility diagnostics distinguish native hiding, personal filtering and missing observations',()=>{
 const row={key:'D-1',nativeVisible:true,status:'Open',statusId:'1'};
 assert.match(C.diagnose('D-1',[row],{status:'Done'})[0],/скрыта личным/);
 assert.match(C.diagnose('D-1',[{...row,nativeVisible:false}],{status:'Done'})[0],/скрыта самой Jira/);
 assert.match(C.diagnose('D-2',[row],{})[0],/не доказывает/);
 assert.match(C.diagnose('D-1',[row],{},{columnConfig:{columns:[{statuses:[{id:'2'}]}]}})[1],/не связан/);
 assert.throws(()=>C.diagnose('../D-1',[],{}));
});
test('profiles validate limits, unique names and field order without accepting arbitrary data',()=>{
 const p=C.empty();p.context.fields=['due','status'];assert.deepEqual(C.profile(p).context.fields,['due','status']);
 assert.throws(()=>C.profile({...p,context:{enabled:true,fields:['status','status']}}));
 const v={id:'one',name:'One',filters:{status:'Open'}};
 assert.throws(()=>C.profile({...p,views:[v,{...v,id:'two',name:'ONE'}]}));
 assert.throws(()=>C.profile({...p,active:'deleted'}));
 assert.throws(()=>C.filters({due:'yesterday'}));
 assert.throws(()=>C.filters({text:'x'.repeat(201)}));
 assert.equal(C.profile({...p,secret:'drop'}).secret,undefined);
});
test('store isolates accounts/boards/context paths, preserves old preferences and rejects stale or failed writes',async()=>{
 const base='https://jira.example/jira',data={jbpBoardPrefs:{daily:true,unknownSetting:42},jbpAI:{key:'secret'}};
 globalThis.chrome={runtime:{id:'extension'},storage:{local:{get:async key=>({[key]:data[key]}),set:async patch=>Object.assign(data,structuredClone(patch))}}};
 const sender={id:'extension',frameId:0,tab:{id:1},url:base+'/secure/RapidBoard.jspa?rapidView=7'};
 const tx=fn=>fn(chrome.storage.local),call=m=>JbpBoardWorkspaceStore.handle({board:'7',account:'alice',...m},sender,base,tx);
 const original=JSON.stringify(data),p=await call({op:'get'});assert.equal(JSON.stringify(data),original,'reading must not migrate or write');
 const next=await call({op:'set',revision:0,value:{...p,context:{enabled:true,fields:['status']}}});assert.equal(next.revision,1);
 await assert.rejects(call({op:'set',revision:0,value:p}),/другой вкладке/);
 assert.equal((await call({op:'get',account:'bob'})).context.enabled,false);
 assert.deepEqual(data.jbpBoardPrefs,{daily:true,unknownSetting:42});assert.equal(data.jbpAI.key,'secret');
 assert.notEqual(C.storageKey(base,'alice','7'),C.storageKey(base,'alice','8'));
 assert.notEqual(C.storageKey(base,'alice','7'),C.storageKey('https://jira.example','alice','7'));
 const saved=JSON.stringify(data);chrome.storage.local.set=async()=>{throw Error('quota');};
 await assert.rejects(call({op:'set',revision:1,value:p}),/quota/);assert.equal(JSON.stringify(data),saved);
 for(const invalid of [{...sender,frameId:1},{...sender,url:'https://evil.example/secure/RapidBoard.jspa?rapidView=7'},{...sender,url:base+'/secure/RapidBoard.jspa?rapidView=8'}])await assert.rejects(JbpBoardWorkspaceStore.handle({op:'get',board:'7',account:'alice'},invalid,base,tx));
 await assert.rejects(call({op:'get',account:''}));
});
