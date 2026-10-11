const {test}=require('node:test');const assert=require('node:assert/strict');require('../src/board-core.js');require('../src/sprint-core.js');const S=globalThis.JbpSprint;
const fields=[{id:'customfield_10002',name:'Story Points'}];
test('estimate profile resolves board SP, explicit original estimate and refuses ambiguity',()=>{
 assert.equal(S.estimation({estimation:{field:{fieldId:'customfield_10002'}}},fields,{}).unit,'SP');
 assert.equal(S.estimation({},fields,{mode:'time'}).divisor,3600);
 assert.throws(()=>S.estimation({},[],{}));assert.throws(()=>S.estimation({},fields,{mode:'points',spField:'bad'}));
});
test('historical original estimate uses seconds and rolls later changes back',()=>{
 const estimate=S.estimation({},[],{mode:'time'}),issue={fields:{timeoriginalestimate:14400,created:'2026-01-01'},changelog:{startAt:0,total:2,histories:[{created:'2026-01-06',items:[{field:'timeoriginalestimate',from:'7200',to:'10800'}]},{created:'2026-01-09',items:[{field:'timeoriginalestimate',from:'10800',to:'14400'}]}]}};
 assert.equal(S.at(issue,estimate,Date.parse('2026-01-05')),2);assert.equal(S.at(issue,estimate,Date.parse('2026-01-07')),3);assert.equal(S.at(issue,estimate,Date.parse('2026-01-10')),4);
 issue.changelog.total=3;assert.equal(S.at(issue,estimate,Date.parse('2026-01-05')),null);
});
test('plan completion excludes added work, null is not zero, parent and subtasks selectable',()=>{
 const issues=[{key:'A-1',assigneeId:'a',category:'completed',added:false,startEstimate:5},{key:'A-2',assigneeId:'b',category:'unfinished',added:false,startEstimate:5},{key:'A-3',assigneeId:'a',category:'completed',added:true,startEstimate:null},{key:'A-4',assigneeId:'a',category:'completed',subtask:true,added:false,startEstimate:100}];
 const selected=S.selection({issues,profile:{includeSubtasks:false}});const m=S.metrics(selected);assert.equal(m.planCompletionPercent,50);assert.equal(m.added,1);assert.equal(m.completed,2);
 issues[1].startEstimate=null;assert.equal(S.metrics(S.selection({issues,profile:{includeSubtasks:false}})).planCompletionPercent,null);
 assert.equal(S.selection({issues,profile:{includeSubtasks:false}},['a']).length,2);
});
test('export protects CSV formulas and does not include descriptions/history without opt-in',()=>{
 const d={context:'',board:{id:'1'},sprint:{id:2,name:'Test'},profile:{includeSubtasks:false},estimation:{unit:'SP'},warnings:[],details:{'A-1':{description:'private',changelog:{}}}};
 const out=S.exportData(d,[{key:'A-1',summary:'=1+1',category:'completed',startEstimate:1}],{},{});
 assert.equal(out.issues[0].description,undefined);assert.ok(S.csv(out).includes("'=1+1"));
 assert.equal(S.exportData(d,out.issues,{}, {description:true}).issues[0].description,'private');
});
const {test:flowTest}=require('node:test');
flowTest('calendar flow reconstructs closed cutoff, reopened work and rejects truncated history',()=>{
 const issue={fields:{created:'2026-01-01',status:{id:'5',name:'Done'}},changelog:{startAt:0,total:4,histories:[['2026-01-02','1','3'],['2026-01-04','3','5'],['2026-01-05','5','3'],['2026-01-07','3','5']].map(([created,from,to])=>({created,items:[{field:'status',from,to}]}))}};
 const p={workStatuses:'3',doneStatuses:'5'};
 const closed=S.flow(issue,{state:'closed',startDate:'2026-01-01',completeDate:'2026-01-06'},p);
 assert.equal(closed.statusIdAtCutoff,'3');assert.equal(closed.ageHours,24);assert.equal(closed.reopened,1);assert.equal(closed.cycleHours,null);
 const done=S.flow(issue,{state:'closed',startDate:'2026-01-01',completeDate:'2026-01-08'},p);assert.equal(done.cycleHours,120);
 issue.changelog.total=5;assert.equal(S.flow(issue,{state:'closed',completeDate:'2026-01-08'},p),null);
 assert.equal(S.metrics([{category:'completed',flow:{cycleHours:2}},{category:'completed',flow:{cycleHours:4}}]).cycle.medianHours,3);
});
test('issue type filter intersects assignee and subtask rules without mixing metrics',()=>{
 const d={profile:{includeSubtasks:false},issues:[{key:'A-1',issuetype:'Bug',assigneeId:'a',category:'completed',startEstimate:2},{key:'A-2',issuetype:'Story',assigneeId:'a',category:'unfinished',startEstimate:5},{key:'A-3',issuetype:'Task',assigneeId:'b',category:'completed',startEstimate:3},{key:'A-4',issuetype:'Bug',assigneeId:'a',subtask:true,startEstimate:10}]};
 assert.deepEqual(S.selection(d,['a'],false,['Bug','Story']).map(r=>r.key),['A-1','A-2']);
 assert.equal(S.metrics(S.selection(d,[],false,['Bug'])).planCompletionPercent,100);
 assert.equal(S.selection(d,['b'],false,['Bug']).length,0);
 assert.equal(S.selection(d,[],true,['Bug']).length,2);
});
