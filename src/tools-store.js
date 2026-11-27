async function toolsCommand(message){
  const T=JbpTools,all=await chrome.storage.local.get(null),base=all[STORE]?.baseUrl||'',prefix=base?`jbpSprint:${encodeURIComponent(base)}:`:'jbpSprint:';
  if(message.op==='metricsProfile'){const id=String(message.board);if(!/^\d+$/.test(id))throw new Error('Некорректный ID доски.');const base=JbpConnection.normalize(message.baseUrl||all[STORE]?.baseUrl),key=`jbpSprint:${encodeURIComponent(base)}:${id}`;return {...(all[key]?.profile||JbpSprint.defaults),statusRules:JbpBoard.statusRules(all.jbpBoardPrefs)};}
  if(message.op==='rulesGet')return all.jbpRefinement||T.settings({types:[{name:'*',checks:{estimate:true,description:true,team:true}}]});
  if(message.op==='rulesSet'){const rules=T.settings(message.rules);await chrome.storage.local.set({jbpRefinement:rules});return rules;}
  const exportProfile=()=>T.bundle({schema:'jira-board-plus/team-profile/v1',origin:all[STORE]?.baseUrl?new URL(all[STORE].baseUrl).origin:'',context:all[STORE]?.context||'',visual:{...JbpBoard.defaults,...all.jbpBoardPrefs},refinement:all.jbpRefinement||T.settings({types:[{name:'*',checks:{estimate:true,description:true,team:true}}]}),queries:all[STORE]?.queries||[],profiles:Object.fromEntries(Object.entries(all).filter(([k])=>k.startsWith(prefix)&&/^\d+$/.test(k.slice(prefix.length))).map(([k,v])=>[k.slice(prefix.length),v.profile]))});
  if(message.op==='export')return exportProfile();
  if(message.op==='backupExport'){if(!all.jbpProfileBackup?.bundle)throw new Error('Резервной копии пока нет. Она создаётся перед импортом.');return T.bundle(all.jbpProfileBackup.bundle);}
  if(message.op==='validate')return T.bundle(message.bundle);
  if(message.op==='import'){
    const b=T.bundle(message.bundle),state=JSON.parse(JSON.stringify(all[STORE]||empty()));
    if(b.origin!==(state.baseUrl?new URL(state.baseUrl).origin:''))throw new Error('Профиль предназначен для другой Jira.');
    if((state.context||'')!==b.context)throw new Error('Context path отличается от существующих JQL-настроек. Импорт отменён.');
    let added=0;
    for(const q of b.queries){const comparable={...q,enabled:false};if(state.queries.some(old=>JSON.stringify({...R.validate(old),enabled:false})===JSON.stringify(comparable)))continue;state.queries.push({...q,id:crypto.randomUUID(),nextRun:Date.now()+q.minutes*60000,lastError:''});added++;}
    if(added&&state.queries.length>30)throw new Error('После импорта будет больше 30 JQL-запросов. Уменьшите профиль; настройки не изменены.');
    state.context=b.context;
    const update={[STORE]:state,jbpBoardPrefs:JbpBoard.validate({...all.jbpBoardPrefs,...b.visual}),jbpRefinement:b.refinement};
    for(const [id,p]of Object.entries(b.profiles))update[`${prefix}${id}`]={...(all[`${prefix}${id}`]||{snapshots:[]}),profile:p};
    update.jbpProfileBackup={createdAt:Date.now(),bundle:exportProfile()};
    await chrome.storage.local.set(update);
    let warning='';
    try{await broadcastPrefs(update.jbpBoardPrefs);}catch{warning='Настройки сохранены. Обновите открытые вкладки Jira, чтобы применить их.';}
    return {added,warning};
  }
  throw new Error('Неизвестная операция инструментов.');
}
