const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],calls=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 let fail=false,failReport=false,releaseSlow;const slow=new Promise(r=>releaseSlow=r);
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());assert.equal(u.origin,'https://127.0.0.1');
  if(u.pathname.startsWith('/jira/rest/')){
   calls.push(u.pathname+u.search);let data;
   if(u.pathname==='/jira/rest/agile/1.0/board'){
    assert.equal(u.searchParams.get('projectKeyOrId'),'DEMO');const start=Number(u.searchParams.get('startAt'));
    data=start===0?{startAt:0,isLast:false,values:[{id:1,name:'Alpha Platform',type:'scrum'},{id:2,name:'Beta Platform',type:'scrum'}]}:{startAt:2,isLast:true,values:[{id:3,name:'Support',type:'kanban'},{id:4,name:'Broken',type:'scrum'}]};
   }else if(u.pathname.endsWith('/board/1/sprint')){await slow;data={startAt:0,isLast:true,values:[{id:11,name:'Old Sprint',state:'closed'}]};}
   else if(u.pathname.endsWith('/board/2/sprint')){data={startAt:0,isLast:true,values:[{id:21,name:'Platform Release 42',state:'active'},{id:22,name:'Platform Release 41',state:'closed'}]};}
   else if(u.pathname.endsWith('/board/4/sprint')){if(!fail){fail=true;return route.fulfill({status:404,contentType:'application/json',body:'{}'});}data={startAt:0,isLast:true,values:[]};}
   else if(u.pathname.endsWith('/configuration'))data={name:'Beta Platform',estimation:{field:{fieldId:'customfield_1',displayName:'Story Points'}},columnConfig:{columns:[]}};
   else if(u.pathname.endsWith('/status'))data=[{id:'1',name:'To Do',statusCategory:{key:'new'}},{id:'3',name:'In Progress',statusCategory:{key:'indeterminate'}},{id:'5',name:'Done',statusCategory:{key:'done'}}];
else if(u.pathname.endsWith('/field'))data=[];
   else if(/\/sprint\/\d+$/.test(u.pathname))data={id:Number(u.pathname.split('/').at(-1)),name:'Platform Release '+(u.pathname.endsWith('/21')?'42':'41'),state:'closed',startDate:'2026-01-02',completeDate:'2026-01-10'};
   else if(u.pathname.endsWith('/sprintreport')){if(failReport)return route.fulfill({status:404,contentType:'application/json',body:'{}'});data={contents:{completedIssues:[],issuesNotCompletedInCurrentSprint:[],puntedIssues:[],issueKeysAddedDuringSprint:{}}};}
   else throw new Error('Unexpected '+u.pathname);
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  }
  const file=u.pathname.slice(1);assert.ok(!file.includes('..'));return route.fulfill({body:fs.readFileSync(path.join(__dirname,'..',file)),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});
 });
 await page.addInitScript(()=>{
  let connection={baseUrl:'https://127.0.0.1/jira',project:'DEMO'},listeners=[];
  globalThis.setProject=project=>{connection={...connection,project};listeners.forEach(fn=>fn({jbpReportsV1:{}},'local'));};
  globalThis.chrome={storage:{local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{sendMessage:async m=>{
   if(m.type==='connectionGet')return {ok:true,data:connection};
   if(m.type==='sprintStore'){if(m.op==='profileGet')await new Promise(resolve=>setTimeout(resolve,50));return {ok:true,data:m.op==='snapshotList'?[]:{mode:'time',spField:'',includeSubtasks:false}};}
   throw new Error('Unexpected message '+m.type);
  }}};
 });
 await page.goto('https://127.0.0.1/metrics.html');await page.getByText('Досок: 4',{exact:true}).waitFor();
 assert.equal(calls.length,2);assert.equal(await page.locator('#context').count(),0);assert.equal(await page.getByRole('button',{name:'Загрузить спринты'}).count(),0);
 await page.locator('#board').fill('pLaTfOrM');assert.equal(await page.locator('#board-options [role=option]').count(),2);
 await page.getByRole('option',{name:'Alpha Platform · Scrum · #1',exact:true}).click();await page.waitForFunction(()=>document.getElementById('sprint').placeholder==='Загрузка спринтов…');
 await page.locator('#board').fill('BETA');await page.getByRole('option',{name:'Beta Platform · Scrum · #2',exact:true}).click();await page.getByText('Спринтов: 2',{exact:true}).waitFor();releaseSlow();
 await page.locator('#sprint').fill('RELEASE 42');assert.equal(await page.locator('#sprint-options [role=option]').count(),1);await page.locator('#sprint').press('Enter');assert.equal(await page.locator('#open').count(),0);
 await page.locator('#metrics #meta').filter({hasText:'Original Time Estimate (h)'}).waitFor();assert.equal(calls.filter(x=>x.includes('/sprintreport')).length,1);await page.locator('#metrics #saved option').waitFor({state:'attached'});
 await page.screenshot({path:'test-output/metrics-pickers.png',fullPage:true});
 failReport=true;await page.locator('#metrics #load').click();await page.locator('#metrics #status').filter({hasText:'HTTP 404'}).waitFor();await page.locator('#metrics #dismiss-status').click();assert.equal(await page.locator('#metrics #status-box').isHidden(),true);failReport=false;
 await page.locator('#metrics #load').click();await page.locator('#metrics #status').filter({hasText:'Данные загружены'}).waitFor();assert.equal(calls.filter(x=>x.includes('/sprintreport')).length,3);
 await page.locator('#sprint').fill('release 41');await page.locator('#sprint').press('Enter');await page.locator('#metrics #meta').filter({hasText:'Platform Release 41'}).waitFor();assert.equal(calls.filter(x=>x.includes('/sprintreport')).length,4);

 await page.locator('#board').fill('not found');assert.equal(await page.locator('#open').count(),0);assert.equal(await page.locator('#metrics #load').count(),0);await page.getByText('Ничего не найдено',{exact:true}).waitFor();
 await page.locator('#board').fill('support');await page.locator('#board').press('Enter');assert.equal(await page.locator('#sprint').isDisabled(),true);assert.equal(calls.some(x=>x.includes('/board/3/sprint')),false);
 await page.locator('#board').fill('broken');await page.locator('#board').press('Enter');await page.locator('#message').filter({hasText:'HTTP 404'}).waitFor();await page.locator('#dismiss-message').click();assert.equal(await page.locator('#message').isHidden(),true);
 await page.locator('#retry-list').click();await page.getByText('Спринтов: 0',{exact:true}).waitFor();
 const before=calls.length;await page.evaluate(()=>setProject(''));await page.getByText('Проект не задан. Запросы к Jira не выполнялись.',{exact:true}).waitFor();assert.equal(calls.length,before);assert.equal(await page.locator('#board').isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('Metrics UI OK: paginated project boards, case-insensitive substring search, click/Enter selection, automatic sprints, stale request suppression, Kanban, empty project/list, dismiss/retry errors.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
