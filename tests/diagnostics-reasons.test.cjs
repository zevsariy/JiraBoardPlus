const {test}=require('node:test'),assert=require('node:assert/strict');require('../src/diagnostics-core.js');const D=JbpDiagnostics;
const resource=(overrides={})=>({route:'/rest/api/2/search',kind:'fetch',startMs:1000,durationMs:2100,status:200,ttfbMs:2000,dnsMs:0,tcpMs:0,connectMs:0,tlsMs:null,downloadMs:100,beforeRequestMs:0,transferBytes:1000,timingExposed:true,buffered:false,visible:true,serverTiming:[],...overrides});
const capture=(overrides={})=>({startMs:1000,visibleObservedMs:10000,capabilities:{resource:true,longTask:true,responseStatus:true},resources:[],longTasks:[],lagMs:[],errors:{js:0,rejections:0},...overrides});
const probe=(overrides={})=>({kind:'serverInfo',outcome:'http',status:200,durationMs:100,visible:true,json:true,serverTiming:[],...overrides});
const find=(a,prefix)=>a.findings.find(f=>f.id.startsWith(prefix));

test('historical and external errors cannot diagnose a current Jira server failure',()=>{
 const a=D.explain(capture({resources:[resource({buffered:true,status:503}),resource({route:'external-resource',status:503}),resource({startMs:500,buffered:false,status:429})]}));
 assert.equal(find(a,'upstream-error'),undefined);assert.equal(find(a,'rate-limit'),undefined);assert.equal(find(a,'first-byte'),undefined);assert.equal(a.scope.bufferedResources,2);assert.equal(a.scope.otherResources,1);
});
test('unknown timing/status and absence of data never imply success or a healthy server',()=>{
 assert.equal(D.explain(null).status,'insufficient');
 const a=D.explain(capture({visibleObservedMs:0,capabilities:{},resources:Array.from({length:6},()=>resource({timingExposed:false,status:null}))}));
 assert.equal(a.status,'insufficient');assert.equal(a.findings.length,0);assert.ok(a.gaps.some(g=>g.includes('неизвестен')));
 assert.equal(D.explain(capture({resources:[resource({ttfbMs:0})],environment:{domElements:1000000,heap:{usedBytes:999999999,limitBytes:1000000000}}})).findings.length,0);
});
test('TTFB confidence depends on recurrence; one large outlier remains low confidence',()=>{
 const one=D.explain(capture({resources:[resource()]})),many=D.explain(capture({resources:Array.from({length:10},()=>resource())}));
 assert.equal(find(one,'first-byte').confidence.level,'low');assert.equal(find(many,'first-byte').confidence.level,'medium');assert.equal(find(many,'first-byte').metrics[0].n,10);
 const outlier=D.explain(capture({resources:[resource(),...Array.from({length:9},()=>resource({ttfbMs:10}))]}));assert.equal(find(outlier,'first-byte').confidence.level,'low');assert.match(find(outlier,'first-byte').confidence.reason,/выше порога: 1/);
 assert.equal(find(D.explain(capture({resources:[resource({ttfbMs:1500})]})),'first-byte'),undefined);
});
test('direct HTTP evidence has a stated scope; probes and resources are not summed for confidence',()=>{
 const a=D.explain(capture({resources:[resource({status:429}),resource({status:429})]}),[probe({status:429}),probe({status:429})]);
 assert.equal(find(a,'rate-limit').confidence.level,'medium');
 const b=D.explain(capture({resources:Array.from({length:3},()=>resource({status:503}))}));assert.equal(find(b,'upstream-error').confidence.level,'high');
 const truncated=D.explain(capture({resources:Array.from({length:3},()=>resource({status:503})),dropped:{resources:2}}));assert.equal(find(truncated,'upstream-error').confidence.level,'medium');
});
test('visible repeated long tasks support local blocking; timer lag alone and hidden tasks do not',()=>{
 const tasks=Array.from({length:3},(_,i)=>({startMs:1000+i*500,duration:250,visible:true}));
 assert.equal(find(D.explain(capture({longTasks:tasks})),'main-thread').confidence.level,'high');
 assert.equal(find(D.explain(capture({longTasks:tasks.map(t=>({...t,visible:false}))})),'main-thread'),undefined);
 assert.equal(find(D.explain(capture({lagMs:[500,600,700],capabilities:{}})),'main-thread').confidence.level,'low');
});
test('different endpoints, background probes and cancelled/limited bodies are not network jitter or packet loss',()=>{
 const mixed=[...Array.from({length:5},()=>probe({durationMs:100})),...Array.from({length:5},()=>probe({kind:'session',durationMs:3000}))];assert.equal(find(D.explain(null,mixed),'variation'),undefined);
 assert.equal(find(D.explain(null,[100,100,100,100,900].map(durationMs=>probe({durationMs,visible:false}))),'variation'),undefined);
 const a=D.explain(null,[probe({outcome:'cancelled'}),probe({outcome:'response-limit'})]);assert.equal(find(a,'request-failure'),undefined);assert.ok(find(a,'probe-limit'));
 const jitter=D.explain(null,[100,100,100,100,900].map(durationMs=>probe({durationMs})));assert.equal(find(jitter,'variation').confidence.level,'low');
});
test('reused and hidden phases are not slow connections, large downloads have measured evidence',()=>{
 assert.equal(find(D.explain(capture({resources:[resource({ttfbMs:10})]})),'connection:'),undefined);
 assert.equal(find(D.explain(capture({resources:[resource({timingExposed:false,tcpMs:4000})]})),'connection:'),undefined);
 const a=D.explain(capture({resources:[resource({downloadMs:3000,durationMs:4000,ttfbMs:50,transferBytes:2097152})]}));assert.ok(find(a,'large-download'));assert.equal(find(a,'large-download').metrics[1].value,2097152);
});
test('Server-Timing remains usable without exposed phases and never becomes a computed network remainder',()=>{
 const a=D.explain(null,[probe({serverTiming:[{name:'db',duration:2500},{name:'app',duration:3000}],phases:null})]);
 assert.ok(find(a,'server-timing:probe:serverInfo:db'));assert.equal(find(a,'server-timing:probe:serverInfo:db').confidence.level,'low');assert.match(find(a,'server-timing').limits.join(' '),/перекрываться/);
 assert.ok(!a.gaps.some(g=>g.startsWith('Нет доступного Server-Timing')));
});
test('cached latency is not current server wait; active and passive latency for the same route are not pooled',()=>{
 assert.equal(find(D.explain(capture({resources:[resource({cache:'local-cache'})]})),'first-byte'),undefined);
 const a=D.explain(capture({resources:[resource({route:'/rest/api/2/serverInfo'})]}),Array.from({length:5},()=>probe({phases:resource({route:'/rest/api/2/serverInfo'})})));
 const waits=a.findings.filter(f=>f.id.startsWith('first-byte'));assert.equal(waits.length,1);assert.equal(waits[0].metrics[0].n,1);
});
test('symptom windows use monotonic time, exclude historical entries, and support old marks without inventing timing',()=>{
 const a=D.explain(capture({resources:[resource(),resource({buffered:true})],longTasks:[{startMs:2000,duration:300,visible:true}],marks:[{kind:'user-symptom',at:'2026-11-28T00:00:00Z',startMs:2100},{kind:'user-symptom',at:'2026-11-28T00:00:01Z'}]}));
 assert.deepEqual(a.windows[0],{at:'2026-11-28T00:00:00Z',available:true,resources:1,slowResponses:1,longTasks:1});assert.equal(a.windows[1].available,false);
});
test('explanations survive export and recomputation without raw probe fields or secrets',()=>{
 const input={capture:capture({resources:[resource()]}),probes:[probe({raw:'SECRET',url:'https://private.example/?secret',requestId:'private',meta:{version:'9.12',cookie:'SECRET'}})]};
 const a=D.report(input),b=D.report(a);assert.equal(a.summary.assessment.method,'browser-evidence/v1');assert.deepEqual(a.summary.assessment,b.summary.assessment);assert.equal(JSON.stringify(a).includes('SECRET'),false);assert.equal(JSON.stringify(a).includes('private'),false);assert.ok(a.summary.findings.every(f=>f.confidence.reason&&f.metrics.length&&f.next));
});
