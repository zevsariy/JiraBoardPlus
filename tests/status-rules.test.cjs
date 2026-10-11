const {test}=require('node:test'),assert=require('node:assert/strict');
require('../src/board-core.js');require('../src/sprint-core.js');require('../src/sprint-client.js');
const B=JbpBoard,S=JbpSprint;
const statuses=[{id:'1',name:'To Do',statusCategory:{key:'new'}},{id:'3',name:'В работе',statusCategory:{key:'indeterminate'}},{id:'30',name:'в РАБОТЕ',statusCategory:{key:'indeterminate'}},{id:'5',name:'Закрыта',statusCategory:{key:'done'}},{id:'6',name:'Obsolete',statusCategory:{key:'done'}}];
test('one case-insensitive status rule resolves all matching IDs, same completion as board',()=>{
 const input={workStatusNames:' В РАБОТЕ, в работе ',doneStatusNames:' закрыта ',doneCategory:false};const rules=B.statusRules(input),resolved=B.resolveStatusRules(statuses,rules);
 assert.equal(rules.workStatusNames,'в работе');assert.equal(resolved.workStatuses,'3,30');assert.equal(resolved.doneStatuses,'5');
 assert.equal(B.isDone(statuses[3],rules),true);assert.equal(B.isDone(statuses[4],rules),false);
 assert.equal(B.resolveStatusRules(statuses,{...rules,doneCategory:true}).doneStatuses,'5,6');
 assert.throws(()=>B.statusRules({workStatusNames:'Done',doneStatusNames:' done '}),/одновременно/);
 assert.throws(()=>B.resolveStatusRules(statuses,{workStatusNames:'Obsolete',doneStatusNames:'Закрыта',doneCategory:true}),/также считается/);
 assert.ok(B.resolveStatusRules(statuses,{workStatusNames:'Missing',doneStatusNames:'Закрыта',doneCategory:false}).warnings.some(w=>w.includes('Missing')));
});
test('sprint load ignores legacy per-board IDs and columns in favor of shared names',async()=>{
 const c=new S.Client('','https://jira.example.com'),rules={workStatusNames:'в работе',doneStatusNames:'ЗАКРЫТА',doneCategory:false};
 c.get=async path=>{
  if(path.endsWith('/configuration'))return {name:'Board',columnConfig:{columns:[{statuses:[{id:'90'}]},{statuses:[{id:'91'}]},{statuses:[{id:'92'}]}]}};
  if(path==='api/2/field')return [];
  if(path==='api/2/status')return statuses;
  if(path==='agile/1.0/sprint/2')return {id:2,state:'closed',startDate:'2026-01-01',completeDate:'2026-01-08'};
  if(path.startsWith('greenhopper/'))return {contents:{completedIssues:[{key:'DEMO-1'}],issuesNotCompletedInCurrentSprint:[],puntedIssues:[],issueKeysAddedDuringSprint:{}}};
  if(path.startsWith('api/2/issue/'))return {fields:{created:'2026-01-01',status:statuses[3],timeoriginalestimate:3600,issuetype:{name:'Task'}},changelog:{startAt:0,total:2,histories:[{created:'2026-01-02',items:[{field:'status',from:'1',to:'3',fromString:'To Do',toString:'В работе'}]},{created:'2026-01-04',items:[{field:'status',from:'3',to:'5',fromString:'В работе',toString:'Закрыта'}]}]}};
  throw new Error('Unexpected '+path);
 };
 const data=await c.load('1','2',{mode:'time',workStatuses:'91',doneStatuses:'92',statusRules:rules},new AbortController().signal);
 assert.equal(data.profile.workStatuses,'3,30');assert.equal(data.profile.doneStatuses,'5');assert.equal(data.issues[0].flow.cycleHours,48);
 assert.equal(data.profile.statusRules.doneCategory,false);assert.equal(S.exportData(data,data.issues,{}).profile.statusRules.workStatusNames,'в работе');
});
