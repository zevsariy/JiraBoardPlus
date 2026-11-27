const jbpBudget=new JbpBudget();
let jbpNetworkBase='';
const initializeBudget=()=>Promise.all([chrome.storage.local.get(['jbpNetworkConfig','jbpReportsV1']),chrome.storage.session?.get('jbpBudgetSession')||{}]).then(([s,session])=>{
  if(s.jbpNetworkConfig){try{jbpBudget.configure(s.jbpNetworkConfig);}catch{/* Keep safe defaults without disabling the Jira budget. */}}
  jbpNetworkBase=JbpConnection.from(s.jbpReportsV1).baseUrl;
  const saved=session.jbpBudgetSession;
  if(saved){jbpBudget.active=new Map(saved.active||[]);jbpBudget.next=saved.next||0;jbpBudget.cooldown=saved.cooldown||0;jbpBudget.stats={...jbpBudget.stats,...saved.stats};jbpBudget.started=saved.started||jbpBudget.started;}
  return true;
}).catch(()=>false);
let jbpBudgetReady=initializeBudget(),configureQueue=Promise.resolve();
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.jbpReportsV1){try{jbpNetworkBase=JbpConnection.from(changes.jbpReportsV1.newValue).baseUrl;}catch{jbpNetworkBase='';}}});
let budgetSave=Promise.resolve();
function persistBudget(){const value={active:[...jbpBudget.active],next:jbpBudget.next,cooldown:jbpBudget.cooldown,stats:{...jbpBudget.stats},started:jbpBudget.started};budgetSave=budgetSave.catch(()=>{}).then(()=>chrome.storage.session?.set({jbpBudgetSession:value}));return budgetSave;}
async function networkMessage(m,sender){
  const ready=jbpBudgetReady;
  if(!await ready){if(jbpBudgetReady===ready)jbpBudgetReady=initializeBudget();if(!await jbpBudgetReady)throw Error('Не удалось прочитать бюджет запросов. Повторите операцию.');}
  const internal=sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''));
  const base=jbpNetworkBase;
  if(sender.id!==chrome.runtime.id||(!internal&&!isJiraPage(sender.url,base)))throw Error('Недопустимый источник запроса.');
  const owner=String(sender.tab?.id??sender.url),control=sender.url===chrome.runtime.getURL('control.html');
  if(m.op==='status')return jbpBudget.snapshot();
  if(m.op==='configure'){if(!control)throw Error('Откройте Контроль команды.');const candidate=new JbpBudget();candidate.configure(m.config);const save=configureQueue.catch(()=>{}).then(async()=>{await chrome.storage.local.set({jbpNetworkConfig:candidate.config});jbpBudget.configure(candidate.config);return jbpBudget.snapshot();});configureQueue=save;return save;}
  if(m.op==='cacheHit'){jbpBudget.stats.cacheHits++;return true;}
  if(m.op==='release'){jbpBudget.release(owner,m.id,m.status,m.durationMs,m.retryMs);await persistBudget();return true;}
  if(m.op!=='acquire')throw Error('Неизвестная операция бюджета.');
  let url;try{url=new URL(m.url);}catch{throw Error('Некорректный адрес.');}
  if(!base||!url.href.startsWith(base+'/rest/'))return {bypass:true};
  const ticket=jbpBudget.acquire(owner);if(ticket.id){try{await persistBudget();}catch(error){jbpBudget.active.delete(ticket.id);await persistBudget().catch(()=>{});throw error;}}return ticket;
}
globalThis.jbpNetworkLocal=m=>networkMessage(m,{id:chrome.runtime.id,url:chrome.runtime.getURL('src/background.js')});
