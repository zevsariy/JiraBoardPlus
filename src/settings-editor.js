/* Presentation adapter for the existing trusted extension editors; no copied storage logic. */
globalThis.JbpSettingsEditor=(()=>{
  const mode=new URLSearchParams(location.search).get('settingsEditor'),page=location.pathname.split('/').pop();
  if(!({roadmap:'roadmap.html',profile:'tools.html',rules:'control.html',performance:'control.html',data:'control.html'}[mode]===page))return false;
  document.body.dataset.settingsEditor=mode;
  const $=id=>document.getElementById(id),main=document.querySelector('main'),panel=document.createElement('div');panel.className='settings-editor-body';
  function move(id){const el=$(id);if(el){el.hidden=false;panel.append(el);}return el;}
  if(mode==='roadmap'){move('rm-connection');const config=move('rm-config');config.open=true;move('rm-message');move('rm-retry');}
  if(mode==='profile'){move('profile');move('message');}
  if(mode==='rules'){move('connection');move('panel-rules');move('status');}
  if(['performance','data'].includes(mode)){
    const health=$('panel-health'),children=[...health.children],dataIndex=children.findIndex(n=>n.tagName==='H2'&&n.textContent==='Локальные данные');
    if(mode==='performance'){move('budget-form');move('network-status');move('health-refresh');}
    else for(const node of children.slice(dataIndex)){panel.append(node);}
    move('status');$('health-refresh')?.click();
  }
  for(const node of [...main.children])node.hidden=true;main.append(panel);
  const help=document.createElement('p');help.textContent='Изменения сохраняются существующим редактором. Переключение разделов центра сохраняет открытый черновик.';panel.prepend(help);
  let dirty=false;
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отменить изменения редактора';cancel.className='settings-editor-cancel';cancel.onclick=()=>{dirty=false;document.body.dataset.editorDirty='false';location.reload();};panel.append(cancel);
  panel.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&(/^(rule-add|rm-add-level)$/.test(b.id)||/^(Удалить|↑|↓)/.test(b.textContent))){dirty=true;document.body.dataset.editorDirty='true';}});
  panel.addEventListener('input',()=>{dirty=true;document.body.dataset.editorDirty='true';});panel.addEventListener('change',()=>{dirty=true;document.body.dataset.editorDirty='true';});
  const statusNodes=[...panel.querySelectorAll('[role=status],#rm-status,#status')];
  const watcher=new MutationObserver(()=>{if(statusNodes.some(n=>/^(Настройки сохранены|Правила сохранены|Общий бюджет запросов сохранён|Настройки импортированы)/.test(n.textContent.trim()))){dirty=false;document.body.dataset.editorDirty='false';}});for(const node of statusNodes)watcher.observe(node,{childList:true,subtree:true,characterData:true});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  return true;
})();
