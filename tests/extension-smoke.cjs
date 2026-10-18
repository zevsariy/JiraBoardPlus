const { chromium } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jbp-extension-test-'));
  const extension = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext(profile, {
    channel: process.env.JBP_TEST_CHANNEL || 'chrome', headless: true,
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
    await worker.evaluate(() => { globalThis.testRows = 2; });
    await page.getByRole('button', { name: 'Запустить', exact: true }).click();
    await page.getByText('Новых: 1', { exact: true }).waitFor({ timeout: 15000 });
    assert.equal((await worker.evaluate(() => globalThis.testNotices)).length, 1);
    const menu = await context.newPage();
    await menu.goto(worker.url().replace('src/background.js', 'popup.html'));
    assert.equal(await menu.locator('input,form').count(),0);assert.equal(await menu.locator('select#theme-choice').count(),1);assert.equal(await menu.locator('#theme-choice').inputValue(),'system');assert.equal(await menu.locator('button').count(),7);
    await menu.screenshot({path:'test-output/popup-menu.png'});
    const settingsTab=context.waitForEvent('page');await menu.locator('#open-settings').click();
    const popup=await settingsTab;await popup.waitForLoadState();assert.ok(popup.url().endsWith('/settings.html'));

    await popup.locator('#calendar').filter({ visible: true }).count();
    await popup.waitForFunction(() => document.getElementById('calendar').value === 'normalHours');
    assert.equal(await popup.locator('#daily').isChecked(), false);
    await popup.locator('#daily').check();await popup.locator('#privateNotes').check(); await popup.locator('#age').check();
    await popup.locator('#workStatusNames').fill(' In Progress, in progress ');await popup.locator('#timeUnit').selectOption('weeks');await popup.locator('#timeMode').selectOption('total');await popup.locator('#doneStatusNames').fill('Closed, Obsolete');await popup.locator('#doneCategory').uncheck();
    await popup.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
    await popup.locator('#status').filter({ hasText: 'Сохранено' }).waitFor();
    const storedPrefs = await worker.evaluate(() => chrome.storage.local.get('jbpBoardPrefs'));
    assert.equal(storedPrefs.jbpBoardPrefs.timeUnit,'weeks');assert.equal(storedPrefs.jbpBoardPrefs.timeMode,'total');assert.equal(storedPrefs.jbpBoardPrefs.doneStatusNames,'Closed, Obsolete');assert.equal(storedPrefs.jbpBoardPrefs.doneCategory,false);assert.equal(storedPrefs.jbpBoardPrefs.daily, true); assert.equal(storedPrefs.jbpBoardPrefs.source, 'timepiece');
    await popup.reload(); await popup.waitForFunction(() => document.getElementById('daily').checked);
    const reportTab = context.waitForEvent('page');
    await popup.locator('#report').click();
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
    await popup.evaluate(()=>{chrome.permissions.request=async()=>true;});await popup.locator('#project-key').fill('demo');
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
    console.log('Extension smoke OK: manifest, worker, real alarms/storage/messages, empty report, manual runs, diff and notification dispatch; mocked Jira and OS notification only.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

