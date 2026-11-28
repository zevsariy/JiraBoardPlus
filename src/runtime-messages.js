/* Share the commit lock between extension pages and the worker. */
(() => {
 if(globalThis.JbpStorage||!globalThis.chrome?.storage?.local||!globalThis.navigator?.locks)return;
 const local=chrome.storage.local,raw={};
 for(const name of ['set','remove','clear'])if(local[name])raw[name]=local[name].bind(local);
 const transaction=fn=>navigator.locks.request('jbp-storage-commit',()=>fn(raw));
 for(const name of Object.keys(raw))local[name]=(...args)=>transaction(()=>raw[name](...args));
 globalThis.JbpStorage={transaction};
})();
/* Promise transport for extension UI. Retry only idempotent reads, never writes. */
(() => {
 if(globalThis.JbpMessaging)return;
 const pending=new Map();
 const readOnly=m=>(m?.type==='composer'&&m.op==='get')||(m?.type==='boardWorkspace'&&m.op==='get')||['boardPrefsGet','connectionGet','embeddedConnection','aiGet','get'].includes(m?.type)||(m?.type==='sprintStore'&&['profileGet','snapshotList'].includes(m.op))||(m?.type==='embeddedReport'&&m.command?.type==='get');
 const channelError=e=>/message (?:channel|port) closed|receiving end does not exist|could not establish connection|listener indicated.*asynchronous|extension context invalidated/i.test(String(e?.message||e));
 const invalidated=e=>/extension context invalidated/i.test(String(e?.message||e));
 function friendly(error,reading){
  if(!channelError(error))return error;
  const e=new Error(reading?'Связь с расширением прервалась. Обновите вкладку Jira и повторите действие. Возможно, расширение обновилось или перезапустилось.':'Связь с расширением прервалась. Результат операции неизвестен: сначала обновите данные и проверьте, сохранились ли изменения. Автоматический повтор не выполнялся.');e.cause=error;return e;
 }
 async function request(message,transport){
  const reading=readOnly(message);
  for(let attempt=0;;attempt++){
   try{const result=await transport(message);if(reading&&result===undefined)throw Error('The message port closed before a response was received.');return result;}
   catch(e){if(reading&&attempt===0&&channelError(e)&&!invalidated(e)){await new Promise(resolve=>setTimeout(resolve,150));continue;}throw friendly(e,reading);}
  }
 }
 function install(runtime){
  if(!runtime?.sendMessage||runtime.sendMessage.jbpTransport)return;
  const original=runtime.sendMessage.bind(runtime);
  const wrapped=function(message,...args){
   if(args.some(a=>typeof a==='function'))return original(message,...args);
   const reading=readOnly(message),key=reading?JSON.stringify(message):null;
   if(key&&pending.has(key))return pending.get(key);
   const result=request(message,()=>original(message,...args));
   if(key){pending.set(key,result);result.then(()=>pending.delete(key),()=>pending.delete(key));}
   return result;
  };
  wrapped.jbpTransport=true;runtime.sendMessage=wrapped;
 }
 globalThis.JbpMessaging={install,request,readOnly};install(globalThis.chrome?.runtime);
})();
