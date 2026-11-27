/* Installed in MAIN only after Start. No fetch/XHR/console monkeypatching. */
(() => {
  if(globalThis.JbpDiagnosticPage)return;
  const D=JbpDiagnostics;
  let state=null,observers=[],tickTimer,stopTimer,lastTick=0,lastVisible=false,lastEnvironment=0,visibleSince=0,seen=new Set();
  const listeners=[];
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));}
  function push(name,value,limit){const list=state[name];if(list.length>=limit){list.shift();state.dropped[name]=(state.dropped[name]||0)+1;}list.push(value);}
  function isLive(){if(!state?.running)return false;if(Date.now()>=state.deadline){stop();return false;}return true;}
  function environment(){
    const connection=navigator.connection,heap=performance.memory;
    state.environment={online:navigator.onLine,visible:!document.hidden,browser:(navigator.userAgent.match(/(?:Edg|Chrome|Firefox)\/[\d.]+/g)||[]).slice(-1)[0]||'unknown',
      networkEstimate:connection?{effectiveType:String(connection.effectiveType||'unknown'),rttMs:D.finite(connection.rtt),downlinkMbps:D.finite(connection.downlink),saveData:!!connection.saveData}:null,
      heap:heap?{usedBytes:D.finite(heap.usedJSHeapSize),allocatedBytes:D.finite(heap.totalJSHeapSize),limitBytes:D.finite(heap.jsHeapSizeLimit)}:null,
      domElements:document.getElementsByTagName('*').length};
  }
  function resource(entry){
    const token=entry.name+'\0'+entry.startTime+'\0'+entry.duration;
    if(seen.has(token))return;seen.add(token);if(seen.size>4000)seen.delete(seen.values().next().value);
    push('resources',{...D.timing(entry,state.base),buffered:entry.startTime<state.startMs},2000);
  }
  function observe(type,fn,buffered=false){
    if(!globalThis.PerformanceObserver?.supportedEntryTypes?.includes(type))return false;
    try{const observer=new PerformanceObserver(list=>{if(!isLive())return;for(const e of list.getEntries())fn(e);});observer.observe({type,buffered});observers.push(observer);return true;}catch{return false;}
  }
  function tick(){
    if(!isLive())return;const now=performance.now(),visible=!document.hidden;
    if(visible && lastVisible){push('lagMs',D.round(Math.max(0,now-lastTick-500)),1000);state.visibleObservedMs+=Math.max(0,now-lastTick);}
    if(now-lastEnvironment>=10000){environment();lastEnvironment=now;}
    lastTick=now;lastVisible=visible;tickTimer=setTimeout(tick,500);
  }
  function start({base,seconds=120,buffered=true}){
    stop();if(!Number.isInteger(seconds)||seconds<15||seconds>300)throw Error('Запись: 15–300 секунд.');
    if(!location.href.startsWith(base+'/'))throw Error('Вкладка не относится к настроенной Jira.');
    const startMs=performance.now();state={base,running:true,startedAt:new Date().toISOString(),deadline:Date.now()+seconds*1000,startMs,visibleObservedMs:0,resources:[],longTasks:[],lagMs:[],marks:[],errors:{js:0,rejections:0,resources:0},dropped:{},capabilities:{},layoutShift:0,environment:null,navigation:null};
    seen=new Set();
    const nav=performance.getEntriesByType('navigation')[0];
    if(nav)state.navigation={...D.timing(nav,base),domInteractiveMs:D.finite(nav.domInteractive),domContentLoadedMs:nav.domContentLoadedEventEnd>0?D.round(nav.domContentLoadedEventEnd):null,loadMs:nav.loadEventEnd>0?D.round(nav.loadEventEnd):null,type:['navigate','reload','back_forward','prerender'].includes(nav.type)?nav.type:'unknown'};
    if(buffered)for(const e of performance.getEntriesByType('resource'))resource(e);
    state.capabilities.resource=observe('resource',resource,buffered);
    visibleSince=document.hidden?Infinity:startMs;
    state.capabilities.longTask=observe('longtask',e=>push('longTasks',{startMs:D.round(e.startTime),duration:D.round(e.duration),visible:!document.hidden&&e.startTime>=visibleSince},500));
    state.capabilities.layoutShift=observe('layout-shift',e=>{if(!e.hadRecentInput)state.layoutShift+=e.value;});
    state.capabilities.lcp=observe('largest-contentful-paint',e=>{state.lcpMs=D.round(e.startTime);},true);
    state.fcpMs=D.finite(performance.getEntriesByName('first-contentful-paint')[0]?.startTime);
    state.capabilities.responseStatus='PerformanceResourceTiming' in globalThis && 'responseStatus' in PerformanceResourceTiming.prototype;
    listen(window,'error',e=>{if(!isLive())return;if(e instanceof ErrorEvent)state.errors.js++;else state.errors.resources++;},true);
    listen(window,'unhandledrejection',()=>{if(isLive())state.errors.rejections++;});
    listen(document,'visibilitychange',()=>{lastTick=performance.now();lastVisible=!document.hidden;visibleSince=lastVisible?lastTick:Infinity;if(state)state.environment.visible=lastVisible;});
    for(const type of ['online','offline'])listen(window,type,()=>{if(state){state.environment.online=navigator.onLine;push('marks',{at:new Date().toISOString(),kind:type},100);}});
    listen(window,'pagehide',stop,{once:true});
    environment();lastEnvironment=lastTick=performance.now();lastVisible=!document.hidden;
    tickTimer=setTimeout(tick,500);stopTimer=setTimeout(stop,seconds*1000);
    return snapshot();
  }
  function stop(){clearTimeout(tickTimer);clearTimeout(stopTimer);for(const o of observers)o.disconnect();observers=[];for(const remove of listeners.splice(0))remove();if(state?.running){state.running=false;state.endedAt=new Date().toISOString();}return snapshot(false);}
  function snapshot(check=true){if(!state)return null;if(check&&state.running&&Date.now()>=state.deadline)return stop();const {base,...data}=state;return {...data,capturedAt:new Date().toISOString(),layoutShift:Math.round(state.layoutShift*1000)/1000,pageRoute:D.route(location.href,base)};}
  function mark(){if(!isLive())throw Error('Сначала начните запись.');push('marks',{at:new Date().toISOString(),kind:'user-symptom'},100);return snapshot();}
  globalThis.JbpDiagnosticPage={start,stop,snapshot,mark};
})();
