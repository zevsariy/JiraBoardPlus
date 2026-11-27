const {test}=require('node:test'),assert=require('node:assert/strict');
require('../src/board-core.js');require('../src/dashboard-core.js');require('../src/analytics-core.js');
const A=JbpAnalytics,H=A.H,D=A.DAY,at=s=>Date.parse(s+'Z');
const m={id:'dev',name:'Разработка',start:['2'],end:['3','4'],rule:'final',created:false,measure:'elapsed',excluded:[],counted:[],types:[],sle:0};
const visits=[{status:'1',from:0,to:D},{status:'2',from:D,to:3*D},{status:'3',from:3*D,to:4*D},{status:'4',from:4*D,to:5*D},{status:'2',from:5*D,to:6*D},{status:'3',from:6*D,to:8*D}];
test('metric rules: terminal group, first/final/each, reopening and boundary cutoffs',()=>{
 assert.deepEqual(A.intervals(visits,m,5*D),{complete:[{from:D,to:3*D}],active:null});
 assert.deepEqual(A.intervals(visits,m,6*D),{complete:[],active:D});
 assert.deepEqual(A.intervals(visits,m,8*D).complete,[{from:D,to:6*D}]);
 assert.deepEqual(A.intervals(visits,{...m,rule:'first'},8*D).complete,[{from:D,to:3*D}]);
 assert.deepEqual(A.intervals(visits,{...m,rule:'each'},8*D).complete,[{from:D,to:3*D},{from:5*D,to:6*D}]);
 assert.equal(A.intervals(visits,{...m,created:true,start:[]},8*D).complete[0].from,0);
});
test('duration measures all elapsed time, selected states, exclusions and unknown histories separately',()=>{
 const rows=[{key:'D-1',type:'Story',visits},{key:'D-2',type:'Story',visits:null}];const range={start:0,end:8*D};
 let result=A.calculate(rows,m,{},range,8*D);assert.equal(result.stats.median,120);assert.equal(result.unknown.length,1);
 result=A.calculate(rows,{...m,measure:'statuses',counted:['2']},{},range,8*D);assert.equal(result.stats.median,72);
 result=A.calculate(rows,{...m,excluded:['3','4']},{},range,8*D);assert.equal(result.stats.median,72);
 assert.equal(A.calculate(rows,{...m,types:['Bug']},{},range,8*D).stats.n,0);
 assert.equal(A.calculate(rows,m,{}, {start:6*D,end:7*D},8*D).stats.n,1);
 assert.equal(A.calculate(rows,m,{}, {start:0,end:6*D},8*D).stats.n,0);
});
test('business calendar clips shifts, excludes weekends/holidays and uses local dates',()=>{
 const c={mode:'business',zone:'Europe/Moscow',days:[1,2,3,4,5],start:'09:00',end:'18:00',holidays:['2026-11-30']};
 const start=at('2026-11-27T12:00:00'),end=at('2026-12-01T08:00:00');
 assert.equal(A.clock(c,start,end)(start,end),5); // Friday 15–18 and Tuesday 9–11.
 const f=A.clock({...c,holidays:[]},start,end);assert.equal(f(start,end),14);assert.equal(f(end,start),0);
 assert.equal(A.clock({},start,end)(start,end),(end-start)/H);
});
test('business calendar respects daylight-saving 23/25-hour days in IANA timezone',()=>{
 const c={mode:'business',zone:'America/New_York',days:[0],start:'00:00',end:'04:00',holidays:[]};
 let start=at('2026-03-08T05:00:00'),end=at('2026-03-08T08:00:00');assert.equal(A.clock(c,start,end)(start,end),3);
 start=at('2026-11-01T04:00:00');end=at('2026-11-01T09:00:00');assert.equal(A.clock(c,start,end)(start,end),5);
});
test('profiles reject broken rules/calendars and preserve custom definitions and views',()=>{
 for(const patch of [{start:['3']},{end:[]},{sle:-1},{rule:'last'},{measure:'statuses',counted:[]}])assert.throws(()=>A.metric({...m,...patch}));
 for(const patch of [{zone:'Mars/Test'},{days:[]},{start:'18:00',end:'09:00'},{holidays:['2026-02-30']}])assert.throws(()=>A.calendar(patch));
 const p=A.template('scrum',{workStatuses:'2',doneStatuses:'3,4'});p.views=[{name:'Daily',hidden:['hist-lead'],order:['aging']}];assert.equal(A.profile(p).views[0].name,'Daily');assert.throws(()=>A.profile({...p,metrics:[m,m]}));
});
test('CFD reconstructs queue/work/done without equating created with board arrival',()=>{
 const points=A.history([{key:'D-1',type:'Story',visits},{key:'D-2',visits:null}],m,{start:0,end:8*D});
 assert.equal(points[0].groups.queue.length,1);assert.equal(points[1].groups.work.length,1);assert.equal(points[3].groups.done.length,1);assert.equal(points[5].groups.work.length,1);assert.equal(points[6].groups.done.length,1);
});
test('sprint membership supports legacy Server fields and refuses ambiguous history',()=>{
 assert.deepEqual(A.sprintIds(['com.atlassian.Sprint@abc[id=21,rapidViewId=1,state=CLOSED]']),['21']);assert.deepEqual(A.sprintIds([{id:21},{id:22}]),['21','22']);assert.equal(A.sprintIds('Sprint 21'),null);
 const start=at('2026-11-01T00:00:00'),end=at('2026-11-04T00:00:00');
 const issue={fields:{created:'2026-10-01T00:00:00Z',status:{id:'3'},sprint:[{id:21}]},changelog:{startAt:0,total:3,histories:[{created:'2026-11-02T12:00:00Z',items:[{field:'Sprint',fieldId:'customfield_1',from:null,to:'21'}]},{created:'2026-11-02T13:00:00Z',items:[{field:'status',from:'1',to:'2'}]},{created:'2026-11-03T12:00:00Z',items:[{field:'status',from:'2',to:'3'}]}]}};
 const dataset={sprint:{id:21,startDate:new Date(start).toISOString(),completeDate:new Date(end).toISOString()},loadedAt:new Date(end+D).toISOString(),profile:{doneStatuses:'3'},issues:[{key:'D-1'}],details:{'D-1':{historyIssue:issue,sprintField:'customfield_1'}}};
 let p=A.sprintHistory(dataset);assert.equal(p[0].total,0);assert.equal(p[2].total,1);assert.equal(p.at(-1).done,1);assert.equal(p.at(-1).remaining,0);
 issue.changelog.total=20;p=A.sprintHistory(dataset);assert.equal(p.at(-1).total,null);assert.equal(p.at(-1).unknown,1);
});
test('business shift endpoints are deterministic in DST gaps and repeated hours',()=>{
 const c={mode:'business',zone:'America/New_York',days:[0],start:'02:30',end:'04:00',holidays:[]};
 const start=at('2026-03-08T05:00:00'),end=at('2026-03-08T09:00:00');assert.equal(A.clock(c,start,end)(start,end),0.5);
 const a=at('2026-11-01T04:00:00'),b=at('2026-11-01T09:00:00');assert.equal(A.clock({...c,start:'01:00',end:'02:00'},a,b)(a,b),2);
});
test('creation cannot start repeated runs and invalid profile revisions are rejected',()=>{
 assert.throws(()=>A.metric({...m,created:true,start:[],rule:'each'}),/начальные статусы/);
 const p=A.template('kanban',{workStatuses:'2',doneStatuses:'3'});
 assert.throws(()=>A.profile({...p,revision:Infinity}),/версия/);
});
