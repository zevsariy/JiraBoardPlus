const {test}=require('node:test'),assert=require('node:assert/strict');require('../src/network-core.js');
test('global concurrency, rate and owner-bound release',()=>{let now=0;const b=new JbpBudget(()=>now);b.configure({concurrency:1,intervalMs:100});const a=b.acquire('tab1');assert.ok(a.id);now=200;assert.ok(b.acquire('tab2').waitMs);b.release('tab2',a.id,200,10);assert.equal(b.active.size,1);b.release('tab1',a.id,200,10);assert.ok(b.acquire('tab2').id);assert.equal(b.snapshot().requests,2);});
test('429 backoff and dead-tab lease expiry recover automatically',()=>{let now=0;const b=new JbpBudget(()=>now),a=b.acquire('a');b.release('a',a.id,429,100,60000);now=59000;assert.ok(b.acquire('b').waitMs);now=61000;assert.ok(b.acquire('b').id);now=92000;assert.ok(b.acquire('c').id);assert.equal(b.active.size,1);assert.equal(b.snapshot().errors,2);});
test('budget bounds cannot be disabled by malformed configuration',()=>{const b=new JbpBudget();for(const c of [{concurrency:0,intervalMs:100},{concurrency:2,intervalMs:0},{concurrency:100,intervalMs:500}])assert.throws(()=>b.configure(c));});
test('transport holds lease until body arrives, preserves status and releases once',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),events=[];let resolveBody;
  const body=new Promise(r=>resolveBody=r),context=vm.createContext({URL,Response,AbortSignal,DOMException,setTimeout,clearTimeout,fetch:async()=>({status:200,statusText:'OK',headers:new Headers({'content-type':'application/json'}),arrayBuffer:()=>body}),jbpNetworkLocal:async m=>{events.push(m);return m.op==='acquire'?{id:'one'}:true;}});
  vm.runInContext(fs.readFileSync(require.resolve('../src/network-client.js'),'utf8'),context);
  const pending=vm.runInContext("JbpNetwork.fetch('https://jira.example.com/rest/api/2/search')",context);await new Promise(setImmediate);assert.deepEqual(events.map(e=>e.op),['acquire']);resolveBody(new TextEncoder().encode('{"ok":true}').buffer);const response=await pending;assert.deepEqual(await response.json(),{ok:true});assert.deepEqual(events.map(e=>e.op),['acquire','release']);assert.equal(events[1].status,200);
});
test('cancellation after slot acquisition releases slot without sending a request',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),controller=new AbortController(),events=[];let calls=0;
  const context=vm.createContext({URL,Response,AbortSignal,DOMException,setTimeout,clearTimeout,signal:controller.signal,fetch:async()=>{calls++;},jbpNetworkLocal:async m=>{events.push(m);if(m.op==='acquire'){controller.abort();return {id:'one'};}return true;}});
  vm.runInContext(fs.readFileSync(require.resolve('../src/network-client.js'),'utf8'),context);await assert.rejects(vm.runInContext("JbpNetwork.fetch('https://jira.example.com/rest/api/2/search',{signal})",context));assert.equal(calls,0);assert.deepEqual(events.map(e=>e.op),['acquire','release']);
});
