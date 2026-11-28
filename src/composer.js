(() => {
 'use strict';
 if(location.protocol!=='https:'||globalThis.__jbpComposer)return;
 globalThis.__jbpComposer=true;
 const account=()=>document.querySelector('meta[name="ajs-remote-user"]')?.content||'';
 const owner=account();if(!owner)return;
 const states=new WeakMap(),controls=new WeakMap(),attached=new Map(),selector='textarea[name="comment"],textarea#comment,textarea[name="description"],textarea#description,input[name="summary"]';
 const uuid=()=>crypto.randomUUID();
 async function rpc(m){if(account()!==owner)throw Error('Пользователь изменился. Перезагрузите страницу.');const r=await chrome.runtime.sendMessage({type:'composer',account:owner,...m});if(account()!==owner)throw Error('Пользователь изменился. Перезагрузите страницу.');if(!r?.ok)throw Error(r?.error||'Не удалось сохранить локально.');return r.data;}
 function context(el){
  const form=el.closest('form');
  if(form?.matches('#create-issue-form')||el.closest('#create-issue-dialog')||/\/CreateIssue[^/]*$/.test(location.pathname))return 'Новая задача / '+(form?.querySelector('[name="pid"]')?.value||'?')+' / '+(form?.querySelector('[name="issuetype"]')?.value||'?');
  const key=form?.querySelector('[name="key"]')?.value||new URL(location.href).searchParams.get('selectedIssue')||document.querySelector('#issuekey-val')?.textContent?.trim()||location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/)?.[1];
  return /^[A-Z][A-Z0-9_]*-\d+$/.test(key||'')?key:'Редактор / '+location.pathname;
 }
 const field=el=>['comment','description','summary'].includes(el.name)?el.name:el.id;
 const usable=el=>el?.isConnected&&!el.disabled&&!el.readOnly&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[aria-hidden="true"]');
 function node(tag,text,parent){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;}
 function button(parent,label,fn){const b=node('button',label,parent);b.type='button';b.onclick=fn;return b;}
 function state(el){let s=states.get(el);const c=context(el);if(!s||s.context!==c){s={id:uuid(),revision:0,context:c,original:el.value,text:el.value,chain:Promise.resolve()};states.set(el,s);}return s;}
 function save(el,status){const s=state(el);if(!el.value.trim()){status.textContent='Поле пустое. Последняя сохранённая копия оставлена для восстановления.';return s.chain;}s.text=el.value;status.textContent='Сохраняю локально…';
  s.chain=s.chain.catch(()=>{}).then(async()=>{
   const value=s.text;if(value===s.saved){status.textContent='Сохранено локально';return;}
   try{const data=await rpc({op:'draftPut',id:s.id,revision:s.revision,context:s.context,field:field(el),original:s.original,text:value});s.revision=data.drafts.find(x=>x.id===s.id).revision;s.saved=value;status.textContent=value===s.text?'Сохранено локально':'Сохраняю локально…';}
   catch(e){status.textContent='Не сохранено: '+e.message;throw e;}
  });s.chain.catch(()=>{});return s.chain;
 }
 function attach(el){if(account()!==owner||!usable(el))return;const previous=controls.get(el);if(previous){if(!previous.isConnected){(el.closest('label')||el).insertAdjacentElement('afterend',previous);attached.set(el,previous);}return;}state(el);
  const host=node('span');host.dataset.jbpComposerEditor=field(el);const root=host.attachShadow({mode:'open'});node('style','button{font:12px system-ui;margin:4px;padding:4px 8px}span{font:12px system-ui}',root);
  const status=node('span','Черновик появится после ввода.',root);status.setAttribute('role','status');
  button(root,'Черновики и шаблоны',()=>library(el));
  button(root,'Повторить сохранение',async()=>{try{const s=state(el);await s.chain.catch(()=>{});const data=await rpc({op:'get'}),saved=data.drafts.find(x=>x.id===s.id);s.revision=saved?.revision||0;s.saved=saved?.text;await save(el,status);}catch(e){status.textContent=e.message;}});
  (el.closest('label')||el).insertAdjacentElement('afterend',host);controls.set(el,host);attached.set(el,host);el.addEventListener('beforeinput',()=>state(el));el.addEventListener('input',()=>{if(usable(el))save(el,status);});
 }
 let opened=false,closeLibrary;
 async function library(target){
  if(opened)return;opened=true;
  const targetContext=target&&context(target);
  const host=node('div',undefined,document.body);host.dataset.jbpComposerDialog='';const root=host.attachShadow({mode:'open'});
  node('style',':host{color-scheme:light dark}dialog{font:14px system-ui;width:680px;max-width:calc(100vw - 48px);max-height:85vh;border:1px solid #888;border-radius:10px;padding:20px}button,input,textarea,select{font:inherit;margin:5px 0;padding:7px;box-sizing:border-box}button{margin-right:8px}textarea,input,select{display:block;width:100%}textarea{min-height:100px}section{border-top:1px solid #888;margin-top:15px;padding-top:10px}p{line-height:1.5}',root);
  const dialog=node('dialog',undefined,root);dialog.setAttribute('aria-label','Локальные черновики и шаблоны');
  const close=()=>{opened=false;for(const type of ['keydown','keypress','keyup'])removeEventListener(type,shield,true);dialog.close();host.remove();if(target?.isConnected)target.focus();};
  closeLibrary=close;
  const shield=e=>{if(e.composedPath().includes(host)){e.stopImmediatePropagation();if(e.type==='keydown'&&e.key==='Escape'&&!e.isComposing){e.preventDefault();close();}}};for(const type of ['keydown','keypress','keyup'])addEventListener(type,shield,true);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});button(dialog,'Закрыть',close);
  node('h2','Локальные черновики и шаблоны',dialog);
  node('p','Тексты хранятся в этом профиле браузера. Отправляйте их штатной кнопкой Jira. После отправки удалите ненужный черновик вручную. Для визуального редактора переключитесь в текстовый режим; форматирование HTML здесь не восстанавливается.',dialog);
  const status=node('p','',dialog);status.setAttribute('role','status');const body=node('div',undefined,dialog);
  async function action(fn){try{await fn();}catch(e){status.textContent=e.message;}}
  function input(parent,label,value='',tag='input'){const l=node('label',label,parent),el=node(tag,undefined,l);el.setAttribute('aria-label',label);el.value=value;return el;}
  async function preserve(el){const s=state(el);await s.chain.catch(()=>{});await rpc({op:'draftPut',id:uuid(),revision:0,context:context(el),field:field(el),original:el.value,text:el.value});}
  function assign(el,value){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  function check(el){if(!usable(el)||account()!==owner||context(el)!==targetContext||targetContext.startsWith('Редактор /'))throw Error('Откройте нужное поле в текстовом режиме и вызовите библиотеку рядом с ним.');}
  async function render(){
   const data=await rpc({op:'get'});body.replaceChildren();
   const drafts=node('section',undefined,body);node('h3','Восстановление черновика',drafts);
   const select=input(drafts,'Сохранённые копии','','select');
   node('option','Выберите черновик',select).value='';
   for(const d of [...data.drafts].sort((a,b)=>b.updatedAt-a.updatedAt)){const o=node('option',d.context+' · '+d.field+' · '+new Date(d.updatedAt).toLocaleString(),select);o.value=d.id;}
   const preview=input(drafts,'Текст черновика','','textarea');preview.readOnly=true;
   const original=input(drafts,'Текст до редактирования','','textarea');original.readOnly=true;
   const warning=node('p','',drafts);let chosen;
   select.onchange=()=>{chosen=data.drafts.find(d=>d.id===select.value);preview.value=chosen?.text||'';original.value=chosen?.original||'';warning.textContent=chosen&&target?(chosen.context!==context(target)||chosen.field!==field(target)?'Это другое поле или задача. Скопируйте текст вручную.':target.value!==chosen.original?'Текущий текст отличается от исходного. Перед заменой будет сохранена отдельная копия.':'Можно восстановить в открытое поле.'):'Откройте библиотеку рядом с полем для восстановления или скопируйте текст.';};
   button(drafts,'Восстановить в поле',()=>action(async()=>{check(target);if(!chosen||chosen.context!==context(target)||chosen.field!==field(target))throw Error('Выберите черновик этого поля и задачи.');await preserve(target);check(target);assign(target,chosen.text);status.textContent='Восстановлено в редактор. Отправка в Jira не выполнялась.';}));
   button(drafts,'Удалить выбранный черновик',()=>action(async()=>{if(!chosen)return;await rpc({op:'draftDelete',id:chosen.id,revision:chosen.revision});await render();status.textContent='Черновик удалён.';}));
   const templates=node('section',undefined,body);node('h3','Личные шаблоны задач и комментариев',templates);
   const pick=input(templates,'Шаблон','','select');node('option','Новый шаблон',pick).value='';
   for(const t of data.templates)node('option',t.name,pick).value=t.id;
   const form=target?.closest('form');const find=f=>form?.querySelector('[name="'+f+'"]');
   const name=input(templates,'Название шаблона');const summary=input(templates,'Заголовок задачи',find('summary')?.value||'');
   const description=input(templates,'Описание задачи',usable(find('description'))?find('description').value:'','textarea');
   const comment=input(templates,'Комментарий',target&&field(target)==='comment'?target.value:'','textarea');let template;
   pick.onchange=()=>{template=data.templates.find(t=>t.id===pick.value);name.value=template?.name||'';summary.value=template?.summary||'';description.value=template?.description||'';comment.value=template?.comment||'';};
   button(templates,'Сохранить шаблон',()=>action(async()=>{await rpc({op:'templatePut',id:template?.id||uuid(),revision:template?.revision||0,name:name.value,summary:summary.value,description:description.value,comment:comment.value});await render();status.textContent='Шаблон сохранён локально.';}));
   button(templates,'Удалить шаблон',()=>action(async()=>{if(!template)return;await rpc({op:'templateDelete',id:template.id,revision:template.revision});await render();status.textContent='Шаблон удалён.';}));
   button(templates,'Добавить в текущее поле',()=>action(async()=>{check(target);const value=({summary:summary.value,description:description.value,comment:comment.value})[field(target)];if(!value)throw Error('В шаблоне нет текста для этого поля.');await preserve(target);check(target);assign(target,target.value+(target.value?'\n':'')+value);status.textContent='Текст добавлен. Проверьте его перед отправкой.';}));
   button(templates,'Заполнить заголовок и описание',()=>action(async()=>{const a=find('summary'),b=find('description');check(a);check(b);if(a.value.trim()||b.value.trim())throw Error('Заголовок и описание должны быть пустыми. Для непустого поля используйте добавление текста.');await preserve(a);await preserve(b);check(a);check(b);if(a.value.trim()||b.value.trim())throw Error('Поля изменились. Повторите действие.');assign(a,summary.value);assign(b,description.value);status.textContent='Шаблон вставлен в форму. Проект и тип задачи выберите в Jira.';}));
  }
  dialog.showModal();await action(render);
 }
 const toolbar=node('div',undefined,document.body);toolbar.dataset.jbpComposer='';const root=toolbar.attachShadow({mode:'open'});node('style',':host{position:fixed;bottom:8px;left:8px;z-index:500}button{font:12px system-ui;padding:7px;border-radius:5px}',root);button(root,'Локальные черновики и шаблоны',()=>library());
 let queued=false;function scan(){queued=false;for(const [el,host]of attached)if(!el.isConnected){host.remove();attached.delete(el);}if(account()!==owner){toolbar.remove();document.querySelectorAll('[data-jbp-composer-editor]').forEach(n=>n.remove());if(opened)closeLibrary();return;}document.querySelectorAll(selector).forEach(attach);}
 const observer=new MutationObserver(records=>{if(!queued&&records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.(selector)||n.querySelector?.(selector))))){queued=true;requestAnimationFrame(scan);}});
 document.addEventListener('focusin',e=>{if(e.target.matches?.(selector))attach(e.target);});
 addEventListener('focus',scan);
 observer.observe(document.body,{childList:true,subtree:true});scan();
})();
