const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('../src/board-workspace-core.js');const C=JbpBoardWorkspaceCore;
(async()=>{const browser=await chromium.launch({channel:process.env.JBP_TEST_CHANNEL||'chromium',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:1200,height:900}}),stored=new Map(),calls=[],errors=[];let fail=false;
 await ctx.exposeBinding('workspaceRPC',async(source,m)=>{
  if(m.type==='boardPrefsGet')return {ok:true,data:{daily:true,scope:false,age:false,flagged:false,backlog:true}};
  const key=m.account+':'+m.board,p=C.profile(stored.get(key));
  if(m.op==='get')return {ok:true,data:p};
  if(fail)return {ok:false,error:'Хранилище недоступно'};
  if(m.revision!==p.revision)return {ok:false,error:'Представления изменились в другой вкладке. Перечитайте сохранённое.'};
  const next=C.profile({...m.value,revision:p.revision+1});stored.set(key,next);return {ok:true,data:next};
 });
 await ctx.addInitScript(()=>{document.hasFocus=()=>true;globalThis.listeners=[];globalThis.chrome={runtime:{sendMessage:m=>workspaceRPC(m),onMessage:{addListener:fn=>listeners.push(fn)}}};});
 await ctx.route('**/*',async r=>{
  const u=new URL(r.request().url());assert.equal(u.hostname,'jira.example');
  if(u.pathname.endsWith('.jspa'))return r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><meta name="ajs-remote-user" content="alice"><meta name="ajs-context-path" content="/jira"><style>.ghx-issue{padding:20px;margin:10px;border:1px solid #ddd;width:300px}.native-hidden{display:none}</style><div id="ghx-pool"><div class="ghx-issue" data-issue-key="D-1"><span class="ghx-summary">First &lt;img src=x&gt;</span><span class="ghx-status">Open</span><span data-field-id="customfield_10200">Alpha</span></div><div class="ghx-issue" data-issue-key="D-2"><span class="ghx-summary">Second</span><span class="ghx-status">Done</span><span data-field-id="customfield_10200">Beta</span></div><div class="ghx-issue native-hidden" data-issue-key="D-3">Hidden by Jira</div></div>'});
  calls.push(u.pathname);assert.match(u.pathname,/\/rest\/api\/2\/issue\/D-[12]$/);
  return r.fulfill({contentType:'application/json',body:JSON.stringify({key:u.pathname.split('/').pop(),fields:{status:{id:'1',name:'Open'},assignee:{displayName:'Alice'},duedate:'2026-11-01',updated:'2026-11-01T10:00:00Z',issuetype:{name:'Task'}}})});
 });
 async function page(){const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('https://jira.example/jira/secure/RapidBoard.jspa?rapidView=7');for(const f of ['ui-theme','jira-theme','board-core','board-workspace-core','board-workspace','active-board'])await p.addScriptTag({path:path.join(__dirname,'../src/'+f+'.js')});await p.waitForFunction(()=>document.querySelector('[data-jbp-board]')?.shadowRoot.getElementById('text').textContent.includes('обновлено'));await p.waitForTimeout(150);return p;}
 const p=await page();assert.equal(calls.length,2,'same two requests as existing daily additions; no workspace fetches');
 await p.getByText('Фильтры и сохранение представления',{exact:true}).click();
 await p.locator('[data-filter=team]').selectOption('Alpha');await p.getByRole('button',{name:'Применить фильтры',exact:true}).click();
 assert.equal(await p.locator('[data-jbp-view-hidden]').count(),1);assert.equal(await p.locator('[data-issue-key="D-2"]').isVisible(),false);
 await p.getByLabel('Название нового представления').fill('Alpha work');await p.getByRole('button',{name:'Сохранить новое',exact:true}).click();await p.getByText('Сохранено для этой доски и пользователя.',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Почему задачи нет?',exact:true}).click();await p.getByLabel('Ключ задачи',{exact:true}).fill('D-2');await p.getByRole('button',{name:'Объяснить',exact:true}).click();await p.getByText(/Карточка скрыта личным представлением JBP/).waitFor();
 await p.getByLabel('Ключ задачи',{exact:true}).fill('D-3');await p.getByRole('button',{name:'Объяснить',exact:true}).click();await p.getByText(/скрыта самой Jira/).waitFor();
 await p.getByLabel('Ключ задачи',{exact:true}).fill('D-99');await p.getByRole('button',{name:'Объяснить',exact:true}).click();await p.getByText(/не доказывает/).waitFor();assert.equal(await p.getByRole('link',{name:'Открыть задачу в Jira'}).getAttribute('href'),'/jira/browse/D-99');await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'Контекст карточек',exact:true}).click();await p.getByLabel('Показывать кнопку «Контекст» на карточках').check();await p.getByRole('button',{name:'Выше: Срок',exact:true}).click();await p.getByRole('button',{name:'Сохранить контекст',exact:true}).click();await p.getByRole('button',{name:'Контекст D-1',exact:true}).waitFor();
 await p.getByRole('button',{name:'Контекст D-1',exact:true}).click();await p.getByText('2026-11-01',{exact:true}).waitFor();assert.equal(await p.locator('[data-jbp-workspace-dialog] img').count(),0);await p.keyboard.press('Escape');assert.equal(await p.getByRole('button',{name:'Контекст D-1',exact:true}).evaluate(n=>n===n.getRootNode().activeElement),true);
 assert.equal(calls.length,2,'filter, save, diagnostics and context add zero Jira requests');
 const second=await page();await second.getByRole('button',{name:'Контекст D-1',exact:true}).waitFor();assert.equal(await second.locator('[data-jbp-view-hidden]').count(),1,'saved view restored');assert.equal(calls.length,4);
 // Same view in another tab is protected against lost updates.
 await second.getByText('Фильтры и сохранение представления',{exact:true}).click();await second.getByLabel('Название нового представления').fill('Other');await second.getByRole('button',{name:'Сохранить новое',exact:true}).click();await second.getByText('Сохранено для этой доски и пользователя.',{exact:true}).waitFor();
 await p.getByLabel('Название нового представления').fill('Stale');await p.getByRole('button',{name:'Сохранить новое',exact:true}).click();await p.getByText(/Представления изменились в другой вкладке/).waitFor();
 await p.getByRole('button',{name:'Перечитать сохранённое',exact:true}).click();await p.getByText('Личные настройки загружены.',{exact:true}).waitFor();
 fail=true;await p.getByRole('button',{name:'Сохранить новое',exact:true}).click();await p.getByText('Хранилище недоступно',{exact:true}).waitFor();assert.equal(stored.get('alice:7').views.length,2);fail=false;
 await p.getByRole('button',{name:'Сбросить фильтр',exact:true}).click();assert.equal(await p.locator('[data-jbp-view-hidden]').count(),0);assert.equal(await p.locator('[data-issue-key="D-3"]').isVisible(),false);
 await p.evaluate(()=>{document.querySelector('[data-issue-key="D-1"] .ghx-status').firstChild.data='Review';});await p.waitForTimeout(160);assert.ok(await p.locator('[data-filter=status] option[value=Review]').count());
 await p.setViewportSize({width:375,height:800});await p.getByRole('button',{name:'Контекст карточек',exact:true}).click();assert.equal(await p.locator('dialog').evaluate(n=>n.getBoundingClientRect().right<=innerWidth),true);await p.keyboard.press('Escape');
 fs.mkdirSync(path.join(__dirname,'../test-output'),{recursive:true});await p.screenshot({path:path.join(__dirname,'../test-output/board-workspace-mobile.png'),fullPage:true});
 await p.evaluate(()=>{history.pushState({},'','?rapidView=7&view=planning');document.getElementById('ghx-pool').id='ghx-plan';dispatchEvent(new PopStateEvent('popstate'));});await p.waitForTimeout(200);assert.equal(calls.length,4,'backlog reuses existing cache');
 await p.evaluate(()=>{listeners.forEach(fn=>fn({type:'boardPrefsChanged',prefs:{visuals:false}}));});await p.locator('[data-jbp-workspace]').waitFor({state:'detached'});assert.equal(await p.locator('[data-jbp-context]').count(),0);assert.equal(await p.locator('[data-jbp-view-hidden]').count(),0);
 // Large boards: context buttons are batched and do not cause scans for unrelated updates.
 await p.evaluate(()=>{document.querySelector('#ghx-plan').innerHTML=Array.from({length:1000},(_,i)=>'<div class="ghx-issue" data-issue-key="L-'+(i+1)+'"><span class="ghx-summary">Task '+i+'</span><span class="ghx-status">Open</span></div>').join('');listeners.forEach(fn=>fn({type:'boardPrefsChanged',prefs:{visuals:true,daily:false,scope:false,age:false}}));});
 await p.waitForFunction(()=>document.querySelectorAll('[data-jbp-context]').length===1000);assert.equal(calls.length,4,'no additional queries for 1000 local cards');
 await p.evaluate(()=>{globalThis.scans=0;const original=Element.prototype.querySelectorAll;Element.prototype.querySelectorAll=function(s){if(s.includes('.ghx-issue[data-issue-key]'))scans++;return original.call(this,s);};const n=document.createElement('div');n.id='noise';document.body.append(n);});
 await p.waitForTimeout(250);const scans=await p.evaluate(()=>globalThis.scans);
 await p.evaluate(()=>{for(let i=0;i<50;i++)document.getElementById('noise').textContent=String(i);});await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>globalThis.scans),scans);
 await p.evaluate(()=>{document.querySelector('meta[name="ajs-remote-user"]').content='bob';dispatchEvent(new Event('focus'));});await p.waitForFunction(()=>!document.querySelector('[data-jbp-context]'));assert.equal(await p.locator('[data-jbp-view-hidden]').count(),0,'account switch clears personal filtering');
 assert.deepEqual(errors,[]);console.log('Personal board OK: zero added requests, saved filters, unknowns, native visibility, context, conflicts, failed writes, backlog and mobile.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
