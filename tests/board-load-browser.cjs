const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext();let calls=0,active=0,peak=0,status=200;
  await context.addInitScript(()=>{
   document.hasFocus=()=>true;globalThis.hiddenForTest=false;Object.defineProperty(document,'hidden',{get:()=>hiddenForTest});
   const now=Date.now;globalThis.offset=0;Date.now=()=>now()+offset;
   globalThis.chrome={runtime:{onMessage:{addListener(fn){globalThis.applyRefreshPrefs=prefs=>fn({type:'boardPrefsChanged',prefs});}},sendMessage:async()=>({ok:true,data:{daily:true,scope:false,age:false}})}};
  });
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());assert.equal(u.hostname,'127.0.0.1');
   if(u.pathname.endsWith('RapidBoard.jspa'))return route.fulfill({contentType:'text/html',body:'<div id="ghx-pool"><div class="ghx-issue" data-issue-key="DEMO-1">One</div><div class="ghx-issue" data-issue-key="DEMO-2">Two</div></div>'});
   calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,30));active--;
   await route.fulfill({status,headers:status===429?{'retry-after':'600'}:{},contentType:'application/json',body:JSON.stringify({fields:{updated:'2025-01-01',assignee:null,status:{name:'Open'},issuelinks:[]}})});
  });
  const pages=await Promise.all(Array.from({length:10},async()=>{
   const page=await context.newPage();await page.goto('http://127.0.0.1/secure/RapidBoard.jspa?rapidView=7');
   for(const f of ['board-core.js','active-board.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../src',f),'utf8').replace("location.protocol!=='https:'","location.protocol!=='http:'")});
   return page;
  }));
  await Promise.all(pages.map(p=>p.waitForFunction(()=>document.querySelector('[data-jbp-board]')?.shadowRoot.getElementById('text').textContent.includes('обновлено'))));
  assert.equal(calls,20);assert.equal(peak,1,'all ten tabs must share one request slot');
  await Promise.all(pages.map(p=>p.evaluate(()=>{offset=240000;dispatchEvent(new PopStateEvent('popstate'));})));
  await pages[0].waitForTimeout(300);assert.equal(calls,20,'no automatic refetch before five minutes');
  const p=pages[0];await p.locator('[data-jbp-board] button').click();await p.waitForTimeout(400);assert.equal(calls,22,'manual refresh bypasses TTL');
  await p.evaluate(()=>{hiddenForTest=true;offset=600000;document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new PopStateEvent('popstate'));});
  await p.waitForTimeout(200);assert.equal(calls,22,'hidden tab does not request');
  status=429;await p.evaluate(()=>{hiddenForTest=false;document.dispatchEvent(new Event('visibilitychange'));});
  await p.waitForTimeout(300);assert.equal(calls,23,'429 stops the remaining batch');
  await p.locator('[data-jbp-board] button').click();await p.evaluate(()=>{offset+=120000;dispatchEvent(new PopStateEvent('popstate'));});
  await p.waitForTimeout(200);assert.equal(calls,23,'manual and automatic refresh respect Retry-After');
  status=200;await p.evaluate(()=>{offset+=600000;dispatchEvent(new PopStateEvent('popstate'));});
  await p.waitForTimeout(400);assert.equal(calls,25,'requests resume after cooldown');
  await p.evaluate(()=>{applyRefreshPrefs({daily:true,scope:false,age:false,nativeRefreshMode:'manual'});offset+=600000;dispatchEvent(new PopStateEvent('popstate'));});
  await p.waitForTimeout(200);assert.equal(calls,25,'manual mode also stops expired card cache refresh');
  await p.locator('[data-jbp-board] button').click();await p.waitForTimeout(400);assert.equal(calls,27,'manual card refresh remains available');
  await p.evaluate(()=>{applyRefreshPrefs({daily:true,scope:false,age:false,nativeRefreshMode:'auto',nativeRefreshSeconds:60});offset+=61000;dispatchEvent(new PopStateEvent('popstate'));});
  await p.waitForTimeout(400);assert.equal(calls,29,'custom interval also controls card cache');
  // Cancel a queued request when a tab becomes hidden; it must never reach Jira.
  await pages[1].evaluate(()=>{globalThis.releaseLock=null;globalThis.lockHeld=false;navigator.locks.request('jbp-board-rest',async()=>{lockHeld=true;await new Promise(r=>releaseLock=r);});});
  await pages[1].waitForFunction(()=>lockHeld);
  await p.locator('[data-jbp-board] button').click();
  await p.evaluate(()=>{hiddenForTest=true;document.dispatchEvent(new Event('visibilitychange'));});
  await pages[1].evaluate(()=>releaseLock());await p.waitForTimeout(200);
  assert.equal(calls,29,'hiding cancels requests waiting in the cross-tab queue');
  console.log('Load regression OK: ten tabs, shared concurrency=1, five-minute cache, manual refresh, hidden tab, 429 batch stop and Retry-After.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
