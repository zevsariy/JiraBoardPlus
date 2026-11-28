(() => {
  if (location.protocol !== 'https:' || !location.pathname.endsWith('/secure/RapidBoard.jspa')) return;
  const C = JbpBoardWorkspaceCore;
  const selector = '.ghx-issue[data-issue-key], .ghx-issue-compact[data-issue-key]';
  const pools = '#ghx-pool, #ghx-plan, #ghx-backlog';
  const owned = '[data-jbp-workspace], [data-jbp-context], [data-jbp-workspace-dialog], [data-jbp-card], [data-jbp-board], [data-jbp-tooltip]';
  const context = document.querySelector('meta[name="ajs-context-path"]')?.content || '';
  if (context && !/^\/[\w/-]*$/.test(context)) return;
  let prefs = {...JbpBoard.defaults}, state = C.empty(), filter = C.filters(), records = [], routeKey = '', board = '', account = '';
  let host, root, pool, modal, timer, loading = false, saving = false, message = '', cached = new Map(), config, cacheBoard = '', generation = 0, contextGeneration = 0;
  const style = document.createElement('style');
  style.textContent = '[data-jbp-view-hidden]{display:none!important}[data-jbp-workspace]{display:block;clear:both;margin:6px 10px}[data-jbp-context]{display:block;position:relative;z-index:3;padding:3px 7px;pointer-events:auto}';
  document.head.append(style);
  const el = (tag, text) => { const node = document.createElement(tag); if (text != null) node.textContent = text; return node; };
  const css = ':host{font:13px/1.5 "Segoe UI",sans-serif;color:var(--ui-text,#172b4d)}*{box-sizing:border-box}.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px;border:1px solid var(--ui-line,#dfe1e6);background:var(--ui-surface,#fff)}button,input,select{font:inherit}button{cursor:pointer;padding:5px 9px}input,select{max-width:100%;min-width:0}label{display:flex;flex-direction:column;gap:4px}details{flex-basis:100%}summary{cursor:pointer}.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.hint{font-size:12px;color:var(--ui-muted,#5e6c84);margin:4px 0;overflow-wrap:anywhere}.count{flex:1 1 220px}dialog{width:min(620px,calc(100vw - 24px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid var(--ui-line,#dfe1e6);padding:20px;background:var(--ui-surface,#fff);color:var(--ui-text,#172b4d)}dialog::backdrop{background:#091e4288}h2{margin-top:0;font-size:20px}dt{font-weight:600}dd{margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}.field{display:flex;align-items:center;gap:8px;margin:8px 0}.field label{flex:1;display:flex;flex-direction:row;align-items:center}a{color:var(--ui-primary,#0052cc)}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #4c9aff;outline-offset:2px}button:disabled{opacity:.6}@media(max-width:500px){.filters{grid-template-columns:1fr}.bar>label{width:100%}}';
  function shadow(node) { const r = node.attachShadow({mode:'open'}), s = el('style',css); r.append(s); for(const type of ['keydown','keyup','keypress'])r.addEventListener(type,e=>e.stopPropagation()); globalThis.JbpUI?.mount(r,true); return r; }
  function button(text, action) { const b = el('button',text); b.type = 'button'; b.addEventListener('click',action); return b; }
  function label(text, input) { const l = el('label',text); l.append(input); return l; }
  function text(node, value) { if (node && node.textContent !== value) node.textContent = value; }
  function route() {
    const u = new URL(location.href), id = u.searchParams.get('rapidView'), view = u.searchParams.get('view');
    return u.pathname === context+'/secure/RapidBoard.jspa' && /^\d{1,15}$/.test(id || '') && ['work','detail','planning','planning.nodetail',null].includes(view) ? {id,planning:view?.startsWith('planning')} : null;
  }
  function currentAccount() { return document.querySelector('meta[name="ajs-remote-user"]')?.content?.trim() || ''; }
  async function send(op, value) {
    const reply = await chrome.runtime.sendMessage({type:'boardWorkspace',op,board,account,revision:state.revision,value});
    if (!reply?.ok) throw Error(reply?.error || 'Связь с расширением недоступна. Перезагрузите вкладку.');
    return C.profile(reply.data);
  }
  function restoreCards() { document.querySelectorAll('[data-jbp-view-hidden]').forEach(n => n.removeAttribute('data-jbp-view-hidden')); }
  function close() { if (!modal) return; const m = modal; modal = null; m.dialog.close(); m.host.remove(); if (m.opener?.isConnected) m.opener.focus(); }
  function cleanup() { contextGeneration++;restoreCards(); document.querySelectorAll('[data-jbp-context]').forEach(n=>n.remove()); host?.remove(); host=root=null; close(); records=[]; }
  function dialog(title, opener) {
    close(); const h = el('div'); h.dataset.jbpWorkspaceDialog=''; const r = shadow(h), d = el('dialog');
    const heading = el('h2',title); heading.id='title'; d.setAttribute('aria-labelledby','title'); d.append(heading); r.append(d); document.body.append(h);
    d.addEventListener('cancel',e=>{e.preventDefault();close();});
    modal={host:h,dialog:d,opener}; return d;
  }
  function showDialog(d) { d.append(button('Закрыть',close)); d.showModal(); }
  function known(fields, key, convert) { return Object.hasOwn(fields,key) ? convert(fields[key]) : undefined; }
  function name(value) { return value == null ? '' : typeof value === 'object' ? value.displayName ?? value.name ?? value.value ?? value.key ?? String(value.id ?? '') : String(value); }
  function domText(card, selectors) { const n = card.querySelector(selectors); return n ? n.textContent.trim() : undefined; }
  function observeCard(card) {
    const key = card.dataset.issueKey, entry = cached.get(key), f = entry?.controlIssue?.fields || {};
    const row = {key,card,nativeVisible:!!card.getClientRects().length,at:entry?.at,error:entry?.error};
    row.summary = domText(card,'.ghx-summary') ?? known(f,'summary',name);
    row.status = domText(card,'.ghx-status') ?? known(f,'status',name); row.statusId=f.status?.id;
    const avatar = card.querySelector('.ghx-avatar img');
    row.assignee = known(f,'assignee',name) ?? avatar?.getAttribute('title') ?? avatar?.getAttribute('alt') ?? undefined;
    row.type = card.querySelector('.ghx-type')?.getAttribute('title') ?? known(f,'issuetype',name);
    row.team = known(f,prefs.teamField,name);
    // Only treat explicit field nodes / cached values as evidence; missing DOM is unknown.
    const team = [...card.querySelectorAll('[data-field-id]')].find(n=>n.getAttribute('data-field-id')===prefs.teamField);
    if (team) row.team=team.textContent.trim();
    row.parent = card.querySelector('.ghx-parent-key')?.textContent.trim() ?? known(f,'parent',v=>v?.key||'');
    const epic = card.querySelector('.ghx-epic-link');
    if (row.parent == null && epic) row.parent=epic.getAttribute('data-epic-key') || epic.textContent.trim();
    const due = known(f,'duedate',name); row.due=due === '' || /^\d{4}-\d{2}-\d{2}$/.test(due||'') ? due : undefined;
    row.updated=known(f,'updated',name);
    row.parents=entry?.parents; row.extra=entry?.cardFields;
    return row;
  }
  function contextDialog(key, opener) {
    const row=records.find(r=>r.key===key); if (!row) return;
    const d=dialog('Контекст · '+key,opener), link=el('a','Открыть задачу в Jira'); link.href=context+'/browse/'+encodeURIComponent(key);link.target='_blank';link.rel='noopener noreferrer';d.append(link);
    const list=el('dl'); for(const field of state.context.fields){list.append(el('dt',C.fields[field]),el('dd',row[field] == null ? 'Нет данных в этой вкладке' : row[field] || 'Не заполнено'));}d.append(list);
    if(row.parents)d.append(el('h3','Поля родителей'),el('p',row.parents));
    if(row.extra?.length){const extra=el('dl');for(const v of row.extra)extra.append(el('dt',v.name),el('dd',v.error||v.value||'Не заполнено'));d.append(extra);}
    d.append(el('p','Данные карточки и существующего кэша JBP. Дополнительных запросов нет.'),el('p',row.at?'Кэш получен: '+new Date(row.at).toLocaleString():'Используется только информация на доске.'));
    if(row.error)d.append(el('p','Обновление кэша не удалось: '+row.error)); showDialog(d);
  }
  function drawCards() {
    if(!pool||document.hidden)return;
    restoreCards();
    records=[...pool.querySelectorAll(selector)].filter(n=>C.keyPattern.test(n.dataset.issueKey)).map(observeCard);
    let hidden=0,unknown=0,available=0;
    for(const row of records){
      if(row.nativeVisible){available++;const result=C.matches(row,filter);if(!result.visible){row.card.setAttribute('data-jbp-view-hidden','');hidden++;}else if(result.unknown.length)unknown++;}
    }
    void renderContexts(records);
    text(root?.querySelector('.count'),`Карточек: ${available-hidden} из ${available} · скрыто личным фильтром: ${hidden}${unknown?' · оставлено с неизвестными полями: '+unknown:''}`);
    if(root){root.querySelector('[data-reset]').disabled=!Object.values(filter).some(Boolean);text(root.querySelector('[data-applied]'),'Применено: '+(Object.entries(filter).filter(([,v])=>v).map(([k,v])=>(C.fields[k]||'Поиск')+': '+({__empty:'не заполнено',overdue:'просрочено (UTC)',none:'нет срока',set:'есть срок'}[v]||v)).join(' · ')||'все доступные карточки'));}
    updateOptions();
  }
  async function renderContexts(rows) {
    const token=++contextGeneration;
    if(!state.context.enabled){document.querySelectorAll('[data-jbp-context]').forEach(n=>n.remove());return;}
    const pending=rows.filter(row=>row.nativeVisible&&row.card.querySelector('[data-jbp-context]')?.dataset.key!==row.key);
    for(let i=0;i<pending.length;i+=20){
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(token!==contextGeneration||document.hidden)return;
      for(const row of pending.slice(i,i+20)){
        if(!row.card.isConnected)continue;
        row.card.querySelector('[data-jbp-context]')?.remove();
        const control=el('div');control.dataset.jbpContext='';control.dataset.key=row.key;
        const r=control.attachShadow({mode:'open'});r.append(el('style',':host{font:12px "Segoe UI",sans-serif}button{font:inherit;cursor:pointer;border:1px solid var(--aui-border-color,#dfe1e6);border-radius:3px;padding:3px 8px;background:var(--ds-surface,#fff);color:var(--ds-link,#0052cc)}button:focus-visible{outline:2px solid #4c9aff;outline-offset:2px}'));
        const b=button('Контекст',()=>contextDialog(row.key,b));b.setAttribute('aria-label','Контекст '+row.key);
        for(const type of ['pointerdown','mousedown','dblclick','click','keydown','keyup','keypress'])control.addEventListener(type,e=>e.stopPropagation());
        r.append(b);row.card.append(control);
      }
    }
  }
  function updateOptions() {
    if(!root)return;
    for(const field of ['status','assignee','type','team','parent']){
      const list=root.querySelector('[data-filter="'+field+'"]');if(!list)continue;
      const current=list.value || filter[field],values=[...new Set([...records.map(r=>r[field]),current].filter(v=>typeof v==='string'&&v&&v!=='__empty'))].sort();
      const signature=JSON.stringify(values);if(list.dataset.signature===signature)continue;list.dataset.signature=signature;list.replaceChildren();const any=el('option','Любое');any.value='';list.append(any);
      const none=el('option');none.value='__empty';none.textContent='Не заполнено';list.append(none);
      for(const value of values){const o=el('option',value);o.value=value;list.append(o);}list.value=current;
    }
  }
  function inputs(value=filter){if(root)for(const [key,v] of Object.entries(C.filters(value))){const n=root.querySelector('[data-filter="'+key+'"]');if(n.tagName==='SELECT'&&v&&![...n.options].some(o=>o.value===v)){const option=el('option',v==='__empty'?'Не заполнено':v);option.value=v;n.append(option);}n.value=v;}}
  function viewOptions(){if(!root)return;const select=root.querySelector('[data-views]');select.replaceChildren();const all=el('option','Все доступные карточки');all.value='';select.append(all);for(const v of state.views){const o=el('option',v.name);o.value=v.id;select.append(o);}select.value=state.active;root.querySelector('[data-delete]').disabled=!state.active;}
  function status(value){message=value;text(root?.querySelector('[data-message]'),value);}
  async function save(next){
    if(saving||loading)throw Error('Дождитесь завершения сохранения или загрузки.');
    if(!account)throw Error('Jira не сообщила пользователя. Сохранение недоступно; локальный фильтр работает до закрытия вкладки.');
    saving=true;const token=generation;
    try{const result=await send('set',C.profile({...next,revision:state.revision}));if(token!==generation)return false;state=result;viewOptions();status('Сохранено для этой доски и пользователя.');return true;}
    finally{if(token===generation)saving=false;}
  }
  const action=fn=>async()=>{try{await fn();}catch(e){status(e.message);}};
  async function reload(){
    if(saving){status('Дождитесь завершения сохранения.');return;}
    const token=++generation;loading=true;saving=false;
    try{if(!account)throw Error('Пользователь Jira не определён. Сохранение недоступно.');const value=await send('get');if(token!==generation)return;state=value;filter=C.filters(state.views.find(v=>v.id===state.active)?.filters);viewOptions();inputs();status('Личные настройки загружены.');}
    catch(e){if(token===generation)status(e.message);}
    finally{if(token===generation){loading=false;drawCards();}}
  }
  function configure(opener){
    const d=dialog('Контекст карточек',opener), enabled=el('input');enabled.type='checkbox';enabled.checked=state.context.enabled;
    d.append(label('Показывать кнопку «Контекст» на карточках',enabled),el('p','Выберите поля и порядок. Недоступные значения останутся неизвестными; загрузка Jira не запускается.'));
    const order=[...state.context.fields,...Object.keys(C.fields).filter(f=>!state.context.fields.includes(f))], selected=new Set(state.context.fields), list=el('div');
    function render(){list.replaceChildren();order.forEach((key,i)=>{const row=el('div');row.className='field';const check=el('input');check.type='checkbox';check.checked=selected.has(key);check.onchange=()=>{if(check.checked)selected.add(key);else selected.delete(key);};row.append(label(C.fields[key],check));for(const [delta,title]of [[-1,'Выше'],[1,'Ниже']]){const b=button(title,()=>{[order[i],order[i+delta]]=[order[i+delta],order[i]];render();list.querySelectorAll('.field')[i+delta].querySelector('input').focus();});b.setAttribute('aria-label',title+': '+C.fields[key]);b.disabled=i+delta<0||i+delta>=order.length;row.append(b);}list.append(row);});}render();d.append(list);
    const error=el('p');error.setAttribute('role','status');d.append(error);
    d.append(button('Сохранить контекст',async()=>{try{if(await save({...state,context:{enabled:enabled.checked,fields:order.filter(f=>selected.has(f))}})){close();drawCards();}}catch(e){error.textContent=e.message;}}));showDialog(d);
  }
  function diagnosis(opener){
    const d=dialog('Почему задача не видна?',opener), input=el('input');input.maxLength=80;input.placeholder='DEMO-42';
    d.append(label('Ключ задачи',input),el('p','Проверка по данным текущей вкладки. Запросов к Jira нет.'));
    const out=el('div');out.setAttribute('role','status');const check=()=>{out.replaceChildren();try{drawCards();const key=input.value.trim().toUpperCase();for(const reason of C.diagnose(key,records,filter,config))out.append(el('p',reason));const link=el('a','Открыть задачу в Jira');link.href=context+'/browse/'+encodeURIComponent(key);link.target='_blank';link.rel='noopener noreferrer';out.append(link);if(records.some(r=>r.key===key&&r.nativeVisible&&!C.matches(r,filter).visible))out.append(button('Сбросить личный фильтр',()=>{reset();check();}));}catch(e){out.append(el('p',e.message));}};
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();check();}});d.append(button('Объяснить',check),out);showDialog(d);input.focus();
  }
  function reset(){state={...state,active:''};filter=C.filters();if(root)root.querySelector('[data-views]').value='';inputs();drawCards();status('Личный фильтр снят в этой вкладке. Сохранённые представления не удалены.');}
  function mount(){
    host=el('section');host.dataset.jbpWorkspace='';root=shadow(host);const bar=el('div');bar.className='bar';bar.append(el('strong','Личная доска'));
    const views=el('select');views.dataset.views='';views.onchange=()=>{state={...state,active:views.value};root.querySelector('[data-delete]').disabled=!views.value;const v=state.views.find(v=>v.id===views.value);filter=C.filters(v?.filters);inputs();drawCards();status('Представление применено в этой вкладке.');};bar.append(label('Представление',views));
    const resetButton=button('Сбросить фильтр',reset);resetButton.dataset.reset='';bar.append(resetButton);
    const diag=button('Почему задачи нет?',()=>diagnosis(diag)), setup=button('Контекст карточек',()=>configure(setup));bar.append(diag,setup);
    const count=el('span');count.className='count';count.setAttribute('role','status');bar.append(count);
    const details=el('details');details.append(el('summary','Фильтры и сохранение представления'));const form=el('div');form.className='filters';
    for(const key of ['text','status','assignee','type','team','parent','due']){
      const field=el(key==='text'?'input':'select');field.dataset.filter=key;
      if(key==='due')for(const [value,title]of [['','Любой'],['overdue','Просрочено (UTC)'],['none','Не заполнено'],['set','Заполнено']]){const o=el('option',title);o.value=value;field.append(o);}
      else if(key==='text'){field.maxLength=200;field.placeholder='Часть ключа или названия';}else{const any=el('option','Любое');any.value='';field.append(any);}
      form.append(label(C.fields[key]||'Поиск',field));
    }
    details.append(form,el('p','Фильтры по полям — точное совпадение, без учёта регистра. Неизвестные поля не скрывают карточку. Фильтруются только уже загруженные карточки; штатные счётчики Jira не меняются.'));
    const apply=button('Применить фильтры',action(()=>{if(loading)throw Error('Дождитесь загрузки личных настроек.');filter=C.filters(Object.fromEntries([...root.querySelectorAll('[data-filter]')].map(n=>[n.dataset.filter,n.value])));drawCards();status('Фильтр применён локально. Сохраните новое или обновите выбранное представление.');}));details.append(apply);
    const name=el('input');name.maxLength=80;details.append(label('Название нового представления',name));
    details.append(button('Сохранить новое',action(async()=>{const next={...state,views:[...state.views,{id:crypto.randomUUID(),name:name.value,filters:filter}]};next.active=next.views.at(-1).id;if(await save(next)){name.value='';viewOptions();}})));
    details.append(button('Обновить выбранное',action(async()=>{const id=views.value;if(!id)throw Error('Выберите сохранённое представление.');await save({...state,active:id,views:state.views.map(v=>v.id===id?{...v,filters:filter}:v)});} )));
    const remove=button('Удалить выбранное',action(async()=>{const id=views.value;if(!id)throw Error('Выберите сохранённое представление.');if(await save({...state,active:state.active===id?'':state.active,views:state.views.filter(v=>v.id!==id)}))reset();}));remove.dataset.delete='';details.append(remove,button('Перечитать сохранённое',reload));
    bar.append(details);const applied=el('p');applied.className='hint';applied.dataset.applied='';const msg=el('p',message);msg.className='hint';msg.dataset.message='';msg.setAttribute('role','status');root.append(bar,applied,msg);pool.before(host);viewOptions();inputs();
  }
  function refresh(){
    timer=null;const r=route(), user=currentAccount(), next=r?`${r.id}:${user}`:'';
    if(next!==routeKey){generation++;saving=false;loading=false;cleanup();if(user!==account){cached=new Map();config=undefined;}routeKey=next;state=C.empty();filter=C.filters();board=r?.id||'';account=user;if(cacheBoard!==board){cached=new Map();config=undefined;}if(r)void reload();}
    if(!r||!prefs.visuals){cleanup();return;}
    pool=document.querySelector(r.planning?'#ghx-plan, #ghx-backlog':'#ghx-pool');
    if(!pool){cleanup();return;}
    if(!host?.isConnected){mount();}else if(host.nextElementSibling!==pool)pool.before(host);
    drawCards();
  }
  function schedule(){if(!timer)timer=setTimeout(refresh,80);}
  globalThis.JbpBoardWorkspace={update(id,rows,configuration){cacheBoard=String(id);cached=rows;config=configuration;schedule();}};
  new MutationObserver(changes=>{
    if(location.href!==lastURL||currentAccount()!==account){lastURL=location.href;schedule();return;}
    if(document.hidden)return;
    if(changes.some(m=>{
      if((m.target.nodeType===3?m.target.parentElement:m.target).closest?.(owned))return false;
      if(m.type==='characterData')return !!m.target.parentElement?.closest(pools);
      if(m.type==='attributes')return m.target.matches?.(selector)||m.target.closest?.(pools)||m.target.querySelector?.(pools);
      const nodes=[...m.addedNodes,...m.removedNodes];
      if(m.target.closest?.(pools))return nodes.some(n=>n.nodeType===3||n.nodeType===1&&!n.matches(owned));
      return nodes.some(n=>n.nodeType===1&&(n.matches(pools)||n.querySelector(pools)));
    }))schedule();
  }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','data-issue-key','data-field-id','title','id','content']});
  let lastURL=location.href;
  chrome.runtime.onMessage.addListener(m=>{if(m.type==='boardPrefsChanged'){prefs=JbpBoard.validate(m.prefs);schedule();}});
  void (async()=>{try{const r=await chrome.runtime.sendMessage({type:'boardPrefsGet'});if(r?.ok)prefs=JbpBoard.validate(r.data);}catch{}refresh();})();
  addEventListener('popstate',schedule);addEventListener('focus',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
})();
