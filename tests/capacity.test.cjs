const {test}=require('node:test'),assert=require('node:assert/strict');require('../src/board-core.js');require('../src/sprint-core.js');require('../src/sprint-client.js');require('../src/sprint-capacity.js');const S=JbpSprint;
const row=(type,start,end,extra={})=>({issuetype:type,startEstimate:start,endEstimate:end,category:'completed',added:false,...extra});
const data=(id,rows)=>({sprint:{id,name:'Sprint '+id,state:'closed'},estimation:{unit:'SP',field:'customfield_1'},profile:{includeSubtasks:false},issues:rows});
test('capacity plans include removed work; delivery includes additions, excludes elsewhere; missing is not zero',()=>{
 const d=data(1,[row('Story',5,8),row('Bug',3,3,{added:true}),row('Task',2,2,{category:'removed'}),row('Task',4,4,{category:'completedElsewhere'}),row('Bug',null,null),row('Subtask',50,50,{subtask:true})]);
 const p=S.capacitySeries([d],'planned'),c=S.capacitySeries([d],'completed');assert.equal(p.sprints[0].total,11);assert.equal(c.sprints[0].total,11);assert.equal(c.sprints[0].missing,1);assert.deepEqual(p.types,c.types);assert.ok(!p.types.includes('Subtask'));
 assert.equal(S.capacitySeries([data(2,[row('Bug',null,null)])]).sprints[0].known,0);assert.throws(()=>S.capacitySeries([d,{...d,estimation:{unit:'h',field:'timeoriginalestimate'}}]));
});
test('sprint selection is chronological, excludes future and other active sprints, deduplicates',()=>{
 const s=(id,date,state='closed')=>({id,name:'S'+id,completeDate:date,state});const selected=s(4,'2026-04-10');assert.deepEqual(S.capacitySprints([s(5,'2026-05-10'),s(2,'2026-02-10'),s(3,'2026-03-10'),s(3,'2026-03-10'),s(1,'2026-01-10'),s(6,'2026-02-11','active')],selected,3).map(s=>s.id),[2,3,4]);assert.throws(()=>S.capacitySprints([],selected,100));
});
test('capacity client shares issue history across sprints and handles server-capped pages and hours',async()=>{
 const client=new S.Client('','https://jira.example'),calls=[];client.sprints=async()=>[1,2,3].map(id=>({id,name:'S'+id,state:'closed',startDate:'2026-01-02',completeDate:'2026-01-10'}));
 client.get=async path=>{calls.push(path);if(path.includes('configuration'))return {type:'scrum'};if(path==='api/2/field')return [];if(path.includes('sprintreport'))return {contents:{completedIssues:[{key:'D-1'},{key:'D-2'}],issuesNotCompletedInCurrentSprint:[],puntedIssues:[],issueKeysAddedDuringSprint:{}}};const u=new URL('https://jira.example/'+path),start=Number(u.searchParams.get('startAt'));assert.match(u.searchParams.get('fields'),/timeoriginalestimate/);return {total:2,startAt:start,issues:[{key:'D-'+(start+1),fields:{issuetype:{name:start?'Bug':'Story'},created:'2026-01-01',timeoriginalestimate:7200},changelog:{startAt:0,total:0,histories:[]}}]};};
 const result=await client.capacity(1,3,3,{mode:'time'},new AbortController().signal);assert.equal(calls.filter(p=>p.startsWith('api/2/search')).length,2);assert.equal(result.datasets.length,3);assert.deepEqual(S.capacitySeries(result.datasets).sprints.map(s=>s.total),[4,4,4]);
});
test('capacity count skips changelog, unknown issues remain explicitly unknown; abort and invalid pagination fail',async()=>{
 const client=new S.Client('','https://jira.example');client.sprints=async()=>[{id:1,name:'S',state:'closed',startDate:'2026-01-02',completeDate:'2026-01-10'}];client.get=async path=>{if(path.includes('configuration'))return {type:'scrum'};if(path==='api/2/field')return [];if(path.includes('sprintreport'))return {contents:{completedIssues:[{key:'D-1'}],issuesNotCompletedInCurrentSprint:[],puntedIssues:[],issueKeysAddedDuringSprint:{}}};assert.ok(!path.includes('changelog'));return {startAt:0,total:0,issues:[]};};
 const result=await client.capacity(1,1,3,{mode:'none'});assert.equal(S.capacitySeries(result.datasets).sprints[0].missing,1);assert.equal(result.warnings.length,1);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(client.capacity(1,1,3,{mode:'none'},ctrl.signal),/abort/i);
});
