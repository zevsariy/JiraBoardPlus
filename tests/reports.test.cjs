const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
require('../src/reports-core.js');
const R = globalThis.JbpReports;
const config = { name: 'My query', jql: 'project = DEMO', minutes: 60, columns: ['summary', 'status'], notify: 'new', enabled: true };
const row = (id, name = 'Test') => R.row({ id, key: `DEMO-${id}`, fields: { summary: name, status: { name: 'Open' } } }, config.columns);
test('query validation and column deduplication', () => {
  assert.equal(R.validate(config).minutes, 60);
  assert.throws(() => R.validate({ ...config, jql: ' ' }));
  assert.throws(() => R.validate({ ...config, minutes: 0 }));
  assert.throws(() => R.validate({ ...config, columns: ['*all'] }));
  assert.deepEqual(R.validate({ ...config, columns: ['summary', 'summary'] }).columns, ['summary']);
});
test('first success is a silent baseline, membership and field changes are distinct', () => {
  assert.equal(R.shouldNotify('all', R.diff(null, [row(1)])), false);
  const d = R.diff([row(1), row(2)], [row(1, 'Changed'), row(3)]);
  assert.deepEqual(d.added.map(r => r.id), ['3']); assert.deepEqual(d.removed.map(r => r.id), ['2']); assert.deepEqual(d.changed.map(r => r.id), ['1']);
  assert.equal(R.shouldNotify('none', d), false); assert.equal(R.shouldNotify('new', d), true);
  const removal = R.diff([row(1)], []);
  assert.equal(R.shouldNotify('new', removal), false); assert.equal(R.shouldNotify('membership', removal), true);
  const edit = R.diff([row(1)], [row(1, 'Changed')]);
  assert.equal(R.shouldNotify('membership', edit), false); assert.equal(R.shouldNotify('all', edit), true);
});
test('rejects truncated and inconsistent pagination', () => {
  assert.throws(() => R.pageCheck({ issues: [], total: 2, startAt: 0 }, 0, null));
  assert.throws(() => R.pageCheck({ issues: [{}], total: 5001, startAt: 0 }, 0, null));
  assert.throws(() => R.pageCheck({ issues: [{}], total: 3, startAt: 1 }, 1, 2));
  assert.throws(() => R.pageCheck({ issues: [{}], total: 2, startAt: 0 }, 1, 2));
});
function harness() {
  let storage = {jbpReportsV1:{baseUrl:'https://jira.example.com',queries:[],results:{},jobs:{},context:'',noticeError:'',fieldNames:{}}}, replyQueue = [], calls = [], notices = [];
  const event = () => ({ addListener() {} });
  const context = vm.createContext({ console, URL, Response, AbortSignal, crypto: require('node:crypto').webcrypto, setTimeout,
    fetch: async (url, options) => { calls.push({ url, options }); const next = replyQueue.shift(); if (!next) throw new Error('Unexpected request'); return new Response(JSON.stringify(next.body), { status: next.status || 200, headers: { 'content-type': 'application/json' } }); },
    chrome: {
      storage: { local: { get: async () => structuredClone(storage), set: async data => { storage = structuredClone(data); }, setAccessLevel: async () => {} } },
      alarms: { get: async () => ({}), create: async () => {}, onAlarm: event() },
      runtime: { id: 'test', getURL: p => `chrome-extension://test/${p}`, onMessage: event(), onInstalled: event(), onStartup: event() },
      action: { onClicked: event() }, tabs: { create: async () => {} },
      notifications: { onClicked: event(), create: async (id, data) => { notices.push({ id, data }); }, clear: async () => {} }
    }
  });
  context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8'), context);
  return { run: code => vm.runInContext(code, context), queue: (...data) => { replyQueue.push(...data); }, calls, notices, get: () => structuredClone(storage.jbpReportsV1) };
}
const me = { body: { key: 'alice' } };
const issue = id => ({ id: String(id), key: `DEMO-${id}`, fields: { summary: `Task ${id}`, status: { name: 'Open' } } });
const page = (ids, startAt, total) => ({ body: { issues: ids.map(issue), startAt, total } });
test('worker: empty start, paginated baseline, new-item notification, failed run preserves result', async () => {
  const h = harness();
  assert.equal((await h.run("command({type:'get'})")).queries.length, 0);
  await h.run(`command({type:'save',query:${JSON.stringify(config)}})`);
  assert.equal(h.calls.length, 0, 'Saving configuration must not execute JQL');
  h.queue(me, page([1], 0, 2), page([2], 1, 2));
  await h.run("command({type:'run'})"); await h.run('tick()');
  const id = h.get().queries[0].id;
  assert.equal(h.get().results[id].rows.length, 2); assert.equal(h.notices.length, 0);
  h.queue(me, page([1, 2, 3], 0, 3)); await h.run("command({type:'run'})"); await h.run('tick()');
  assert.equal(h.notices.length, 1); assert.equal(h.get().results[id].delta.added[0].key, 'DEMO-3');
  h.queue(me, { status: 400, body: { errorMessages: ['Bad JQL'] } }); await h.run("command({type:'run'})"); await h.run('tick()');
  assert.equal(h.get().results[id].rows.length, 3); assert.match(h.get().queries[0].lastError, /Bad JQL/); assert.equal(h.notices.length, 1);
  assert.equal(h.calls[1].options.credentials, 'include'); assert.equal(h.calls[1].options.method, 'POST');
});
test('worker: account switch and JQL edit reset baseline; deletion clears data', async () => {
  const h = harness(); await h.run(`command({type:'save',query:${JSON.stringify(config)}})`);
  h.queue(me, page([1], 0, 1)); await h.run("command({type:'run'})"); await h.run('tick()');
  h.queue({ body: { key: 'bob' } }, page([2], 0, 1)); await h.run("command({type:'run'})"); await h.run('tick()');
  const id = h.get().queries[0].id;
  assert.equal(h.get().results[id].delta.baseline, true); assert.equal(h.notices.length, 0);
  await h.run(`command({type:'save',query:${JSON.stringify({ ...config, id, jql: 'project = OTHER' })}})`);
  assert.equal(h.get().results[id], undefined);
  await h.run(`command({type:'delete',id:'${id}'})`); assert.equal(h.get().queries.length, 0);
});
test('worker: scheduled due query runs, paused query waits, duplicate pages never replace snapshot', async () => {
  const h = harness(); await h.run(`command({type:'save',query:${JSON.stringify(config)}})`);
  await h.run('(async()=>{const s=await read();s.queries[0].nextRun=0;await write(s)})()');
  h.queue(me, page([1], 0, 1)); await h.run('tick()'); assert.equal(h.calls.length, 2);
  await h.run('(async()=>{const s=await read();s.queries[0].nextRun=0;s.queries[0].enabled=false;await write(s)})()');
  await h.run('tick()'); assert.equal(h.calls.length, 2);
  h.queue(me, page([1], 0, 2), page([1], 1, 2)); await h.run("command({type:'run'})"); await h.run('tick()');
  const s = h.get(); assert.equal(s.results[s.queries[0].id].rows.length, 1); assert.match(s.queries[0].lastError, /повторились/);
});
test('diff ignores cells property order after storage roundtrip but records real field changes',()=>{
 const before={id:'1',key:'DEMO-1',cells:{assignee:'Alice',status:'Open',summary:'Same'}};
 const same={id:'1',key:'DEMO-1',cells:{summary:'Same',status:'Open',assignee:'Alice'}};
 assert.notEqual(JSON.stringify(before.cells),JSON.stringify(same.cells));assert.equal(R.diff([before],[same]).changed.length,0);
 const moved={...same,cells:{...same.cells,status:'Done'}};
 assert.deepEqual(R.diff([before],[moved]).changed[0].changes,[{field:'status',before:'Open',after:'Done'}]);
});
test('worker repeated unchanged query survives key reordering; notification URL is extension-root absolute',async()=>{
 const h=harness();await h.run(`command({type:'save',query:${JSON.stringify({...config,notify:'all'})}})`);
 h.queue(me,page([1,2,3],0,3));await h.run("command({type:'run'})");await h.run('tick()');
 await h.run('(async()=>{const s=await read();for(const r of s.results[s.queries[0].id].rows)r.cells=Object.fromEntries(Object.entries(r.cells).reverse());await write(s)})()');
 h.queue(me,page([1,2,3],0,3));await h.run("command({type:'run'})");await h.run('tick()');
 assert.equal(h.get().results[h.get().queries[0].id].delta.changed.length,0);assert.equal(h.notices.length,0);
 h.queue(me,page([2,3,4],0,3));await h.run("command({type:'run'})");await h.run('tick()');
 assert.equal(h.notices.length,1);assert.equal(h.notices[0].data.iconUrl,'chrome-extension://test/icons/report.png');
});
test('notification dismissal persists and does not dismiss a newer error; test requires no Jira',async()=>{
 const h=harness();await h.run("chrome.notifications.create=async()=>{throw new Error('Unable to download all specified images.');}");
 await h.run("command({type:'testNotice'})");const first=h.get().noticeErrorId;assert.match(h.get().noticeError,/Unable to download/);assert.equal(h.calls.length,0);
 await h.run("command({type:'testNotice'})");const second=h.get().noticeErrorId;assert.notEqual(first,second);
 await h.run(`command({type:'dismissNotice',errorId:'${first}'})`);assert.equal(h.get().noticeErrorId,second);
 await h.run(`command({type:'dismissNotice',errorId:'${second}'})`);assert.equal(h.get().noticeError,'');assert.equal((await h.run("command({type:'get'})")).noticeError,'');
 await h.run("command({type:'testNotice'})");assert.match(h.get().noticeError,/Unable to download/);
});
test('configured Jira alone controls dynamic scripts; fresh install has no server and no requests',async()=>{
 const h=harness();await h.run('write(empty())');await h.run(`command({type:'save',query:${JSON.stringify(config)}})`);await h.run("command({type:'run'})");await h.run('tick()');assert.equal(h.calls.length,0);assert.match(h.get().queries[0].lastError,/адрес Jira/);
 await h.run(`globalThis.registered=[];globalThis.unregistered=0;chrome.permissions={contains:async()=>true};chrome.scripting={getRegisteredContentScripts:async()=>registered,registerContentScripts:async rows=>{registered=rows;},unregisterContentScripts:async()=>{registered=[];unregistered++;}};`);
 await h.run('syncContent()');assert.equal(await h.run('registered.length'),0);
 await h.run("write({...empty(),baseUrl:'https://jira-one.example/jira'})");await h.run('syncContent()');assert.equal(await h.run('registered[0].matches[0]'),'https://jira-one.example/jira/*');
 assert.equal(await h.run("isJiraPage('https://jira-one.example/jira/secure/RapidBoard.jspa','https://jira-one.example/jira')"),true);
 for(const url of ['https://jira-one.example/other/','https://jira-one.example.evil/jira/','https://jira-one.example/jira-other/'])assert.equal(await h.run(`isJiraPage(${JSON.stringify(url)},'https://jira-one.example/jira')`),false);
 await h.run("write({...empty(),baseUrl:'https://jira-two.example'})");await h.run('syncContent()');assert.equal(await h.run('registered[0].matches[0]'),'https://jira-two.example/*');assert.equal(await h.run('unregistered'),1);
 await h.run('chrome.permissions.contains=async()=>false');await h.run('syncContent()');assert.equal(await h.run('registered.length'),0);
});
