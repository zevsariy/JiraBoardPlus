const {test}=require('node:test'),assert=require('node:assert/strict');
require('../src/board-core.js');require('../src/sprint-core.js');require('../src/dashboard-core.js');require('../src/dashboard-client.js');
const D=JbpDashboard,prefs={...JbpBoard.defaults,workStatusNames:'Doing',doneStatusNames:'Done, Closed',doneCategory:false},statuses=[{id:'1',name:'Todo'},{id:'2',name:'Doing'},{id:'3',name:'Done'},{id:'4',name:'Closed'},{id:'5',name:'Blocked'}];
const at=s=>Date.parse('2026-10-'+s+'T00:00:00Z'),now=at('20'),range=D.period('2026-10-01','2026-10-15',now);
function issue(key,changes=[],status='2'){return {key,fields:{created:'2026-10-01T00:00:00Z',summary:key,status:statuses.find(s=>s.id===status),issuetype:{name:'Story'},assignee:null,issuelinks:[]},changelog:{startAt:0,total:changes.length,histories:changes.map(([day,from,to])=>({created:'2026-10-'+day+'T00:00:00Z',items:[{field:'status',from,to}]}))}};}
test('flow history uses period-end state, terminal group entries and excludes incomplete history',()=>{
 const closed=issue('D-1',[['02','1','2'],['05','2','3'],['08','3','4']],'4');
 const reopenedAfter=issue('D-2',[['02','1','2'],['05','2','3'],['18','3','2']]);
 const reopenedBefore=issue('D-3',[['02','1','2'],['05','2','3'],['10','3','2']]);
 const partial=issue('D-4',[]);partial.changelog.total=20;
 const rows=D.rows([closed,reopenedAfter,reopenedBefore,partial],statuses,prefs,range,now),m=D.aggregate(rows,range,7);
 assert.equal(rows[0].completedAt,at('05'));assert.equal(rows[0].cycleHours,72);assert.equal(rows[0].leadHours,96);
 assert.equal(rows[1].completedAt,at('05'));assert.equal(rows[1].ageHours,48);assert.equal(rows[2].completedAt,null);assert.equal(rows[3].ageHours,null);
 assert.equal(m.completed.length,2);assert.equal(m.wip.length,3);assert.equal(m.unknown.length,1);assert.equal(m.aging.length,1);assert.equal(m.cycle.median,72);assert.equal(m.weeks.reduce((n,w)=>n+w.completed.length,0),2);
});
test('flow excludes inconsistent histories, handles duplicate closure visits and case-insensitive blockers',()=>{
 const x=issue('D-1',[['02','1','2'],['04','2','3'],['06','3','2'],['09','2','3']],'3');
 assert.equal(D.rows([x],statuses,prefs,range,now)[0].completedAt,at('09'));
 x.changelog.histories[1].items[0].from='unexpected';assert.equal(D.timeline(x,now),null);
 const b=issue('D-2',[],'5');b.fields.issuelinks=[{type:{inward:'is blocked by'},inwardIssue:{key:'D-1',fields:{status:{name:'dOnE'}}}},{type:{inward:'is blocked by'},inwardIssue:{key:'D-3',fields:{status:{name:'Closed'}}}}];
 let r=D.rows([b],statuses,prefs,range,now)[0];assert.equal(r.blocked,true);assert.equal(r.unblocked,true);b.fields.issuelinks[1].inwardIssue.fields.status.name='Doing';assert.equal(D.rows([b],statuses,prefs,range,now)[0].unblocked,false);
});
test('period rejects future/reversed/overlong windows and sprint recurrence does not mix units or types',()=>{
 assert.throws(()=>D.period('2026-10-21','2026-10-22',now));assert.throws(()=>D.period('2026-10-15','2026-10-01',now));assert.throws(()=>D.period('2026-02-30','2026-03-02',now));assert.throws(()=>D.period('2026-10-01','2026-10-21',now));assert.throws(()=>D.period('2020-01-01','2026-10-01',now));
 const ds=unit=>({sprint:{id:unit,name:unit},estimation:{unit},issues:[{key:'D-1',issuetype:'Bug',category:'unfinished',added:false,startEstimate:3},{key:'D-2',issuetype:'Story',category:'completed',startEstimate:8}]});
 const result=D.sprintTrend([ds('SP'),ds('h')],'Bug');assert.equal(result.recurring.length,1);assert.equal(result.sprints[0].metrics.planned.value,3);assert.equal(result.sprints[1].unit,'h');
 assert.equal(JbpSprint.estimation({},[],{mode:'none'}).unit,'count');assert.equal(JbpSprint.estimation({estimation:{type:'issueCount'}},[],{mode:'auto'}).unit,'count');
});
test('dashboard client fetches current board filter and refuses partial or changing pagination',async()=>{
 let calls=[],broken=false;const client={get:async path=>{calls.push(path);if(path.includes('configuration'))return{filter:{id:99}};if(path==='api/2/status')return statuses;const u=new URL('https://test/'+path),start=Number(u.searchParams.get('startAt'));assert.match(u.searchParams.get('jql'),/filter = 99/);return{startAt:start,total:2,issues:start===0?[issue('D-1')]:broken?[]:[issue('D-2')]};}};
 const result=await D.load(client,{id:1,name:'Board'},prefs,range);assert.equal(result.rows.length,2);assert.equal(calls.filter(s=>s.includes('search')).length,2);broken=true;await assert.rejects(D.load(client,{id:1},prefs,range),/неполный/);
});

test('P50/70/80/85 use nearest rank, keep median separate and export chosen sprint percentile',()=>{
 const sample=Array.from({length:10},(_,i)=>({key:'D-'+i,done:true,completedAt:at('05'),cycleHours:i+1,leadHours:i+1}));
 for(const [p,expected]of [[50,5],[70,7],[80,8],[85,9]]){const a=D.aggregate(sample,range,7,p);assert.equal(a.cycle.percentile,p);assert.equal(a.cycle.percentileValue,expected);assert.equal(a.cycle.median,5.5);const sprint=JbpSprint.metrics(sample.map(r=>({...r,category:'completed',flow:{cycleHours:r.cycleHours}})),p);assert.equal(sprint.cycle.percentileHours,expected);assert.equal(sprint.cycle.medianHours,5.5);}
 assert.equal(D.aggregate([],range,7,70).cycle.percentileValue,null);
 assert.equal(D.aggregate([{completedAt:at('05'),cycleHours:0},{completedAt:at('05'),cycleHours:null}],range,7,85).cycle.percentileValue,0);
 assert.equal(D.aggregate(sample,range,7,99).cycle.percentile,85);
 const out=JbpSprint.exportData({baseUrl:'https://jira.example',board:{},sprint:{},details:{}},sample.map(r=>({...r,category:'completed',flow:{cycleHours:r.cycleHours}})),{},{percentile:80});assert.equal(out.metrics.cycle.percentileHours,8);
});

test('display preserves short nonzero durations and distinguishes missing data',()=>{assert.equal(D.formatNumber(0.021),'0,02');assert.equal(D.formatNumber(0.001),'<0,01');assert.equal(D.formatNumber(0),'0');assert.equal(D.formatNumber(null),'—');assert.equal(D.formatNumber(NaN),'—');});
