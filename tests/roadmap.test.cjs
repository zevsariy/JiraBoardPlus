const {test}=require('node:test'),assert=require('node:assert/strict');
require('../src/board-core.js');require('../src/sprint-core.js');require('../src/sprint-client.js');require('../src/roadmap-core.js');require('../src/roadmap-client.js');
const R=JbpRoadmap,c={levels:[{types:['1']},{types:['2'],parentField:'customfield_1'},{types:['3'],parentField:'customfield_2'}],rankField:'customfield_3',teamField:'customfield_4',startField:'customfield_5',endField:'customfield_6',sprintField:'customfield_7',dateMode:'targets',dependency:'is blocked by'},prefs={...JbpBoard.defaults,unblockingStatusNames:'DONE, Obsolete'};
function issue(key,start='2026-10-01',end='2026-10-10'){return {key,id:key.split('-')[1],fields:{summary:key,status:{name:'Doing'},issuetype:{name:'Task'},duedate:'2026-10-12',fixVersions:[],issuelinks:[],customfield_4:1,customfield_5:start,customfield_6:end}};}
const block=k=>({type:{inward:'IS BLOCKED BY'},inwardIssue:{key:k}});
test('roadmap validates mappings and dates, parent payloads and sprint IDs',()=>{assert.equal(R.config(c).levels.length,3);assert.throws(()=>R.config({...c,levels:[{types:['1']},{types:['1'],parentField:'parent'}]}));assert.equal(R.day('2026-02-30'),null);assert.equal(R.parentRef({id:'wrapper',data:{key:'D-2'}}),'D-2');assert.deepEqual(R.sprintIds(['x[id=2,name=Demo]',{id:3},'3']),['2','3']);});
test('descendants extend root beyond Due Date; unknown leaf cannot confirm deadline',()=>{const root=issue('D-1'),child=issue('D-2','2026-10-02','2026-10-20');let m=R.build([{issue:root,level:0},{issue:child,parent:'D-1',level:1}],c,prefs,{}, {},{},R.day('2026-10-01'));assert.equal(m.roots[0].lateDays,8);assert.equal(m.nodes[1].late,true);child.fields.customfield_6=null;m=R.build([{issue:root,level:0},{issue:child,parent:'D-1',level:1}],c,prefs,{}, {},{},R.day('2026-10-01'));assert.equal(m.roots[0].risk,'unknown');});
test('sprint priority uses active/future over historical closed and falls back to targets',()=>{const i=issue('D-1');i.fields.customfield_7=[1,2];const s={1:{id:1,state:'closed',startDate:'2025-01-01',endDate:'2025-01-15'},2:{id:2,state:'future',startDate:'2026-11-01',endDate:'2026-11-15'}};assert.equal(R.schedule(i,{...c,dateMode:'sprints'},s).start,R.day('2026-11-01'));assert.equal(R.schedule(i,c,s).start,R.day('2026-10-01'));s[2].endDate=null;assert.equal(R.schedule(i,{...c,dateMode:'sprints'},s).source,'Target Start / Target End');});
test('multiple blockers distinguish clear, conflict, missing and dependency cycles',()=>{const a=issue('D-1'),b=issue('D-2'),d=issue('D-3');a.fields.issuelinks=[block('D-2'),block('D-3'),block('D-4')];b.fields.issuelinks=[block('D-1')];d.fields.status.name='oBsOlEtE';const m=R.build([a,b,d].map(issue=>({issue,level:0})),c,prefs);assert.equal(m.edges.filter(e=>e.conflict).length,2);assert.equal(m.edges.find(e=>e.from==='D-3').clear,true);assert.equal(m.edges.find(e=>e.from==='D-4').unknown,true);assert.deepEqual(m.cycles.sort(),['D-1','D-2']);});
test('client selects release only at root and keeps descendants from other releases',async()=>{const client=new R.Client('','https://jira.example.com'),queries=[];client.search=async q=>{queries.push(q);if(q.includes('fixVersion'))return [issue('D-1')];if(q.includes('cf[1]')){const i=issue('D-2');i.fields.customfield_1='D-1';return[i];}return [];};client.get=async()=>[];const m=await client.load('D',{id:8},c,prefs,undefined,undefined,['101']);assert.equal(m.nodes.length,2);assert.match(queries[0],/fixVersion = 8/);assert.match(queries[0],/component IN \(101\)/);assert.deepEqual(m.componentIds,['101']);assert.ok(queries.slice(1).every(q=>!q.includes('fixVersion')&&!q.includes('project =')&&!q.includes('component IN')));});
test('client rejects changing pagination totals and missing parent links',async()=>{const client=new R.Client('','https://jira.example.com');let n=0;client.get=async()=>n++?{startAt:1,total:3,issues:[issue('D-2')]}:{startAt:0,total:2,issues:[issue('D-1')]};await assert.rejects(client.search('x',[]),/изменился/);client.search=async q=>q.includes(' = \"D-1\"')?[]:[issue(q.includes('fixVersion')?'D-1':'D-2')];client.get=async()=>[];const model=await client.load('D',{id:8},{...c,levels:c.levels.slice(0,2)},prefs,undefined,undefined,['101']);const orphan=model.nodes.find(n=>n.key==='D-2');assert.equal(orphan.parent,'');assert.match(orphan.orphanLabel,/Без родителя/);assert.equal(model.nodes.length,2);assert.ok(orphan.warnings.some(w=>w.includes('не подтверждён')));});
test('missing sprint is opt-in, type-scoped, skips completed and distinguishes inaccessible fields',()=>{const i=issue('D-1');i.fields.issuetype.id='3';i.fields.customfield_7=[];const checked=R.config({...c,noSprint:true,noSprintTypes:['3']});const build=(cfg=checked)=>R.build([{issue:i,level:0}],cfg,prefs).nodes[0];assert.equal(build().noSprint,true);assert.ok(!build(R.config(c)).noSprint);i.fields.customfield_7=[{id:9}];assert.ok(!build().noSprint);delete i.fields.customfield_7;assert.ok(!build().noSprint);assert.ok(build().warnings.some(w=>w.includes('назначение неизвестно')));i.fields.customfield_7=[];i.fields.status={name:'Done',statusCategory:{key:'done'}};assert.ok(!build().noSprint);});
test('selected fields retain order and safe text including missing access and complex values',()=>{const i=issue('D-1');i.fields.assignee={displayName:'Alice'};i.fields.labels=['a','b'];const cfg=R.config({...c,columns:['labels','assignee','description','labels']});assert.deepEqual(cfg.columns,['labels','assignee','description']);const n=R.build([{issue:i,level:0}],cfg,prefs).nodes[0];assert.equal(n.extraFields.assignee.value,'Alice');assert.equal(n.extraFields.labels.value,'a, b');assert.equal(n.extraFields.description.available,false);assert.equal(R.fieldText('<script>'),' <script>'.trim());});
test('component scope is mandatory, deduplicated and rejects JQL injection before any request',async()=>{const client=new R.Client('','https://jira.example.com');let calls=0;client.search=async()=>{calls++;return[];};for(const ids of [[],['101) OR project=OTHER'],Array.from({length:101},(_,i)=>String(i+1))])await assert.rejects(client.load('D',{id:8},c,prefs,undefined,undefined,ids));assert.equal(calls,0);assert.deepEqual(R.componentIds([101,'101',102]),['101','102']);const queries=[];client.search=async q=>{queries.push(q);return[];};await client.load('D',{id:8},c,prefs,undefined,undefined,['101','102']);assert.match(queries[0],/component IN \(101,102\)/);});
test('metadata loads project Component/s without querying any issues',async()=>{const client=new R.Client('','https://jira.example.com'),paths=[];client.get=async path=>{paths.push(path);if(path.endsWith('/field'))return [];if(path.endsWith('/versions'))return[{id:8,name:'Release'}];if(path.endsWith('/components'))return[{id:'101',name:'Platform'}];return{issueTypes:[]};};const data=await client.metadata('DEMO');assert.equal(data.components[0].name,'Platform');assert.ok(paths.includes('api/2/project/DEMO/components'));assert.ok(paths.every(p=>!p.includes('/search')));});
test('affected version scopes roots only, requests REST versions and exports mode; invalid fields rejected',async()=>{const client=new R.Client('','https://jira.example.com'),queries=[];client.get=async()=>[];client.search=async(q,fields)=>{queries.push(q);assert.ok(fields.includes('versions'));if(q.includes('affectedVersion')){const i=issue('D-1');i.fields.versions=[{id:8,name:'Affected release'}];return[i];}if(q.includes('cf[1]')){const i=issue('D-2');i.fields.customfield_1='D-1';return[i];}return[];};const m=await client.load('D',{id:8},c,prefs,undefined,undefined,['101'],'affectedVersion');assert.match(queries[0],/\(component IN \(101\)\) AND affectedVersion = 8/);assert.ok(queries.every(q=>!q.includes('fixVersion')));assert.ok(queries.slice(1).every(q=>!q.includes('affectedVersion')));assert.equal(m.versionField,'affectedVersion');assert.equal(m.nodes[0].affectedVersions[0].name,'Affected release');assert.deepEqual(m.nodes[1].affectedVersions,[]);const before=queries.length;await assert.rejects(client.load('D',{id:8},c,prefs,undefined,undefined,['101'],'other OR project=SECRET'),/поле релиза/);assert.equal(queries.length,before);});

test('development cutoff is inclusive, separate from Due Date, clearable and skips external nodes',()=>{
 const m=R.build([{issue:issue('D-1'),level:0},{issue:issue('D-2',null,null),level:0}],c,prefs);
 const now=R.day('2026-10-01');R.applyCutoff(m,'2026-10-10',now);
 assert.equal(m.nodes[0].cutoffRisk,'ok');assert.equal(m.nodes[1].cutoffRisk,'unknown');
 R.applyCutoff(m,'2026-10-09',now);assert.equal(m.nodes[0].cutoffLateDays,1);assert.equal(m.nodes[0].due,R.day('2026-10-12'));
 m.nodes[0].external=true;R.applyCutoff(m,'2026-10-09',now);assert.equal(m.nodes[0].cutoffRisk,'off');
 R.applyCutoff(m,'',now);assert.equal(m.cutoff,null);assert.ok(m.nodes.every(n=>n.cutoffRisk==='off'));
 assert.throws(()=>R.applyCutoff(m,'2027-02-30',now));
});
test('UTC export preserves model numbers and non-date values, serializes all plan dates',()=>{
 const m=R.build([{issue:issue('D-1'),level:0}],c,prefs,{}, {},{id:8,releaseDate:'2027-03-01'});
 m.nodes[0].segments=[{id:99,start:R.day('2026-10-01'),end:null}];R.applyCutoff(m,'2027-01-01');
 const out=R.exportModel(m);assert.equal(out.cutoff,'2027-01-01T00:00:00.000Z');assert.equal(out.version.releaseDate,'2027-03-01T00:00:00.000Z');
 assert.equal(out.nodes[0].start,'2026-10-01T00:00:00.000Z');assert.equal(out.nodes[0].segments[0].start,out.nodes[0].start);assert.equal(out.nodes[0].segments[0].end,null);assert.equal(out.nodes[0].segments[0].id,99);assert.equal(typeof m.nodes[0].start,'number');assert.doesNotThrow(()=>JSON.stringify(out));
});

test('branch masks are case insensitive, literal-safe and support wildcards',()=>{assert.equal(R.excluded({key:'D-1',fields:{summary:'Feature fs0 delivery'}},'FS0\nTS0'),true);assert.equal(R.excluded({key:'D-1',fields:{summary:'A[1] delivery'}},'A[1]'),true);assert.equal(R.excluded({key:'D-1',fields:{summary:'Other'}},'FS0'),false);assert.equal(R.excluded({key:'D-1',fields:{summary:'Feature xxx Done'}},'Feature*Done'),true);});
test('AI compact payload stays under cap and explicitly declares omitted rows',()=>{const m=R.build([{issue:issue('D-1'),level:0}],c,prefs);m.config=R.config(c);m.nodes=Array.from({length:2500},(_,i)=>({...m.nodes[0],key:'D-'+i,summary:'secret summary'.repeat(100),team:'Team'.repeat(30)}));m.roots=[];m.edges=[];const out=R.compactAI(m);assert.ok(JSON.stringify(out).length<200000);assert.ok(out.omittedIssues>0);assert.equal(out.totals.issues,2500);assert.equal(JSON.stringify(out).includes('secret summary'),false);assert.match(out.coverage,/PARTIAL/);});
test('excluded root never triggers child loading and extra table fields are fetched',async()=>{const client=new R.Client('','https://jira.example.com'),queries=[];client.get=async()=>[];client.search=async(q,fields)=>{queries.push(q);assert.ok(fields.includes('assignee'));const i=issue('D-1');i.fields.summary='FS0 feature';return[i];};const m=await client.load('D',{id:8},{...c,excludeMasks:'FS0',dependencyColumns:['assignee']},prefs,undefined,undefined,['101']);assert.equal(m.nodes.length,0);assert.equal(queries.length,1);});

test('scope modes constrain roots, group custom OR and retain hierarchy queries',async()=>{
 for(const scope of [{mode:'project'},{mode:'labels',values:['platform','mobile']},{mode:'filter',id:'42'},{mode:'jql',jql:'labels = a OR labels = b'}]){
  const client=new R.Client('','https://jira.example.com'),queries=[];client.get=async()=>[];client.search=async q=>{queries.push(q);return queries.length===1?[issue('D-1')]:[];};
  const m=await client.load('D',{id:8},c,prefs,undefined,undefined,scope);
  assert.match(queries[0],/^project = "D"/);assert.match(queries[0],/AND fixVersion = 8 AND issuetype/);
  assert.ok(queries.slice(1).every(q=>!q.includes('labels')&&!q.includes('filter =')&&!q.includes('project =')));
  assert.equal(m.selection.mode,scope.mode);
  if(scope.mode==='jql')assert.ok(queries[0].includes('AND (labels = a OR labels = b) AND'));
 }
 assert.throws(()=>R.scope({mode:'labels',values:[]}));assert.throws(()=>R.scope({mode:'filter',id:'42 OR project = x'}));assert.throws(()=>R.scope({mode:'jql',jql:'project = D ORDER BY key'}));
});

test('custom scope cannot escape outer intersection',()=>{assert.throws(()=>R.scope({mode:'jql',jql:'labels = a) OR (project = X'}));assert.equal(R.scope({mode:'jql',jql:'summary ~ \"(draft)\"'}).mode,'jql');});

test('risk explanations use inclusive dependency dates, missing dates and configured cleared status',()=>{
 const a={key:'D-1',end:R.day('2026-11-15'),status:'Done'},b={key:'D-2',start:R.day('2026-11-15')},map=new Map([[a.key,a],[b.key,b]]);
 assert.match(R.dependencyReason({from:a.key,to:b.key,conflict:true},map),/1 календ/);
 assert.match(R.dependencyReason({from:a.key,to:b.key,clear:true,conflict:false},map),/Done/);
 assert.match(R.dependencyReason({from:'D-9',to:b.key,unknown:true},map),/недоступна задача D-9/);
 const child={key:'D-3',end:R.day('2026-11-20'),children:[]},n={key:'D-1',root:'D-1',rootDue:R.day('2026-11-15'),end:child.end,late:true,cutoffLate:true,cutoffLateDays:10,children:[child],dependencies:[]};
 const lines=R.riskReasons(n,{nodes:[n,child],cutoff:R.day('2026-11-10')}).join(' ');assert.match(lines,/10 календ/);assert.match(lines,/5 календ/);assert.match(lines,/определяют: D-3/);
 child.end=null;n.late=false;n.cutoffLate=false;n.risk='unknown';assert.match(R.riskReasons(n,{nodes:[n,child]}).join(' '),/Нет даты окончания: D-3/);
});

test('snapshots compare stable fields, membership and plan dates, rejecting different scope',()=>{
 const m=R.build([{issue:issue('D-1'),level:0},{issue:issue('D-2'),level:0}],c,prefs);Object.assign(m,{config:R.config(c),project:'D',version:{id:8,releaseDate:'2026-11-01'},versionField:'fixVersion',selection:{mode:'labels',values:['a','b']}});
 const before=R.snapshot(m,'Baseline',1);m.nodes.reverse();m.loadedAt=999;
 assert.deepEqual(R.compareSnapshots(before,R.snapshot(m)).rows,[]);
 m.nodes.find(n=>n.key==='D-1').status='Done';m.nodes=m.nodes.filter(n=>n.key!=='D-2');m.nodes.push({...m.nodes[0],key:'D-3',summary:'New'});m.cutoff=R.day('2026-10-15');
 const after=R.snapshot(m),diff=R.compareSnapshots(before,after);assert.equal(diff.added,1);assert.equal(diff.removed,1);assert.equal(diff.changed,1);assert.equal(diff.rows.find(r=>r.key==='D-1').changes[0].field,'Статус');assert.equal(diff.plan[0].after,'2026-10-15T00:00:00.000Z');
 m.selection.values.reverse();assert.equal(R.snapshot(m).signature,after.signature);m.selection.values=['c'];assert.throws(()=>R.compareSnapshots(before,R.snapshot(m)),/Область/);
 assert.equal(before.nodes.find(n=>n.key==='D-1').status,'Doing');
});

test('progress separates hierarchy levels, teams and units, preserves zero and missing estimates',()=>{
 const nodes=[{level:0,teamId:'a',team:'Alpha',done:true,storyPoints:100,originalHours:100},
 {level:1,teamId:'a',team:'Alpha',done:true,storyPoints:0,originalHours:2},
 {level:1,teamId:'a',team:'Alpha',done:false,storyPoints:5,originalHours:null},
 {level:1,teamId:'a',team:'Alpha',done:false,storyPoints:null,originalHours:3},
 {level:1,teamId:'b',team:'Beta',done:true,storyPoints:8,originalHours:4},
 {level:1,teamId:'a',team:'Alpha',external:true,done:false,storyPoints:100,originalHours:100}];
 const [a,b]=R.progress({nodes},1);assert.deepEqual([a.count,a.done,a.sp,a.spDone,a.spMissing,a.hours,a.hoursDone,a.hoursMissing],[3,1,5,0,1,5,2,1]);assert.equal(b.sp,8);
 assert.match(R.capacityStatus(a,'sp',10),/Нельзя подтвердить/);assert.match(R.capacityStatus(a,'sp',4),/минимум/);assert.match(R.capacityStatus(a,'count',3),/100%/);assert.match(R.capacityStatus(a,'hours',0),/не задана/);
 const i=issue('D-1');i.fields.timeoriginalestimate=7200;i.fields.customfield_8=3;const cfg=R.config({...c,storyPointsField:'customfield_8'}),n=R.build([{issue:i,level:0}],cfg,prefs).nodes[0];assert.equal(n.originalHours,2);assert.equal(n.storyPoints,3);
});

test('local scenarios roll up dates and recalculate conflicts without mutating baseline',()=>{
 const a=issue('D-1'),b=issue('D-2'),d=issue('D-3');d.fields.issuelinks=[block('D-2')];
 const m=R.build([{issue:a,level:0},{issue:b,level:1,parent:'D-1'},{issue:d,level:0}],c,prefs);R.applyCutoff(m,'2026-10-15',R.day('2026-10-01'));
 const before=JSON.stringify(R.exportModel(m));const s=R.scenario(m,{'D-2':{start:'2026-10-05',end:'2026-10-25'}},'Later',R.day('2026-10-01'));
 assert.equal(s.roots[0].end,R.day('2026-10-25'));assert.equal(s.roots[0].cutoffLateDays,10);assert.equal(s.edges[0].conflict,true);assert.equal(s.nodes.find(n=>n.key==='D-3').dependencies[0].conflict,true);assert.equal(s.scenario.localOnly,true);assert.equal(JSON.stringify(R.exportModel(m)),before);
 assert.throws(()=>R.scenario(m,{'D-9':{start:'2026-10-01',end:'2026-10-02'}}),/недоступна/);assert.throws(()=>R.scenario(m,{'D-2':{start:'2026-10-03',end:'2026-10-02'}}),/обе даты/);
 const cleared=R.scenario(m,{'D-3':{start:'2026-10-11',end:'2026-10-12'}},'No overlap',R.day('2026-10-01'));assert.equal(cleared.edges[0].conflict,false);
});

test('period load conserves known estimates across weeks and sprints and reports missing schedules',()=>{
 const n={key:'D-1',level:1,teamId:'a',team:'Alpha',start:R.day('2026-10-05'),end:R.day('2026-10-18'),storyPoints:14,segments:[{id:'1',name:'One'},{id:'2',name:'Two'}]};
 const weeks=R.periodLoad({nodes:[n,{...n,key:'D-2',start:null,end:null,segments:[]}]},1,'week','sp');assert.equal(weeks.rows.length,2);assert.equal(weeks.rows[0].amount,7);assert.equal(weeks.unscheduled,1);
 const sprints=R.periodLoad({nodes:[n]},1,'sprint','sp');assert.equal(sprints.rows.reduce((s,r)=>s+r.amount,0),14);assert.equal(sprints.rows[0].amount,7);
 assert.equal(R.periodLoad({nodes:[{...n,storyPoints:null}]},1,'week','sp').rows[0].missing,1);
});
test('backup import validates project isolation, allowed sections and malicious properties',()=>{
 const data={format:'jbp-roadmap-backup-v1',context:'project',entries:[['cutoff:1','2026-10-01']]};assert.equal(R.backupEntries(data,'project').length,1);assert.throws(()=>R.backupEntries(data,'other'));
 assert.throws(()=>R.backupEntries({...data,entries:[['aiKey','secret']]},'project'));
 assert.throws(()=>R.backupEntries({...data,entries:[['capacity:fixVersion:1',{bad:-1}]]},'project'));
 assert.throws(()=>R.backupEntries({...data,entries:[['view',JSON.parse('{"__proto__":{}}')]]},'project'));
});
test('loading limit defaults to 2000 and explicitly permits 5000 while rejecting excess rows',async()=>{
 const client=new R.Client('','https://jira.example');client.get=async()=>({startAt:0,total:5000,issues:[]});await assert.rejects(client.search('x',[]),/2000/);
 client.issueLimit=5000;client.get=async path=>{const start=Number(new URLSearchParams(path.split('?')[1]).get('startAt'));return {startAt:start,total:5000,issues:Array.from({length:Math.min(73,5000-start)},(_,i)=>issue('D-'+(start+i+1)))};};assert.equal((await client.search('x',[])).length,5000);
 client.get=async()=>({startAt:0,total:5001,issues:[]});await assert.rejects(client.search('x',[]),/5000/);
});

 test('missing Epic Link payload is verified against exact configured parents, ambiguity rejected',async()=>{
 for(const ambiguous of [false,true]){const client=new R.Client('','https://jira.example.com');client.get=async()=>[];const queries=[];client.search=async q=>{queries.push(q);if(q.includes('fixVersion'))return[issue('D-1'),issue('D-3')];if(q.includes(' IN (')){if(q.includes('cf[1] IN'))return[issue('D-2')];}if(q.includes('cf[1] = "D-1"'))return[issue('D-2')];if(q.includes('cf[1] = "D-3"'))return ambiguous?[issue('D-2')]:[];return[];};const run=client.load('D',{id:8},{...c,levels:c.levels.slice(0,2)},prefs,undefined,undefined,['101']);if(ambiguous)await assert.rejects(run,/несколько родителей/);else{const m=await run;assert.equal(m.nodes.find(n=>n.key==='D-2').parent,'D-1');assert.ok(m.warnings.some(w=>w.includes('JQL')));assert.ok(queries.some(q=>q.includes('cf[1] = "D-3"')));}}
 });

test('Team defaults use the field name rather than an unrelated installation ID',()=>{assert.equal(R.defaults([{id:'customfield_10200',name:'Fixed In'},{id:'customfield_10107',name:'Team'}],[]).teamField,'customfield_10107');assert.equal(R.defaults([{id:'customfield_10200',name:'Fixed In'}],[]).teamField,'');});
