const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/api.js');
const { Api, teamId, FIELD } = globalThis.JiraBoardPlus;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(responses) {
  const calls = [];
  const api = new Api('', async (url, options) => {
    calls.push({ url, ...options });
    assert.ok(responses.length, 'Unexpected request');
    return responses.shift();
  });
  return { api, calls };
}
const issue = id => json({ fields: { [FIELD]: id } });
const meta = () => json({ fields: { [FIELD]: { operations: ['set'], required: false } } });
test('normalizes Server Team IDs and rejects unknown shapes', () => {
  for (const value of [42, '42', { id: 42 }]) assert.equal(teamId(value), '42');
  assert.equal(teamId(null), '');
  assert.throws(() => teamId({ value: '42' }));
});
test('loads all pages including server-capped pages; only shared teams', async () => {
  const { api, calls } = fixture([json([{ id: 1, title: 'A', shareable: true }]), json([{ id: 2, title: 'Private', shareable: false }]), json([{ id: 3, title: 'B', shareable: true }]), json([])]);
  assert.deepEqual((await api.teams()).map(t => t.id), ['1', '3']);
  assert.ok(calls[3].url.includes('page=4'));
});
test('repeated pagination fails instead of showing incomplete results', async () => {
  const page = [{ id: 1, title: 'A', shareable: true }];
  await assert.rejects(fixture([json(page), json(page)]).api.teams(), /повторяет/);
});
test('save targets only Team, uses session, verifies persisted value', async () => {
  const { api, calls } = fixture([issue('1'), meta(), new Response(null, { status: 204 }), issue('2')]);
  assert.equal(await api.save('ABC-12', '2', '1'), '2');
  assert.deepEqual(JSON.parse(calls[2].body), { fields: { customfield_10200: '2' } });
  assert.equal(calls[2].method, 'PUT');
  assert.equal(calls[2].credentials, 'same-origin');
  assert.equal(calls[2].redirect, 'error');
});
test('clear uses null', async () => {
  const { api, calls } = fixture([issue('1'), meta(), new Response(null, { status: 204 }), issue(null)]);
  await api.save('ABC-12', '', '1');
  assert.equal(JSON.parse(calls[2].body).fields[FIELD], null);
});
test('conflicting edit never writes', async () => {
  const { api, calls } = fixture([issue('3')]);
  await assert.rejects(api.save('ABC-12', '2', '1'), /уже изменена/);
  assert.equal(calls.length, 1);
});
test('missing Edit Screen field never writes', async () => {
  const { api, calls } = fixture([issue('1'), json({ fields: {} })]);
  await assert.rejects(api.save('ABC-12', '2', '1'), /Edit Screen/);
  assert.equal(calls.length, 2);
});
test('permission errors, HTML login, and failed verification are surfaced', async () => {
  await assert.rejects(fixture([json({}, 403)]).api.read('ABC-12'), /Нет прав/);
  await assert.rejects(fixture([new Response('<html>Login</html>')]).api.read('ABC-12'), /не JSON/);
  await assert.rejects(fixture([issue('1'), meta(), new Response(null, { status: 204 }), issue('1')]).api.save('ABC-12', '2', '1'), /Проверка после/);
});
test('invalid issue and context path rejected before network', async () => {
  await assert.rejects(fixture([]).api.read('../other'), /ключ/);
  assert.throws(() => new Api('//evil.example'), /context/);
});

test('configured Team field reads, validates editability and writes only that field', async () => {
  const field='customfield_10107',calls=[];
  const replies=[json({fields:{[field]:'1'}}),json({fields:{[field]:{operations:['set']}}}),new Response(null,{status:204}),json({fields:{[field]:'2'}})];
  const api=new Api('',async(url,options)=>{calls.push({url,...options});return replies.shift();},field);
  assert.equal(await api.save('QA-1','2','1'),'2');
  assert.deepEqual(JSON.parse(calls[2].body),{fields:{[field]:'2'}});
  assert.ok(calls[0].url.endsWith('fields='+field));
  assert.throws(()=>new Api('',async()=>{},'summary'),/ID/);
});
