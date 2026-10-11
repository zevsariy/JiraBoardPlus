(() => {
  const B = globalThis.JbpBoard, $ = id => document.getElementById(id);
  async function send(type, prefs) { const r = await chrome.runtime.sendMessage({ type, prefs }); if (!r?.ok) throw new Error(r?.error || 'Служба расширения недоступна'); return r.data; }
  function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
  let connection;
  const connectionStatus=(text,error=false)=>{const box=$('connection-status');box.hidden=!text;box.querySelector('span').textContent=text;box.className=error?'error':'';};
  $('connection-status').querySelector('button').onclick=()=>connectionStatus('');
  async function connectionSend(type,body={}){const r=await chrome.runtime.sendMessage({type,...body});if(!r?.ok)throw new Error(r?.error||'Служба недоступна');return r.data;}
  connectionSend('connectionGet').then(value=>{connection=value;$('base-url').value=value.baseUrl;$('project-key').value=value.project;$('save-connection').disabled=false;}).catch(e=>connectionStatus(e.message,true));
  $('connection-form').onsubmit=async event=>{
    event.preventDefault();const submit=event.submitter;submit.disabled=true;
    try{
      const baseUrl=JbpConnection.normalize($('base-url').value),project=$('project-key').value.trim();
      if(project&&!/^(?:[a-z][a-z0-9_]*|[0-9]+)$/i.test(project))throw new Error('Укажите ключ проекта или его числовой ID.');
      const changed=!!connection?.baseUrl&&baseUrl!==connection.baseUrl;
      if(changed&&!confirm('Сменить адрес Jira? Сохранённые результаты JQL и база сравнения будут очищены. Сами запросы сохранятся.'))return;
      if(!await chrome.permissions.request({origins:[new URL(baseUrl).origin+'/*']}))throw new Error('Доступ к выбранному адресу не предоставлен. Настройки не изменены.');
      connection=await connectionSend('connectionSet',{baseUrl,project,confirmReset:!!changed});
      $('base-url').value=connection.baseUrl;$('project-key').value=connection.project;connectionStatus('Сохранено. Списки на странице метрик обновятся автоматически.');
    }catch(e){connectionStatus(e.message,true);}finally{submit.disabled=false;}
  };
  $('report').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
  $('tools').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('tools.html') });
  $('metrics').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('metrics.html') });
  $('source').onchange = () => { if ($('source').value === 'timepiece') $('integration').open = true; };
  $('settings').onsubmit = async e => {
    e.preventDefault(); const submit = e.submitter; submit.disabled = true;
    try {
      const prefs = B.validate(Object.fromEntries(Object.keys(B.defaults).map(key => [key, typeof B.defaults[key] === 'boolean' ? $(key).checked : $(key).value])));
      await send('boardPrefsSet', prefs); status('Сохранено. Открытые доски обновляются автоматически.');
    } catch (error) { status(error.message, true); } finally { submit.disabled = false; }
  };
  send('boardPrefsGet').then(prefs => { for (const key of Object.keys(B.defaults)) { if (typeof B.defaults[key] === 'boolean') $(key).checked = prefs[key]; else $(key).value = prefs[key]; } $('save-main').disabled=false; }).catch(e => status(e.message, true));
})();

