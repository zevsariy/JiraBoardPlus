// Offline report UI test. Every network request is fulfilled from local files.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: process.env.JBP_TEST_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      assert.equal(url.origin, 'http://127.0.0.1');
      const file = url.pathname.slice(1);
      assert.ok(['report.html', 'src/theme-preference.js', 'src/ui-theme.js','src/ui-tokens.css','src/ui-pages.css','src/ui-pages.js','src/report.js', 'src/report.css', 'src/brand.css', 'icons/board-plus.svg', 'icons/geometry.svg', 'src/reports-core.js'].includes(file));
      return route.fulfill({ body: fs.readFileSync(path.join(__dirname, '..', file)), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html' });
    });
    await page.addInitScript(() => {
      const state = { baseUrl: 'https://jira.example.com', queries: [], results: {}, jobs: {}, context: '', noticeError: '' };
      globalThis.chrome = { storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } }, runtime: {
        sendMessage: async message => {
          const R = globalThis.JbpReports;
          if(message.type==='testNotice'){state.noticeError='Уведомление не доставлено: Unable to download all specified images.';state.noticeErrorId='sample';}
          if(message.type==='dismissNotice'){state.noticeError='';state.noticeErrorId='';}
          if (message.type === 'save') {
            const input = R.validate(message.query), existing = state.queries.find(q => q.id === message.query.id);
            if (existing) Object.assign(existing, input);
            else state.queries.push({ ...input, id: `query-${state.queries.length + 1}`, nextRun: Date.now() + input.minutes * 60000 });
          }
          if (message.type === 'run') {
            for (const q of state.queries.filter(q => !message.id || q.id === message.id)) {
              const old = state.results[q.id];
              const rows = [R.row({ id: '1', key: 'DEMO-1', fields: { summary: '<img src=x onerror=alert(1)>', status: { name: 'Open' }, assignee: { displayName: 'User' } } }, q.columns)];
              if(old)rows[0].cells.status='Done';
              if (old) rows.push(R.row({ id: '2', key: 'DEMO-2', fields: { summary: 'New result', status: { name: 'Open' } } }, q.columns));
              state.results[q.id] = { rows, account: 'test-user', finishedAt: Date.now(), previousAt: old?.finishedAt, delta: R.diff(old?.rows, rows) };
            }
          }
          if (message.type === 'fields') return { ok: true, data: [{ id: 'customfield_12345', name: 'Custom field' }] };
          if (message.type === 'delete') { state.queries = state.queries.filter(q => q.id !== message.id); delete state.results[message.id]; }
          return { ok: true, data: structuredClone(state) };
        }
      } };
    });
    await page.goto('http://127.0.0.1/report.html');
    await page.locator('#empty').waitFor();
    fs.mkdirSync(path.join(__dirname, '../test-output'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../test-output/brand-preview.png'), fullPage: true });
    assert.equal(await page.locator('.report').count(), 0);
    await page.locator('#add').click();
    assert.equal(await page.locator('#jql').inputValue(), '');
    await page.locator('#name').fill('Мой контроль компонентов');
    await page.locator('#jql').fill('issuetype = Component ORDER BY key ASC');
    await page.locator('#minutes').fill('30');
    await page.locator('#notify').selectOption('all');
    await page.locator('#load-fields').click();
    await page.locator('#fields-status').filter({ hasText: 'Доступных полей: 1' }).waitFor();
    await page.locator('#field-id').fill('customfield_12345');
    await page.locator('#add-column').click();
    await page.getByRole('button', { name: 'Сохранить запрос', exact: true }).click();
    await page.locator('.report').waitFor();
    assert.equal(await page.locator('.report table').count(), 0);
    await page.getByRole('button', { name: 'Запустить', exact: true }).click();
    await page.getByText('База сравнения создана', { exact: true }).waitFor();
    assert.equal(await page.locator('td img').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'DEMO-1', exact: true }).getAttribute('href'), 'https://jira.example.com/browse/DEMO-1');
    await page.getByRole('button', { name: 'Запустить', exact: true }).click();
    await page.getByText('Новых: 1', { exact: true }).waitFor();
    assert.equal(await page.locator('tr.new').count(), 1);
    await page.getByText('Что изменилось в полях',{exact:true}).click();assert.ok((await page.locator('.change-details').textContent()).includes('Open → Done'));
    await page.locator('.settings summary').click();await page.locator('#test-notice').click();await page.locator('#notice-error').waitFor();await page.locator('#dismiss-notice').click();assert.equal(await page.locator('#notice-error').isVisible(),false);
    await page.getByRole('button',{name:'Запустить',exact:true}).click();assert.equal(await page.locator('#notice-error').isVisible(),false);
    await page.locator('#test-notice').click();await page.locator('#notice-error').waitFor();await page.locator('#dismiss-notice').click();
    await page.locator('#add').click();
    await page.locator('#name').fill('Второй запрос');
    await page.locator('#jql').fill('project = DEMO');
    await page.locator('#enabled').uncheck();
    await page.getByRole('button', { name: 'Сохранить запрос', exact: true }).click();
    assert.equal(await page.locator('.report').count(), 2);
    await page.getByRole('button', { name: 'Запустить все', exact: true }).click();
    await page.locator('#query-2 table').waitFor();
    fs.mkdirSync(path.join(__dirname, '../test-output'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../test-output/report.png'), fullPage: true });
    await page.locator('#query-2').getByRole('button', { name: 'Настроить', exact: true }).click();
    assert.equal(await page.locator('#jql').inputValue(), 'project = DEMO');
    await page.screenshot({ path: path.join(__dirname, '../test-output/editor.png') });
    await page.locator('#cancel-edit').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#query-2').getByRole('button', { name: 'Удалить', exact: true }).click();
    assert.equal(await page.locator('.report').count(), 1);
    assert.deepEqual(errors, []);
    console.log('Report UI OK: empty start, add/edit/delete queries, columns, run all, links, diff markers, safe text rendering.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
