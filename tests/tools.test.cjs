const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
for(const file of ['reports-core','board-core','sprint-core','tools-core','sprint-client','tools-client'])require(`../src/${file}.js`);
const T=JbpTools;
test('refinement: overrides by type, disabled rules, zero estimate and inaccessible fields',()=>{
 const config={types:[{name:'*',checks:{estimate:true,team:true}},{name:'Bug',checks:{description:true}},{name:'Task',checks:{}}]};
 const result=T.inspect([{key:'A-1',fields:{issuetype:{name:'Story'},customfield_1:0,customfield_10200:null}},{key:'A-2',fields:{issuetype:{name:'Bug'},description:' '}},{key:'A-3',fields:{issuetype:{name:'Task'}}},{key:'A-4',fields:{issuetype:{name:'Story'}}}],config,'customfield_1');
 assert.equal(result[0].problems.length,1);assert.equal(result[1].problems.length,1);assert.equal(result[2].checked,false);assert.equal(result[3].unknown.length,2);assert.equal(result[3].problems.length,0);
 assert.throws(()=>T.settings({types:[{name:'Bug'},{name:'bug'}]}));
});
test('transfers distinguish overlapping sprints, removed work, repeated visits and chronological carryover',()=>{
 const report=(id,start,end,category)=>({sprint:{id,name:`S${id}`,startDate:start,completeDate:end,state:'closed'},rows:[{key:'A-1',category}]});
 const data=[report(3,'2026-01-20','2026-01-30','completed'),report(1,'2026-01-01','2026-01-10','unfinished'),report(2,'2026-01-11','2026-01-19','unfinished')];
 assert.equal(T.transfers(data)[0].transfers,2);
 data[1].sprint.completeDate='2026-01-15';assert.equal(T.transfers(data)[0].transfers,1);
 data[2].rows[0].category='removed';assert.equal(T.transfers(data)[0].transfers,0);
});
const bundle=()=>({schema:'jira-board-plus/team-profile/v1',origin:JbpReports.ORIGIN,context:'',visual:{},profiles:{7:{mode:'time'}},refinement:{types:[]},queries:[{name:'Work',jql:'project = A',columns:['summary'],minutes:60,notify:'new',enabled:true}],results:{secret:true}});
test('portable profile allowlists settings and pauses imported queries',()=>{const b=T.bundle(bundle());assert.equal(b.queries[0].enabled,false);assert.equal(b.results,undefined);assert.equal(b.profiles[7].mode,'time');assert.throws(()=>T.bundle({...bundle(),origin:'not-a-url'}));assert.throws(()=>T.bundle({...bundle(),profiles:{bad:{}}}));});
test('profile import preserves results and snapshots, deduplicates queries and rejects context mismatch atomically',async()=>{
 let state={jbpReportsV1:{queries:[],results:{old:{rows:[1]}},jobs:{},context:''},'jbpSprint:7':{profile:{mode:'auto'},snapshots:[{id:'keep'}]}};
 const context=vm.createContext({broadcastPrefs:async()=>{},JbpTools:T,JbpReports,JbpBoard,JbpSprint,R:JbpReports,STORE:'jbpReportsV1',empty:()=>({queries:[],results:{},jobs:{},context:''}),crypto:require('node:crypto').webcrypto,chrome:{storage:{local:{get:async()=>structuredClone(state),set:async update=>Object.assign(state,structuredClone(update))}},tabs:{query:async()=>[],sendMessage:async()=>{}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/tools-store.js'),'utf8'),context);context.input=bundle();
 assert.equal((await vm.runInContext("toolsCommand({op:'import',bundle:input})",context)).added,1);
 assert.equal((await vm.runInContext("toolsCommand({op:'import',bundle:input})",context)).added,0);
 assert.equal(state.jbpReportsV1.results.old.rows[0],1);assert.equal(state['jbpSprint:7'].snapshots[0].id,'keep');assert.equal(state.jbpReportsV1.queries[0].enabled,false);
 const before=JSON.stringify(state);context.input={...bundle(),context:'/jira'};await assert.rejects(vm.runInContext("toolsCommand({op:'import',bundle:input})",context));assert.equal(JSON.stringify(state),before);
});
test('refinement pagination rejects duplicate keys and does not require SP when estimates disabled',async()=>{
 const c=new T.Client('', 'https://jira.example.com');c.get=async()=>[];let page=0;c.post=async()=>({startAt:page++,total:2,issues:[{key:'A-1',fields:{issuetype:{name:'Bug'},description:null}}]});
 const request={board:'',jql:'project=A',config:{mode:'points',types:[{name:'Bug',checks:{description:true}}]}};
 await assert.rejects(c.refinement(request,new AbortController().signal),/Повтор/);
 c.post=async()=>({startAt:0,total:1,issues:[{key:'A-1',fields:{issuetype:{name:'Bug'},description:null}}]});assert.equal((await c.refinement(request,new AbortController().signal)).rows[0].problems.length,1);
});

test('refinement auto-estimates follow board setting and sprint scope stays on selected board',async()=>{
 const c=new T.Client('','https://jira.example.com'),calls=[];
 c.get=async p=>{calls.push(p);if(p==='api/2/field')return [];if(p.endsWith('/configuration'))return {type:'scrum',name:'Team',estimation:{field:{fieldId:'timeoriginalestimate'}}};if(p==='agile/1.0/sprint/99')return {id:99,name:'Future planning',state:'future'};if(p.startsWith('agile/1.0/board/7/sprint/99/issue?'))return {startAt:0,total:1,issues:[{key:'A-1',fields:{issuetype:{name:'Task'},timeoriginalestimate:0}}]};throw Error(p);};
 const result=await c.refinement({board:'7',source:'sprint',sprint:'99',config:{mode:'auto',types:[{name:'*',checks:{estimate:true}}]}},new AbortController().signal);
 assert.equal(result.estimate.unit,'h');assert.equal(result.rows[0].problems.length,0);assert.match(result.source,/Future planning/);assert.ok(calls.some(p=>p.startsWith('agile/1.0/board/7/sprint/99/issue?')&&p.includes('timeoriginalestimate')));
 assert.equal(calls.some(p=>p.includes('sprintreport')),false);
});
test('kanban column scopes all mapped statuses and subquery; backlog uses different endpoint',async()=>{
 const c=new T.Client('','https://jira.example.com'),calls=[];const config={mode:'time',types:[{name:'*',checks:{estimate:true}}]};
 c.get=async p=>{calls.push(p);if(p==='api/2/field')return [];if(p.endsWith('/configuration'))return {type:'kanban',name:'Delivery',subQuery:{query:'fixVersion is EMPTY OR fixVersion in unreleasedVersions()'},columnConfig:{columns:[{name:'Backlog',statuses:[{id:'10'}]},{name:'Selected',statuses:[{id:'1'},{id:'4'}]}]}};return {startAt:0,total:0,issues:[]};};
 await c.refinement({board:'8',source:'column',columnIndex:'1',config},new AbortController().signal);
 const scoped=new URL('https://mock.invalid/'+calls.at(-1));assert.match(scoped.pathname,/board\/8\/issue$/);assert.equal(scoped.searchParams.get('jql'),'status in (1,4) AND (fixVersion is EMPTY OR fixVersion in unreleasedVersions())');
 await c.refinement({board:'8',source:'backlog',config},new AbortController().signal);assert.match(calls.at(-1),/board\/8\/backlog\?/);
 await assert.rejects(c.refinement({board:'8',source:'sprint',sprint:'2',config},new AbortController().signal),/Kanban/);
 await assert.rejects(c.refinement({board:'8',source:'column',columnIndex:'9',config},new AbortController().signal),/колонку/);
 await assert.rejects(c.refinement({board:'8',source:'backlog',config:{...config,mode:'auto'}},new AbortController().signal),/не задала поле оценки/);
});
test('refinement auto mode skips estimation requirement when no estimate rule is enabled',async()=>{
 const c=new T.Client('','https://jira.example.com');c.get=async p=>p==='api/2/field'?[]:p.endsWith('/configuration')?{type:'kanban',name:'Support'}:{startAt:0,total:0,issues:[]};
 const result=await c.refinement({board:'8',source:'backlog',config:{mode:'auto',types:[{name:'*',checks:{description:true}}]}},new AbortController().signal);assert.equal(result.estimate.field,null);
});

test('additional refinement checks distinguish empty fields, missing access and populated values',()=>{
 const checks={priority:true,components:true,fixVersions:true,labels:true,duedate:true},config={types:[{name:'*',checks}]};
 const rows=T.inspect([{key:'A-1',fields:{issuetype:{name:'Task'},priority:null,components:[],fixVersions:[],labels:[],duedate:null}},{key:'A-2',fields:{issuetype:{name:'Task'}}},{key:'A-3',fields:{issuetype:{name:'Task'},priority:{id:'3'},components:[{id:'1'}],fixVersions:[{id:'1'}],labels:['ready'],duedate:'2026-12-01'}}],config,null,null);
 assert.equal(rows[0].problems.length,5);assert.equal(rows[0].unknown.length,0);assert.equal(rows[1].problems.length,0);assert.equal(rows[1].unknown.length,5);assert.equal(rows[2].problems.length,0);assert.equal(rows[2].unknown.length,0);
});
