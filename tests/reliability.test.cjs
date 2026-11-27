const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'../src',name+'.js'),'utf8');
function profileFixture(){
 let state={jbpReportsV1:{baseUrl:'https://jira.example.com',context:'',queries:[],results:{keep:1},jobs:{}},jbpBoardPrefs:{daily:true,staleDays:9,futureKey:'keep'},jbpAI:{key:'secret'},'jbpSprint:https%3A%2F%2Fjira.example.com:7':{profile:{mode:'time'},snapshots:[{id:'keep'}]}},fail=false,notifyFail=false;
 const c=vm.createContext({URL,crypto:require('node:crypto').webcrypto,broadcastPrefs:async()=>{if(notifyFail)throw Error('tab closed');},chrome:{storage:{local:{get:async()=>structuredClone(state),set:async values=>{if(fail)throw Error('quota');Object.assign(state,structuredClone(values));}}}}});
 for(const name of ['reports-core','board-core','sprint-core','tools-core'])vm.runInContext(source(name),c);
 vm.runInContext("const STORE='jbpReportsV1',R=JbpReports;const empty=()=>({queries:[],results:{},jobs:{}});",c);vm.runInContext(source('tools-store'),c);
 return {state,fail:()=>fail=true,notifyFail:()=>notifyFail=true,call:async m=>{c.message=m;return vm.runInContext('toolsCommand(message)',c);}};
}
const profile=()=>({schema:'jira-board-plus/team-profile/v1',origin:'https://jira.example.com',context:'',visual:{daily:false},refinement:{types:[]},profiles:{},queries:[]});
const query=n=>({name:'Q'+n,jql:'project = A'+n,columns:['summary'],minutes:60,notify:'new',enabled:false});
test('old profile preserves omitted and future preferences; backup is previous state without secrets',async()=>{
 const f=profileFixture(),b=await f.call({op:'validate',bundle:{...profile(),visual:{daily:false,privateNotes:true}}});assert.deepEqual(Object.keys(b.visual).sort(),['daily','privateNotes']);
 await f.call({op:'import',bundle:b});assert.equal(f.state.jbpBoardPrefs.daily,false);assert.equal(f.state.jbpBoardPrefs.staleDays,9);assert.equal(f.state.jbpBoardPrefs.futureKey,'keep');
 const backup=await f.call({op:'backupExport'});assert.equal(backup.visual.daily,true);assert.equal(backup.visual.staleDays,9);assert.doesNotMatch(JSON.stringify(backup),/secret|snapshots|results/);
 await f.call({op:'import',bundle:backup});assert.equal(f.state.jbpBoardPrefs.daily,true);assert.equal(f.state.jbpBoardPrefs.privateNotes,false);assert.equal(f.state.jbpAI.key,'secret');assert.equal(f.state.jbpReportsV1.results.keep,1);
});
test('context mismatch with no queries and query overflow leave storage unchanged',async()=>{
 const f=profileFixture(),before=JSON.stringify(f.state);await assert.rejects(f.call({op:'import',bundle:{...profile(),context:'/jira'}}),/Context/);assert.equal(JSON.stringify(f.state),before);
 await assert.rejects(f.call({op:'import',bundle:{...profile(),queries:Array.from({length:31},(_,i)=>query(i))}}),/30/);assert.equal(JSON.stringify(f.state),before);
 f.state.jbpReportsV1.queries=Array.from({length:30},(_,i)=>({...query(i),id:String(i)}));const result=await f.call({op:'import',bundle:{...profile(),queries:[query(0),query(0)]}});assert.equal(result.added,0);assert.equal(f.state.jbpReportsV1.queries.length,30);
});
test('quota failure does not alter preferences or backup; notification failure reports saved state',async()=>{
 const f=profileFixture(),before=JSON.stringify(f.state);f.fail();await assert.rejects(f.call({op:'import',bundle:profile()}),/quota/);assert.equal(JSON.stringify(f.state),before);
 const g=profileFixture();g.notifyFail();const r=await g.call({op:'import',bundle:profile()});assert.ok(r.warning);assert.equal(g.state.jbpBoardPrefs.daily,false);
});
function networkFixture({badConfig=false,readFail=false,sessionFail=false}={}){
 let failSave=false;
 const state={jbpReportsV1:{baseUrl:'https://jira.example.com'},jbpNetworkConfig:badConfig?{concurrency:0,intervalMs:0}:{concurrency:1,intervalMs:100}};
 const c=vm.createContext({URL,crypto:require('node:crypto').webcrypto,isJiraPage:(u,b)=>u.startsWith(b+'/'),chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p},storage:{onChanged:{addListener(){}},local:{get:async()=>{if(readFail)throw Error('read failed');return state;},set:async v=>{if(failSave)throw Error('quota');Object.assign(state,v);}},session:{get:async()=>({}),set:async()=>{if(sessionFail)throw Error('session failed');}}}}});
 for(const name of ['network-core','connection','network-worker'])vm.runInContext(source(name),c);
 return {state,failSave:()=>failSave=true,recover:()=>{readFail=false;sessionFail=false;},active:()=>vm.runInContext('jbpBudget.active.size',c),call:m=>{c.message=m;return vm.runInContext("networkMessage(message,{id:'test',url:'chrome-extension://test/control.html'})",c);}};
}
test('invalid saved config retains budget; failed config write retains effective and saved settings',async()=>{
 const f=networkFixture({badConfig:true});const ticket=await f.call({op:'acquire',url:'https://jira.example.com/rest/api/2/search'});assert.ok(ticket.id);assert.equal(ticket.bypass,undefined);
 const g=networkFixture();g.failSave();await assert.rejects(g.call({op:'configure',config:{concurrency:6,intervalMs:900}}),/quota/);assert.equal((await g.call({op:'status'})).config.concurrency,1);assert.equal(g.state.jbpNetworkConfig.concurrency,1);
});
test('storage read failure blocks budget bypass and recovers; failed lease persistence releases slot',async()=>{
 const f=networkFixture({readFail:true});await assert.rejects(f.call({op:'acquire',url:'https://jira.example.com/rest/api/2/search'}));f.recover();assert.ok((await f.call({op:'acquire',url:'https://jira.example.com/rest/api/2/search'})).id);
 const g=networkFixture({sessionFail:true});await assert.rejects(g.call({op:'acquire',url:'https://jira.example.com/rest/api/2/search'}),/session failed/);assert.equal(g.active(),0);g.recover();assert.equal((await g.call({op:'status'})).active,0);
});
