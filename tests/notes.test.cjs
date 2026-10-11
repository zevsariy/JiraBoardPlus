const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
require('../src/notes-core.js');const N=JbpNotes;
test('private notes CRUD preserves timestamps, rejects stale edits/deletes, limits size and scopes by server',()=>{
 let state=N.change(null,{op:'create',text:'  First  '},10,()=> 'one');assert.equal(state.notes[0].text,'First');
 state=N.change(state,{op:'update',id:'one',revision:1,text:'Next'},20);assert.equal(state.notes[0].createdAt,10);assert.equal(state.notes[0].updatedAt,20);
 assert.throws(()=>N.change(state,{op:'update',id:'one',revision:1,text:'Lost'}),/другой вкладке/);assert.throws(()=>N.change(state,{op:'delete',id:'one',revision:1}),/другой вкладке/);
 assert.equal(N.change(state,{op:'delete',id:'one',revision:2}).notes.length,0);assert.equal(state.notes.length,1);
 assert.throws(()=>N.change(null,{op:'create',text:' '}));assert.throws(()=>N.change(null,{op:'create',text:'x'.repeat(20001)}));assert.throws(()=>N.storageKey('https://jira.example.com','../secret'));
 assert.notEqual(N.storageKey('https://jira.example.com','DEMO-1'),N.storageKey('https://jira.example.com/jira','DEMO-1'));
});
test('worker stores notes locally, shares across views, isolates servers and refuses disabled or foreign callers',async()=>{
 let handler;const state={jbpReportsV1:{baseUrl:'https://jira.example.com/jira',project:'DEMO',queries:[],results:{},jobs:{},context:'/jira'},jbpBoardPrefs:{privateNotes:true,visuals:true}};let network=0;const broadcasts=[];
 const event={addListener(){}};const ctx=vm.createContext({console,URL,AbortSignal,crypto:require('node:crypto').webcrypto,setTimeout,fetch:async()=>{network++;throw Error('Network forbidden');},chrome:{storage:{local:{get:async()=>structuredClone(state),set:async v=>Object.assign(state,structuredClone(v)),setAccessLevel:async()=>{}}},runtime:{id:'test',getURL:f=>'chrome-extension://test/'+f,onMessage:{addListener:f=>handler=f},onInstalled:event,onStartup:event},alarms:{get:async()=>({}),create:async()=>{},onAlarm:event},notifications:{onClicked:event},tabs:{query:async()=>[{id:1,url:'https://jira.example.com/jira/browse/DEMO-1'}],sendMessage:async(id,m)=>broadcasts.push(m)}}});
 ctx.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),ctx));vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/background.js'),'utf8'),ctx);
 const call=(op,body={},url='https://jira.example.com/jira/secure/RapidBoard.jspa?view=work')=>new Promise(resolve=>handler({type:'privateNotes',issueKey:'DEMO-1',op,...body},{id:'test',url},resolve));
 let r=await call('create',{text:'Private <img src=x onerror=alert(1)>'});assert.equal(r.ok,true);const note=r.data.notes[0];
 r=await call('list',{},'https://jira.example.com/jira/browse/DEMO-1');assert.equal(r.data.notes[0].id,note.id);
 const [a,b]=await Promise.all([call('update',{id:note.id,revision:1,text:'First edit'}),call('update',{id:note.id,revision:1,text:'Conflicting edit'})]);assert.equal(a.ok,true);assert.equal(b.ok,false);
 assert.equal((await call('list',{},'https://evil.example/jira/browse/DEMO-1')).ok,false);assert.equal((await call('list',{},'https://jira.example.com/other/browse/DEMO-1')).ok,false);
 state.jbpBoardPrefs.privateNotes=false;assert.equal((await call('list')).ok,false);state.jbpBoardPrefs.privateNotes=true;assert.equal((await call('list')).data.notes[0].text,'First edit');
 state.jbpReportsV1.baseUrl='https://jira-two.example';assert.equal((await call('list',{},'https://jira-two.example/browse/DEMO-1')).data.notes.length,0);state.jbpReportsV1.baseUrl='https://jira.example.com/jira';
 const exported=await vm.runInContext("toolsCommand({op:'export'})",ctx);assert.equal(JSON.stringify(exported).includes('First edit'),false);assert.equal(exported.privateNotes,undefined);
 r=await call('delete',{id:note.id,revision:2});assert.equal(r.data.notes.length,0);assert.equal(network,0);assert.ok(broadcasts.every(m=>!JSON.stringify(m).includes('Private')&&!JSON.stringify(m).includes('First edit')));
});
