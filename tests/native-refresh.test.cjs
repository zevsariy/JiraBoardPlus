const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
require('../src/board-core.js');
function harness(){
 let time=0,id=0;const timers=new Map(),events=new Map();
 const c=vm.createContext({URL,console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Date:class extends Date{static now(){return time;}},location:{pathname:'/secure/RapidBoard.jspa',href:'https://jira.example/secure/RapidBoard.jspa?rapidView=7'},document:{hidden:false,hasFocus:()=>true,dispatchEvent(){},addEventListener:(type,fn)=>{events.set(type,[...(events.get(type)||[]),fn]);}},addEventListener:(type,fn)=>{events.set(type,[...(events.get(type)||[]),fn]);},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:time+Number(delay)});return id;},clearTimeout:key=>timers.delete(key)});
 const run=code=>vm.runInContext(code,c);
 run(fs.readFileSync(path.join(__dirname,'../src/native-refresh-main.js'),'utf8'));
 // Small contract fixture: native add/remove and repeat scheduling, plus an
 // unrelated poller. No production Jira source or server is used by tests.
 run(`globalThis.calls=[];globalThis.other=0;globalThis.fail=false;globalThis.hold=false;globalThis.release=null;globalThis.nativeTimers={};
 globalThis.GH={};GH.Poller={
 addPoller(id,delay,fn,ctx){if(typeof delay==='function'){ctx=fn;fn=delay;delay=30000;}this.removePoller(id);const tick=()=>{fn.call(ctx,false);nativeTimers[id]=setTimeout(tick,delay);};nativeTimers[id]=setTimeout(tick,delay);},
 removePoller(id){clearTimeout(nativeTimers[id]);delete nativeTimers[id];}
 };
 globalThis.handler=function(immediate){calls.push({at:Date.now(),immediate,context:this?.name});if(hold)return new Promise(r=>release=r);if(fail)return Promise.reject(Error('503'));return Promise.resolve();};
 GH.Poller.addPoller('WorkPoller',30000,handler,{name:'work'});GH.Poller.addPoller('linkedPagePoller',30000,()=>other++);`);
 return {run,event(type){for(const fn of events.get(type)||[])fn();},async advance(ms){const until=time+ms;let steps=0;while(true){const due=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;if(++steps>10000)throw Error('timer loop');time=due[1].at;timers.delete(due[0]);due[1].fn();await new Promise(setImmediate);}time=until;await new Promise(setImmediate);},configure(mode='auto',seconds=120,pauseHidden=true){run(`JbpNativeRefresh.configure(${JSON.stringify({mode,seconds,pauseHidden})})`);},count:()=>run('calls.length')};
}
test('refresh preferences validate mode and interval and migrate old profiles',()=>{
 assert.equal(JbpBoard.validate({}).nativeRefreshSeconds,300);assert.equal(JbpBoard.validate({}).nativeRefreshPauseHidden,true);
 for(const nativeRefreshSeconds of [0,29,3601,NaN,1.5])assert.throws(()=>JbpBoard.validate({nativeRefreshSeconds}));
 assert.throws(()=>JbpBoard.validate({nativeRefreshMode:'reload'}));assert.equal(JbpBoard.validate({nativeRefreshSeconds:'60'}).nativeRefreshSeconds,60);
});
test('custom interval controls only WorkPoller and preserves call context/edit safety',async()=>{
 const h=harness();h.configure();await h.advance(119999);assert.equal(h.count(),0);await h.advance(1);assert.equal(h.count(),1);assert.equal(h.run('calls[0].context'),'work');assert.equal(h.run('calls[0].immediate'),false);assert.equal(h.run('other'),4);await h.advance(120000);assert.equal(h.count(),2);
});
test('manual mode, explicit check and native restoration have no duplicate timers',async()=>{
 const h=harness();h.configure('manual');await h.advance(300000);assert.equal(h.count(),0);h.run('JbpNativeRefresh.refreshNow()');await h.advance(0);assert.equal(h.count(),1);assert.equal(h.run('calls[0].immediate'),false);
 h.configure('jira',300,false);await h.advance(90000);assert.equal(h.count(),4);h.configure('manual');await h.advance(90000);assert.equal(h.count(),4);
});
test('hidden and unfocused tabs pause; resuming makes one overdue check',async()=>{
 const h=harness();h.configure('auto',60);h.run('document.hidden=true');h.event('visibilitychange');await h.advance(600000);assert.equal(h.count(),0);h.run('document.hidden=false');h.event('visibilitychange');await h.advance(0);assert.equal(h.count(),1);
 h.run('document.hasFocus=()=>false');h.event('blur');await h.advance(600000);assert.equal(h.count(),1);h.run('document.hasFocus=()=>true');h.event('focus');await h.advance(0);assert.equal(h.count(),2);
});
test('ten tabs poll only the focused visible tab',async()=>{
 const tabs=Array.from({length:10},()=>harness());for(let i=0;i<10;i++){tabs[i].configure('auto',60);if(i){tabs[i].run('document.hidden=true');tabs[i].event('visibilitychange');}}
 await Promise.all(tabs.map(h=>h.advance(60000)));assert.deepEqual(tabs.map(h=>h.count()),[1,0,0,0,0,0,0,0,0,0]);
 tabs[0].run('document.hidden=true');tabs[0].event('visibilitychange');tabs[1].run('document.hidden=false');tabs[1].event('visibilitychange');await tabs[1].advance(0);assert.equal(tabs[1].count(),1);
});
test('in-flight requests cannot overlap or resurrect removed polling after changes',async()=>{
 const h=harness();h.configure('auto',30);h.run('hold=true');await h.advance(30000);assert.equal(h.count(),1);h.run('JbpNativeRefresh.refreshNow()');await h.advance(300000);assert.equal(h.count(),1);
 h.configure('manual');h.run('hold=false;release()');await h.advance(300000);assert.equal(h.count(),1);h.configure('auto',30);await h.advance(30000);assert.equal(h.count(),2);
 h.run("GH.Poller.removePoller('WorkPoller')");await h.advance(300000);assert.equal(h.count(),2);assert.equal(h.run('JbpNativeRefresh.status().supported'),false);
});
test('failures back off, page routes do not poll and unknown APIs fail visibly',async()=>{
 const h=harness();h.configure('auto',30);h.run('fail=true');await h.advance(30000);assert.equal(h.count(),1);assert.throws(()=>h.run('JbpNativeRefresh.refreshNow()'));await h.advance(59999);assert.equal(h.count(),1);await h.advance(1);assert.equal(h.count(),2);await h.advance(119999);assert.equal(h.count(),2);
 h.run("location.href='https://jira.example/secure/RapidBoard.jspa?rapidView=7&view=planning'");h.event('popstate');await h.advance(300000);assert.equal(h.count(),2);
 h.run("GH.Poller.removePoller('WorkPoller')");assert.throws(()=>h.run('JbpNativeRefresh.refreshNow()'),/не обнаружен/);
});
