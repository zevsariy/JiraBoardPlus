const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('../src/ai-core.js');
test('AI endpoint restricts insecure destinations and preserves custom API paths',()=>{
 assert.equal(JbpAI.endpoint('https://llm.example/v1/'),'https://llm.example/v1/chat/completions');assert.equal(JbpAI.endpoint('http://localhost:1234/v1/chat/completions'),'http://localhost:1234/v1/chat/completions');
 for(const u of ['http://remote/v1','https://user:pass@llm/v1','https://llm/v1?key=secret','file:///tmp/model'])assert.throws(()=>JbpAI.endpoint(u));
 assert.equal(JbpAI.config({enabled:false},{key:'secret'}).key,'secret');assert.equal(JbpAI.config({clearKey:true},{key:'secret'}).key,'');assert.throws(()=>JbpAI.config({enabled:true}));
});
test('AI worker guards sender, secrets, toggles, failures and cancellation; requests are explicit',async()=>{
 const state={jbpAI:{enabled:true,board:true,sprint:true,endpoint:'https://llm.example/v1',model:'demo',key:'secret',prompt:'Custom'},jbpBoardPrefs:{visuals:true}};let calls=[];let fetchImpl=async(u,o)=>{calls.push({u,o});return new Response(JSON.stringify({choices:[{message:{content:'Analysis'}}]}));};
 const ctx=vm.createContext({URL,AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout,Response,fetch:(...a)=>fetchImpl(...a),read:async()=>({baseUrl:'https://jira.example'}),request:async(base,path,body)=>({total:1,issues:[{key:'DEMO-1',fields:{summary:'Task',status:{name:'Blocked'},description:'PRIVATE DESCRIPTION',timeoriginalestimate:7200,issuelinks:[{type:{inward:'is blocked by'},inwardIssue:{key:'DEMO-2',fields:{status:{name:'Done'}}}}]}}]}),isJiraPage:(u,b)=>u.startsWith(b+'/'),JbpConnection:{from:x=>x},JbpBoard:{defaults:{visuals:true}},chrome:{runtime:{id:'test',getURL:f=>'chrome-extension://test/'+f},permissions:{contains:async()=>true},storage:{local:{get:async()=>structuredClone(state),set:async v=>Object.assign(state,v)}}}});
 for(const f of ['ai-core.js','ai-worker.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src',f),'utf8'),ctx);
 const native={id:'test',tab:{id:1},url:'https://jira.example/browse/DEMO-1'},settings={id:'test',url:'chrome-extension://test/settings.html'};
 const call=(m,s=native)=>ctx.aiMessage(m,s);
 const info=await call({type:'aiGet'});assert.equal(info.key,undefined);assert.equal(info.hasKey,true);assert.equal(calls.length,0);
 await assert.rejects(call({type:'aiSave',config:{} }));await assert.rejects(call({type:'aiGet'},{id:'evil',url:native.url}));
 const board=await call({type:'aiBoardData',keys:['DEMO-1']});assert.equal(board.issues[0].originalEstimateHours,2);assert.equal(board.issues[0].blockers[0].status,'Done');assert.equal(JSON.stringify(board).includes('PRIVATE DESCRIPTION'),false);await assert.rejects(call({type:'aiBoardData',keys:['DEMO-1) OR project=OTHER']}));
 const msg={type:'aiAnalyze',scope:'sprint',id:'1',destination:{endpoint:'https://llm.example/v1',model:'demo'},payload:'{"issues":[]}'};
 assert.equal((await call(msg)).text,'Analysis');await assert.rejects(call({...msg,destination:{endpoint:'https://different.example',model:'demo'}}),/изменилось/);const req=calls[0];assert.equal(req.o.credentials,'omit');assert.equal(req.o.redirect,'error');assert.equal(req.o.headers.Authorization,'Bearer secret');assert.equal(JSON.parse(req.o.body).messages[0].content,'Custom');
 const roadmap={id:'test',url:'chrome-extension://test/roadmap.html'};await call({type:'aiGet'},roadmap);await assert.rejects(call({...msg,scope:'roadmap'},roadmap));state.jbpAI.roadmap=true;assert.equal((await call({...msg,scope:'roadmap',payload:'{"mode":"roadmap"}'},roadmap)).text,'Analysis');assert.match(JSON.parse(calls.at(-1).o.body).messages[1].content,/Due Date/);await assert.rejects(call({...msg,scope:'roadmap'}));
 state.jbpAI.enabled=false;await assert.rejects(call(msg));state.jbpAI.enabled=true;state.jbpBoardPrefs.visuals=false;await assert.rejects(call(msg));state.jbpBoardPrefs.visuals=true;
 fetchImpl=async()=>new Response('secret diagnostic',{status:401});await assert.rejects(call(msg),e=>e.message.includes('401')&&!e.message.includes('secret'));
 fetchImpl=async(u,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('abort'))));const pending=call(msg);await new Promise(r=>setTimeout(r,10));await call({type:'aiCancel',id:'1'});await assert.rejects(pending,/120/);
 await call({type:'aiSave',config:{enabled:false,clearKey:true}},settings);assert.equal(state.jbpAI.key,'');
});
