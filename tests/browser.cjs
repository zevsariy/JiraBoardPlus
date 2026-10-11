// Optional local UI integration test: NODE_PATH must contain Playwright.
// All requests are fulfilled in memory. No connection to corporate Jira.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { globalThis.chrome = { runtime: { onMessage: { addListener(fn) { globalThis.changeTeamPrefs = prefs => fn({ type: 'boardPrefsChanged', prefs }); } }, sendMessage: async () => ({ ok: true, data: { visuals: true, team: true } }) } }; });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let writes = 0;
    const values = { 'DEMO-1': '1', 'DEMO-2': '2' };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      assert.equal(url.hostname, '127.0.0.1');
      if (url.pathname.endsWith('RapidBoard.jspa')) return route.fulfill({ contentType: 'text/html', body: '<html><body><div id="ghx-detail-view"><a id="issuekey-val">DEMO-1</a><section id="ghx-details"><h3>Details</h3><div class="ghx-detail-section-content">Priority: Medium</div></section></div></body></html>' });
      const key = url.pathname.match(/issue\/(DEMO-\d+)/)?.[1];
      let body;
      if (url.pathname.includes('teams-api')) body = url.searchParams.get('page') === '1' ? [{ id: 1, title: 'Alpha', shareable: true }, { id: 2, title: 'Beta', shareable: true }, { id: 3, title: 'Private', shareable: false }] : [];
      else if (url.pathname.endsWith('editmeta')) body = { fields: { customfield_10200: { operations: ['set'], required: false } } };
      else if (route.request().method() === 'PUT') { writes++; values[key] = route.request().postDataJSON().fields.customfield_10200; return route.fulfill({ status: 204 }); }
      else if (key) body = { fields: { customfield_10200: values[key] } };
      else throw new Error(`Unexpected request ${url}`);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('http://127.0.0.1/secure/RapidBoard.jspa?view=planning&selectedIssue=DEMO-1');
    for (const file of ['api.js', 'team-panel.js', 'content.js']) {
      let source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
      if (file === 'content.js') source = source.replace("location.protocol !== 'https:'", "location.protocol !== 'http:'");
      await page.addScriptTag({ content: source });
    }
    await page.evaluate(()=>{globalThis.shortcuts=0;for(const type of ['keydown','keypress','keyup'])document.addEventListener(type,e=>{if(e.key.toLowerCase()==='e')shortcuts++;},true);});
    const status = page.locator('[data-jbp] #status');
    await page.locator('[data-jbp] #value:not([disabled])').waitFor();
    assert.equal(await page.locator('#ghx-details [data-jbp]').count(), 1);
    assert.equal(await page.locator('[data-jbp] #search').isVisible(), false);
    await page.locator('[data-jbp] #value').click();
    assert.equal(await page.locator('[data-jbp] [role=option]').count(), 3);
    fs.mkdirSync(path.join(__dirname,'../test-output'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../test-output/team-combobox.png')});
    await page.locator('[data-jbp] #search').fill('Beta');
    assert.equal(await page.locator('[data-jbp] #save').count(),0);
    await page.locator('[data-jbp] #search').press('Enter');
    await page.locator('[data-jbp] #value').filter({ hasText: 'Beta' }).waitFor();
    assert.equal(values['DEMO-1'], '2'); assert.equal(writes, 1);
    await page.evaluate(() => {
      history.pushState({}, '', '?view=planning&selectedIssue=DEMO-2');
      document.getElementById('issuekey-val').textContent = 'DEMO-2';
    });
    await page.locator('[data-jbp][data-issue-key="DEMO-2"]').waitFor();
    await page.locator('[data-jbp] #value:not([disabled])').waitFor();
    assert.equal(await page.locator('[data-jbp]').count(), 1);
    await page.locator('[data-jbp] #value').click();
    await page.locator('[data-jbp] #search').fill('Без команды');
    await page.locator('[data-jbp] [role=option]').filter({hasText:'Без команды'}).click();
    await page.locator('[data-jbp] #value').filter({ hasText: 'Без команды' }).waitFor();
    assert.equal(values['DEMO-2'], null); assert.equal(writes, 2);
    for(const view of ['work','detail']){
      await page.evaluate(view=>{history.pushState({},'',`?rapidView=7&view=${view}&selectedIssue=DEMO-2`);dispatchEvent(new PopStateEvent('popstate'));},view);
      await page.locator('[data-jbp] #value:not([disabled])').waitFor();
      await page.locator('[data-jbp] #value').click();await page.locator('[data-jbp] #search').fill('');await page.locator('[data-jbp] #search').pressSequentially('Dev');assert.equal(await page.locator('[data-jbp] #search').inputValue(),'Dev');assert.equal(await page.evaluate(()=>shortcuts),0);await page.locator('[data-jbp] #search').press('Escape');
      assert.equal(writes,2);assert.equal(await page.locator('[data-jbp] #options').isVisible(),false);
    }
    await page.locator('[data-jbp] #value').click();await page.locator('[data-jbp] #search').fill('No matches');await page.locator('[data-jbp] #search').press('Enter');assert.equal(writes,2);await page.locator('[data-jbp] #search').press('Escape');
    await page.locator('body').click({position:{x:800,y:400}});await page.keyboard.press('e');assert.ok(await page.evaluate(()=>shortcuts>0));
    await page.evaluate(() => changeTeamPrefs({ visuals: true, team: false }));
    await page.locator('[data-jbp]').waitFor({ state: 'detached' });
    await page.evaluate(() => changeTeamPrefs({ visuals: true, team: true }));
    await page.locator('[data-jbp] #value:not([disabled])').waitFor();
    await page.evaluate(() => changeTeamPrefs({ visuals: false, team: true }));
    await page.locator('[data-jbp]').waitFor({ state: 'detached' });
    await page.evaluate(() => changeTeamPrefs({ visuals: true, team: true }));
    await page.locator('[data-jbp]').waitFor();
    await page.evaluate(() => document.getElementById('ghx-detail-view').style.display = 'none');
    await page.locator('[data-jbp]').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('UI OK: mounting, search, shared filtering, save, task navigation, clear, close; no external requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
