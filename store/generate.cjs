const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=__dirname,ext=path.resolve(out,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const baseUrl='https://jira.example.com',config={baseUrl,project:'DEMO'};
 const makeState=()=>{const R=JbpReports,columns=['summary','status','assignee','issuetype'];const row=(id,summary,status,assignee,type)=>R.row({id:String(id),key:'DEMO-'+id,fields:{summary,status,assignee,issuetype:type}},columns);
 const rows=[row(101,'Подготовить новую версию API','In Progress','Демо-пользователь','Story'),row(102,'Исправить фильтр поиска','To Do','Не назначен','Bug'),row(103,'Добавить проверку конфигурации','To Do','Демо-пользователь','Task')];const old=[rows[0],row(102,'Исправить фильтр поиска','Open','Не назначен','Bug')];const at=Date.parse('2026-10-19T09:00:00+03:00');return {baseUrl,context:'',queries:[{id:'daily',name:'Задачи команды · контроль перед daily',jql:'project = DEMO AND resolution = Unresolved',columns,minutes:60,enabled:true,notify:'membership',lastAttempt:at,nextRun:at+3600000,lastError:''}],results:{daily:{rows,delta:R.diff(old,rows),account:'demo-user',finishedAt:at,previousAt:at-3600000}},jobs:{},fieldNames:{},noticeError:''};};
 globalThis.chrome={permissions:{request:async()=>true},tabs:{create:async()=>{}},storage:{local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener(){}}},runtime:{getURL:f=>'https://demo.invalid/'+f,onMessage:{addListener(){}},sendMessage:async m=>{
 if(m.type==='connectionGet')return {ok:true,data:config};if(m.type==='boardPrefsGet')return {ok:true,data:{...JbpBoard.defaults,daily:true,scope:true,age:true,build:true,backlog:true,sprintTools:true}};
 if(m.type==='get')return {ok:true,data:makeState()};if(m.type==='sprintStore')return {ok:true,data:m.op==='snapshotList'?[]:{mode:'time',spField:'',includeSubtasks:false,statusRules:{workStatusNames:'In Progress',doneStatusNames:'Done',doneCategory:true}}};
 if(m.type==='tools'&&m.op==='rulesGet')return {ok:true,data:{mode:'auto',spField:'',types:[{name:'*',checks:{description:true,estimate:true,team:true}}]}};
 throw Error('Unexpected demo command '+m.type+' '+m.op);
 }}};
});
await page.route('**/*',async r=>{const u=new URL(r.request().url());let data;
 if(u.hostname==='demo.invalid'){const f=path.resolve(ext,u.pathname.slice(1));assert.ok(f.startsWith(ext+path.sep));return r.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':'text/html'});}
 assert.equal(u.hostname,'jira.example.com');
 if(u.pathname.endsWith('/board'))data={startAt:0,isLast:true,values:[{id:7,name:'Demo Platform',type:'scrum'}]};
 else if(u.pathname.endsWith('/configuration'))data={type:'scrum',name:'Demo Platform',estimation:{field:{fieldId:'timeoriginalestimate',displayName:'Original Time Estimate'}},columnConfig:{columns:[{name:'To Do',statuses:[{id:'1'}]},{name:'In Progress',statuses:[{id:'3'}]},{name:'Done',statuses:[{id:'5'}]}]}};
 else if(u.pathname.endsWith('/field'))data=[{id:'timeoriginalestimate',name:'Original Time Estimate'},{id:'customfield_10200',name:'Team'}];
 else if(u.pathname.endsWith('/status'))data=[{id:'1',name:'To Do',statusCategory:{key:'new'}},{id:'3',name:'In Progress',statusCategory:{key:'indeterminate'}},{id:'5',name:'Done',statusCategory:{key:'done'}}];
 else if(u.pathname.endsWith('/sprint'))data={startAt:0,isLast:true,values:[{id:42,name:'Demo Sprint 42',state:'closed'}]};
 else if(u.pathname.endsWith('/sprint/42'))data={id:42,name:'Demo Sprint 42',state:'closed',startDate:'2026-09-21T09:00:00Z',completeDate:'2026-10-02T16:00:00Z'};
 else if(u.pathname.endsWith('/sprintreport'))data={contents:{completedIssues:[{key:'DEMO-101',summary:'Подготовить новую версию API'},{key:'DEMO-102',summary:'Исправить фильтр поиска'}],issuesNotCompletedInCurrentSprint:[{key:'DEMO-103',summary:'Добавить проверку конфигурации'}],puntedIssues:[],issueKeysAddedDuringSprint:{'DEMO-103':true}}};
 else if(/\/issue\/DEMO-/.test(u.pathname)){const id=u.pathname.split('-').at(-1),done=id!=='103';data={fields:{summary:{101:'Подготовить новую версию API',102:'Исправить фильтр поиска',103:'Добавить проверку конфигурации'}[id],assignee:{key:'demo-user',displayName:'Демо-пользователь'},status:{id:done?'5':'3',name:done?'Done':'In Progress'},issuetype:{name:id==='102'?'Bug':'Story',subtask:false},created:'2026-09-18T09:00:00Z',timeoriginalestimate:id==='101'?28800:14400},changelog:{startAt:0,total:done?2:1,histories:[{created:'2026-09-22T09:00:00Z',items:[{field:'status',from:'1',to:'3',fromString:'To Do',toString:'In Progress'}]},...(done?[{created:'2026-09-28T09:00:00Z',items:[{field:'status',from:'3',to:'5',fromString:'In Progress',toString:'Done'}]}]:[])]}};}
 else if(u.pathname.endsWith('/backlog'))data={startAt:0,total:2,issues:[{key:'DEMO-201',fields:{summary:'Описание новой интеграции',issuetype:{name:'Story'},description:null,timeoriginalestimate:null,customfield_10200:'4'}},{key:'DEMO-202',fields:{summary:'Проверить обработку ошибок',issuetype:{name:'Task'},description:'Добавить проверку таймаутов',timeoriginalestimate:7200,customfield_10200:null}}]};
 else throw Error('Unexpected mock URL '+u.href);
 return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});
const shot=async name=>{await page.evaluate(()=>document.body.style.zoom='0.9');await page.screenshot({path:path.join(out,'screenshots',name+'.png')});};
await page.goto('https://demo.invalid/report.html');await page.locator('.report').waitFor();await page.locator('details.settings').evaluateAll(es=>es.forEach(e=>e.open=false));await shot('01-jql-report');
assert.deepEqual(errors,[]);
const logo=fs.readFileSync(path.join(ext,'icons/board-plus.svg'),'utf8');
for(const [name,w,h]of [['small-440x280',440,280],['marquee-1400x560',1400,560]]){
await page.setViewportSize({width:w,height:h});
await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#132d46;color:#f2f8ff;font-family:Arial,sans-serif;height:100vh;display:flex;align-items:center;justify-content:center}.layout{display:flex;align-items:center;gap:42px;padding:32px}.logo{width:180px;flex-shrink:0}svg{width:100%;display:block}h1{font-size:58px;letter-spacing:-2px;margin:0 0 18px}p{font-size:24px;line-height:1.6;margin:0;color:#aee8e1}.tag{display:inline-block;color:#54d5c2;font-size:16px;letter-spacing:3px;margin-bottom:20px}@media(max-width:500px){.layout{display:block;text-align:center;padding:24px}.logo{width:72px;margin:0 auto 18px}h1{font-size:30px;letter-spacing:-1px;margin-bottom:10px}p{font-size:16px}.tag{display:none}}</style><div class="layout"><div class="logo">${logo}</div><div><span class="tag">JIRA SERVER / DATA CENTER</span><h1>Jira Board Plus</h1><p>Доски · Метрики · Роадмэп<br>Контекст команды в вашей Jira</p></div></div>`);
await page.screenshot({path:path.join(out,'promo',name+'.png')});
}
fs.copyFileSync(path.join(ext,'icons/report.png'),path.join(out,'promo/icon-128.png'));
console.log('Store demo report and branded promo images generated from current code.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
