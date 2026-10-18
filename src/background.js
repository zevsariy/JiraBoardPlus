importScripts('connection.js', 'reports-core.js', 'board-core.js', 'sprint-core.js', 'tools-core.js', 'tools-store.js', 'notes-core.js', 'ai-core.js');
const R = globalThis.JbpReports;
const STORE = 'jbpReportsV1';
const ALARM = 'jbp-scheduler';
let chain = Promise.resolve();
const serial = fn => { const next = chain.then(fn); chain = next.catch(() => {}); return next; };
const CONTENT_FILES = ["src/ui-theme.js", "src/jira-theme.js", "src/api.js", "src/team-panel.js", "src/content.js", "src/board-core.js", "src/active-board.js", "src/sprint-core.js", "src/sprint-client.js", "src/vendor/marked.umd.js", "src/ai-markdown.js", "src/ai-ui.js", "src/ai-board.js", "src/sprint-ui.js", "src/sprint-report.js", "src/private-notes.js"];
function isJiraPage(url,base){return !!base && typeof url==='string' && url.startsWith(base+'/');}
async function broadcastPrefs(prefs,base){if(base===undefined)base=(await read()).baseUrl;if(!base)return;const tabs=await chrome.tabs.query({url:new URL(base).origin+'/*'});await Promise.allSettled(tabs.filter(t=>isJiraPage(t.url,base)).map(t=>chrome.tabs.sendMessage(t.id,{type:'boardPrefsChanged',prefs})));}
async function syncContent(){
  if(!chrome.scripting)return;
  await syncEmbedded();
  const base=JbpConnection.from(await read()).baseUrl,registered=await chrome.scripting.getRegisteredContentScripts({ids:['jbp-jira']});
  const permitted=base&&await chrome.permissions.contains({origins:[new URL(base).origin+'/*']});
  const matches=permitted?[base+'/secure/RapidBoard.jspa*',base+'/browse/*']:[];
  if(registered.length && JSON.stringify(registered[0].matches)===JSON.stringify(matches) && JSON.stringify(registered[0].js)===JSON.stringify(CONTENT_FILES))return;
  if(registered.length)await chrome.scripting.unregisterContentScripts({ids:['jbp-jira']});
  if(permitted)await chrome.scripting.registerContentScripts([{id:'jbp-jira',matches,js:CONTENT_FILES,runAt:'document_idle',persistAcrossSessions:true}]);
}
const empty = () => ({ queries: [], results: {}, jobs: {}, context: '', noticeError: '', fieldNames: {} });
async function read() { return (await chrome.storage.local.get(STORE))[STORE] || empty(); }
async function write(state) { await chrome.storage.local.set({ [STORE]: state });if(chrome.tabs?.query&&state.baseUrl){const base=state.baseUrl;chrome.tabs.query({url:new URL(base).origin+'/*'}).then(tabs=>Promise.allSettled(tabs.filter(t=>isJiraPage(t.url,base)).map(t=>chrome.tabs.sendMessage(t.id,{type:'embeddedReportChanged'})))).catch(()=>{});} }
async function request(context, path, body) {
  if(!context)throw new Error('Укажите адрес Jira в настройках или мастере.');
  const response = await fetch(`${context}/rest/api/2/${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'include', redirect: 'error', cache: 'no-store',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    let detail = '';
    try { const data = await response.json(); detail = [...(data.errorMessages || []), ...Object.values(data.errors || {})].join(' '); } catch {}
    const hints = { 400: 'Проверьте JQL и доступность его функций.', 401: 'Войдите в Jira в этом профиле Chrome.', 403: 'Нет доступа. Проверьте сессию Jira, VPN и права.', 429: 'Лимит запросов Jira. Повторите позже.' };
    throw new Error(`HTTP ${response.status}. ${hints[response.status] || ''} ${detail}`.trim());
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Вместо JSON получена страница входа. Откройте Jira и войдите.');
  return response.json();
}
async function arm() {
  const all=await chrome.storage.local.get(null),updates={};
  for(const [key,value] of Object.entries(all)){
    if(!/^jbpSprint:\d+$/.test(key))continue;
    const sources=[...new Set((value.snapshots||[]).map(s=>s.dataset?.baseUrl).filter(Boolean))];
    if(sources.length!==1)continue;
    try{const base=JbpConnection.normalize(sources[0]),target=`jbpSprint:${encodeURIComponent(base)}:${key.split(':')[1]}`;if(!all[target])updates[target]=value;}catch{}
  }
  if(Object.keys(updates).length)await chrome.storage.local.set(updates);
  await syncContent();
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  if (!await chrome.alarms.get(ALARM)) await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
}
async function kick() { await chrome.alarms.create('jbp-now', { when: Date.now() + 100 }); }
async function tick() {
  const state = await read();
  const deadline = Date.now() + 20000;
  // Each page is checkpointed. A suspended worker resumes on the next alarm.
  const ordered = [...state.queries].sort((a, b) => (state.jobs[a.id]?.startedAt ?? a.nextRun) - (state.jobs[b.id]?.startedAt ?? b.nextRun));
  for (const query of ordered) {
    if (!state.jobs[query.id] && !(query.enabled && query.nextRun <= Date.now())) continue;
    try {
      let job = state.jobs[query.id];
      if (!job) {
        job = state.jobs[query.id] = { rows: [], startAt: 0, startedAt: Date.now(), total: null, account: null };
        await write(state);
      }
      if (Date.now() - job.startedAt > 15 * 60 * 1000) throw new Error('Запуск прерван надолго. Запустите запрос заново.');
      // Validate the session again on worker resume; never combine pages from different users.
      const me = await request(JbpConnection.from(state).baseUrl, 'myself');
      const account = me.key || me.name;
      if (!account) throw new Error('Не удалось определить пользователя Jira.');
      if (job.account && job.account !== account) throw new Error('Пользователь Jira сменился во время запуска. Повторите запрос.');
      job.account = account;
      do {
        const data = R.pageCheck(await request(JbpConnection.from(state).baseUrl, 'search', {
          jql: query.jql, startAt: job.startAt, maxResults: 100, fields: query.columns
        }), job.startAt, job.total);
        if (data.warningMessages?.length) throw new Error(`Jira вернула предупреждение: ${data.warningMessages.join(' ')}`);
        job.total = data.total;
        const rows = data.issues.map(issue => R.row(issue, query.columns));
        const seen = new Set(job.rows.map(row => row.id));
        for (const row of rows) { if (seen.has(row.id)) throw new Error('Задачи повторились между страницами. Повторите запрос: выдача могла измениться.'); seen.add(row.id); }
        job.rows.push(...rows); job.startAt += rows.length;
        if (job.startAt > job.total) throw new Error('Размер выдачи изменился во время запуска. Повторите запрос.');
        if (job.startAt === job.total) {
          const previous = state.results[query.id];
          const delta = R.diff(previous?.account === account ? previous.rows : null, job.rows);
          const finishedAt = Date.now();
          state.results[query.id] = { rows: job.rows, delta, account, finishedAt, previousAt: previous?.account === account ? previous.finishedAt : null };
          delete state.jobs[query.id]; query.lastError = ''; query.lastAttempt = finishedAt;
          query.nextRun = finishedAt + query.minutes * 60000;
          await write(state);
          if (R.shouldNotify(query.notify, delta)) {
            try {
              await chrome.notifications.create(`jbp:${query.id}`, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/report.png'), title: `JQL: ${query.name}`, message: `Новых: ${delta.added.length}; вышли из выдачи: ${delta.removed.length}; изменились: ${delta.changed.length}. Открыть отчёт.` });
              state.noticeError = ''; state.noticeErrorId = '';
            } catch (error) { state.noticeError = `Уведомление не доставлено: ${error.message}`; state.noticeErrorId=crypto.randomUUID(); }
            await write(state);
          }
          break;
        }
        await write(state);
      } while (Date.now() < deadline);
    } catch (error) {
      delete state.jobs[query.id]; query.lastError = error.message; query.lastAttempt = Date.now();
      query.nextRun = Date.now() + Math.max(5, query.minutes) * 60000;
      await write(state); // Do not replace the last complete result on failure.
    }
    if (Date.now() >= deadline) break;
  }
}
async function command(message) {
  const state = await read();
  switch (message.type) {
    case 'get': return {...state,defaultTeamField:(await chrome.storage.local.get('jbpBoardPrefs')).jbpBoardPrefs?.teamField||''};
    case 'dismissNotice':
      if((state.noticeErrorId||'')===(message.errorId||'')){state.noticeError='';state.noticeErrorId='';}
      break;
    case 'testNotice':
      try{
        await chrome.notifications.create('jbp:test',{type:'basic',iconUrl:chrome.runtime.getURL('icons/report.png'),title:'Jira Board Plus · проверка',message:'Тестовое уведомление. Запросы к Jira не выполнялись.'});
        state.noticeError='';state.noticeErrorId='';
      }catch(error){state.noticeError=`Уведомление не доставлено: ${error.message}`;state.noticeErrorId=crypto.randomUUID();}
      break;
    case 'fields': {
      const fields = await request(JbpConnection.from(state).baseUrl, 'field');
      if (!Array.isArray(fields)) throw new Error('Неизвестный формат списка полей.');
      state.fieldNames = Object.fromEntries(fields.map(f => [f.id, f.name]));
      await write(state);
      return fields.map(f => ({ id: f.id, name: f.name }));
    }
    case 'context': {
      const context = String(message.context || '').replace(/\/$/, '');
      if (context && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(context)) throw new Error('Context path: пустая строка или /jira.');
      if (state.context !== context) { state.baseUrl = new URL(JbpConnection.from(state).baseUrl).origin + context; state.context = context; state.results = {}; state.jobs = {}; state.fieldNames = {}; for (const q of state.queries) { q.nextRun = Date.now(); q.lastError = ''; } }
      break;
    }
    case 'save': {
      const config = R.validate(message.query);
      const old = state.queries.find(q => q.id === message.query.id);
      if (!old && state.queries.length >= 30) throw new Error('Максимум 30 запросов.');
      if (message.query.id && !old) throw new Error('Запрос уже удалён. Обновите страницу.');
      if (old) {
        const reset = old.jql !== config.jql || JSON.stringify(old.columns) !== JSON.stringify(config.columns);
        delete state.jobs[old.id];
        if (reset) delete state.results[old.id];
        Object.assign(old, config, { nextRun: Date.now() + config.minutes * 60000, lastError: '' });
      } else state.queries.push({ ...config, id: crypto.randomUUID(), nextRun: Date.now() + config.minutes * 60000, lastError: '' });
      break;
    }
    case 'delete':
      state.queries = state.queries.filter(q => q.id !== message.id); delete state.results[message.id]; delete state.jobs[message.id]; break;
    case 'run':
      for (const q of state.queries.filter(q => !message.id || q.id === message.id)) {
        if (!state.jobs[q.id]) state.jobs[q.id] = { rows: [], startAt: 0, startedAt: Date.now(), total: null, account: null };
      }
      break;
    default: throw new Error('Неизвестная команда.');
  }
  await write(state);
  if (message.type === 'run') await kick();
  return state;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if(['embeddedOpen','embeddedConnection','embeddedStore','embeddedPage','embeddedReport','embeddedTools','embeddedPrefs','embeddedRoadmapStore'].includes(message.type)){embeddedMessage(message,sender).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true;}
  if(['aiGet','aiSave','aiAnalyze','aiCancel','aiBoardData'].includes(message.type)){aiMessage(message,sender).then(data=>reply({ok:true,data}),e=>reply({ok:false,error:e.message}));return true;}
  if(sender.id===chrome.runtime.id && message.type==='privateNotes'){
    serial(async()=>{
      const base=JbpConnection.from(await read()).baseUrl;
      if(!isJiraPage(sender.url,base))throw new Error('Личные заметки доступны только на настроенной Jira.');
      const prefs={...JbpBoard.defaults,...(await chrome.storage.local.get('jbpBoardPrefs')).jbpBoardPrefs};
      if(!prefs.visuals||!prefs.privateNotes)throw new Error('Личные заметки выключены в настройках.');
      const key=JbpNotes.storageKey(base,message.issueKey),state=(await chrome.storage.local.get(key))[key]||{revision:0,notes:[]};
      if(message.op==='list')return state;
      const next=JbpNotes.change(state,message);
      await chrome.storage.local.set({[key]:next});
      // Only an invalidation signal crosses tabs. Note contents stay in trusted storage until requested.
      const tabs=await chrome.tabs.query({url:new URL(base).origin+'/*'});
      await Promise.allSettled(tabs.filter(t=>isJiraPage(t.url,base)).map(t=>chrome.tabs.sendMessage(t.id,{type:'privateNotesChanged',issueKey:message.issueKey})));
      return next;
    }).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true;
  }

  if(sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('tools.html')&&message.type==='tools'){
    serial(()=>toolsCommand(message)).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true;
  }
  if (sender.id === chrome.runtime.id && message.type === 'sprintStore') {
    const trusted = sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL('metrics.html');
    serial(async()=>{
      const configured=JbpConnection.from(await read()).baseUrl;
      if(!trusted&&!isJiraPage(sender.url,configured))throw new Error('Недопустимая страница Jira.');
      const id=String(message.boardId);if(!/^\d+$/.test(id))throw new Error('Некорректный ID доски.');
      const base=JbpConnection.normalize(message.baseUrl||configured);
      if(!trusted&&base!==configured)throw new Error('Недопустимый сервер снимка.');
      const key=`jbpSprint:${encodeURIComponent(base)}:${id}`,state=(await chrome.storage.local.get(key))[key]||{profile:JbpSprint.defaults,snapshots:[]};
      if(message.op==='profileGet')return {...state.profile,statusRules:JbpBoard.statusRules((await chrome.storage.local.get('jbpBoardPrefs')).jbpBoardPrefs)};
      if(message.op==='snapshotList')return state.snapshots;
      if(message.op==='profileSet')state.profile=JbpSprint.profile({mode:message.profile.mode,spField:message.profile.spField,includeSubtasks:message.profile.includeSubtasks});
      else if(message.op==='snapshotAdd'){
        const d=message.dataset;
        if(!d||String(d.board?.id)!==id||!Array.isArray(d.issues)||d.issues.length>3000||!d.estimation||!d.sprint||JSON.stringify(d).length>5000000)throw new Error('Некорректный или слишком большой снимок.');
        if(state.snapshots.length>=20)throw new Error('На доске уже 20 снимков. Удалите ненужный снимок перед сохранением.');
        state.snapshots.push({id:crypto.randomUUID(),at:new Date().toISOString(),dataset:{...d,details:{}}});
      }else if(message.op==='snapshotDelete')state.snapshots=state.snapshots.filter(s=>s.id!==message.id);
      else throw new Error('Неизвестная операция.');
      await chrome.storage.local.set({[key]:state});return state;
    }).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true;
  }
  if (sender.id === chrome.runtime.id && ['boardPrefsGet', 'boardPrefsSet'].includes(message.type)) {
    const popup = ['settings.html','onboarding.html'].some(name=>sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL(name));
    const jira = message.type==='boardPrefsGet';
    if (!popup && !(jira && message.type === 'boardPrefsGet')) return;
    serial(async () => {
      if(!popup&&!isJiraPage(sender.url,JbpConnection.from(await read()).baseUrl))throw new Error('Недопустимая страница Jira.');
      if (message.type === 'boardPrefsGet') return { ...JbpBoard.defaults, ...(await chrome.storage.local.get('jbpBoardPrefs')).jbpBoardPrefs };
      const prefs = JbpBoard.validate(message.prefs);
      await chrome.storage.local.set({ jbpBoardPrefs: prefs });
      await broadcastPrefs(prefs);
      return prefs;
    }).then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message }));
    return true;
  }
  if(sender.id===chrome.runtime.id && ['connectionGet','connectionSet'].includes(message.type)) {
    const page=sender.url?.split(/[?#]/)[0];
    if(!['settings.html','onboarding.html','metrics.html','report.html','tools.html','roadmap.html'].some(name=>page===chrome.runtime.getURL(name)))return;
    if(message.type==='connectionSet'&&page!==chrome.runtime.getURL('settings.html'))return;
    serial(async()=>{
      const state=await read();
      if(message.type==='connectionGet')return JbpConnection.from(state);
      const baseUrl=JbpConnection.normalize(message.baseUrl), project=String(message.project||'').trim().toUpperCase();
      if(project&&!/^(?:[A-Z][A-Z0-9_]*|[0-9]+)$/.test(project))throw new Error('Укажите ключ проекта (например DEMO) или его числовой ID.');
      if(!await chrome.permissions.contains({origins:[new URL(baseUrl).origin+'/*']}))throw new Error('Для этого адреса не предоставлен доступ расширению.');
      if(baseUrl!==JbpConnection.from(state).baseUrl){
        if(state.queries.length&&!message.confirmReset)throw new Error('Подтвердите смену сервера: результаты JQL и база сравнения будут очищены.');
        state.results={};state.jobs={};state.fieldNames={};
        for(const q of state.queries){q.nextRun=Date.now()+q.minutes*60000;q.lastError='';}
      }
      state.baseUrl=baseUrl;state.context=new URL(baseUrl).pathname.replace(/\/$/,'');state.project=project;
      await broadcastPrefs({visuals:false},JbpConnection.from(await read()).baseUrl);
      await write(state);await syncContent();await broadcastPrefs({...JbpBoard.defaults,...(await chrome.storage.local.get('jbpBoardPrefs')).jbpBoardPrefs});return JbpConnection.from(state);
    }).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true;
  }
  if(sender.id===chrome.runtime.id && message.type==='onboardingSave' && sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL('onboarding.html')){
    serial(async()=>{
      const state=await read(),baseUrl=JbpConnection.normalize(message.baseUrl),project=String(message.project||'').trim().toUpperCase();
      if(!/^(?:[A-Z][A-Z0-9_]*|[0-9]+)$/.test(project))throw new Error('Укажите ключ проекта или его числовой ID.');
      if(!await chrome.permissions.contains({origins:[new URL(baseUrl).origin+'/*']}))throw new Error('Доступ к адресу Jira не предоставлен.');
      const stored=(await chrome.storage.local.get('jbpBoardPrefs')).jbpBoardPrefs||{};
      const allowed=['workStatusNames','doneStatusNames','doneCategory','visuals','team','privateNotes','daily','scope','age','backlog','build','sprintTools','source','timeUnit'];
      const patch=Object.fromEntries(allowed.filter(k=>Object.hasOwn(message.prefs||{},k)).map(k=>[k,message.prefs[k]]));
      const prefs=JbpBoard.validate({...stored,...patch});
      if(baseUrl!==JbpConnection.from(state).baseUrl){
        if((state.baseUrl||state.queries.length)&&!message.confirmReset)throw new Error('Подтвердите смену адреса Jira: результаты JQL будут очищены.');
        state.results={};state.jobs={};state.fieldNames={};
        for(const q of state.queries){q.nextRun=Date.now()+q.minutes*60000;q.lastError='';}
      }
      state.baseUrl=baseUrl;state.context=new URL(baseUrl).pathname.replace(/\/$/,'');state.project=project;
      await broadcastPrefs({visuals:false},JbpConnection.from(await read()).baseUrl);
      await chrome.storage.local.set({[STORE]:state,jbpBoardPrefs:prefs,jbpOnboarding:{version:1,completedAt:Date.now()},jbpOnboardingDraft:null});
      await syncContent();await broadcastPrefs(prefs);
      return true;
    }).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true;
  }
  // The board content script cannot trigger report commands or access stored results.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('report.html'))) return;
  serial(() => command(message)).then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => { if ([ALARM, 'jbp-now'].includes(alarm.name)) serial(tick).catch(console.error); });
chrome.runtime.onInstalled.addListener(details => { serial(arm).catch(console.error); if(details?.reason==='install')chrome.tabs.create({url:chrome.runtime.getURL('onboarding.html')}).catch(console.error); });
chrome.runtime.onStartup.addListener(() => { serial(async () => { await arm(); await tick(); }).catch(console.error); });
chrome.notifications.onClicked.addListener(id => { if (id.startsWith('jbp:')) { chrome.tabs.create({ url: chrome.runtime.getURL(id==='jbp:test'?'report.html':`report.html#${encodeURIComponent(id.slice(4))}`) }); chrome.notifications.clear(id); } });
serial(arm).catch(console.error);

importScripts('ai-worker.js');

async function syncEmbedded(){
 const base=JbpConnection.from(await read()).baseUrl,allowed=base&&await chrome.permissions.contains({origins:[new URL(base).origin+'/*']}),matches=allowed?[base+'/*']:[],old=await chrome.scripting.getRegisteredContentScripts({ids:['jbp-shell']});
 if(old.length&&JSON.stringify(old[0].matches)===JSON.stringify(matches))return;
 if(old.length)await chrome.scripting.unregisterContentScripts({ids:['jbp-shell']});
 if(allowed)await chrome.scripting.registerContentScripts([{id:'jbp-shell',matches,js:['src/jira-shell.js'],runAt:'document_idle',persistAcrossSessions:true}]);
}
async function embeddedMessage(message,sender){
 const connection=JbpConnection.from(await read());if(sender.id!==chrome.runtime.id||!sender.tab?.id||sender.frameId!==0||!isJiraPage(sender.url,connection.baseUrl))throw Error('Недопустимая страница Jira.');
 if(message.type==='embeddedConnection')return connection;
 if(message.type==='embeddedTools'){const cmd=message.command;if(!['rulesGet','rulesSet','metricsProfile','export','validate','import'].includes(cmd?.op))throw Error('Недопустимая операция.');if(cmd.baseUrl&&JbpConnection.normalize(cmd.baseUrl)!==connection.baseUrl)throw Error('Другой сервер Jira.');return serial(()=>toolsCommand(cmd));}
 if(message.type==='embeddedPrefs'){const prefs=JbpBoard.validate(message.prefs);await chrome.storage.local.set({jbpBoardPrefs:prefs});await broadcastPrefs(prefs);return prefs;}
 if(message.type==='embeddedRoadmapStore'){
  const prefix='jbpRoadmap:'+encodeURIComponent(connection.baseUrl)+':'+connection.project;
  const allowed=k=>typeof k==='string'&&(k===prefix||k.startsWith(prefix+':'))&&k.length<1000;
  if(message.op==='get'){if(message.keys===null){const all=await chrome.storage.local.get(null);return Object.fromEntries(Object.entries(all).filter(([k])=>allowed(k)));}const keys=Array.isArray(message.keys)?message.keys:[message.keys];if(!keys.every(k=>allowed(k)||k==='jbpBoardPrefs'))throw Error('Недопустимый раздел хранилища.');return chrome.storage.local.get(keys);}
  if(message.op==='set'){if(!message.values||typeof message.values!=='object'||Array.isArray(message.values)||!Object.keys(message.values).every(allowed)||JSON.stringify(message.values).length>25000000)throw Error('Некорректные данные роадмэпа.');await chrome.storage.local.set(message.values);return true;}
  if(message.op==='remove'&&allowed(message.key)){await chrome.storage.local.remove(message.key);return true;}throw Error('Недопустимая операция хранилища.');
 }

 if(message.type==='embeddedReport'){const cmd=message.command;if(!['get','save','delete','run','fields','dismissNotice','testNotice'].includes(cmd?.type))throw Error('Недопустимая операция отчёта.');return serial(()=>command(cmd));}
 if(message.type==='embeddedPage'){if(!['metrics.html','report.html','roadmap.html','tools.html','settings.html','help.html','onboarding.html'].includes(message.page))throw Error('Недопустимая страница.');await chrome.tabs.create({url:chrome.runtime.getURL(message.page)});return true;}
 if(message.type==='embeddedStore'){
  if(message.op==='get'&&message.key==='jbpBoardPrefs')return {jbpBoardPrefs:{...JbpBoard.defaults,...(await chrome.storage.local.get('jbpBoardPrefs')).jbpBoardPrefs}};
  const prefix='jbpDashboard:'+encodeURIComponent(connection.baseUrl)+':';if(typeof message.key!=='string'||!message.key.startsWith(prefix)||message.key.length>500)throw Error('Недопустимый раздел настроек.');
  if(message.op==='get')return chrome.storage.local.get(message.key);
  if(message.op!=='set'||!message.value||typeof message.value!=='object'||JSON.stringify(message.value).length>20000)throw Error('Некорректные настройки.');await chrome.storage.local.set({[message.key]:message.value});return true;
 }
 const section=message.section||'metrics';if(!['metrics','report','help','roadmap','tools','settings'].includes(section))throw Error('Раздел недоступен.');
 let modules=section==='help'?[]:section==='report'?[['JbpReports','src/reports-core.js'],['JbpReportsMount','src/report.js']]:[['JbpUI','src/ui-theme.js'],['JbpBoard','src/board-core.js'],['JbpSprint','src/sprint-core.js'],['JbpSprint.Client','src/sprint-client.js'],['marked','src/vendor/marked.umd.js'],['JbpMarkdown','src/ai-markdown.js'],['JbpAIUI','src/ai-ui.js'],['JbpSprint.mount','src/sprint-ui.js'],['JbpSearchPicker','src/search-picker.js'],['JbpDashboard','src/dashboard-core.js'],['JbpDashboard.load','src/dashboard-client.js'],['JbpCharts','src/dashboard-charts.js'],['JbpDashboard.mount','src/dashboard-ui.js'],['JbpMetricsMount','src/metrics.js']];
 const common=[['JbpUI','src/ui-theme.js'],['JbpBoard','src/board-core.js'],['JbpSprint','src/sprint-core.js'],['JbpSprint.Client','src/sprint-client.js'],['JbpSearchPicker','src/search-picker.js']];
 if(section==='roadmap')modules=[...common,['JbpRoadmap','src/roadmap-core.js'],['JbpRoadmap.Client','src/roadmap-client.js'],['JbpRoadmap.draw','src/roadmap-view.js'],['marked','src/vendor/marked.umd.js'],['JbpMarkdown','src/ai-markdown.js'],['JbpAIUI','src/ai-ui.js'],['cytoscape','src/vendor/cytoscape.min.js'],['JbpRoadmap.createGraph','src/roadmap-graph.js'],['JbpRoadmapMount','src/roadmap.js']];
 if(section==='tools')modules=[...common,['JbpReports','src/reports-core.js'],['JbpTools','src/tools-core.js'],['JbpTools.Client','src/tools-client.js'],['JbpToolsSelection','src/tools-selection.js'],['JbpToolsMount','src/tools.js']];
 if(section==='settings')modules=[...common,['JbpConnection','src/connection.js'],['JbpSettingsMount','src/settings.js']];
 for(const [name,file] of modules){const [r]=await chrome.scripting.executeScript({target:{tabId:sender.tab.id},func:path=>{let v=globalThis;for(const part of path.split('.'))v=v?.[part];return !!v;},args:[name]});if(!r?.result)await chrome.scripting.executeScript({target:{tabId:sender.tab.id},files:[file]});}
 const html=await (await fetch(chrome.runtime.getURL(section+'.html'))).text();const css=await Promise.all(['report','brand',...({help:['guide'],roadmap:['roadmap'],tools:['tools'],settings:['settings']}[section]||['dashboard']),'ui-tokens','ui-pages','ui-jira'].map(async n=>(await fetch(chrome.runtime.getURL('src/'+n+'.css'))).text()));return {html,css:css.join('\n')};
}
