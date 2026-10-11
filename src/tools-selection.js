globalThis.JbpToolsSelection = ({onChange,onHistoryChange,message}) => {
 const $=id=>document.getElementById(id);let connection,board,sprint,historyBoard,config,boardsAbort,scopeAbort,revision=0,scopeRevision=0;
 const client=()=>new JbpTools.Client('',connection.baseUrl);
 function changed(){onChange();$('runRefine').disabled=!connection||(!board||!config||($('source').value==='sprint'&&!sprint)||($('source').value==='column'&&!$('refineColumn').value));}
 function scope(){
  const source=$('source').value;$('sprint-picker').hidden=source!=='sprint';$('columnLabel').hidden=source!=='column';
  $('scope-hint').textContent=source==='sprint'?'Проверяются текущие задачи выбранного спринта в фильтре этой доски. Доступны также будущие спринты.':source==='column'?'Выбрана первая рабочая колонка. При необходимости уточните её по названию; учитываются все статусы этой колонки и фильтр доски.':'Бэклог Jira без задач активных и будущих спринтов. Для Kanban используется отдельный бэклог доски.';
  changed();
 }
 const sprintPicker=JbpSearchPicker($('sprint-picker'),{onSelect(item){sprint=item;changed();},onClear(){sprint=null;changed();}});
 const boardPicker=JbpSearchPicker($('board-picker'),{onSelect:selectBoard,onClear(){board=null;clearScope();scope();}});
 const historyPicker=JbpSearchPicker($('history-board-picker'),{onSelect(item){historyBoard=item;onHistoryChange();},onClear(){historyBoard=null;onHistoryChange();}});
 function clearScope(){scopeAbort?.abort();scopeRevision++;config=null;sprint=null;sprintPicker.set([],'Сначала выберите Scrum-доску');$('refineColumn').replaceChildren();$('scope-status').textContent='';$('retry-scope').hidden=true;$('source').replaceChildren(new Option('Бэклог без спринтов','backlog'));}
 async function selectBoard(item){
  clearScope();board=item;scope();const seq=scopeRevision;scopeAbort=new AbortController();const signal=scopeAbort.signal;
  $('scope-status').textContent='Загрузка настроек доски…';
  try{
   const value=await client().get(`agile/1.0/board/${item.id}/configuration`,signal);if(seq!==scopeRevision)return;config=value;
   const type=value.type||item.type;
   if(type==='scrum')$('source').add(new Option('Конкретный спринт','sprint'),1);
   if(type==='kanban'){
    $('source').options[0].text='Бэклог Kanban';$('source').add(new Option('Первая колонка Kanban','column'),1);
    const columns=config.columnConfig?.columns||[];
    columns.forEach((c,i)=>{if(c.statuses?.length)$('refineColumn').add(new Option(c.name,String(i)));});
    const preferred=columns.findIndex(c=>c.statuses?.length&&!/^backlog$/i.test(String(c.name||'').trim()));
    if(preferred>=0)$('refineColumn').value=String(preferred);
   }
   scope();$('scope-status').textContent=`${item.name} · ${type==='kanban'?'Kanban':'Scrum'}`;
   if(type==='scrum'){
    sprintPicker.set([],'Загрузка спринтов…');
    const values=await client().pages(`agile/1.0/board/${item.id}/sprint?state=future,active,closed`,signal);if(seq!==scopeRevision)return;
    const order={future:0,active:1,closed:2},labels={future:'будущий',active:'активный',closed:'завершённый'};
    values.sort((a,b)=>(order[a.state]??3)-(order[b.state]??3)||String(b.startDate||'').localeCompare(String(a.startDate||'')));
    sprintPicker.set(values.map(s=>({...s,label:`${s.name} · ${labels[s.state]||s.state} · #${s.id}`})),values.length?'Выберите спринт или введите часть названия':'Спринтов нет');
    $('scope-status').textContent=`${item.name} · Scrum · спринтов: ${values.length}`;
   }
  }catch(e){if(seq!==scopeRevision)return;$('scope-status').textContent='Не удалось загрузить настройки или спринты доски.';$('retry-scope').hidden=false;message(e.message,true);}
 }
 $('retry-scope').onclick=()=>{if(board)selectBoard(board);};$('source').onchange=scope;$('refineColumn').onchange=changed;
 $('mode').addEventListener('change',()=>{$('spFieldLabel').hidden=$('mode').value!=='points';changed();});
 async function load(){
  boardsAbort?.abort();boardsAbort=new AbortController();const seq=++revision;board=null;historyBoard=null;clearScope();onHistoryChange();scope();
  boardPicker.set([],'Загрузка досок…');historyPicker.set([],'Загрузка досок…');$('retry-boards').hidden=true;
  try{
   const result=await chrome.runtime.sendMessage({type:'connectionGet'});if(seq!==revision)return;if(!result?.ok)throw new Error(result?.error||'Настройки недоступны');connection=result.data;
   $('connection-info').textContent=`Jira: ${connection.baseUrl} · Проект: ${connection.project||'не задан'}. Изменить: Настройки → Подключение к Jira и проект.`;
   if(!connection.baseUrl||!connection.project){boardPicker.set([],'Укажите проект в настройках расширения');historyPicker.set([],'Укажите проект в настройках расширения');$('boards-status').textContent='Проект не задан. Список досок не запрашивался.';scope();return;}
   const values=await client().boards(connection.project,boardsAbort.signal);if(seq!==revision)return;
   const items=values.sort((a,b)=>a.name.localeCompare(b.name)).map(b=>({...b,label:`${b.name} · ${b.type==='kanban'?'Kanban':'Scrum'} · #${b.id}`}));
   boardPicker.set(items,items.length?'Выберите доску или введите часть названия':'Доступных досок нет');const scrum=items.filter(b=>b.type==='scrum');historyPicker.set(scrum,scrum.length?'Выберите Scrum-доску':'Scrum-досок нет');$('boards-status').textContent=`Досок проекта: ${items.length}`;scope();
  }catch(e){if(seq!==revision)return;boardPicker.set([],'Список досок недоступен');historyPicker.set([],'Список досок недоступен');$('retry-boards').hidden=false;$('boards-status').textContent='';message(e.message,true);}
 }
 $('retry-boards').onclick=load;
 chrome.storage?.onChanged?.addListener((changes,area)=>{if(area!=='local'||!changes.jbpReportsV1)return;const next=changes.jbpReportsV1.newValue;if(!next||!connection||(next.project||'')!==connection.project||(next.baseUrl||JbpSprint.origin+(next.context||''))!==connection.baseUrl)load();});
 load();
 return {refresh:changed,get(){if(!connection)throw new Error('Настройки подключения ещё не загружены.');return {baseUrl:connection.baseUrl,board:board?String(board.id):'',source:$('source').value,sprint:sprint?.id,columnIndex:$('refineColumn').value||null};},history(){if(!connection||!historyBoard)throw new Error('Выберите Scrum-доску из списка.');return {baseUrl:connection.baseUrl,board:String(historyBoard.id)};}};
};
