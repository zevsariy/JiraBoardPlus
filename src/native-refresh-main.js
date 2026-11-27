/* MAIN world: narrowly adapts Jira Server/DC GH.Poller WorkPoller.
 * API verified against the official jira-greenhopper-plugin 9.12.0 artifact.
 * Never intercepts fetch/XHR, writes, other pollers, or page-wide timers. */
(() => {
  if(globalThis.JbpNativeRefresh || !location.pathname.endsWith('/secure/RapidBoard.jspa'))return;
  let config={mode:'jira',seconds:300,pauseHidden:false},api,entry,timer,internal=false;
  let lastError='',stopped=false;
  const now=()=>Date.now();
  const route=()=>{const u=new URL(location.href);return u.pathname.endsWith('/secure/RapidBoard.jspa')&&/^\d+$/.test(u.searchParams.get('rapidView')||'')&&[null,'work','detail'].includes(u.searchParams.get('view'));};
  const inactive=()=>document.hidden||!document.hasFocus();
  const managed=()=>config.mode!=='jira'||config.pauseHidden;
  const interval=()=>config.mode==='auto'?config.seconds*1000:(entry?.interval||30000);
  function status(){return {supported:!!entry,adapter:!!api,mode:config.mode,paused:config.pauseHidden&&inactive(),running:!!entry?.busy,error:lastError,route:route()};}
  function notify(){document.dispatchEvent(new CustomEvent('jbp-native-refresh-status',{detail:JSON.stringify(status())}));}
  function cancel(){clearTimeout(timer);timer=null;}
  function schedule(){
    cancel();
    if(stopped||!entry||!managed()||entry.busy||config.mode==='manual'||!route()||(config.pauseHidden&&inactive()))return;
    timer=setTimeout(()=>run(entry),Math.max(0,entry.nextAt-now()));
  }
  function settle(e,error){
    if(entry!==e)return;
    e.busy=false;
    if(error){e.failures=Math.min(4,e.failures+1);lastError='Проверка Jira не удалась. Повтор будет отложен.';}
    else{e.failures=0;lastError='';}
    e.nextAt=now()+Math.max(interval(),error?Math.min(900000,60000*2**(e.failures-1)):0);
    notify();schedule();
  }
  function run(e,manual=false,restarting=false){
    if(stopped||entry!==e||e.busy||!route()||(!manual&&(config.mode==='manual'||(config.pauseHidden&&inactive())||((managed()||e.failures)&&now()<e.nextAt))))return;
    if(manual&&inactive())return;
    e.busy=true;cancel();notify();
    try{
      // false preserves Jira's "board updated" prompt and never overwrites an editor.
      const result=e.handler.call(e.context,managed()?false:restarting);
      if(result&&typeof result.then==='function')Promise.resolve(result).then(()=>settle(e),()=>settle(e,true));
      else if(result&&typeof result.done==='function'){
        result.done(()=>settle(e));if(typeof result.fail==='function')result.fail(()=>settle(e,true));
      }else settle(e);
    }catch(error){settle(e,true);}
  }
  function forward(fn,args){internal=true;try{return fn.apply(api.object,args);}finally{internal=false;}}
  function register(){
    cancel();if(!entry||!api)return;
    forward(api.remove,['WorkPoller']);
    if(managed())schedule();
    else{
      const e=entry;
      // Do not return Jira's Deferred: the native poller must not resurrect a
      // removed timer when an old request finishes after a setting change.
      forward(api.add,['WorkPoller',e.interval,restarting=>{if(!managed())run(e,false,restarting);},e.context]);
    }
    notify();
  }
  function attach(object){
    if(api||!object||typeof object.addPoller!=='function'||typeof object.removePoller!=='function')return;
    api={object,add:object.addPoller,remove:object.removePoller};
    object.addPoller=function(id,delay,handler,context){
      if(id!=='WorkPoller'||internal)return api.add.apply(this,arguments);
      if(typeof delay==='function'){context=handler;handler=delay;delay=30000;}
      if(typeof handler!=='function')return api.add.apply(this,arguments);
      const previous=entry;
      entry={handler,context,interval:Number(delay)>0?Number(delay):30000,busy:false,failures:0,nextAt:now()+(config.mode==='auto'?config.seconds*1000:Number(delay)||30000)};
      // Render callbacks can re-register the same poller during its own request.
      if(previous?.busy&&previous.handler===handler){entry=previous;entry.context=context;}
      register();
    };
    object.removePoller=function(id){
      if(id==='WorkPoller'&&!internal){cancel();entry=null;notify();}
      return api.remove.apply(this,arguments);
    };
    notify();
  }
  // Catch namespace assignment synchronously, before WorkController registers
  // its first poller. Existing tabs without a captured registration show a
  // reload hint rather than guessing at Jira's private timer state.
  function watch(object,key,receive){
    const descriptor=Object.getOwnPropertyDescriptor(object,key);
    if(descriptor&&(!descriptor.configurable||descriptor.get||descriptor.set)){receive(object[key]);return;}
    let value=object[key];
    Object.defineProperty(object,key,{configurable:true,enumerable:descriptor?.enumerable??true,get:()=>value,set:v=>{value=v;receive(v);}});
    receive(value);
  }
  const watched=new WeakSet();
  function namespace(gh){if(!gh||typeof gh!=='object'||watched.has(gh))return;watched.add(gh);watch(gh,'Poller',attach);}
  watch(globalThis,'GH',namespace);
  globalThis.JbpNativeRefresh={
    configure(value){
      const seconds=Number(value?.seconds);
      if(!['jira','manual','auto'].includes(value?.mode)||!Number.isInteger(seconds)||seconds<30||seconds>3600||typeof value.pauseHidden!=='boolean')throw Error('Некорректные настройки обновления.');
      const changed=JSON.stringify(config)!==JSON.stringify(value);config={mode:value.mode,seconds,pauseHidden:value.pauseHidden};
      if(changed&&entry){entry.nextAt=now()+interval();register();}
      notify();return status();
    },
    refreshNow(){
      if(!entry)throw Error('Таймер Jira не обнаружен. Перезагрузите вкладку; эта версия Jira может не поддерживаться.');
      if(entry.failures&&entry.nextAt>now())throw Error('После ошибки Jira действует пауза. Повторите позже.');
      run(entry,true);return status();
    },
    status
  };
  document.addEventListener('visibilitychange',()=>{schedule();notify();});
  for(const type of ['focus','blur','popstate'])addEventListener(type,()=>{schedule();notify();});
  addEventListener('pagehide',()=>{stopped=true;cancel();});
  addEventListener('pageshow',()=>{stopped=false;schedule();notify();});
})();
