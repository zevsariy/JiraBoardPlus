(() => {
  const $=id=>document.getElementById(id),root=$('metrics').attachShadow({mode:'open'});
  let connection,client,board,sprint,dispose,boardsAbort,sprintsAbort,revision=0,boardRevision=0,retry,dashboardDispose;
  const params=new URLSearchParams(location.search);let initialBoard=params.get('board');
  function message(text=''){$('message').hidden=!text;$('message-text').textContent=text;}
  $('dismiss-message').onclick=()=>message();
  function clearPanel(){dispose?.();dispose=null;root.replaceChildren();}
  function clearSprint(){dashboardDispose?.();dashboardDispose=null;sprintsAbort?.abort();boardRevision++;sprint=null;clearPanel();sprintPicker.set([],'Сначала выберите доску');}
  function failure(e,action){message(e.message);$('list-status').textContent='';retry=action;$('retry-list').hidden=false;}
  const boardPicker=JbpSearchPicker($('board-picker'),{onSelect:selectBoard,onClear(){board=null;clearSprint();$('metrics-mode-label').hidden=true;$('list-status').textContent='Выберите доску из списка.';$('retry-list').hidden=true;}});
  const sprintPicker=JbpSearchPicker($('sprint-picker'),{onSelect(item){sprint=item;clearPanel();dispose=JbpSprint.mount(root,{boardId:board.id,sprintId:sprint.id,baseUrl:connection.baseUrl,autoLoad:true});},onClear(){sprint=null;clearPanel();}});
  async function selectBoard(item,keepMode=false){
    board=item;clearSprint();message();$('retry-list').hidden=true;
    $('metrics-mode-label').hidden=false;if(!keepMode)$('metrics-mode').value='auto';
    const mode=$('metrics-mode').value==='auto'?item.type:$('metrics-mode').value;
    $('sprint-picker').hidden=mode==='kanban';
    dashboardDispose=JbpDashboard.mount($('dashboard'),{client,board:item,mode,getSprints:signal=>item.type==='kanban'?Promise.resolve([]):client.sprints(item.id,signal)});
    if(mode==='kanban'||item.type==='kanban'){sprintPicker.set([],'У Kanban-доски нет спринтов');$('list-status').textContent=mode==='kanban'?'Kanban: выберите период анализа в обзоре.':'Эта доска не предоставляет спринты Jira; доступен общий обзор.';return;}

    const seq=boardRevision,configRevision=revision; sprintsAbort=new AbortController();
    sprintPicker.set([],'Загрузка спринтов…');$('list-status').textContent='Загрузка спринтов…';
    try{
      const values=await client.sprints(item.id,sprintsAbort.signal);if(seq!==boardRevision||configRevision!==revision)return;
      const labels={active:'активный',closed:'завершённый'};
      sprintPicker.set(values.map(s=>({...s,label:`${s.name} · ${labels[s.state]||s.state} · #${s.id}`})),values.length?'Выберите спринт или введите часть названия':'Активных и завершённых спринтов нет');
      $('list-status').textContent=`Спринтов: ${values.length}`;
    }catch(e){if(seq!==boardRevision||configRevision!==revision)return;sprintPicker.set([],'Не удалось загрузить спринты');failure(e,()=>selectBoard(item));}
  }
  async function loadBoards(){
    boardsAbort?.abort();boardsAbort=new AbortController();const seq=++revision;board=null;clearSprint();$('metrics-mode-label').hidden=true;message();$('retry-list').hidden=true;boardPicker.set([],'Загрузка досок…');
    if(!connection.project){boardPicker.set([],'Укажите проект в настройках расширения');$('list-status').textContent='Проект не задан. Запросы к Jira не выполнялись.';return;}
    $('list-status').textContent='Загрузка досок проекта…';
    try{
      const values=await client.boards(connection.project,boardsAbort.signal);if(seq!==revision)return;
      const sorted=values.sort((a,b)=>a.name.localeCompare(b.name));
      boardPicker.set(sorted.map(b=>({...b,label:`${b.name} · ${b.type==='kanban'?'Kanban':'Scrum'} · #${b.id}`})),values.length?'Выберите доску или введите часть названия':'В этом проекте доступных досок нет');
      $('list-status').textContent=`Досок: ${values.length}`;
      if(initialBoard){const id=initialBoard;initialBoard=null;boardPicker.select(id);}
    }catch(e){if(seq!==revision)return;boardPicker.set([],'Не удалось загрузить доски');failure(e,loadBoards);}
  }
  $('metrics-mode').onchange=()=>{if(board)selectBoard(board,true);};
  $('retry-list').onclick=()=>retry?.();
  async function settings(){
    try{const res=await chrome.runtime.sendMessage({type:'connectionGet'});if(!res?.ok)throw new Error(res?.error||'Настройки недоступны');const next=res.data;if(connection&&connection.baseUrl===next.baseUrl&&connection.project===next.project)return;
      connection=next;if(!connection.baseUrl){message('Укажите адрес Jira в настройках или мастере.');boardPicker.set([],'Сначала настройте Jira');return;}client=new JbpSprint.Client('',connection.baseUrl);$('connection-info').textContent=`Jira: ${connection.baseUrl} · Проект: ${connection.project||'не задан'}`;await loadBoards();
    }catch(e){failure(e,settings);}
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.jbpReportsV1)settings();});
  settings();
})();
