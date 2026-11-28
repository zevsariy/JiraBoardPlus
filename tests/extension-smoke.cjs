const { chromium } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jbp-extension-test-'));
  const extension = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext(profile, {
    channel: process.env.JBP_TEST_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    ignoreDefaultArgs: ['--disable-extensions']
  });
  try {
    // Seed an explicit synthetic address; no Jira server is built in.
    // No configured queries, so startup must not contact Jira.
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    await worker.evaluate(()=>{chrome.permissions.contains=async()=>true;return chrome.storage.local.set({jbpReportsV1:{baseUrl:'https://jira.example.com',queries:[],results:{},jobs:{},context:'',noticeError:'',fieldNames:{}}});});
    const page = await context.newPage();
    await page.goto(worker.url().replace('src/background.js', 'report.html'));
    await page.locator('#empty').waitFor({ timeout: 10000 });
    const alarms = await worker.evaluate(() => chrome.alarms.getAll());
    assert.ok(alarms.some(a => a.name === 'jbp-scheduler'));
    assert.equal(await page.locator('.report').count(), 0);
    const png=await page.evaluate(async()=>{const img=new Image();img.src=chrome.runtime.getURL('icons/report.png');await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};});
    assert.ok(png.width>0&&png.height>0);
    const notificationCheck=await page.evaluate(()=>chrome.runtime.sendMessage({type:'testNotice'}));
    assert.equal(notificationCheck.ok,true);assert.equal(notificationCheck.data.noticeError,'');
    await worker.evaluate(()=>chrome.notifications.clear('jbp:test'));
    console.log('Native notification API accepted the packaged PNG (no Jira requests).');
    // Replace fetch before adding any query. Real extension APIs, synthetic Jira only.
    await worker.evaluate(() => {
      globalThis.testRows = 1; globalThis.testNotices = [];
      globalThis.fetch = async (url, options) => {
        let data;
        if (url.endsWith('/myself')) data = { key: 'offline-test' };
        else if (url.endsWith('/search')) {
          const request = JSON.parse(options.body);
          if (request.jql !== 'project = DEMO') throw new Error('Unexpected JQL');
          data = { startAt: 0, total: globalThis.testRows, issues: Array.from({ length: globalThis.testRows }, (_, i) => ({ id: String(i + 1), key: `DEMO-${i + 1}`, fields: { summary: `Offline task ${i + 1}` } })) };
        } else throw new Error('Unexpected API; no network allowed');
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      };
      chrome.notifications.create = async (id, data) => { globalThis.testNotices.push({ id, data }); return id; };
    });
    await page.locator('#add').click();
    await page.locator('#name').fill('Offline smoke test');
    await page.locator('#jql').fill('project = DEMO');
    await page.getByRole('button', { name: 'Сохранить запрос', exact: true }).click();
    await page.locator('.report').waitFor();
    await page.getByRole('button', { name: 'Запустить', exact: true }).click();
    await page.getByText('База сравнения создана', { exact: true }).waitFor({ timeout: 15000 });
    const scheduled = await worker.evaluate(async () => ({
      alarm: await chrome.alarms.get('jbp-next-query'),
      query: (await chrome.storage.local.get('jbpReportsV1')).jbpReportsV1.queries[0]
    }));
    assert.equal(scheduled.alarm.scheduledTime, scheduled.query.nextRun);
    await worker.evaluate(() => { globalThis.testRows = 2; });
    await page.getByRole('button', { name: 'Запустить', exact: true }).click();
    await page.getByText('Новых: 1', { exact: true }).waitFor({ timeout: 15000 });
    assert.equal((await worker.evaluate(() => globalThis.testNotices)).length, 1);
    const menu = await context.newPage();
    await menu.goto(worker.url().replace('src/background.js', 'popup.html'));
    assert.equal(await menu.locator('input,form').count(),0);assert.equal(await menu.locator('select#theme-choice').count(),1);assert.equal(await menu.locator('#theme-choice').inputValue(),'system');assert.equal(await menu.locator('button').count(),9);
    await menu.screenshot({path:'test-output/popup-menu.png'});
    const settingsTab=context.waitForEvent('page');await menu.locator('#open-settings').click();
    const popup=await settingsTab;await popup.waitForLoadState();assert.ok(popup.url().endsWith('/settings.html'));

    await popup.locator('#calendar').filter({ visible: true }).count();
    await popup.waitForFunction(() => document.getElementById('calendar').value === 'normalHours');
    assert.equal(await popup.locator('#daily').isChecked(), false);
    await popup.locator('.settings-nav a[href="#boards"]').click();await popup.locator('#daily-settings summary').click();await popup.locator('#time-settings>details>summary').click();await popup.locator('#daily').check();await popup.locator('#privateNotes').check(); await popup.locator('#age').check();
    await popup.locator('#timeUnit').selectOption('weeks');await popup.locator('#timeMode').selectOption('total');await popup.locator('#save-main').click();await popup.locator('#status').filter({hasText:'Сохранено'}).waitFor();await popup.locator('.settings-nav a[href="#team"]').click();await popup.locator('#workStatusNames').fill(' In Progress, in progress ');await popup.locator('#doneStatusNames').fill('Closed, Obsolete');await popup.locator('#doneCategory').uncheck();
    await popup.getByRole('button', { name: 'Сохранить раздел', exact: true }).click();
    await popup.locator('#status').filter({ hasText: 'Сохранено' }).waitFor();
    const storedPrefs = await worker.evaluate(() => chrome.storage.local.get('jbpBoardPrefs'));
    assert.equal(storedPrefs.jbpBoardPrefs.timeUnit,'weeks');assert.equal(storedPrefs.jbpBoardPrefs.timeMode,'total');assert.equal(storedPrefs.jbpBoardPrefs.doneStatusNames,'Closed, Obsolete');assert.equal(storedPrefs.jbpBoardPrefs.doneCategory,false);assert.equal(storedPrefs.jbpBoardPrefs.daily, true); assert.equal(storedPrefs.jbpBoardPrefs.source, 'timepiece');
    await popup.reload(); await popup.waitForFunction(() => document.getElementById('daily').checked);
    const reportTab = context.waitForEvent('page');
    await popup.locator('.ui-nav a[href="report.html"]').click({modifiers:['Control']});
    const opened = await reportTab; await opened.waitForLoadState();
    assert.ok(opened.url().endsWith('/report.html'));
    const metricsTab = await context.newPage();
    await metricsTab.goto(worker.url().replace('src/background.js', 'metrics.html'));
    const profileResult=await metricsTab.evaluate(()=>chrome.runtime.sendMessage({type:'sprintStore',op:'profileSet',boardId:'7',profile:{mode:'time'}}));
    assert.equal(profileResult.ok,true);
    const restored=await metricsTab.evaluate(()=>chrome.runtime.sendMessage({type:'sprintStore',op:'profileGet',boardId:'7'}));
    assert.equal(restored.data.mode,'time');assert.equal(restored.data.statusRules.workStatusNames,'in progress');assert.equal(restored.data.statusRules.doneStatusNames,'Closed, Obsolete');assert.equal(restored.data.statusRules.doneCategory,false);
    const toolsTab = await context.newPage();
    await toolsTab.goto(worker.url().replace('src/background.js', 'tools.html'));
    await toolsTab.locator('#check-estimate:checked').waitFor();
    const exportedProfile=await toolsTab.evaluate(()=>chrome.runtime.sendMessage({type:'tools',op:'export'}));
    assert.equal(exportedProfile.ok,true);assert.equal(exportedProfile.data.results,undefined);
    assert.equal(exportedProfile.data.profiles['7'].mode,'time');
    const importedProfile=await toolsTab.evaluate(bundle=>chrome.runtime.sendMessage({type:'tools',op:'import',bundle}),exportedProfile.data);
    assert.equal(importedProfile.ok,true);assert.equal(importedProfile.data.added,0);
    const preserved=await worker.evaluate(()=>chrome.storage.local.get('jbpReportsV1'));
    assert.ok(Object.keys(preserved.jbpReportsV1.results).length>0);
    // Verify connection settings through the real popup and worker. All Jira traffic remains mocked.
    await context.route('https://jira.example.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({startAt:0,isLast:true,values:[]})}));
    await popup.screenshot({path:'test-output/settings-page.png',fullPage:true});
    await popup.locator('.settings-nav a[href="#connection"]').click();await popup.evaluate(()=>{chrome.permissions.request=async()=>true;});await popup.locator('#project-key').fill('demo');
    await popup.getByRole('button',{name:'Сохранить подключение',exact:true}).click();
    await popup.locator('#connection-status').filter({hasText:'Сохранено'}).waitFor();
    assert.equal((await worker.evaluate(()=>chrome.storage.local.get('jbpReportsV1'))).jbpReportsV1.project,'DEMO');
    assert.ok(Object.keys((await worker.evaluate(()=>chrome.storage.local.get('jbpReportsV1'))).jbpReportsV1.results).length>0,'Project-only change preserves results');
    await metricsTab.getByText('Досок: 0',{exact:true}).waitFor();
    popup.once('dialog',d=>d.accept());await popup.locator('#base-url').fill('https://jira.example.com/jira/');
    await popup.getByRole('button',{name:'Сохранить подключение',exact:true}).click();
    await popup.waitForFunction(()=>document.getElementById('base-url').value==='https://jira.example.com/jira');
    const connection=await metricsTab.evaluate(()=>chrome.runtime.sendMessage({type:'connectionGet'}));
    assert.deepEqual(connection.data,{baseUrl:'https://jira.example.com/jira',project:'DEMO'});
    await page.waitForFunction(()=>document.getElementById('jira-url').getAttribute('href')==='https://jira.example.com/jira');
    const changed=await worker.evaluate(()=>chrome.storage.local.get('jbpReportsV1'));
    assert.equal(Object.keys(changed.jbpReportsV1.results).length,0);assert.equal(changed.jbpReportsV1.queries.length,1);
    await worker.evaluate(()=>{globalThis.fetch=async url=>{if(!url.startsWith('https://jira.example.com/jira/rest/api/2/'))throw new Error('Wrong Jira base URL');return new Response(JSON.stringify(url.endsWith('/myself')?{key:'offline-test'}:{startAt:0,total:0,issues:[]}),{headers:{'content-type':'application/json'}});};});
    await page.getByRole('button',{name:'Запустить',exact:true}).click();await page.getByText('База сравнения создана',{exact:true}).waitFor({timeout:15000});
    const isolated=await metricsTab.evaluate(()=>chrome.runtime.sendMessage({type:'sprintStore',op:'profileGet',boardId:'7',baseUrl:'https://jira.example.com/jira'}));
    assert.equal(isolated.data.mode,'auto','Another installation must not use another board profile with same ID');
    const controlTab=await context.newPage();await controlTab.goto(worker.url().replace('src/background.js','control.html'));
    await controlTab.locator('#status').filter({hasText:'Готово.'}).waitFor();
    assert.equal((await controlTab.evaluate(()=>chrome.runtime.sendMessage({type:'networkBudget',op:'configure',config:{concurrency:1,intervalMs:100}}))).ok,true);
    assert.equal((await metricsTab.evaluate(()=>chrome.runtime.sendMessage({type:'networkBudget',op:'configure',config:{concurrency:6,intervalMs:100}}))).ok,false);
    const ticket=await metricsTab.evaluate(async()=>{for(let n=0;n<50;n++){const r=await chrome.runtime.sendMessage({type:'networkBudget',op:'acquire',url:'https://jira.example.com/jira/rest/api/2/field'});if(!r.ok||!r.data.waitMs)return r;await new Promise(resolve=>setTimeout(resolve,r.data.waitMs));}throw Error('Budget remained busy');});assert.ok(ticket.data.id);
    const wait=await controlTab.evaluate(()=>chrome.runtime.sendMessage({type:'networkBudget',op:'acquire',url:'https://jira.example.com/jira/rest/api/2/field'}));assert.ok(wait.data.waitMs);
    await controlTab.evaluate(id=>chrome.runtime.sendMessage({type:'networkBudget',op:'release',id,status:200}),ticket.data.id);
    assert.equal((await controlTab.evaluate(()=>chrome.runtime.sendMessage({type:'networkBudget',op:'status'}))).data.active,1);
    await metricsTab.evaluate(id=>chrome.runtime.sendMessage({type:'networkBudget',op:'release',id,status:200}),ticket.data.id);
    assert.equal((await controlTab.evaluate(()=>chrome.runtime.sendMessage({type:'networkBudget',op:'status'}))).data.active,0);
    const persisted=await worker.evaluate(()=>chrome.storage.session.get('jbpBudgetSession'));assert.equal(persisted.jbpBudgetSession.active.length,0);
    const composerSaved=await worker.evaluate(()=>JbpComposerStore.handle({account:'offline-test',op:'draftPut',id:'smoke-draft',revision:0,context:'DEMO-99',field:'comment',original:'',text:'Recovery'}, {id:chrome.runtime.id,tab:{id:1},frameId:0,url:'https://jira.example.com/jira/browse/DEMO-99'},'https://jira.example.com/jira',fn=>JbpStorage.transaction(fn)));
    assert.equal(composerSaved.drafts[0].text,'Recovery');
    // Real extension messaging and storage lock for the personal queue, no Jira calls.
    const attentionTab=await context.newPage();await attentionTab.goto(worker.url().replace('src/background.js','attention.html?account=offline-test'));
    await attentionTab.getByText('Локальная очередь загружена. Запросов Jira нет.',{exact:true}).waitFor();
    await attentionTab.getByLabel('Ключ задачи',{exact:true}).fill('DEMO-99');await attentionTab.getByRole('button',{name:'Закрепить',exact:true}).click();await attentionTab.getByText('Задача закреплена локально.',{exact:true}).waitFor();
    await attentionTab.getByRole('button',{name:'Через час DEMO-99',exact:true}).click();await attentionTab.getByText('Сохранено локально.',{exact:true}).waitFor();
    assert.ok(await worker.evaluate(()=>chrome.alarms.get('jbp-attention-due')));
    const queue=await attentionTab.evaluate(()=>chrome.runtime.sendMessage({type:'attention',op:'get',account:'offline-test'}));assert.equal(queue.ok,true);assert.equal(queue.data.items[0].key,'DEMO-99');
    const reminder=await attentionTab.evaluate(revision=>chrome.runtime.sendMessage({type:'attention',op:'edit',account:'offline-test',key:'DEMO-99',revision,state:'later',note:'',remindAt:Date.now()-1000}),queue.data.items[0].revision);assert.equal(reminder.ok,true);
    await attentionTab.waitForFunction(async()=>{const key='jbpAttention:'+encodeURIComponent('https://jira.example.com/jira')+':offline-test',s=(await chrome.storage.local.get(key))[key];return s?.items[0].notifiedAt===s?.items[0].remindAt;},{},{timeout:45000});
    assert.equal(await worker.evaluate(async()=>{for(let i=0;i<50&&!testNotices.some(n=>n.id==='jbp-attention');i++)await new Promise(r=>setTimeout(r,20));return testNotices.filter(n=>n.id==='jbp-attention').length;}),1);
    await attentionTab.getByRole('button',{name:'Перечитать локальную очередь',exact:true}).click();await attentionTab.getByText('Локальная очередь загружена. Запросов Jira нет.',{exact:true}).waitFor();
    await attentionTab.getByLabel('Состояние DEMO-99',{exact:true}).selectOption('done');await attentionTab.getByRole('button',{name:'Сохранить DEMO-99',exact:true}).click();await attentionTab.getByText('Сохранено локально.',{exact:true}).waitFor();
    assert.equal(await worker.evaluate(()=>chrome.alarms.get('jbp-attention-due')),undefined);
    const archiveTab=await context.newPage();await archiveTab.goto(worker.url().replace('src/background.js','personal-workspace.html'));
    await archiveTab.getByLabel('offline-test',{exact:true}).waitFor();
    const personalRestored=await archiveTab.evaluate(async()=>{
      const send=m=>chrome.runtime.sendMessage({type:'personalArchive',client:'smoke',...m});
      const exported=await send({op:'export',accounts:['offline-test'],kinds:['draft','attention'],includeTexts:true});if(!exported.ok)throw Error(exported.error);
      for(const row of exported.data.records)if(row.kind==='draft')row.value.text='Imported recovery';else {row.value.state='later';row.value.remindAt=Date.now()-1000;}
      const preview=await send({op:'inspect',archive:exported.data});if(!preview.ok)throw Error(preview.error);
      const applied=await send({op:'apply',token:preview.data.token,selected:preview.data.rows.filter(r=>r.status!=='same').map(r=>({id:r.id,action:r.status==='new'?'add':'replace'}))});if(!applied.ok)throw Error(applied.error);
      return applied;
    });assert.equal(personalRestored.ok,true);assert.equal(personalRestored.data.count,2);
    assert.equal(await worker.evaluate(()=>chrome.alarms.get('jbp-attention-due')),undefined);
    const undone=await archiveTab.evaluate(async()=>{const send=m=>chrome.runtime.sendMessage({type:'personalArchive',client:'smoke',...m}),p=await send({op:'undoInspect'});if(!p.ok)throw Error(p.error);return send({op:'apply',token:p.data.token,selected:p.data.rows.map(r=>({id:r.id,action:'undo'}))});});assert.equal(undone.ok,true);
    assert.equal(await worker.evaluate(()=>testNotices.filter(n=>n.id==='jbp-attention').length),1,'import and rollback never replay reminder');
    console.log('Extension smoke OK: manifest, worker, real alarms/storage/messages, personal queue, empty report, manual runs, diff and notification dispatch; mocked Jira and OS notification only.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

