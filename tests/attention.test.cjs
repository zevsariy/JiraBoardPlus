const {test}=require('node:test'),assert=require('node:assert/strict');require('../src/attention-core.js');require('../src/attention-worker.js');const C=JbpAttention,W=JbpAttentionWorker;
const pin={op:'pin',key:'D-1',values:{summary:'Title',status:'Open'}};
test('queue isolates scopes and retains data across edits, completion and stale writes',()=>{
 const a=C.change({future:true},pin,100,()=> 'id');assert.equal(a.future,true);assert.deepEqual(C.changes(a.items[0]),[]);assert.equal(C.change(a,pin),a);
 const b=C.change(a,{op:'edit',key:'D-1',revision:1,state:'waiting',note:'Private',remindAt:200},100);assert.equal(b.items[0].notifiedAt,null);
 assert.throws(()=>C.change(b,{op:'remove',key:'D-1',revision:1}));assert.equal(a.items[0].note,'');
 const c=C.change(b,{op:'edit',key:'D-1',revision:2,state:'done',note:'Private',remindAt:200},100);assert.equal(c.items[0].remindAt,null);
 assert.notEqual(C.key('https://jira.example','a'),C.key('https://jira.example','b'));assert.notEqual(C.key('https://jira.example/jira','a'),C.key('https://jira.example','a'));
 assert.throws(()=>C.change(a,{...pin,key:'D-1) OR x'}));assert.throws(()=>C.key('x',''));assert.throws(()=>C.change(a,{op:'edit',key:'D-1',revision:1,state:'later',note:'',remindAt:NaN}));
 assert.throws(()=>C.change({items:Array.from({length:100},(_,i)=>({key:'X-'+i}))},pin),/100/);
});
test('diffs compare known fields only, baseline acknowledgement and stale page protection',()=>{
 let x=C.change({},pin,100,()=> 'id').items[0];x=C.observe(x,{status:'Done',assignee:'Alice'},200,'jira');assert.deepEqual(C.changes(x).map(d=>d.field),['status']);
 x=C.observe(x,{status:'Open'},300,'page');assert.equal(x.latest.status,'Done');assert.equal(x.fieldAt.status.at,200);
 x=C.change({items:[x]},{op:'seen',key:'D-1',revision:x.revision},400).items[0];assert.deepEqual(C.changes(x),[]);
 assert.deepEqual(C.fromIssue({fields:{assignee:null,duedate:null}}),{assignee:'',duedate:''});assert.deepEqual(C.fromIssue({fields:{}}),{});
});
function harness(){const base='https://jira.example/jira',key=C.key(base,'alice'),all={jbpReportsV1:{baseUrl:base},jbpBoardPrefs:{daily:true},jbpComposer:{keep:true}},alarms=new Map(),notices=[],calls=[],replies=[];let fail=false;
 const raw={get:async()=>structuredClone(all),set:async v=>{if(fail)throw Error('Disk full');Object.assign(all,structuredClone(v));}};let chain=Promise.resolve();const tx=fn=>{const next=chain.catch(()=>{}).then(()=>fn({set:raw.set}));chain=next;return next;};
 global.chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p},storage:{local:raw},alarms:{create:async(k,v)=>alarms.set(k,v),clear:async k=>alarms.delete(k)},notifications:{create:async(k,v)=>notices.push({k,v})},tabs:{create:async()=>{}}};global.JbpConnection={from:s=>s||{}};
 global.JbpNetwork={fetch:async(url,options)=>{calls.push({url,options});const r=replies.shift();if(r instanceof Error)throw r;return new Response(JSON.stringify(r?.body??r),{status:r?.status||200,headers:{'Content-Type':'application/json'}});}};
 const sender={id:'ext',url:'chrome-extension://ext/attention.html'},call=m=>W.handle({account:'alice',...m},sender,base,tx);
 return {base,key,all,alarms,notices,calls,replies,raw,tx,call,fail:v=>{fail=v;}};
}
test('reminders are local, restart-safe, one delivery, completion and failure preserve data',async()=>{
 const h=harness();await h.call(pin);let x=h.all[h.key].items[0];await h.call({op:'edit',key:x.key,revision:x.revision,state:'later',note:'Secret',remindAt:Date.now()-1000});assert.ok(h.alarms.has(W.alarm));
 h.alarms.clear();await W.schedule(h.base);assert.ok(h.alarms.has(W.alarm),'startup restores alarm');
 await Promise.all([W.fire(h.base,h.tx),W.fire(h.base,h.tx)]);assert.equal(h.notices.length,1);assert.equal(h.alarms.size,0);assert.ok(!JSON.stringify(h.notices).includes('Secret'));assert.equal(h.calls.length,0);
 x=h.all[h.key].items[0];await h.call({op:'edit',key:x.key,revision:x.revision,state:'later',note:'Secret',remindAt:Date.now()-1});h.fail(true);await assert.rejects(W.fire(h.base,h.tx),/Disk full/);assert.equal(h.notices.length,1);h.fail(false);await W.fire(h.base,h.tx);assert.equal(h.notices.length,2);
 assert.deepEqual(h.all.jbpBoardPrefs,{daily:true});assert.deepEqual(h.all.jbpComposer,{keep:true});
});
test('manual refresh uses two bounded calls, verifies account, preserves missing issues and errors',async()=>{
 const h=harness();await h.call(pin);await h.call({...pin,key:'D-2'});assert.equal(h.calls.length,0);h.replies.push({name:'bob'});await assert.rejects(h.call({op:'refresh',keys:['D-1']}),/другая/);assert.equal(h.calls.length,1);
 h.replies.push({name:'alice'},{startAt:0,total:1,issues:[{key:'D-1',fields:{status:{name:'Done'},assignee:null}}]});await h.call({op:'refresh',keys:['D-1','D-2']});assert.equal(h.calls.length,3);const request=JSON.parse(h.calls[2].options.body);assert.equal(request.jql,'key in (D-1,D-2)');assert.equal(request.maxResults,50);assert.ok(!request.fields.includes('comment'));assert.ok(!request.expand);
 assert.equal(C.changes(h.all[h.key].items[0])[0].after,'Done');assert.match(h.all[h.key].items[1].error,/отсутствует/);assert.equal(h.all[h.key].items[1].latest.summary,'Title');
 const before=structuredClone(h.all[h.key]);h.replies.push({name:'alice'},{total:2,issues:[{key:'D-1',fields:{}}]});await assert.rejects(h.call({op:'refresh',keys:['D-1','D-2']}),/неполную/);assert.deepEqual(h.all[h.key],before);
 h.replies.push({name:'alice'},{status:429,body:{}});await assert.rejects(h.call({op:'refresh',keys:['D-1']}),/429/);assert.deepEqual(h.all[h.key],before);
 await assert.rejects(W.handle({op:'get',account:'alice'},{id:'ext',frameId:0,tab:{id:1},url:'https://jira.example/other/'},h.base,h.tx),/Недопустимая/);
});
test('refresh skips concurrently edited/deleted records and rejects changed connection',async()=>{
 const h=harness();await h.call(pin);let release;global.JbpNetwork.fetch=async url=>{if(url.endsWith('myself'))return new Response('{"name":"alice"}',{headers:{'Content-Type':'application/json'}});await new Promise(r=>{release=r;});return new Response('{"total":1,"issues":[{"key":"D-1","fields":{"status":{"name":"Done"}}}]}',{headers:{'Content-Type':'application/json'}});};
 const pending=h.call({op:'refresh',keys:['D-1']});while(!release)await new Promise(r=>setImmediate(r));await assert.rejects(h.call({op:'refresh',keys:['D-1']}),/выполняется/);
 await h.call({op:'edit',key:'D-1',revision:1,state:'waiting',note:'Keep',remindAt:null});release();const result=await pending;assert.match(result.notice,/пропущены/);assert.equal(result.items[0].note,'Keep');assert.equal(result.items[0].latest.status,'Open');
 release=null;const next=h.call({op:'refresh',keys:['D-1']});while(!release)await new Promise(r=>setImmediate(r));h.all.jbpReportsV1.baseUrl='https://other.example';release();await assert.rejects(next,/Подключение изменилось/);
});
