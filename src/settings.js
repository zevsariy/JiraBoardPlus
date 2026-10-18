globalThis.JbpSettingsMount=function(document,chrome=globalThis.chrome,window=globalThis.window,options={}){
  const B = globalThis.JbpBoard, $ = id => document.getElementById(id);
  async function send(type, prefs) { const r = await chrome.runtime.sendMessage({ type, prefs }); if (!r?.ok) throw new Error(r?.error || 'Служба расширения недоступна'); return r.data; }
  function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
  let connection,teamFields=[],teamRevision=0,teamReady=false;
  const teamLabel=f=>`${f.name} · ${f.id}`;
  const teamPicker=JbpSearchPicker($('team-field-picker'),{onSelect:f=>{$('teamField').value=f.id;},onClear:()=>{$('teamField').value='';}});
  function resolveTeam(){
    const value=$('team-field-name').value.trim();
    if(/^customfield_\d+$/.test(value))return value;
    const matches=teamFields.filter(f=>teamLabel(f)===value||f.name.toLocaleLowerCase()===value.toLocaleLowerCase());
    if(matches.length===1)return matches[0].id;
    throw Error(matches.length?'Несколько полей с таким названием: выберите поле из списка по ID.':'Выберите поле Team из списка или укажите его точное название / ID.');
  }
  async function loadTeamFields(){
    const revision=++teamRevision,previous=$('teamField').value;
    $('team-field-status').textContent='Загрузка полей Jira…';$('team-fields-retry').disabled=true;
    try{
      const fields=await connectionSend('fields');if(revision!==teamRevision)return;
      teamFields=fields.filter(f=>/^customfield_\d+$/.test(f.id)).sort((a,b)=>(b.name.toLowerCase()==='team')-(a.name.toLowerCase()==='team')||a.name.localeCompare(b.name));
      teamPicker.set(teamFields.map(f=>({id:f.id,label:teamLabel(f)})),'Введите название поля');
      $('team-field-name').disabled=false;
      if(teamFields.some(f=>f.id===previous))teamPicker.select(previous);else $('team-field-name').value=previous;
      $('team-field-suggestions').replaceChildren();
      for(const field of teamFields.filter(f=>f.name.toLowerCase()==='team')){const b=document.createElement('button');b.type='button';b.textContent=teamLabel(field);b.onclick=()=>teamPicker.select(field.id);$('team-field-suggestions').append(b);}
      $('team-field-status').textContent='Поля загружены. Варианты с названием Team предложены ниже.';
    }catch(e){if(revision===teamRevision){$('team-field-status').textContent=e.message+' Можно указать ID вручную или повторить загрузку.';$('team-field-name').disabled=false;}}
    finally{if(revision===teamRevision)$('team-fields-retry').disabled=false;}
  }
  $('team-fields-retry').onclick=loadTeamFields;
  const connectionStatus=(text,error=false)=>{const box=$('connection-status');box.hidden=!text;box.querySelector('span').textContent=text;box.className=error?'error':'';};
  $('connection-status').querySelector('button').onclick=()=>connectionStatus('');
  async function connectionSend(type,body={}){const r=await chrome.runtime.sendMessage({type,...body});if(!r?.ok)throw new Error(r?.error||'Служба недоступна');return r.data;}
  connectionSend('connectionGet').then(value=>{connection=value;$('base-url').value=value.baseUrl;$('project-key').value=value.project;$('save-connection').disabled=!!options.embedded;if(teamReady&&connection.baseUrl)loadTeamFields();}).catch(e=>connectionStatus(e.message,true));
  $('connection-form').onsubmit=async event=>{
    event.preventDefault();const submit=event.submitter;submit.disabled=true;
    try{
      const baseUrl=JbpConnection.normalize($('base-url').value),project=$('project-key').value.trim();
      if(project&&!/^(?:[a-z][a-z0-9_]*|[0-9]+)$/i.test(project))throw new Error('Укажите ключ проекта или его числовой ID.');
      const changed=!!connection?.baseUrl&&baseUrl!==connection.baseUrl;
      if(changed&&!confirm('Сменить адрес Jira? Сохранённые результаты JQL и база сравнения будут очищены. Сами запросы сохранятся.'))return;
      if(!await chrome.permissions.request({origins:[new URL(baseUrl).origin+'/*']}))throw new Error('Доступ к выбранному адресу не предоставлен. Настройки не изменены.');
      connection=await connectionSend('connectionSet',{baseUrl,project,confirmReset:!!changed});
      loadTeamFields();$('base-url').value=connection.baseUrl;$('project-key').value=connection.project;connectionStatus('Сохранено. Списки на странице метрик обновятся автоматически.');
    }catch(e){connectionStatus(e.message,true);}finally{submit.disabled=false;}
  };
  $('report').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
  $('tools').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('tools.html') });
  $('metrics').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('metrics.html') });
  $('source').onchange = () => { if ($('source').value === 'timepiece') $('integration').open = true; };
  $('settings').onsubmit = async e => {
    e.preventDefault(); const submit = e.submitter; submit.disabled = true;
    try {
      $('teamField').value=resolveTeam();
      const prefs = B.validate(Object.fromEntries(Object.keys(B.defaults).map(key => [key, typeof B.defaults[key] === 'boolean' ? $(key).checked : $(key).value])));
      await send('boardPrefsSet', prefs); status('Сохранено. Открытые доски обновляются автоматически.');
    } catch (error) { status(error.message, true); } finally { submit.disabled = false; }
  };
  send('boardPrefsGet').then(prefs => { for (const key of Object.keys(B.defaults)) { if (typeof B.defaults[key] === 'boolean') $(key).checked = prefs[key]; else $(key).value = prefs[key]; } $('team-field-name').value=prefs.teamField;teamReady=true;if(connection?.baseUrl)loadTeamFields();$('save-main').disabled=false; }).catch(e => status(e.message, true));
return ()=>{teamRevision++;};
};
if(!globalThis.jbpShellInstalled)JbpSettingsMount(document);

