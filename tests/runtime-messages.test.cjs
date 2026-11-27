const {test}=require('node:test'),assert=require('node:assert/strict');require('../src/runtime-messages.js');
const closed=()=>Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received');
test('message reads retry once; writes and AI calls never replay; invalidated contexts give actionable error',async()=>{
 let calls=0;assert.deepEqual(await JbpMessaging.request({type:'boardPrefsGet'},async()=>{if(++calls===1)throw closed();return {ok:true};}),{ok:true});assert.equal(calls,2);
 for(const m of [{type:'boardPrefsSet'},{type:'sprintStore',op:'snapshotAdd'},{type:'aiAnalyze'},{type:'run'}]){calls=0;await assert.rejects(JbpMessaging.request(m,async()=>{calls++;throw closed();}),/Результат операции неизвестен/);assert.equal(calls,1);}
 calls=0;await assert.rejects(JbpMessaging.request({type:'connectionGet'},async()=>{calls++;throw Error('Extension context invalidated.');}),/Обновите вкладку/);assert.equal(calls,1);
});
test('parallel settings reads share one in-flight request and failures do not poison subsequent reads',async()=>{
 let calls=0,release;const runtime={sendMessage:()=>{calls++;return new Promise(r=>release=r);}};JbpMessaging.install(runtime);const a=runtime.sendMessage({type:'boardPrefsGet'}),b=runtime.sendMessage({type:'boardPrefsGet'});assert.equal(calls,1);release({ok:true});assert.deepEqual(await a,await b);runtime.sendMessage({type:'boardPrefsGet'});assert.equal(calls,2);release({ok:true});
});
