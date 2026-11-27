const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root='https://jira.example.com',sprint='jbpSprint:'+encodeURIComponent(root)+':7';
const query=n=>({name:'Q'+n,jql:'project = DEMO'+n,columns:['summary'],minutes:60,notify:'new',enabled:true,id:'q'+n});
function fixture(){
 let state={jbpReportsV1:{baseUrl:root,context:'',project:'DEMO',queries:[query(1)],results:{q1:{rows:['keep']}},jobs:{q1:{startAt:1}}},jbpBoardPrefs:{daily:true,staleDays:9,future:'keep'},jbpAI:{key:'secret',enabled:true,endpoint:'https://model.example/v1/chat/completions',model:'old',board:true},jbpNetworkConfig:{concurrency:2,intervalMs:500},jbpTheme:'dark',[sprint]:{profile:{mode:'time',includeSubtasks:true},snapshots:[{id:'keep'}]},jbpPrivateNotes:{text:'keep'},jbpControlV1:{snapshots:[{id:'keep'}],reviewed:{keep:true},config:{baseUrl:root,jql:'project = DEMO'}},jbpRestoreBackup:{old:true}},session={},fail=false,permission=true;
 const lockQueues=new Map(),locks={request(name,fn){const p=(lockQueues.get(name)||Promise.resolve()).catch(()=>{}).then(fn);lockQueues.set(name,p);return p;}};
 const set=async values=>{if(fail)throw Error('quota');Object.assign(state,structuredClone(values));};
 const c=vm.createContext({URL,TextEncoder,crypto:require('node:crypto').webcrypto,navigator:{locks},serial:fn=>locks.request('serial',fn),JbpStorage:{transaction:fn=>locks.request('jbp-storage-commit',()=>fn({set}))},scheduleNext:async()=>{},syncContent:async()=>{},broadcastPrefs:async()=>{},chrome:{runtime:{id:'fixture',getURL:p=>'chrome-extension://fixture/'+p},permissions:{contains:async()=>permission},storage:{local:{get:async keys=>keys===null?structuredClone(state):Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in state).map(k=>[k,structuredClone(state[k])]))},session:{get:async key=>({[key]:structuredClone(session[key])}),set:async values=>Object.assign(session,structuredClone(values)),remove:async key=>delete session[key]}}}});
 for(const n of ['connection','network-core','reports-core','board-core','sprint-core','tools-core','ai-core','control-core','roadmap-core','analytics-core','restore-core','restore-worker'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/'+n+'.js'),'utf8'),c);
 return {state,c,fail:()=>fail=true,deny:()=>permission=false,call:(op,extra={},tab=1)=>c.restoreMessage({op,...extra},{id:'fixture',url:'chrome-extension://fixture/restore.html',tab:{id:tab}}),archive:data=>({schema:'jira-board-plus/settings-archive/v1',baseUrl:root,data})};
}
test('restore applies only selected settings, preserving secrets, reports, snapshots and unknown keys',async()=>{
 const f=fixture(),before=structuredClone(f.state),plan=await f.call('inspect',{archive:f.archive({jbpBoardPrefs:{daily:false},jbpTheme:'light',[sprint]:{profile:{mode:'points',spField:'customfield_3'},snapshots:[{id:'overwrite'}]},jbpAI:{enabled:true,endpoint:'https://other.example/v1',model:'new',key:'injected'}})});
 assert.doesNotMatch(JSON.stringify(plan),/secret|injected/);assert.equal(plan.rows.find(r=>r.id==='jbpAI').after.enabled,false);
 await f.call('apply',{token:plan.token,selected:['jbpBoardPrefs',sprint]});assert.equal(f.state.jbpBoardPrefs.daily,false);assert.equal(f.state.jbpBoardPrefs.future,'keep');assert.equal(f.state.jbpBoardPrefs.staleDays,9);assert.equal(f.state.jbpTheme,'dark');assert.deepEqual(f.state.jbpAI,before.jbpAI);assert.deepEqual(f.state[sprint].snapshots,before[sprint].snapshots);assert.deepEqual(f.state.jbpReportsV1,before.jbpReportsV1);assert.doesNotMatch(JSON.stringify(f.state.jbpRestoreBackup),/secret|injected|"rows":|"snapshots":/);
 const rollback=await f.call('inspect',{archive:await f.call('backup')});await f.call('apply',{token:rollback.token,selected:['jbpBoardPrefs',sprint]});assert.equal(f.state.jbpBoardPrefs.daily,true);assert.equal(f.state[sprint].profile.mode,'time');
});
test('stale selected settings cancel entire apply; changes outside selection survive',async()=>{
 const f=fixture(),archive=f.archive({jbpBoardPrefs:{daily:false},jbpTheme:'light'}),p=await f.call('inspect',{archive});f.state.jbpBoardPrefs.daily=false;const before=JSON.stringify(f.state);await assert.rejects(f.call('apply',{token:p.token,selected:['jbpBoardPrefs','jbpTheme']}),/изменился/);assert.equal(JSON.stringify(f.state),before);
 const q=await f.call('inspect',{archive});f.state.jbpBoardPrefs.staleDays=12;await f.call('apply',{token:q.token,selected:['jbpTheme']});assert.equal(f.state.jbpBoardPrefs.staleDays,12);assert.equal(f.state.jbpTheme,'light');
});
test('failed write leaves previous backup and all settings intact; preview cannot be replayed',async()=>{
 const f=fixture(),p=await f.call('inspect',{archive:f.archive({jbpTheme:'light'})}),before=JSON.stringify(f.state);f.fail();await assert.rejects(f.call('apply',{token:p.token,selected:['jbpTheme']}),/quota/);assert.equal(JSON.stringify(f.state),before);
 const g=fixture(),q=await g.call('inspect',{archive:g.archive({jbpTheme:'light'})});await g.call('apply',{token:q.token,selected:['jbpTheme']});await assert.rejects(g.call('apply',{token:q.token,selected:['jbpTheme']}),/устарел/);
});
test('archive schemas, invalid settings, other Jira, unsafe properties and foreign preview tokens are rejected',async()=>{
 const f=fixture();for(const archive of [{schema:'future',data:{}},f.archive({jbpNetworkConfig:{concurrency:0,intervalMs:0}}),f.archive({jbpBoardPrefs:{daily:'false'}}),{...f.archive({}),baseUrl:'https://other.example'},JSON.parse('{"schema":"jira-board-plus/settings-archive/v1","data":{"__proto__":{}}}')])await assert.rejects(f.call('inspect',{archive}));
 const p=await f.call('inspect',{archive:f.archive({jbpTheme:'light'})});await assert.rejects(f.call('apply',{token:p.token,selected:['jbpTheme']},2));await assert.rejects(f.call('apply',{token:p.token,selected:['arbitrary-key']}));
 await assert.rejects(f.c.restoreMessage({op:'export'},{id:'fixture',url:root+'/browse/DEMO-1'}));
});
test('legacy full archive imports queries additively on pause and never replaces results or jobs',async()=>{
 const f=fixture(),before=structuredClone(f.state.jbpReportsV1),p=await f.call('inspect',{archive:{schema:'jira-board-plus/local-archive/v1',data:{jbpReportsV1:{...before,queries:[query(1),query(2)],results:{evil:true},jobs:{evil:true}},jbpPrivateNotes:{evil:true}}}});
 const row=p.rows.find(r=>r.id==='queries');assert.equal(row.before[0].enabled,true);assert.equal(row.after[0].enabled,true);assert.equal(row.after[1].enabled,false);assert.equal(row.after.length,2);await f.call('apply',{token:p.token,selected:['queries']});assert.equal(f.state.jbpReportsV1.queries.length,2);assert.equal(f.state.jbpReportsV1.queries[0].enabled,true);assert.equal(f.state.jbpReportsV1.queries[1].enabled,false);assert.deepEqual(f.state.jbpReportsV1.results,before.results);assert.deepEqual(f.state.jbpReportsV1.jobs,before.jobs);assert.deepEqual(f.state.jbpPrivateNotes,{text:'keep'});
});
test('connection permission failure is non-mutating and connection changes after preview invalidate plan',async()=>{
 const f=fixture(),p=await f.call('inspect',{archive:f.archive({jbpReportsV1:{baseUrl:root,project:'OTHER'}})});f.deny();const before=JSON.stringify(f.state);await assert.rejects(f.call('apply',{token:p.token,selected:['connection']}),/доступ/);assert.equal(JSON.stringify(f.state),before);
 f.state.jbpReportsV1.baseUrl='https://other.example';await assert.rejects(f.call('apply',{token:p.token,selected:['connection']}),/Подключение изменилось/);
});
test('roadmap and dashboard settings restore without touching saved plans and snapshots',async()=>{
 const f=fixture(),key='jbpRoadmap:'+encodeURIComponent(root)+':DEMO',dash='jbpDashboard:'+encodeURIComponent(root)+':7';f.state[key+':plans']=[{id:'keep'}];
 const p=await f.call('inspect',{archive:f.archive({[key]:{levels:[{types:['1']}],rankField:'customfield_1',teamField:'customfield_2',sprintField:'customfield_3'},[key+':plans']:[{id:'bad'}],[dash]:{percentile:85,charts:{weekly:false}}})});assert.ok(p.ignored.includes(key+':plans'));await f.call('apply',{token:p.token,selected:[key,dash]});assert.equal(f.state[key].rankField,'customfield_1');assert.equal(f.state[dash].percentile,85);assert.deepEqual(f.state[key+':plans'],[{id:'keep'}]);
});

test('default zero WIP limit exports and restores, invalid periods are rejected',async()=>{
 const f=fixture(),key='jbpDashboard:'+encodeURIComponent(root)+':7';f.state[key]={percentile:85,period:'30',age:'7',limit:'0',charts:{weekly:true,aging:false}};
 const archive=await f.call('export');assert.equal(archive.data[key].limit,'0');
 const p=await f.call('inspect',{archive:f.archive({[key]:{charts:{weekly:false}}})});await f.call('apply',{token:p.token,selected:[key]});assert.equal(f.state[key].charts.aging,false);assert.equal(f.state[key].limit,'0');
 await assert.rejects(f.call('inspect',{archive:f.archive({[key]:{period:'invalid'}})}),/период/);
});

test('query capacity blocks only that selection; numeric project IDs remain valid',async()=>{
 const f=fixture();f.state.jbpReportsV1.project='123';f.state.jbpReportsV1.queries=Array.from({length:30},(_,i)=>query(i));assert.equal((await f.call('export')).data.jbpReportsV1.project,'123');
 const p=await f.call('inspect',{archive:f.archive({jbpReportsV1:{queries:[query(100)]},jbpTheme:'light'})});assert.match(p.rows.find(r=>r.id==='queries').blocked,/30/);await assert.rejects(f.call('apply',{token:p.token,selected:['queries']}));await f.call('apply',{token:p.token,selected:['jbpTheme']});assert.equal(f.state.jbpTheme,'light');assert.equal(f.state.jbpReportsV1.queries.length,30);
});

test('empty roadmap scope drafts do not prevent backup; first connection restores into an empty profile',async()=>{
 const f=fixture(),key='jbpRoadmap:'+encodeURIComponent(root)+':DEMO:scope';
 for(const scope of [{mode:'components',values:[]},{mode:'labels',values:['']},{mode:'filter'},{mode:'jql',jql:''}]){f.state[key]=scope;const exported=await f.call('export');assert.equal(exported.data[key].mode,scope.mode);}
 const g=fixture();for(const k of Object.keys(g.state))delete g.state[k];const p=await g.call('inspect',{archive:g.archive({jbpReportsV1:{baseUrl:root,project:'DEMO'},jbpBoardPrefs:{daily:true}})});await g.call('apply',{token:p.token,selected:['connection','jbpBoardPrefs']});assert.equal(g.state.jbpReportsV1.baseUrl,root);assert.deepEqual(g.state.jbpReportsV1.queries,[]);assert.equal(g.state.jbpRestoreBackup.baseUrl,'');
});


test('analytics profiles survive settings backup and restore with calendar, rules and views',async()=>{
 const f=fixture(),key='jbpDashboard:'+encodeURIComponent(root)+':7:analytics';
 const profile=f.c.JbpAnalytics.template('kanban',{workStatuses:'2',doneStatuses:'3'});profile.calendar={mode:'business',zone:'Europe/Moscow',days:[1,2,3,4,5],start:'09:00',end:'18:00',holidays:['2026-11-30']};profile.views=[{name:'Daily',hidden:['lead'],order:['aging','cycle']}];
 f.state[key]=profile;const archive=f.c.JbpRestore.exportSettings(f.state);assert.equal(archive.data[key].calendar.zone,'Europe/Moscow');assert.equal(archive.data[key].views[0].name,'Daily');
 const parsed=f.c.JbpRestore.parse(archive);assert.ok(parsed.rows.some(r=>r.key===key));
 assert.throws(()=>f.c.JbpRestore.parse({...archive,data:{[key]:{...profile,metrics:[{...profile.metrics[0],end:[]}]}}}));
});
