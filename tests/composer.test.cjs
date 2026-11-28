const {test}=require('node:test'),assert=require('node:assert/strict');
require('../src/composer-core.js');require('../src/composer-store.js');const C=JbpComposer;
const draft={op:'draftPut',id:'a',revision:0,context:'D-1',field:'comment',original:'',text:'draft'};
test('drafts persist independent editor copies and preserve unrelated profile properties',()=>{
 const a=C.change({unknown:true},draft,100),b=C.change(a,{...draft,id:'b',text:'other'},200);
 assert.equal(b.drafts.length,2);assert.equal(b.unknown,true);assert.equal(a.drafts.length,1);
 assert.throws(()=>C.change(b,{...draft,text:'stale'}),/другой вкладке/);
 const c=C.change(b,{...draft,revision:1,text:'latest'});assert.equal(c.drafts[0].revision,2);
 assert.equal(C.change(c,{op:'draftDelete',id:'a',revision:2}).drafts[0].text,'other');
});
test('templates validate and update without touching drafts or allowing lost updates',()=>{
 const m={op:'templatePut',id:'t',revision:0,name:'Bug',summary:'Title',description:'Steps',comment:''};
 const s=C.change(C.change({},draft),m);assert.equal(s.templates[0].name,'Bug');assert.equal(s.drafts.length,1);
 assert.throws(()=>C.change(s,m));assert.throws(()=>C.change({}, {...m,name:''}));
 assert.throws(()=>C.change({}, {...draft,text:'x'.repeat(100001)}));
 assert.throws(()=>C.change({}, {...draft,field:'password'}));
 assert.throws(()=>C.change({drafts:Array.from({length:100},(_,i)=>({id:String(i)}))},draft),/лимит/);
 assert.notEqual(C.key('https://jira.example','alice'),C.key('https://jira.example','bob'));
 assert.notEqual(C.key('https://jira.example/jira','alice'),C.key('https://jira.example','alice'));
});
test('store isolates configured server/account, authorizes sender and commits under transaction',async()=>{
 const all={jbpBoardPrefs:{daily:true},jbpReportsV1:{baseUrl:'https://jira.example/jira'}},raw={get:async k=>({[k]:all[k]}),set:async v=>Object.assign(all,v)};
 global.chrome={runtime:{id:'extension'},storage:{local:raw}};
 const sender={id:'extension',tab:{id:1},frameId:0,url:'https://jira.example/jira/browse/D-1'};let locks=0;
 const call=(m,s=sender)=>JbpComposerStore.handle({account:'alice',...m},s,'https://jira.example/jira',async fn=>{locks++;return fn(raw);});
 await call(draft);assert.equal(locks,1);assert.equal((await call({op:'get'})).drafts[0].text,'draft');
 assert.deepEqual(all.jbpBoardPrefs,{daily:true});assert.deepEqual((await call({op:'get',account:'bob'})).drafts,[]);
 for(const s of [{...sender,url:'https://evil.example/jira/'},{...sender,url:'https://jira.example/jira-other/'},{...sender,frameId:1},{...sender,id:'foreign'}])await assert.rejects(call(draft,s));
 raw.set=async()=>{throw Error('disk unavailable');};await assert.rejects(call({...draft,id:'b'}),/disk unavailable/);assert.equal((await call({op:'get'})).drafts.length,1);
});
