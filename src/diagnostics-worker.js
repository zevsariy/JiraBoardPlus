let diagnosticProbe=null,lastDiagnosticProbeAt=0;
async function diagnosticMessage(message,sender){
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('diagnostics.html'))throw Error('Откройте инженерную диагностику расширения.');
  await jbpBudgetReady;
  const base=jbpNetworkBase,owner=String(sender.tab?.id??sender.url);
  if(message.op==='overview'){
    const tabs=base?(await chrome.tabs.query({url:new URL(base).origin+'/*'})).filter(t=>isJiraPage(t.url,base)):[];
    return {baseUrl:base,extensionVersion:chrome.runtime.getManifest().version,budget:jbpBudget.snapshot(),tabs:tabs.map(t=>({id:t.id,title:String(t.title||'Jira').slice(0,120),route:JbpDiagnostics.route(t.url,base),active:!!t.active,discarded:!!t.discarded,frozen:typeof t.frozen==='boolean'?t.frozen:null,status:t.status}))};
  }
  if(!base)throw Error('Сначала настройте адрес Jira.');
  const tabId=Number(message.tabId);if(!Number.isInteger(tabId)||tabId<0)throw Error('Выберите вкладку Jira.');
  const tab=await chrome.tabs.get(tabId);
  if(!isJiraPage(tab.url,base))throw Error('Вкладка закрыта или больше не относится к настроенной Jira.');
  if(tab.discarded)throw Error('Вкладка выгружена браузером. Откройте её вручную и повторите действие.');
  const execute=async(world,func,args=[])=>{
    const [r]=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world,func,args});
    if(r?.error)throw Error('Браузер не смог выполнить сбор измерений.');
    const value=r?.result??null;
    return world==='MAIN'?JbpDiagnostics.cleanCapture(value):value;
  };
  if(message.op==='focus'){await chrome.tabs.update(tabId,{active:true});if(chrome.windows)await chrome.windows.update(tab.windowId,{focused:true});return true;}
  if(message.op==='start'){
    if(!Number.isInteger(message.seconds)||message.seconds<15||message.seconds>300)throw Error('Запись: 15–300 секунд.');
    await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'MAIN',files:['src/diagnostics-core.js','src/diagnostics-page.js']});
    return execute('MAIN',options=>globalThis.JbpDiagnosticPage.start(options),[{base,seconds:message.seconds,buffered:message.buffered===true}]);
  }
  if(message.op==='read')return execute('MAIN',()=>globalThis.JbpDiagnosticPage?.snapshot()||null);
  if(message.op==='stop')return execute('MAIN',()=>globalThis.JbpDiagnosticPage?.stop()||null);
  if(message.op==='mark')return execute('MAIN',()=>globalThis.JbpDiagnosticPage?.mark()||null);
  if(message.op==='cancelProbe'){
    if(diagnosticProbe&&diagnosticProbe.owner!==owner)throw Error('Проба запущена в другой вкладке диагностики.');
    if(diagnosticProbe)diagnosticProbe.cancelled=true;
    return execute('ISOLATED',()=>{globalThis.jbpDiagnosticActiveProbe?.controller.abort();return true;});
  }
  if(message.op!=='probe'||!['serverInfo','session'].includes(message.kind))throw Error('Неизвестное диагностическое действие.');
  if(diagnosticProbe)return {waiting:true,waitMs:500};
  const record={owner,tabId,id:crypto.randomUUID()};diagnosticProbe=record;
  let result=null,ticket=null;
  try{
  const saved=await chrome.storage.session?.get('jbpDiagnosticsLastProbeAt');
  lastDiagnosticProbeAt=Math.max(lastDiagnosticProbeAt,saved?.jbpDiagnosticsLastProbeAt||0);
  if(Date.now()-lastDiagnosticProbeAt<2000)return {waiting:true,waitMs:2000-(Date.now()-lastDiagnosticProbeAt)};
  // Reserve a global slot before the in-tab probe; never bypass the Jira budget.
  ticket=await networkMessage({op:'acquire',url:base+'/rest/api/2/'+(message.kind==='serverInfo'?'serverInfo':'myself')},sender);
  if(ticket.waitMs)return {waiting:true,waitMs:ticket.waitMs};
  if(!ticket.id)throw Error('Подключение Jira изменилось. Обновите диагностику.');
  lastDiagnosticProbeAt=Date.now();
    await chrome.storage.session?.set({jbpDiagnosticsLastProbeAt:lastDiagnosticProbeAt});
    await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',files:['src/diagnostics-core.js']});
    if(record.cancelled)return {at:new Date().toISOString(),kind:message.kind,outcome:'cancelled',status:null,durationMs:0,serverTiming:[],meta:{}};
    result=await execute('ISOLATED',JbpDiagnosticProbe,[base,message.kind,record.id]);
    if(!result)throw Error('Документ изменился во время пробы.');
    return result;
  }finally{
    if(ticket?.id)await networkMessage({op:'release',id:ticket.id,status:result?.status||0,durationMs:result?.durationMs||0,retryMs:result?.retryMs||0},sender).catch(()=>{});
    if(diagnosticProbe===record)diagnosticProbe=null;
  }
}
