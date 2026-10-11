const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [], calls = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      globalThis.chrome = { runtime: { onMessage: { addListener(fn) { globalThis.setBoardPrefs = prefs => fn({ type: 'boardPrefsChanged', prefs }); } }, sendMessage: async () => ({ ok: true, data: {} }) } };
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()); assert.equal(url.hostname, '127.0.0.1');
      if (url.pathname.endsWith('RapidBoard.jspa')) return route.fulfill({ contentType: 'text/html', body: '<meta charset=utf-8><style>.ghx-issue{width:260px;background:white;margin:12px;padding:12px;border:1px solid #ddd;display:inline-block;vertical-align:top}body{background:#f4f5fa;font:14px Arial}</style><h2>Активный спринт</h2><div id="ghx-pool"><div class="ghx-issue" data-issue-key="DEMO-1">DEMO-1<br>Первая задача</div><div class="ghx-issue" data-issue-key="DEMO-2">DEMO-2<br>Вторая задача</div></div>' });
      calls.push(url.pathname); let data;
      if (url.pathname.endsWith('/field')) data = [{ id: 'customfield_9', schema: { custom: 'com.pyxis.greenhopper.jira:gh-flagged' } }];
      else if (url.pathname.endsWith('/configuration')) data={type:'scrum'};
      else if (url.pathname.endsWith('/sprint')) data = { startAt: 0, isLast: true, values: [{ id: 12, state: 'active', name: 'Sprint 12' }] };
      else if (url.pathname.endsWith('/sprintreport')) data = { contents: { issueKeysAddedDuringSprint: { 'DEMO-1': true }, completedIssues: [], issuesNotCompletedInCurrentSprint: [{ key: 'DEMO-1' }, { key: 'DEMO-2' }] } };
      else if (url.pathname.includes('/tis/')) {
        assert.ok(['last','total'].includes(url.searchParams.get('multiVisitBehavior'))); assert.equal(url.searchParams.get('viewFormat'), 'hours');
        data = { table: { body: { rows: [{ headerColumns: [{ id: 'issuekey', value: url.searchParams.get('issueKey') }], valueColumns: [{ id: '3', value: '9.5' }, { id: '4', value: '24' }, { id: '5', value: '-' }] }] } } };
      } else data = { fields: { updated: '2025-01-01', created: '2024-01-01', duedate: '2025-01-01', assignee: null, status: { id: '3', name: 'In progress', statusCategory: { key: 'indeterminate' } }, issuelinks: [] } };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('http://127.0.0.1/secure/RapidBoard.jspa?rapidView=7&view=work');
    for (const file of ['ui-theme.js','jira-theme.js','board-core.js', 'active-board.js']) {
      let code = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8').replace("location.protocol!=='https:'", "location.protocol!=='http:'");
      await page.addScriptTag({ content: code });
    }
    assert.equal(calls.length, 0);
    await page.evaluate(() => setBoardPrefs({ daily: true, scope: true, age: true, color: '#ff8800', borderWidth: 5, scopeFill: true, fillColor: '#ffeecc' }));
    await page.locator('[data-jbp-card]').first().waitFor();
    await page.getByText('9,5 ч', { exact: true }).first().waitFor();
    assert.equal(await page.locator('[data-jbp-added]').count(), 1);
    assert.equal(await page.locator('[data-jbp-added]').getAttribute('data-issue-key'), 'DEMO-1');
    assert.equal(await page.locator('[data-jbp-added]').evaluate(el => el.style.getPropertyValue('--jbp-added')), '#ff8800');
    assert.equal(await page.locator('[data-jbp-added]').evaluate(el => getComputedStyle(el).outlineWidth), '5px');
    assert.equal(await page.locator('[data-jbp-filled]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 238, 204)');
    await page.locator('[data-jbp-card] button.age').first().hover();
    await page.locator('[data-jbp-tooltip]').waitFor();
    assert.equal(await page.locator('[data-jbp-tooltip] tbody tr').count(), 3);
    assert.equal(await page.locator('[data-jbp-tooltip] tr.current').count(), 1);
    assert.equal(await page.locator('[data-jbp-tooltip] td').last().textContent(), '—');
    await page.keyboard.press('Escape');
    await page.locator('[data-jbp-tooltip]').waitFor({ state: 'detached' });
    await page.locator('[data-jbp-card] button.age').first().focus();
    await page.locator('[data-jbp-tooltip]').waitFor();
    assert.equal(await page.getByText('Нет исполнителя', { exact: true }).count(), 2);
    fs.mkdirSync(path.join(__dirname, '../test-output'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../test-output/active-board.png') });
    await page.evaluate(() => setBoardPrefs({ daily: true, scope: true, age: true, summary: false, unassigned: false, stale: false, overdue: false, flagged: false, scopeOutline: false, scopeLabel: false }));
    await page.getByText('9,5 ч', { exact: true }).first().waitFor();
    assert.equal(await page.locator('[data-jbp-board]').count(), 0);
    assert.equal(await page.locator('[data-jbp-added]').count(), 0);
    assert.equal(await page.getByText('Нет исполнителя', { exact: true }).count(), 0);
    assert.equal(await page.getByText('+ После старта', { exact: true }).count(), 0);
    await page.evaluate(() => setBoardPrefs({ visuals: false, daily: true, scope: true, age: true }));
    await page.locator('[data-jbp-card]').first().waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-jbp-added]').count(), 0);
    assert.equal(await page.locator('[data-jbp-filled]').count(), 0);
    assert.equal(await page.locator('[data-jbp-tooltip]').count(), 0);
    await page.evaluate(() => { history.pushState({}, '', '?rapidView=7&view=planning'); setBoardPrefs({ daily: true, scope: true, age: true }); });
    assert.equal(await page.locator('[data-jbp-board]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Board UI OK: default off, daily, Timepiece last visit, scope/color, disable cleanup, backlog exclusion.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });


