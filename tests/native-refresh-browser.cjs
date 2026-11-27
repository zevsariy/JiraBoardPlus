const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'jbp-refresh-')),extension=path.join(temp,'extension');fs.mkdirSync(extension);
 for(const name of ['src','icons',...fs.readdirSync(root).filter(n=>n.endsWith('.html'))])fs.cpSync(path.join(root,name),path.join(extension,name),{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));manifest.host_permissions=['https://jira.example.test/*'];fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'msedge',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],ignoreDefaultArgs:['--disable-extensions']});
 try{
  const network=[],errors=[];
  await context.route('https://**/*',route=>{
   const u=new URL(route.request().url());assert.equal(u.hostname,'jira.example.test');network.push({path:u.pathname,method:route.request().method()});
   if(u.pathname.endsWith('RapidBoard.jspa'))return route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><div id="ghx-pool"><div class="ghx-issue" data-issue-key="DEMO-1">Task</div></div><textarea id="draft">unsaved comment</textarea><script>
    globalThis.adapterBeforeJira=!!globalThis.JbpNativeRefresh;globalThis.activeForTest=true;globalThis.hiddenForTest=false;
    document.hasFocus=()=>activeForTest;Object.defineProperty(document,'hidden',{get:()=>hiddenForTest});
    globalThis.polls=0;globalThis.completed=0;globalThis.otherPolls=0;globalThis.immediateArgs=[];globalThis.nativeTimers={};
    globalThis.GH={};GH.Poller={addPoller(id,delay,handler,ctx){if(typeof delay==='function'){ctx=handler;handler=delay;delay=30000;}this.removePoller(id);const tick=()=>{handler.call(ctx,false);nativeTimers[id]=setTimeout(tick,delay);};nativeTimers[id]=setTimeout(tick,delay);},removePoller(id){clearTimeout(nativeTimers[id]);delete nativeTimers[id];}};
    GH.Poller.addPoller('WorkPoller',function(immediate){polls++;immediateArgs.push(immediate);return fetch('/rest/greenhopper/1.0/xboard/work/allData.json').then(r=>r.json()).then(()=>completed++);});
    GH.Poller.addPoller('linkedPagePoller',()=>otherPolls++);
   </script>`});
   return route.fulfill({contentType:'application/json',body:u.pathname.endsWith('/field')?'[]':'{}'});
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>serial(async()=>{await chrome.storage.local.set({jbpReportsV1:{baseUrl:'https://jira.example.test',queries:[],results:{},jobs:{}},jbpBoardPrefs:{nativeRefreshMode:'auto',nativeRefreshSeconds:120,nativeRefreshPauseHidden:true}});await syncContent();}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('https://jira.example.test/secure/RapidBoard.jspa?rapidView=7');
  await page.getByRole('button',{name:'Проверить Jira',exact:true}).waitFor();await page.waitForFunction(()=>JbpNativeRefresh.status().supported&&JbpNativeRefresh.status().mode==='auto');assert.equal(await page.evaluate(()=>adapterBeforeJira),true,'MAIN adapter is installed before Jira registers polling');
  await page.clock.runFor(119000);assert.equal(await page.evaluate(()=>polls),0);await page.clock.runFor(2000);await page.waitForFunction(()=>completed===1);assert.equal(await page.evaluate(()=>polls),1);assert.ok(await page.evaluate(()=>otherPolls>=4));assert.equal(await page.locator('#draft').inputValue(),'unsaved comment');
  await page.evaluate(()=>{hiddenForTest=true;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(600000);assert.equal(await page.evaluate(()=>polls),1);
  await page.evaluate(()=>{hiddenForTest=false;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(1);await page.waitForFunction(()=>completed===2);assert.equal(await page.evaluate(()=>polls),2);
  await worker.evaluate(async()=>{const p={nativeRefreshMode:'manual',nativeRefreshSeconds:120,nativeRefreshPauseHidden:true};await chrome.storage.local.set({jbpBoardPrefs:p});await broadcastPrefs(p);});await page.waitForFunction(()=>JbpNativeRefresh.status().mode==='manual');await page.clock.runFor(600000);assert.equal(await page.evaluate(()=>polls),2);
  await page.getByRole('button',{name:'Проверить Jira',exact:true}).click();await page.waitForFunction(()=>completed===3);assert.equal(await page.evaluate(()=>immediateArgs.every(x=>x===false)),true);
  await page.evaluate(()=>fetch('/rest/api/2/issue/DEMO-1',{method:'PUT',body:'{}'}));assert.ok(network.some(n=>n.method==='PUT'));assert.equal(await page.locator('#draft').inputValue(),'unsaved comment');
  await worker.evaluate(async()=>{const p={nativeRefreshMode:'jira',nativeRefreshSeconds:120,nativeRefreshPauseHidden:false};await chrome.storage.local.set({jbpBoardPrefs:p});await broadcastPrefs(p);});await page.waitForFunction(()=>JbpNativeRefresh.status().mode==='jira');await page.clock.runFor(31000);await page.waitForFunction(()=>completed===4);assert.equal(await page.evaluate(()=>polls),4);
  // A settings page edits and persists the same preferences through the real worker.
  const settings=await context.newPage();await settings.goto(worker.url().replace('src/background.js','settings.html#performance'));await settings.locator('#save-main').waitFor();await settings.waitForFunction(()=>!document.getElementById('save-main').disabled);
  await settings.locator('#nativeRefreshMode').selectOption('auto');await settings.locator('#nativeRefreshSeconds').fill('90');await settings.locator('#nativeRefreshPauseHidden').check();await settings.locator('#save-main').click();await settings.waitForFunction(()=>document.getElementById('status').textContent.includes('Сохранено'));await settings.reload();await settings.waitForFunction(()=>document.getElementById('nativeRefreshSeconds').value==='90');assert.equal(await settings.locator('#nativeRefreshMode').inputValue(),'auto');assert.equal(await settings.locator('#nativeRefreshPauseHidden').isChecked(),true);
  await settings.locator('#nativeRefreshMode').selectOption('manual');assert.equal(await settings.locator('#nativeRefreshSeconds').isDisabled(),true);
  await settings.locator('#refresh-settings').screenshot({path:path.join(root,'test-output/native-refresh-settings.png')});
  assert.deepEqual(errors,[]);console.log('Native refresh browser OK: real MAIN/isolated bridge, early capture, interval, hidden pause, manual action, unchanged edits/writes, native restoration and persisted settings.');
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
