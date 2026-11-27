const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:process.env.JBP_TEST_CHANNEL||'chromium',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
 const ago=n=>new Date(Date.now()-n*86400000).toISOString();
 const statuses=[{id:'1',name:'Todo'},{id:'2',name:'Doing'},{id:'3',name:'Done',statusCategory:{key:'done'}},{id:'4',name:'Blocked'}];
 function issue(key,type,status,changes,partial=false){return{key,fields:{summary:'Демо '+key,created:ago(20),status:statuses.find(s=>s.id===status),issuetype:{name:type},assignee:null,issuelinks:status==='4'?[{type:{inward:'is blocked by'},inwardIssue:{key:'DEMO-2',fields:{status:{name:'Done'}}}}]:[]},changelog:{startAt:0,total:partial?50:changes.length,histories:changes.map(([days,from,to])=>({created:ago(days),items:[{field:'status',from,to}]}))}};}
 const issues=[issue('DEMO-1','Story','2',[[12,'1','2']]),issue('DEMO-2','Story','3',[[10,'1','2'],[2,'2','3']]),issue('DEMO-3','Bug','4',[[9,'1','4']]),issue('DEMO-4','Task','3',[],true)];
 await page.route('**/*',async route=>{const u=new URL(route.request().url());assert.equal(u.origin,'https://jira.example.com');let data;
  if(u.pathname.includes('/rest/')){calls.push(u.pathname+u.search);
   if(u.pathname.endsWith('/board'))data={startAt:0,isLast:true,values:[{id:1,name:'Product',type:'scrum'},{id:2,name:'Support',type:'kanban'}]};
   else if(u.pathname.endsWith('/configuration'))data={name:'Demo',filter:{id:99},estimation:{type:'issueCount'},columnConfig:{columns:[]}};
   else if(u.pathname.endsWith('/status'))data=statuses;
   else if(u.pathname.endsWith('/search'))data={startAt:0,total:issues.length,issues};
   else if(u.pathname.endsWith('/sprint'))data={startAt:0,isLast:true,values:[{id:21,name:'Sprint 1',state:'closed',completeDate:ago(15)},{id:22,name:'Sprint 2',state:'closed',completeDate:ago(2)}]};
   else throw Error('Unexpected API '+u.pathname);
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  }
  const f=path.join(__dirname,'..',u.pathname.slice(1));return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':'text/html'});
 });
 await page.addInitScript(()=>{const state={jbpBoardPrefs:{workStatusNames:'Doing',doneStatusNames:'Done',doneCategory:true,blockedStatusNames:'Blocked',unblockingStatusNames:'Done'}},listeners=[];globalThis.chrome={storage:{local:{get:async k=>({[k]:state[k]}),set:async v=>{if(globalThis.failStorage)throw Error('Хранилище недоступно');Object.assign(state,v);globalThis.savedState=state;}},onChanged:{addListener:f=>listeners.push(f),removeListener:f=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);}}},runtime:{sendMessage:async m=>{if(m.type==='networkBudget')return {ok:true,data:{bypass:true}};if(m.type==='connectionGet')return{ok:true,data:{baseUrl:'https://jira.example.com',project:'DEMO'}};if(m.type==='aiGet')return{ok:true,data:{enabled:true,board:true,sprint:true,endpoint:'https://llm.example/v1',model:'demo'}};if(m.type==='aiAnalyze'){globalThis.aiPayload=JSON.parse(m.payload);return{ok:true,data:{text:'Проверьте DEMO-3'}};}if(m.type==='sprintStore')return{ok:true,data:{mode:'auto',statusRules:state.jbpBoardPrefs}};return{ok:true};}}};});
 await page.goto('https://jira.example.com/metrics.html');await page.locator('#board').fill('support');await page.locator('#board').press('Enter');await page.locator('#flow-data').waitFor({state:'visible'});

 await page.locator('[data-widget="cycle"] svg').waitFor();
 assert.equal(await page.locator('[data-widget="cfd"] svg').count(),1);
 const initialCalls=calls.length;
 await page.getByRole('button',{name:'Создать метрику',exact:true}).click();
 await page.locator('#metric-name').fill('Разработка до поставки');
 await page.locator('#metric-rule').selectOption('each');
 await page.locator('#metric-calendar').selectOption('business');
 await page.locator('#metric-zone').fill('Europe/Moscow');
 await page.locator('#metric-day-start').fill('09:00');await page.locator('#metric-day-end').fill('18:00');
 await page.locator('#metric-holidays').fill('2026-11-23');
 await page.locator('#metric-sle').fill('40');
 await page.locator('#metric-preview').selectOption('DEMO-2');
 await page.locator('#metric-preview').dispatchEvent('change');
 assert.match(await page.locator('.analytics-preview').textContent(),/Рабочие часы/);
 await page.screenshot({path:'test-output/analytics-builder-light.png',fullPage:true});
 await page.getByRole('button',{name:'Сохранить метрику и календарь',exact:true}).click();
 await page.locator('#analytics-editor').waitFor({state:'hidden'});
 const key='jbpDashboard:'+encodeURIComponent('https://jira.example.com')+':2:analytics';
 const saved=await page.evaluate(key=>savedState[key],key);assert.equal(saved.metrics.length,3);assert.equal(saved.calendar.mode,'business');assert.equal(saved.calendar.holidays[0],'2026-11-23');
 const custom=saved.metrics.find(m=>m.name==='Разработка до поставки');assert.equal(custom.rule,'each');
 await page.locator('#analytics-primary').selectOption(custom.id);await page.locator('#analytics-status').filter({hasText:'Профиль сохранён'}).waitFor();
 assert.match(await page.locator('.analytics-kpis').textContent(),/Разработка до поставки/);
 assert.equal(calls.length,initialCalls,'Metric/calendar changes must not refetch Jira');
 await page.getByRole('button',{name:'Процесс и календарь',exact:true}).click();
 await page.locator('#metric-end-3').uncheck();await page.getByRole('button',{name:'Сохранить метрику и календарь',exact:true}).click();assert.match(await page.locator('.analytics-error').textContent(),/конечный статус/);
 await page.locator('#metric-end-3').check();await page.locator('#metric-name').fill('Unsaved draft');await page.getByRole('button',{name:'Отменить',exact:true}).click();assert.equal(await page.locator('#analytics-primary option').filter({hasText:'Unsaved draft'}).count(),0);
 await page.locator('.analytics-widget-list').locator('..').locator('summary').click();
 await page.locator('#analytics-visible-hist-lead').uncheck();await page.locator('[data-widget="hist-lead"]').waitFor({state:'hidden'});
 await page.getByRole('textbox',{name:'Название представления'}).fill('Daily');await page.getByRole('button',{name:'Сохранить вид',exact:true}).click();await page.locator('#analytics-view option').filter({hasText:'Daily'}).waitFor({state:'attached'});
 await page.getByRole('button',{name:'Kanban',exact:true}).click();await page.locator('[data-widget="hist-lead"]').waitFor({state:'visible'});await page.locator('#analytics-view').selectOption('0');await page.locator('[data-widget="hist-lead"]').waitFor({state:'hidden'});
 await page.locator('#analytics-visible-cfd').focus();await page.keyboard.press('Space');await page.locator('[data-widget="cfd"]').waitFor({state:'hidden'});await page.locator('#analytics-visible-cfd').check();await page.locator('[data-widget="cfd"]').waitFor({state:'visible'});
 const dl=page.waitForEvent('download');await page.locator('#flow-export').click();const exported=JSON.parse(fs.readFileSync(await(await dl).path(),'utf8'));assert.equal(exported.analytics.profile.metrics.length,3);assert.ok(exported.analytics.results.some(r=>r.metric.id===custom.id));
 await page.locator('#flow-refresh').click();await page.locator('#flow-data').waitFor({state:'visible'});await page.locator('#analytics-primary').waitFor();assert.equal(await page.locator('#analytics-primary').inputValue(),custom.id);
 await page.getByRole('button',{name:'Процесс и календарь',exact:true}).click();await page.locator('#metric-name').fill('Not saved');await page.evaluate(()=>globalThis.failStorage=true);await page.getByRole('button',{name:'Сохранить метрику и календарь',exact:true}).click();await page.locator('.analytics-error').filter({hasText:'Хранилище недоступно'}).waitFor({state:'visible'});assert.match(await page.locator('.analytics-error').textContent(),/Хранилище недоступно/);assert.equal((await page.evaluate(key=>savedState[key],key)).metrics.find(m=>m.id===custom.id).name,'Разработка до поставки');await page.evaluate(()=>globalThis.failStorage=false);await page.getByRole('button',{name:'Отменить',exact:true}).click();
 await page.getByRole('button',{name:'Процесс и календарь',exact:true}).click();await page.getByRole('button',{name:'Сохранить метрику и календарь',exact:true}).click();await page.locator('#analytics-editor').waitFor({state:'hidden'});await page.locator('.analytics-widget-list').locator('..').evaluate(e=>e.open=false);
 for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:1100});await page.locator('.analytics-workspace').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:'test-output/analytics-'+scheme+'.png'});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>[e.tagName,e.className,e.id,e.getBoundingClientRect().right,e.outerHTML.slice(0,250)]))));await page.getByRole('button',{name:'Процесс и календарь',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>[e.tagName,e.className,e.id,e.getBoundingClientRect().right,e.outerHTML.slice(0,250)]))));await page.getByRole('button',{name:'Отменить',exact:true}).click();}
 await page.setViewportSize({width:1440,height:1100});await page.getByRole('button',{name:'Процесс и календарь',exact:true}).click();await page.getByRole('button',{name:'Удалить метрику',exact:true}).click();await page.getByRole('button',{name:'Удалить',exact:true}).click();await page.locator('#analytics-editor').waitFor({state:'hidden'});assert.equal((await page.evaluate(key=>savedState[key],key)).metrics.length,2);

 await page.locator('#board').fill('product');await page.locator('#board').press('Enter');await page.locator('#flow-data').waitFor({state:'visible'});
 await page.evaluate(()=>{JbpSprint.Client.prototype.load=async(board,id)=>{const ago=n=>new Date(Date.now()-n*86400000).toISOString(),historyIssue={fields:{created:ago(20),status:{id:'3'},sprint:[{id}]},changelog:{startAt:0,total:3,histories:[{created:ago(13),items:[{field:'Sprint',fieldId:'customfield_9',from:null,to:String(id)}]},{created:ago(12),items:[{field:'status',from:'1',to:'2'}]},{created:ago(9),items:[{field:'status',from:'2',to:'3'}]}]}};return {sprint:{id,name:'Sprint '+id,startDate:ago(14),completeDate:ago(7)},loadedAt:ago(0),profile:{doneStatuses:'3'},estimation:{unit:'SP'},warnings:[],issues:[{key:'DEMO-2',issuetype:'Story',summary:'Delivered',category:'completed',added:true,startEstimate:0,endEstimate:5}],details:{'DEMO-2':{historyIssue,sprintField:'customfield_9'}}};};});
 await page.getByRole('button',{name:'Загрузить графики спринтов',exact:true}).click();await page.locator('#flow-trend-status').filter({hasText:'Загружено 2'}).waitFor();
 await page.locator('[data-widget="burnup"] svg').waitFor();assert.equal(await page.locator('[data-widget="burndown"] svg').count(),1);assert.equal(await page.locator('[data-widget="velocity"] svg').count(),1);assert.equal(await page.locator('[data-widget="plan"] svg').count(),1);
 const scopeValues=await page.locator('[data-widget="burnup"] svg [aria-label*="Объём спринта"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));assert.ok(scopeValues.some(s=>s.includes(': 0 ')));assert.ok(scopeValues.some(s=>s.includes(': 1 ')));
 await page.locator('[data-widget="velocity"] select').selectOption('SP');assert.ok(await page.locator('[data-widget="velocity"] [aria-label*="5 SP"]').count()>0);
 await page.locator('.analytics-workspace').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:'test-output/analytics-scrum.png'});
 assert.deepEqual(errors,[]);console.log('Analytics UI: custom metric, calendar, preview, invalid states, cancellation, local recalculation, views, keyboard, persistence, failed storage, export, deletion and both themes/mobile passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
