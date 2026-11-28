globalThis.JbpPersonalArchiveWorker = (() => {
 const C=JbpPersonalArchive,BACKUP='jbpPersonalWorkspaceBackup';
 const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v??null))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 async function handle(m,sender,tx){
  if(sender.id!==chrome.runtime.id||sender.url?.split(/[?#]/)[0]!==chrome.runtime.getURL('personal-workspace.html'))throw Error('Откройте архив личного пространства.');
  if(typeof m.client!=='string'||!/^[\w-]{1,80}$/.test(m.client))throw Error('Перезагрузите страницу архива.');
  const sessionKey='jbpPersonalPreview:'+m.client,all=await chrome.storage.local.get(null),base=JbpConnection.from(all.jbpReportsV1).baseUrl;
  if(!base)throw Error('Сначала настройте адрес Jira. Архив не меняет подключение.');
  if(m.op==='list'){const records=C.readRecords(all,base);return {base,accounts:[...new Set(records.map(r=>r.account))],counts:Object.fromEntries(C.kinds.map(k=>[k,records.filter(r=>r.kind===k).length])),backup:!!all[BACKUP]&&!all[BACKUP].rolledBack};}
  if(m.op==='export')return C.exportArchive(all,base,m.accounts,m.kinds,m.includeTexts);
  if(['inspect','undoInspect'].includes(m.op)){
   let rows,backupId;
   if(m.op==='inspect')rows=C.rows(C.parse(m.archive,base),all,base);
   else {const b=all[BACKUP];if(!b||b.rolledBack||b.base!==base)throw Error('Нет доступной копии для отката этой Jira.');backupId=b.id;rows=[];for(const [key,v]of Object.entries(b.keys)){const same=await hash(all[key])===v.afterHash;const parts=key.split(':'),label=decodeURIComponent(parts[2])+' · '+(parts[0]==='jbpComposer'?'Черновики и шаблоны':parts[0]==='jbpAttention'?'Очередь и напоминания':'Представления доски '+parts[3]);rows.push({id:String(rows.length),key,label,before:all[key]||null,after:C.undo(key,v.before,all[key],v.after),status:same?'rollback':'blocked',blocked:same?'':'Раздел изменён после импорта. Откат не затронет новые изменения; этот раздел недоступен.'});}}
   for(const row of rows)row.hash=await hash(all[row.key]);
   const token=crypto.randomUUID(),plan={token,base,at:Date.now(),owner:sender.documentId||null,rows,mode:m.op,backupId:backupId||null};
   if(JSON.stringify(plan).length>C.MAX*3)throw Error('Предпросмотр слишком большой. Выберите меньший архив.');
   await chrome.storage.session.set({[sessionKey]:plan});
   return {token,mode:m.op,rows:rows.map(({record,hash,...row})=>row),reminders:'Восстановленные напоминания приостановлены. Сохранённая дата будет показана в очереди.'};
  }
  if(m.op!=='apply')throw Error('Неизвестная операция архива.');
  return tx(async raw=>{
   const plan=(await chrome.storage.session.get(sessionKey))[sessionKey];
   if(!plan||plan.token!==m.token||Date.now()-plan.at>1800000||plan.owner!==(sender.documentId||null))throw Error('Предпросмотр устарел. Откройте его заново.');
   const selected=m.selected;if(!Array.isArray(selected)||!selected.length||new Set(selected.map(s=>s.id)).size!==selected.length)throw Error('Выберите записи для применения.');
   const current=await chrome.storage.local.get(null);if(JbpConnection.from(current.jbpReportsV1).baseUrl!==plan.base)throw Error('Подключение изменилось. Откройте предпросмотр заново.');
   if(current[BACKUP]?.token===plan.token||plan.mode==='undoInspect'&&(current[BACKUP]?.id!==plan.backupId||current[BACKUP]?.rolledBack))throw Error('Эта операция уже применена или копия заменена.');
   const chosen=selected.map(s=>{const r=plan.rows.find(r=>r.id===s.id);if(!r||!['new','conflict','rollback'].includes(r.status)||s.action!==(r.status==='conflict'?'replace':r.status==='rollback'?'undo':'add'))throw Error('Подтвердите действие из предпросмотра.');return r;});
   for(const r of chosen)if(await hash(current[r.key])!==r.hash)throw Error('Данные изменились после предпросмотра. Ничего не применено. Откройте предпросмотр заново.');
   const working={...current},updates={},keys={};
   for(const row of chosen){if(plan.mode==='undoInspect')working[row.key]=row.after;else C.put(working,row);updates[row.key]=working[row.key];}
   for(const [key,value]of Object.entries(updates))keys[key]={before:current[key]??null,after:value,afterHash:await hash(value)};
   const remaining=plan.mode==='undoInspect'?Object.fromEntries(Object.entries(current[BACKUP].keys).filter(([k])=>!Object.hasOwn(updates,k))):{};
   const backup=plan.mode==='undoInspect'?{...current[BACKUP],keys:remaining,rolledBack:!Object.keys(remaining).length,token:plan.token}:{id:crypto.randomUUID(),token:plan.token,base:plan.base,at:Date.now(),keys};
   if(JSON.stringify(backup).length>C.MAX*2)throw Error('Копия для отката слишком большая. Выберите меньше записей.');
   await raw.set({...updates,[BACKUP]:backup});
   await chrome.storage.session.remove(sessionKey).catch(()=>{});
   let warning='';try{await JbpAttentionWorker.reindex();await JbpAttentionWorker.schedule(plan.base);}catch{warning='Данные сохранены. Перечитайте личную очередь для восстановления локального расписания.';}
   return {count:chosen.length,warning,backupAt:backup.at};
  });
 }
 return {handle};
})();
