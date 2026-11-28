globalThis.JbpAttentionWorker = (() => {
 const C=JbpAttention,alarm='jbp-attention-due',notice='jbp-attention',busy=new Set(),keys=new Set();let scheduling=Promise.resolve(),indexing;
 async function index(){if(!indexing)indexing=chrome.storage.local.get(null).then(all=>{for(const k of Object.keys(all))if(k.startsWith('jbpAttention:'))keys.add(k);}).catch(e=>{indexing=null;throw e;});await indexing;}
 const prefix=base=>'jbpAttention:'+encodeURIComponent(base)+':';
 const empty=()=>({revision:0,items:[]});
 function schedule(base){const next=scheduling.catch(()=>{}).then(async()=>{await index();const all=await chrome.storage.local.get([...keys,'jbpReportsV1']),times=[];base=JbpConnection.from(all.jbpReportsV1).baseUrl||'';for(const [k,s]of Object.entries(all))if(k.startsWith(prefix(base))&&s)for(const x of s.items||[])if(x.state!=='done'&&x.remindAt!==null&&x.remindAt!==x.notifiedAt)times.push(x.remindAt);if(times.length)await chrome.alarms.create(alarm,{when:Math.max(Date.now()+1000,Math.min(...times))});else await chrome.alarms.clear(alarm);});scheduling=next;return next;}
 async function fire(base,tx){
  await index();
  let count;try{count=await tx(async raw=>{const all=await chrome.storage.local.get([...keys,'jbpReportsV1']),updates={};if(JbpConnection.from(all.jbpReportsV1).baseUrl!==base)return 0;let n=0;for(const [k,s]of Object.entries(all)){if(!k.startsWith(prefix(base))||!s)continue;const items=s.items.map(x=>{if(x.state==='done'||x.remindAt===null||x.remindAt>Date.now()||x.notifiedAt===x.remindAt)return x;n++;return {...x,notifiedAt:x.remindAt,revision:x.revision+1};});if(items.some((x,i)=>x!==s.items[i]))updates[k]={...s,items,revision:s.revision+1};}if(n)await raw.set(updates);return n;});}catch(error){await chrome.alarms.create(alarm,{when:Date.now()+60000});throw error;}
  // Claim delivery before displaying: a worker restart must not send a second alert.
  try{if(count)await chrome.notifications.create(notice,{type:'basic',iconUrl:chrome.runtime.getURL('icons/report.png'),title:'Jira Board Plus · Напоминание',message:'Настало время вернуться к личной очереди. Откройте её для просмотра.'});}finally{await schedule(base);}
 }
 async function refresh(m,base,storageKey,tx){
  if(!Array.isArray(m.keys)||!m.keys.length||m.keys.length>50||m.keys.some(k=>!C.validKey(k))||new Set(m.keys).size!==m.keys.length)throw Error('Выберите от 1 до 50 разных задач.');
  if(busy.has(storageKey))throw Error('Обновление уже выполняется.');busy.add(storageKey);
  try{
   const initial=(await chrome.storage.local.get(storageKey))[storageKey]||empty(),selected=initial.items.filter(x=>m.keys.includes(x.key));if(selected.length!==m.keys.length)throw Error('Список изменился. Перечитайте очередь.');
   const signal=AbortSignal.timeout(60000);
   const request=async(path,body)=>{const r=await JbpNetwork.fetch(base+'/rest/api/2/'+path,{method:body?'POST':'GET',credentials:'include',redirect:'error',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});if(!r.ok)throw Error('Jira: HTTP '+r.status+'. Сохранённые данные не заменены.');if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Jira вернула страницу входа вместо данных.');return r.json();};
   const me=await request('myself');if(![me.name,me.key,me.accountId].includes(m.account))throw Error('В Jira открыта другая учётная запись. Переключите пользователя или очередь.');
   const data=await request('search',{jql:'key in ('+m.keys.join(',')+')',fields:Object.keys(C.fields),startAt:0,maxResults:50});
   if(!Array.isArray(data.issues)||!Number.isInteger(data.total)||data.total!==data.issues.length||(data.startAt??0)!==0||new Set(data.issues.map(x=>x.key)).size!==data.issues.length||data.issues.some(x=>!m.keys.includes(x.key)))throw Error('Jira вернула неполную или некорректную выборку. Выберите меньше задач.');
   const rows=new Map(data.issues.map(x=>[x.key,C.fromIssue(x)])),now=Date.now();
   return await tx(async raw=>{
    const all=await chrome.storage.local.get(['jbpReportsV1',storageKey]);if(JbpConnection.from(all.jbpReportsV1).baseUrl!==base)throw Error('Подключение изменилось. Перечитайте очередь.');
    const state=all[storageKey]||empty();let skipped=0;
    const items=state.items.map(x=>{const start=selected.find(s=>s.key===x.key);if(!start)return x;if(start.id!==x.id||start.revision!==x.revision){skipped++;return x;}return rows.has(x.key)?{...C.observe(x,rows.get(x.key),now,'jira'),checkedAt:now,error:''}:{...x,revision:x.revision+1,checkedAt:now,error:'Не удалось проверить: задача отсутствует в ответе. Причина неизвестна.'};});
    const value={...state,items,revision:state.revision+1};await raw.set({[storageKey]:value});return {...value,notice:skipped?'Некоторые записи изменились во время загрузки и пропущены.':'Обновление завершено. Отсутствующие задачи отмечены отдельно.'};
   });
  }finally{busy.delete(storageKey);}
 }
 async function handle(m,sender,base,tx){
  const internal=sender.id===chrome.runtime.id&&sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL('attention.html');
  const page=sender.id===chrome.runtime.id&&sender.frameId===0&&sender.tab?.id&&base&&sender.url?.startsWith(base+'/');
  if(!internal&&!page)throw Error('Недопустимая страница очереди.');if(!base)throw Error('Настройте подключение Jira.');
  if(m.op==='accounts'&&internal){await index();const all=await chrome.storage.local.get([...keys]);return {base,accounts:Object.keys(all).filter(k=>k.startsWith(prefix(base))&&all[k]).map(k=>decodeURIComponent(k.slice(prefix(base).length)))};}
  const key=C.key(base,m.account);keys.add(key);
  if(m.op==='get'){const state=(await chrome.storage.local.get(key))[key]||empty();try{await schedule(base);}catch{return {...state,notice:'Не удалось установить будильник. Просроченные напоминания остаются в очереди.'};}return state;}
  if(m.op==='refresh'){if(!internal)throw Error('Откройте личную очередь.');return refresh(m,base,key,tx);}
  if(m.op==='open'){
   if(!page)throw Error('Откройте очередь со страницы Jira.');
   if(Array.isArray(m.observations)&&m.observations.length<=100)await tx(async raw=>{const s=(await chrome.storage.local.get(key))[key];if(!s)return;const items=s.items.map(x=>{const o=m.observations.find(o=>o.key===x.key);return o?C.observe(x,o.values,Date.now(),'page'):x;});await raw.set({[key]:{...s,items,revision:s.revision+1}});});
   await chrome.tabs.create({url:chrome.runtime.getURL('attention.html')+'?account='+encodeURIComponent(m.account)});return true;
  }
  if(!internal&&m.op!=='pin')throw Error('Откройте личную очередь.');
  const result=await tx(async raw=>{const old=(await chrome.storage.local.get(key))[key]||empty(),next=C.change(old,m);await raw.set({[key]:next});return next;});
  try{await schedule(base);}catch{return {...result,notice:'Запись сохранена, но будильник не установлен. Перечитайте очередь для повторной попытки.'};}return result;
 }
 return {handle,schedule,fire,alarm,notice};
})();
