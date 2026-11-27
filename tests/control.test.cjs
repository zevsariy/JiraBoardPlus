const {test}=require('node:test'),assert=require('node:assert/strict');
require('../src/control-core.js');const C=globalThis.JbpControl;
const at='2026-11-27T12:00:00Z',config={doneNames:['Done'],teamField:'customfield_1',sprintField:'customfield_2',estimateField:'customfield_3',sprintId:'7',sprintStart:'2026-11-01T00:00:00Z'};
const issue=(n,fields={},histories=[])=>({key:`DEMO-${n}`,fields:{summary:'Task',created:'2026-11-01T00:00:00Z',updated:'2026-11-02T00:00:00Z',status:{name:'Doing',statusCategory:{key:'indeterminate'}},issuetype:{name:'Task'},assignee:null,issuelinks:[],...fields},changelog:{total:histories.length,histories}});
const event=(date,field,fromString,toString,extra={})=>({created:date,items:[{field,fromString,toString,...extra}]});
const snapshot=issues=>({schema:'jira-board-plus/control/v1',id:'x',at,issues,baseUrl:'https://jira.example.com',account:'a',jql:'project=DEMO',config});
test('risk explanations use configured thresholds and skip finished work',()=>{const a=C.analyze(snapshot([issue(1,{duedate:'2026-11-20'}),issue(2,{status:{name:'Done'}})]),config);assert.equal(a.rows[0].signals.length,3);assert.ok(a.rows[0].signals[0].reason.includes('порог'));assert.equal(a.rows[1].signals.length,0);});
test('missing and truncated history stays unknown, including reopen counts',()=>{const a=issue(1);delete a.changelog;const b=issue(2);b.changelog.total=2;const result=C.analyze(snapshot([a,b]),config);for(const r of result.rows){assert.equal(r.ageDays,null);assert.equal(r.reopens,null);}assert.equal(result.counts.history,0);});
test('age cohorts use completed visits of same type and status, minimum five',()=>{const fixtures=Array.from({length:5},(_,n)=>issue(n+1,{status:{name:'Done'}},[event(`2026-11-0${n+2}T00:00:00Z`,'status','Doing','Done')]));fixtures.push(issue(10));const r=C.analyze(snapshot(fixtures),config).rows.at(-1);assert.equal(r.percentile,100);assert.equal(r.cohortSize,5);});
test('reopen and revisit events are distinct and observable',()=>{const i=issue(1,{},[event('2026-11-02T00:00:00Z','status','Doing','Test'),event('2026-11-03T00:00:00Z','status','Test','Done'),event('2026-11-04T00:00:00Z','status','Done','Doing')]);const r=C.analyze(snapshot([i]),config).rows[0];assert.equal(r.reopens,1);assert.equal(r.returns,1);});
test('sprint journal respects numeric IDs, date window and preserves zero estimate',()=>{const i=issue(1,{},[event('2026-11-02T00:00:00Z','Sprint','','Sprint 7',{from:'',to:'7',fieldId:'customfield_2'}),event('2026-11-03T00:00:00Z','SP','0','3',{fieldId:'customfield_3'}),event('2026-10-01T00:00:00Z','Sprint','7','8',{from:'7',to:'8'})]);const a=C.analyze(snapshot([i]),config);assert.equal(a.events.length,2);assert.equal(a.events[1].before,'0');assert.ok(a.rows[0].observations.some(s=>s.includes('после старта')));});
test('dependency validation finds cycles, date inversions and unknown endpoints',()=>{const block=(key)=>({type:{outward:'blocks'},outwardIssue:{key}});const a=issue(1,{duedate:'2026-12-10',issuelinks:[block('DEMO-2'),block('DEMO-9')]}),b=issue(2,{duedate:'2026-12-01',issuelinks:[block('DEMO-1')]});const r=C.analyze(snapshot([a,b]),config);assert.ok(r.dependencyProblems.some(p=>p.problem.includes('Циклическая')));assert.ok(r.dependencyProblems.some(p=>p.problem.includes('позже')));assert.ok(r.dependencyProblems.some(p=>p.problem.includes('вне выборки')));});
test('parent comparison handles teams, versions, due dates and inaccessible parents',()=>{const a=issue(1,{customfield_1:{id:1},fixVersions:[{name:'v1'}],duedate:'2026-11-15'}),b=issue(2,{customfield_1:{id:2},fixVersions:[{name:'v2'}],duedate:'2026-11-20',parent:{key:'DEMO-1'}});const r=C.analyze(snapshot([a,b]),config);assert.equal(r.consistency.length,3);});
test('snapshot comparison isolates account, server and JQL; no false deletion claim',()=>{const a=snapshot([issue(1)]),b={...snapshot([issue(1,{assignee:{displayName:'A'}}),issue(2)]),at:'2026-11-28T12:00:00Z'};const d=C.diff(a,b);assert.deepEqual(d.added,['DEMO-2']);assert.deepEqual(d.changed[0].fields,['assignee']);assert.throws(()=>C.diff(a,{...b,account:'b'}));assert.throws(()=>C.diff(a,{...b,jql:'other'}));});
test('Monte Carlo includes zero completion days and excludes current partial day',()=>{const issues=Array.from({length:7},(_,i)=>issue(i+1,{status:{name:'Done'},resolutiondate:`2026-11-${20+i}T12:00:00Z`}));const s=snapshot(issues);const r=C.forecast(s,config,10,7,100,()=>0.5);assert.equal(r.completed,7);assert.equal(r.p50.days,10);assert.equal(r.p85.days,10);assert.throws(()=>C.forecast({...s,partial:true},config,10));assert.throws(()=>C.forecast(snapshot([]),config,10));});
test('all meeting modes generate grounded documents with scope and limitations',()=>{const s=snapshot([issue(1)]),a=C.analyze(s,config);for(const mode of ['daily','refinement','review','retro','management']){const text=C.meeting(mode,a,s,C.diff(null,s));assert.ok(text.includes(s.jql));assert.ok(text.includes(s.at));}assert.ok(C.meeting('review',a,s).includes('не доказывает'));});
test('rule validation rejects unbounded and unsafe values',()=>{assert.throws(()=>C.rules([{...C.defaults[0],color:'url(x)'}]));assert.throws(()=>C.rules([{...C.defaults[0],metric:'__proto__'}]));assert.throws(()=>C.rules(Array(31).fill(C.defaults[0])));});
test('sprint baseline and end fact reconstruct historical membership and zero estimates',()=>{const i=issue(1,{customfield_2:[{id:7}],customfield_3:5,status:{name:'Done'}},[event('2026-11-03T00:00:00Z','SP','0','5',{fieldId:'customfield_3'}),event('2026-11-04T00:00:00Z','status','Doing','Done')]);const r=C.analyze(snapshot([i]),config).sprint;assert.equal(r.planned,1);assert.equal(r.completed,1);assert.equal(r.plannedEstimate,0);assert.equal(r.completedEstimate,5);assert.equal(r.unknownEstimates,0);});
test('estimate journal excludes changes after removal from chosen sprint',()=>{const i=issue(1,{customfield_2:[{id:8}]},[event('2026-11-02T00:00:00Z','Sprint','Seven','Eight',{fieldId:'customfield_2',from:'7',to:'8'}),event('2026-11-03T00:00:00Z','SP','1','5',{fieldId:'customfield_3'})]);const a=C.analyze(snapshot([i]),config);assert.equal(a.events.length,1);assert.equal(a.events[0].kind,'Удалена из спринта');});
test('today due date is not overdue before end of calendar day',()=>{const r=C.analyze(snapshot([issue(1,{duedate:'2026-11-27'})]),config).rows[0];assert.equal(r.dueDays,0);assert.ok(!r.signals.some(s=>s.metric==='dueDays'));});

test('percentiles include ties and keep small cohorts unknown',()=>{
 const fixtures=[1,2,2,4,8].map((days,n)=>issue(n+1,{status:{name:'Done'}},[event(`2026-11-${String(days+1).padStart(2,'0')}T00:00:00Z`,'status','Doing','Done')]));
 fixtures.push(issue(10,{created:'2026-11-25T12:00:00Z'}));
 const result=C.analyze(snapshot(fixtures),config).rows.at(-1);
 assert.equal(result.percentile,60);
 assert.equal(C.analyze(snapshot(fixtures.slice(1)),config).rows.at(-1).percentile,null);
});
test('analysis history cache does not survive edits to the same issue object',()=>{
 const value=issue(1),s=snapshot([value]);
 assert.equal(C.analyze(s,config).rows[0].returns,0);
 value.changelog.histories.push(event('2026-11-02','status','Doing','Test'),event('2026-11-03','status','Test','Doing'));
 value.changelog.total=2;
 assert.equal(C.analyze(s,config).rows[0].returns,1);
 value.changelog.total=3;
 assert.equal(C.analyze(s,config).rows[0].returns,null);
});
test('self transitions count only statuses from earlier events',()=>{
 const value=issue(1,{},[event('2026-11-02','status','Doing','Doing'),event('2026-11-03','status','Doing','Doing')]);
 assert.equal(C.analyze(snapshot([value]),config).rows[0].returns,1);
});
