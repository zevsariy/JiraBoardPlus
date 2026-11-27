globalThis.JbpSettingsMount=function(document,chrome=globalThis.chrome,window=globalThis.window,options={}){

  if(!globalThis.JbpSettingsCenter){
  const cards=[...document.querySelectorAll('.settings-card')],nav=document.querySelector('.settings-nav');
  const label=document.createElement('label');label.className='ui-setting-search';label.textContent='Найти настройку';const input=document.createElement('input');input.type='search';input.placeholder='Например: спринт, Team, заметки';input.setAttribute('aria-label','Найти настройку');label.append(input);nav?.after(label);
  const count=document.createElement('p');count.className='ui-setting-count';count.role='status';label.after(count);
  input.addEventListener('input',()=>{const q=input.value.trim().toLocaleLowerCase();for(const card of cards)card.hidden=!!q&&!card.textContent.toLocaleLowerCase().includes(q);count.textContent=q?'Разделов найдено: '+cards.filter(c=>!c.hidden).length:'';});
  nav?.addEventListener('click',e=>{if(e.target.closest('a')){input.value='';input.dispatchEvent(new Event('input'));}});
  }
   const B = globalThis.JbpBoard, $ = id => document.getElementById(id);
  const center=globalThis.JbpSettingsCenter?.(document,window,options);document.querySelector("main").jbpSettingsCenter=center;
  const disposeForms=options.embedded?globalThis.JbpFormsMount?.(document.querySelector("main")):null;
  async function send(type, prefs, patch=false) { const r = await chrome.runtime.sendMessage({ type, prefs, patch }); if (!r?.ok) throw new Error(r?.error || 'Служба расширения недоступна'); return r.data; }
  function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
  let connection,teamFields=[],teamRevision=0,teamReady=false;
  let baseline=null;
  const raw=key=>typeof B.defaults[key]==='boolean'?$(key).checked:$(key).value;
  const dirtyKeys=()=>baseline?Object.keys(B.defaults).filter(k=>String(raw(k))!==String(baseline[k])):[];
  const footer=document.querySelector('.save-bar'),dirty=document.createElement('p'),cancel=document.createElement('button');dirty.id='settings-dirty';dirty.className='settings-dirty';dirty.setAttribute('role','status');cancel.id='cancel-main';cancel.type='button';cancel.textContent='Отменить изменения раздела';footer.append(cancel,dirty);
  if(center){$('save-main').textContent='Сохранить раздел';footer.querySelector('p').textContent='Сохраняется только открытый раздел. Черновики других разделов остаются на странице.';}
  function changed(){const count=dirtyKeys().length;dirty.textContent=count?`Несохранённых параметров: ${count}.`:'Все изменения сохранены.';cancel.disabled=!baseline;center?.refresh();for(const hint of document.querySelectorAll('[data-settings-dependency]'))hint.hidden=hint.dataset.settingsDependency.split(' ').every(id=>$(id)?.checked);}
  const dependency=(id,parents,message)=>{const card=$(id);if(!card)return;const hint=document.createElement('p');hint.className='settings-dependency';hint.dataset.settingsDependency=parents;hint.textContent=message;(card.querySelector('summary')||card.querySelector('h2')).after(hint);};
  dependency('daily-settings','visuals daily','Метки daily появятся, когда включены дополнения Jira и сводка перед daily. Значения ниже сохраняются даже при выключенной функции.');
  dependency('scope-settings','visuals scope','Для отображения включите дополнения Jira и «Добавленные после старта».');
  dependency('build-settings','visuals build','Для отображения включите дополнения Jira и метку «Есть билд».');
  dependency('time-settings','visuals age','Для отображения включите дополнения Jira и «Время в статусе».');
  dependency('sprint-settings','sprintTools','Дополнительные возможности сохраняются, но работают только при включённых инструментах Sprint Report.');
  $('settings').addEventListener('input',changed);$('settings').addEventListener('change',changed);
  cancel.onclick=()=>{if(!baseline)return;for(const key of center?.keys()||Object.keys(B.defaults)){if(typeof B.defaults[key]==='boolean')$(key).checked=baseline[key];else $(key).value=baseline[key];}if((center?.keys()||Object.keys(B.defaults)).includes('teamField')){if(teamFields.some(f=>f.id===baseline.teamField))teamPicker.select(baseline.teamField);else $('team-field-name').value=baseline.teamField;}refreshControls();$('settings').querySelectorAll('[aria-invalid]').forEach(n=>{n.removeAttribute('aria-invalid');if(n.getAttribute('aria-describedby')==='settings-field-error')n.removeAttribute('aria-describedby');});document.querySelectorAll('.settings-inline-error').forEach(n=>n.remove());status('Изменения раздела отменены.');changed();};
  const connectionDirty=()=>connection&&($('base-url').value!==connection.baseUrl||$('project-key').value!==(connection.project||''));
  const beforeUnload=e=>{if(dirtyKeys().length||connectionDirty()){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  const connectionCancel=document.createElement('button');connectionCancel.type='button';connectionCancel.id='cancel-connection';connectionCancel.textContent='Отменить изменения';$('connection-form').append(connectionCancel);connectionCancel.onclick=()=>{if(connection){$('base-url').value=connection.baseUrl;$('project-key').value=connection.project||'';connectionStatus('Изменения подключения отменены.');}};
  const teamLabel=f=>`${f.name} · ${f.id}`;
  const teamPicker=JbpSearchPicker($('team-field-picker'),{onSelect:f=>{$('teamField').value=f.id;changed();},onClear:()=>{$('teamField').value='';changed();}});
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
  const refreshControls=()=>{$('nativeRefreshSeconds').disabled=$('nativeRefreshMode').value!=='auto';};
  $('nativeRefreshMode').onchange=refreshControls;
  $('source').onchange = () => { if ($('source').value === 'timepiece') $('integration').open = true; };
  $('settings').noValidate=true;
  $('settings').onsubmit = async e => {
    e.preventDefault(); const submit = e.submitter; submit.disabled = true;
    try {
      let keys=center?.keys()||Object.keys(B.defaults);if(keys.includes('teamField'))$('teamField').value=resolveTeam();if(center)keys=keys.filter(k=>dirtyKeys().includes(k));
      const fresh=await send('boardPrefsGet'),patch=Object.fromEntries(keys.map(key=>[key,raw(key)]));
      const prefs=B.validate({...fresh,...patch});for(const key of keys)patch[key]=prefs[key];
      await send('boardPrefsSet',patch,true);baseline={...baseline,...patch};for(const key of keys)if(typeof B.defaults[key]!=='boolean')$(key).value=patch[key];
      document.querySelectorAll('.settings-inline-error').forEach(n=>n.remove());$('settings').querySelectorAll('[aria-invalid]').forEach(n=>{n.removeAttribute('aria-invalid');if(n.getAttribute('aria-describedby')==='settings-field-error')n.removeAttribute('aria-describedby');});
      changed();status('Сохранено. Настройки раздела применены к открытым вкладкам.');
    } catch (error) { status(error.message, true);const rules=[[/Team|названием|списка/,'team-field-name'],[/статус|Статус/,'workStatusNames'],[/обновлен|Интервал/,'nativeRefreshSeconds'],[/Календарь/,'calendar'],[/Порог/,'staleDays'],[/рамки/,'borderWidth'],[/Поля карточек|8 названий/,'cardFields'],[/родител|типов карточек|поля связи/,'parentTypes'],[/билда/,'buildField']];const key=rules.find(([pattern])=>pattern.test(error.message))?.[1];if(key){center?.reveal(key);const field=$(key);field.setAttribute('aria-invalid','true');document.querySelectorAll('.settings-inline-error').forEach(n=>n.remove());const hint=document.createElement('p');hint.className='settings-inline-error';hint.id='settings-field-error';hint.textContent=error.message;field.closest('label')?.after(hint);if(!hint.isConnected)field.parentElement.append(hint);field.setAttribute('aria-describedby',hint.id);field.focus();}} finally { submit.disabled = false; }
  };
  send('boardPrefsGet').then(prefs => { for (const key of Object.keys(B.defaults)) { if (typeof B.defaults[key] === 'boolean') $(key).checked = prefs[key]; else $(key).value = prefs[key]; } baseline=structuredClone(prefs);refreshControls();$('team-field-name').value=prefs.teamField;teamReady=true;if(connection?.baseUrl)loadTeamFields();$('save-main').disabled=false;changed(); }).catch(e => status(e.message, true));
return ()=>{teamRevision++;center?.dispose();disposeForms?.();window.removeEventListener('beforeunload',beforeUnload);};
};
if(!globalThis.jbpShellInstalled)JbpSettingsMount(document);

