async function restoreMessage(message,sender){
 if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('restore.html'))throw Error('Откройте восстановление настроек расширения.');
 const R=JbpRestore,sessionKey='jbpRestorePreview:'+String(sender.tab?.id??'page');
 const fingerprint=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value??null))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(message.op==='export')return R.exportSettings(await chrome.storage.local.get(null));
 if(message.op==='backup'){const b=(await chrome.storage.local.get('jbpRestoreBackup')).jbpRestoreBackup;if(!b)throw Error('Копии пока нет. Она появится перед первым восстановлением.');return b;}
 if(message.op==='inspect'){
  const parsed=R.parse(message.archive),all=await chrome.storage.local.get(null),base=R.connection(all.jbpReportsV1||{}).baseUrl;
  if(base&&parsed.base&&parsed.base!==base)throw Error('Архив относится к другой Jira. Восстановление отменено.');
  const rows=[];
  for(const row of parsed.rows){
   const before=R.current(row,all);let after,blocked='';
   try{after=R.current(row,{...all,[row.key]:R.merged(row,all)});}catch(e){after=row.value;blocked=e.message;}
   if(row.id==='connection'&&base&&row.value.baseUrl!==base)blocked='Смена сервера через восстановление запрещена. Настройте подключение отдельно.';
   rows.push({...row,before,after,blocked,changed:JSON.stringify(before)!==JSON.stringify(after),hash:await fingerprint(all[row.key])});
  }
  const token=crypto.randomUUID(),plan={token,base,sourceBase:parsed.base,createdAt:Date.now(),rows};
  await chrome.storage.session.set({[sessionKey]:plan});
  const needsPermission=!!parsed.base&&!await chrome.permissions.contains({origins:[new URL(parsed.base).origin+'/*']});
  return {token,base:parsed.base,needsPermission,rows:rows.map(({hash,value,...row})=>row),ignored:parsed.ignored};
 }
 if(message.op!=='apply')throw Error('Неизвестная операция восстановления.');
 return serial(()=>navigator.locks.request('jbp-control-store',()=>JbpStorage.transaction(async raw=>{
  const plan=(await chrome.storage.session.get(sessionKey))[sessionKey];
  if(!plan||message.token!==plan.token||Date.now()-plan.createdAt>30*60000)throw Error('Просмотр устарел. Загрузите файл повторно.');
  const ids=message.selected;if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!plan.rows.some(r=>r.id===id&&r.changed&&!r.blocked)))throw Error('Выберите изменённые разделы из просмотра.');
  const all=await chrome.storage.local.get(null),base=R.connection(all.jbpReportsV1||{}).baseUrl;
  if(base!==plan.base)throw Error('Подключение изменилось после просмотра. Загрузите файл повторно.');
  if(!base&&plan.sourceBase&&!ids.includes('connection'))throw Error('Для первого восстановления выберите подключение к Jira.');
  const selected=plan.rows.filter(r=>ids.includes(r.id)),updates={},working={...all};
  for(const row of selected){if(await fingerprint(all[row.key])!==row.hash)throw Error('Раздел «'+row.label+'» изменился после просмотра. Ничего не применено; загрузите файл повторно.');
   const next=R.merged(row,working);working[row.key]=next;updates[row.key]=next;
  }
  const connection=R.connection(working.jbpReportsV1||{});
  if(ids.includes('connection')&&connection.baseUrl&&!await chrome.permissions.contains({origins:[new URL(connection.baseUrl).origin+'/*']}))throw Error('Предоставьте доступ к Jira перед восстановлением подключения.');
  // One write contains both the pre-apply settings archive and the selected changes.
  // Never clear storage or replace result/snapshot/note collections.
  const backup=R.exportSettings(all);
  if(JSON.stringify(backup).length>R.MAX)throw Error('Копия настроек больше 25 МБ. Изменения не применены.');
  await raw.set({...updates,jbpRestoreBackup:backup});
  await chrome.storage.session.remove(sessionKey).catch(()=>{});
  let warning='';
  try{if(updates.jbpReportsV1){await scheduleNext(working.jbpReportsV1);await syncContent();}if(updates.jbpBoardPrefs)await broadcastPrefs(updates.jbpBoardPrefs);}catch{warning='Настройки сохранены; обновите вкладки Jira для применения.';}
  return {count:selected.length,backupAt:backup.at,warning};
 })));
}
