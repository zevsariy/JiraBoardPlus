const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/board-core.js');
const B = globalThis.JbpBoard;
test('board features opt-in and validate color/calendar', () => {
  assert.deepEqual([B.defaults.daily, B.defaults.scope, B.defaults.age], [false, false, false]);
  assert.throws(() => B.validate({ color: 'red;background:url(x)' }));
  assert.throws(() => B.validate({ calendar: '../bad' }));
  assert.throws(() => B.validate({ borderWidth: 0 }));
  assert.throws(() => B.validate({ borderWidth: 9 }));
  assert.throws(() => B.validate({ fillColor: 'red' }));
  assert.equal(B.validate({ calendar: '0' }).calendar, '0');
});
test('status age uses latest visit; truncated history is unknown', () => {
  const issue = { fields: { created: '2026-01-01', status: { id: '3' } }, changelog: { startAt: 0, total: 2, histories: [{ created: '2026-01-02', items: [{ field: 'status', to: '1' }] }, { created: '2026-01-03', items: [{ field: 'status', to: '3' }] }] } };
  assert.equal(B.statusSince(issue), Date.parse('2026-01-03'));
  issue.changelog.total = 3; assert.equal(B.statusSince(issue), null);
});
test('daily flags stale/unassigned/overdue and excludes done', () => {
  const issue = { fields: { updated: '2026-01-01', duedate: '2026-01-01', assignee: null, status: { statusCategory: { key: 'indeterminate' } }, customfield_1: [{ value: 'Impediment' }] } };
  assert.equal(B.daily(issue, 3, Date.parse('2026-01-10'), B.defaults).length, 3);
  issue.fields.status.statusCategory.key = 'done'; assert.equal(B.daily(issue, 3, Date.parse('2026-01-10'), B.defaults).length, 0);
});
test('added scope accepts explicit Jira sets, never infers from creation date', () => {
  assert.deepEqual([...B.addedKeys({ contents: { issueKeysAddedDuringSprint: { 'A-1': true, 'A-2': false } } })], ['A-1']);
  assert.throws(() => B.addedKeys({ contents: {} }));
});
test('Timepiece matches issue and current status, numeric hours including zero', () => {
  const data = { table: { body: { rows: [{ headerColumns: [{ id: 'issuekey', value: 'A-1' }], valueColumns: [{ id: '3', value: '12.5' }, { id: '4', value: '0' }] }] } } };
  assert.equal(B.timepieceValue(data, 'A-1', '3'), '12,5ч');
  assert.equal(B.timepieceValue(data, 'A-1', '4'), '0ч');
  assert.throws(() => B.timepieceValue(data, 'A-2', '3'));
  assert.throws(() => B.timepieceValue(data, 'A-1', '5'));
  data.table.header = { valueColumns: [{ id: '3', value: 'In Progress' }, { id: '4', value: 'Review' }] };
  const statuses = B.timepieceStatuses(data, 'A-1', '3');
  assert.deepEqual(statuses.map(s => s.name), ['In Progress', 'Review']);
  assert.equal(statuses[0].current, true); assert.equal(statuses[1].text, '0 ч');
});
test('configured terminal names ignore case and category fallback is optional',()=>{
 const p=B.validate({doneStatusNames:' Done, Closed, Resolved, Obsolete ',doneCategory:false});
 assert.equal(B.isDone({name:'oBsOlEtE'},p),true);assert.equal(B.isDone({name:'Custom',statusCategory:{key:'done'}},p),false);
 assert.equal(B.daily({fields:{assignee:{},status:{name:'Open'}}},3,Date.now(),p)[0].text,'Нет исполнителя');
 assert.equal(B.daily({fields:{assignee:null,status:{name:'CLOSED'}}},3,Date.now(),p).length,0);
});
test('blockers use inward description, all dependencies, and never mark unknown as unblocked',()=>{
 const issue={fields:{status:{name:'bLoCkEd'},issuelinks:[{type:{inward:'is blocked by',outward:'blocks'},inwardIssue:{key:'B-1'}},{type:{inward:'is blocked by',outward:'blocks'},inwardIssue:{key:'B-2'}},{type:{inward:'is blocked by',outward:'blocks'},outwardIssue:{key:'B-3'}},{type:{inward:'relates to'},inwardIssue:{key:'B-4'}}]}};
 assert.deepEqual(B.blockerKeys(issue),['B-1','B-2']);
 assert.equal(B.blockage([{key:'B-1',status:{name:'Done'}},{key:'B-2',status:{name:'Open'}}]).text,'ЗАБЛОКИРОВАНА');
 assert.equal(B.blockage([{key:'B-1',status:{name:'Resolved'}},{key:'B-2',status:{name:'obsolete'}}]).text,'РАЗБЛОКИРОВАНА');
 assert.equal(B.blockage([{key:'B-1',status:{name:'Done'}},{key:'B-2',error:'HTTP 403'}]).text,'БЛОКИРОВКА: ?');
 issue.fields.status.name='In Progress';assert.deepEqual(B.blockerKeys(issue),[]);
});
test('Jira visits: last and total differ, incomplete history cannot produce a duration',()=>{
 const issue={fields:{created:'2026-01-01',status:{id:'3',name:'Work'}},changelog:{startAt:0,total:3,histories:[['2026-01-02','1','3'],['2026-01-04','3','2'],['2026-01-05','2','3']].map(([created,from,to])=>({created,items:[{field:'status',from,to}]}))}};
 assert.equal(B.jiraTimes(issue,'last',Date.parse('2026-01-06')).find(s=>s.current).hours,24);
 assert.equal(B.jiraTimes(issue,'total',Date.parse('2026-01-06')).find(s=>s.current).hours,72);
 issue.changelog.total=4;assert.throws(()=>B.jiraTimes(issue,'total',Date.parse('2026-01-06')));
});
test('Timepiece units share raw milliseconds and validate requested visit mode',()=>{
 const data={multiVisitBehavior:'total',viewFormat:'humanReadable',table:{body:{rows:[{headerColumns:[{id:'issuekey',value:'A-1'}],valueColumns:[{id:'3',raw:String(168*3600000),value:'7 d'}]}]}}};
 assert.equal(B.timepieceStatuses(data,'A-1','3','total','weeks')[0].text,'1 нед');
 assert.equal(B.timepieceStatuses(data,'A-1','3','total','days')[0].text,'7 д');
 assert.equal(B.timepieceStatuses(data,'A-1','3','total','hours')[0].text,'168 ч');
 assert.throws(()=>B.timepieceStatuses(data,'A-1','3','last'));
 assert.equal(B.formatHours(48,'days'),'2 д');assert.equal(B.formatHours(null,'hours'),'—');
});
test('independent blocking rules match names ignoring case and require all links to clear',()=>{
 const prefs=B.validate({blockedStatusNames:' Waiting, waiting ',unblockingStatusNames:'Released',doneCategory:true});
 const issue={fields:{status:{name:'WAITING'},issuelinks:[{type:{inward:'is blocked by'},inwardIssue:{key:'DEP-1'}}]}};
 assert.deepEqual(B.blockerKeys(issue,prefs),['DEP-1']);assert.deepEqual(B.blockerKeys(issue),[]);
 assert.equal(B.blockage([{key:'DEP-1',status:{name:'Done',statusCategory:{key:'done'}}}],prefs).tone,'blocked');
 assert.equal(B.blockage([{key:'DEP-1',status:{name:'RELEASED'}}],prefs).tone,'unblocked');
 assert.equal(B.blockage([{key:'DEP-1',status:{name:'Released'}},{key:'DEP-2',error:'403'}],prefs).tone,'unknown');
});
test('build requires configured status and a nonempty exact field; ambiguity is reported',()=>{
 assert.equal(B.defaults.build,false);assert.equal(B.defaults.backlog,false);
 const fields=[{id:'customfield_55',name:'Fixed In'}];assert.equal(B.resolveBuildField(fields,'fixed in'),'customfield_55');
 assert.throws(()=>B.resolveBuildField([...fields,{id:'customfield_56',name:'Fixed In'}],'Fixed In'));
 assert.equal(B.resolveBuildField(fields,'customfield_55'),'customfield_55');
 for(const value of [null,' ',[],{}])assert.equal(B.hasBuild({fields:{status:{name:'Resolved'},customfield_55:value}},'customfield_55'),false);
 for(const value of ['build-1',['build-1'],{value:'build-1'}])assert.equal(B.hasBuild({fields:{status:{name:'rESOLVED'},customfield_55:value}},'customfield_55'),true);
 assert.equal(B.hasBuild({fields:{status:{name:'Open'},customfield_55:'build'}},'customfield_55'),false);
 assert.throws(()=>B.hasBuild({fields:{status:{name:'Resolved'}}},'customfield_55'));
});

test('small positive status durations remain distinct from zero in all units',()=>{
 for(const unit of ['hours','days','weeks']) {
  assert.match(B.formatHours(1/3600,unit),/^< 0,01 /);
  assert.match(B.formatHours(0,unit),/^0 /);
 }
 assert.equal(B.formatHours(7/60,'days'),'< 0,01 д');
});
