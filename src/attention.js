(() => {
 const C=JbpAttention,$=id=>document.getElementById(id),names={check:'Проверить',waiting:'Жду ответа',later:'Вернуться позже',done:'Завершено'};
 let state={items:[]},base='',account='',selected=new Set(),loading=false,dirty=false,shownFilter='all';
 const node=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;};
 const date=t=>t?new Date(t).toLocaleString():'Не проверено';
 function localTime(t){if(!t)return '';const d=new Date(t);return new Date(t-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
 async function rpc(m){const r=await chrome.runtime.sendMessage({type:'attention',account,...m});if(!r?.ok)throw Error(r?.error||'Связь с расширением недоступна.');return r.data;}
 function status(t){$('status').textContent=t;}
 async function action(fn){if(loading)return;loading=true;$('items').inert=true;$('add').inert=true;$('filter').disabled=true;$('refresh').disabled=true;$('reload').disabled=true;$('account').disabled=true;try{await fn();}catch(e){status(e.message);}finally{loading=false;$('items').inert=false;$('add').inert=false;$('filter').disabled=false;$('refresh').disabled=false;$('reload').disabled=false;$('account').disabled=false;}}
 function button(parent,label,fn){const b=node('button',label,parent);b.type='button';b.onclick=()=>action(fn);return b;}
 function input(parent,label,value,type='text'){const l=node('label',label,parent),el=node(type==='textarea'?'textarea':'input',undefined,l);el.setAttribute('aria-label',label);if(type!=='textarea')el.type=type;el.value=value;el.oninput=()=>{dirty=true;};return el;}
 const due=x=>x.remindAt!==null&&x.remindAt<=Date.now()&&x.state!=='done';
 function render(savedKey,keep=false){const preserved=new Map(keep?[...$('items').querySelectorAll('article[data-dirty]')].filter(n=>n.dataset.key!==savedKey).map(n=>[n.dataset.key,n]):[]);dirty=preserved.size>0;$('items').replaceChildren();$('count').textContent='В очереди: '+state.items.length+'. Пора вернуться: '+state.items.filter(due).length+'.';
  const filter=$('filter').value;shownFilter=filter;
  for(const x of state.items){if(filter==='due'&&!due(x)||filter==='changed'&&!C.changes(x).length||Object.hasOwn(names,filter)&&x.state!==filter)continue;
   if(preserved.has(x.key)){$('items').append(preserved.get(x.key));continue;}const card=node('article',undefined,$('items'));card.dataset.key=x.key;
   const label=node('label','Выбрать '+x.key,card);label.className='selected';const check=node('input',undefined,label);check.type='checkbox';check.checked=selected.has(x.key);check.onchange=()=>check.checked?selected.add(x.key):selected.delete(x.key);
   const heading=node('h2',undefined,card),link=node('a',x.key,heading);link.href=base+'/browse/'+encodeURIComponent(x.key);link.target='_blank';link.rel='noopener';node('span',' · '+(x.latest.summary||'Название ещё не загружено'),heading);
   node('p',names[x.state]+(due(x)?' · Пора вернуться':'')+(x.remindAt!==null?' · Напоминание: '+date(x.remindAt):''),card);
   node('p','Проверка Jira: '+date(x.checkedAt)+(x.error?' · '+x.error:''),card).className='muted';
   if(x.restoredRemindAt&&x.remindAt===null)node('p','Восстановленное напоминание приостановлено: '+date(x.restoredRemindAt)+'. Назначьте новую дату для включения.',card);
   const list=node('ul',undefined,card),diff=C.changes(x);
   for(const d of diff)node('li',d.label+': '+(d.before||'пусто')+' → '+(d.after||'пусто')+' · '+date(d.at)+' · '+(d.source==='jira'?'Jira':'страница'),list);
   if(!diff.length)node('p',Object.keys(x.latest).length?'В известных полях нет отличий от просмотренного.':'Нет данных для сравнения.',card);
   const details=node('details',undefined,card);node('summary','Известные значения и свежесть',details);for(const [k,v]of Object.entries(x.latest))node('p',C.fields[k]+': '+(v||'пусто')+' · '+date(x.fieldAt?.[k]?.at)+' · '+(x.fieldAt?.[k]?.source==='jira'?'Jira':'страница'),details);
   const edit=node('div',undefined,card);edit.className='edit';const l=node('label','Состояние '+x.key,edit),s=node('select',undefined,l);s.setAttribute('aria-label','Состояние '+x.key);for(const [v,n]of Object.entries(names))node('option',n,s).value=v;s.value=x.state;s.onchange=()=>{dirty=true;};
   const when=input(edit,'Напомнить '+x.key,localTime(x.remindAt),'datetime-local');const note=input(edit,'Личная заметка '+x.key,x.note,'textarea');note.maxLength=5000;note.parentElement.className='note';
   const actions=node('div',undefined,card);actions.className='actions';
   const save=async()=>{const remindAt=when.value?new Date(when.value).getTime():null;state=await rpc({op:'edit',key:x.key,revision:x.revision,state:s.value,note:note.value,remindAt});render(x.key,true);status(state.notice||'Сохранено локально.');};
   button(actions,'Сохранить '+x.key,save);
   button(actions,'Через час '+x.key,async()=>{when.value=localTime(Date.now()+3600000);s.value='later';await save();});
   button(actions,'Завтра '+x.key,async()=>{const t=new Date();t.setDate(t.getDate()+1);t.setHours(9,0,0,0);when.value=localTime(t.getTime());s.value='later';await save();});
   button(actions,'Просмотрено '+x.key,async()=>{if(dirty)throw Error('Сначала сохраните введённые изменения.');state=await rpc({op:'seen',key:x.key,revision:x.revision});render();status('Точка сравнения обновлена.');});
   button(actions,'Удалить '+x.key,async()=>{if(!confirm('Удалить '+x.key+' из личной очереди вместе с заметкой и напоминанием?'))return;state=await rpc({op:'remove',key:x.key,revision:x.revision});selected.delete(x.key);render(x.key,true);status('Удалено только из личной очереди.');});
  }
 }
 $('items').addEventListener('input',e=>{if(e.target.type!=='checkbox'){const card=e.target.closest('article');if(card)card.dataset.dirty='true';}});
 function discard(){return !dirty||confirm('Перечитать список и отменить несохранённые изменения формы?');}
 async function load(){if(!account){state={items:[]};render();return;}state=await rpc({op:'get'});selected=new Set([...selected].filter(k=>state.items.some(x=>x.key===k)));render();status(state.notice||'Локальная очередь загружена. Запросов Jira нет.');}
 $('reload').onclick=()=>{if(discard())action(load);};$('filter').onchange=()=>{if(discard())render();else $('filter').value=shownFilter;};$('account').onchange=()=>{if(!discard()){$('account').value=account;return;}account=$('account').value;selected.clear();action(load);};
 $('add').onsubmit=e=>{e.preventDefault();action(async()=>{if(dirty)throw Error('Сначала сохраните изменения формы.');state=await rpc({op:'pin',key:$('key').value.trim().toUpperCase(),values:{}});$('key').value='';render();status('Задача закреплена локально.');});};
 $('refresh').onclick=()=>action(async()=>{if(dirty)throw Error('Сначала сохраните изменения формы.');status('Проверяю выбранные задачи в Jira…');state=await rpc({op:'refresh',keys:[...selected]});render();status(state.notice);});
 addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 action(async()=>{const data=await rpc({op:'accounts'});base=data.base;$('connection').textContent=base;const requested=new URL(location.href).searchParams.get('account'),accounts=[...new Set([...data.accounts,...(requested?[requested]:[])])];for(const a of accounts)node('option',a,$('account')).value=a;account=requested||accounts[0]||'';$('account').value=account;$('empty-account').hidden=!!account;$('add').hidden=!account;await load();});
})();
