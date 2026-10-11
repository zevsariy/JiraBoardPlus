(() => {
  const S = JbpSprint;
  S.mount = function(root, { boardId, sprintId, context = '', baseUrl = S.origin + context, onFilter = () => {}, autoLoad = false, features = {export:true,assignee:true,metrics:true} }) {
    let data, viewingSnapshot=false, selected = [], selectedTypes = [], abort = new AbortController(), disposed = false, loadRevision = 0;
    const client = new S.Client(context,baseUrl);
    root.innerHTML = `<style>:host{display:block;font:13px "Segoe UI",sans-serif;color:#172b4d}*{box-sizing:border-box}.panel{padding:16px;background:white;border:1px solid #dce0ef;border-radius:6px}.controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:12px 0}label{display:block;font-size:12px}input,select,button{font:inherit;padding:7px;border:1px solid #bfc6dc;border-radius:4px;background:white;color:#172b4d}button{cursor:pointer}.primary{background:#303bea;color:white;border-color:#303bea}button:disabled{opacity:.5;cursor:default}select[multiple]{min-width:220px;height:95px}p{font-size:12px;line-height:1.5;color:#626783}.error{color:#a32620}.stats{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.stat{padding:12px;background:#f2f3ff;border-radius:4px;min-width:120px}.stat b{display:block;font-size:23px;color:#242c96}.table{max-height:500px;overflow:auto}table{font:inherit;border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #e7eaf3;text-align:left;overflow-wrap:anywhere}th{background:#f4f5fb;position:sticky;top:0}a{color:#303bea}h3{margin:0;font-size:17px}h4{margin:16px 0 4px}details{margin:12px 0}summary{cursor:pointer}[hidden]{display:none!important}.check{display:flex;gap:5px;align-items:center}.muted{color:#67748b}.export-block{margin:14px 0;padding:12px;background:#f4f5ff;border:1px solid #dde0fa;border-radius:5px}.export-block h4{margin:0}.export-block .controls{margin-bottom:0}.snapshot-block{margin:12px 0;padding:10px 12px;background:#f7f8fc;border:1px solid #e6e9f2;border-radius:5px}.snapshot-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.snapshot-row>label{font-weight:600}.snapshot-row select{flex:1 1 220px;min-width:0;max-width:420px;width:100%;padding:5px 7px}.snapshot-row button{padding:5px 8px}.snapshot-menu{position:relative;margin:0}.snapshot-menu>summary{padding:5px 8px;list-style:none;border:1px solid #bfc6dc;border-radius:4px;background:white}.snapshot-menu>summary::-webkit-details-marker{display:none}.snapshot-menu>div{position:absolute;right:0;top:calc(100% + 4px);z-index:5;min-width:190px;background:white;border:1px solid #dce0ef;border-radius:5px;box-shadow:0 5px 18px #172b4d22;padding:4px}.snapshot-menu button{display:block;width:100%;text-align:left;border:0}.snapshot-menu button:hover{background:#f2f3ff}#snapshot-status{margin:6px 0 0}#snapshot-retry{padding:3px 7px;margin-top:6px}@media(max-width:560px){.snapshot-row select{max-width:none;flex-basis:100%}}</style>
    <section class="panel"><h3>Sprint Report · Board Plus</h3><section id="export-block" class="export-block" aria-label="Выгрузка для ИИ"><h4>Выгрузка для ИИ</h4><div class="controls"><label>Формат <select id="format"><option value="json">JSON для ИИ</option><option value="markdown">Markdown</option><option value="csv">CSV</option></select></label><label>Выборка <select id="range"><option value="all">Весь спринт по паспорту</option><option value="filtered">С учётом всех фильтров</option></select></label><label class="check"><input type="checkbox" id="description">Описание (JSON)</label><label class="check"><input type="checkbox" id="history">История (JSON)</label><button class="primary" id="export" disabled>Выгрузить для ИИ</button></div></section><details><summary>Паспорт метрик этой доски</summary><div class="controls"><label>Оценки <select id="mode"><option value="auto">Из настройки доски</option><option value="none">Без оценок · количество задач</option><option value="points">Story Points</option><option value="time">Original Time Estimate</option></select></label><label>ID поля SP <input id="spField" placeholder="customfield_10002"></label><label class="check"><input type="checkbox" id="includeSubtasks">Учитывать подзадачи</label><button id="profileSave">Сохранить</button></div><p>Original Time Estimate отображается в часах (секунды / 3600). SP остаются отдельной единицей. Подзадачи по умолчанию исключены, чтобы не удваивать оценки родителей.</p></details>
    <div class="controls" id="main-actions"><button id="load">Загрузить / обновить данные</button></div>
    <section class="snapshot-block" aria-label="Снимки спринтов"><div class="snapshot-row"><label for="saved">Снимки <span id="snapshot-count" class="muted"></span></label><select id="saved" aria-label="Сохранённые снимки" disabled><option value="">Загрузка снимков…</option></select><button id="restore" disabled>Открыть</button><button id="snapshot" disabled title="Сохранить полный снимок загруженных данных">+ Сохранить</button><details class="snapshot-menu" id="snapshot-menu"><summary aria-label="Действия со снимком">Ещё ▾</summary><div><button id="compare" disabled>Сравнить со снимком</button><button id="remove-snapshot" disabled>Удалить снимок</button></div></details></div><p id="snapshot-status" role="status" hidden></p><button id="snapshot-retry" hidden>Повторить загрузку списка</button></section>
    <div id="status-box" role="status" style="display:flex;align-items:start;gap:8px"><p id="status">Загрузите данные для фильтрации, метрик и экспорта.</p><button id="dismiss-status" aria-label="Закрыть сообщение" title="Закрыть" style="margin-left:auto" hidden>×</button></div>
    <div id="loaded" hidden><p id="meta"></p><div class="controls"><label>Текущий исполнитель (Ctrl/⌘ — несколько)<br><select id="assignees" multiple aria-label="Исполнители"></select></label><button id="reset">Все исполнители</button><label class="check"><input type="checkbox" id="group">Группировать по исполнителю</label></div>

    <div class="controls" id="typeControls"><label>Перцентиль спринта<select id="percentile"><option value="50">P50</option><option value="70">P70</option><option value="80">P80</option><option value="85" selected>P85</option></select></label><label>Типы задач (Ctrl/⌘ — несколько)<br><select id="types" multiple aria-label="Типы задач"></select></label><button id="resetTypes">Все типы</button><label class="check"><input type="checkbox" id="splitTypes">Метрики по каждому типу</label></div><div id="typeStats"></div><div id="stats" class="stats"></div><details id="health" hidden><summary>Риски активного спринта</summary><p id="health-summary"></p><div id="health-issues"></div></details><details><summary>Определения и качество данных</summary><p>Выполнение плана = оценки на старте завершённых первоначальных задач / оценки на старте всех первоначальных задач. При пропусках оценок процент не рассчитывается. Добавленные задачи показаны отдельно. «Не завершены» — не счётчик повторных переносов. Текущие исполнители могут отличаться от исполнителей на конец спринта. Фильтр меняет таблицы и метрики расширения; родные графики Jira сохраняют полный спринт.</p><p id="warnings"></p></details><div id="comparison"></div><div id="table"></div></div></section>`;
    globalThis.JbpUI?.mount(root);
    const $ = id => root.getElementById(id), el = (tag,text) => { const n=document.createElement(tag); if(text!=null)n.textContent=text;return n; };
    if(!features.export)$('export-block').hidden=true;
    if(globalThis.JbpAIUI)JbpAIUI.send('aiGet').then(c=>{
      if(disposed||!c.enabled||!c.sprint)return;
      const button=el('button','Анализ через ИИ');button.type='button';$('main-actions').append(button);
      button.onclick=()=>JbpAIUI.open('sprint',()=>{if(!data)throw Error('Сначала загрузите данные спринта.');return S.exportData(data,filtered(),{assigneeIds:selected,issueTypes:selectedTypes,includeSubtasks:data.profile.includeSubtasks},{description:false,history:false,percentile:Number($('percentile').value)});});
    }).catch(()=>{});

    if(!features.assignee)$('assignees').closest('.controls').hidden=true;
    if(!features.metrics){$('stats').hidden=true;$('typeStats').hidden=true;$('typeControls').hidden=true;}
    let sharedRules=JbpBoard.statusRules();
    const rulesNote=el('p');$('profileSave').closest('details').append(rulesNote);
    function showRules(){rulesNote.textContent=`Общие статусы: рабочие — ${sharedRules.workStatusNames||'не заданы'}; завершённые — ${sharedRules.doneStatusNames||'не заданы'}${sharedRules.doneCategory?' + категория Done':''}. Изменить: Настройки → Общие правила статусов.`;}
    showRules();
    async function store(op, values = {}) { const r=await chrome.runtime.sendMessage({ type:'sprintStore',op,boardId:String(boardId),baseUrl,...values }); if(!r?.ok)throw new Error(r?.error||'Хранилище недоступно');return r.data; }
    const status = (text,error=false) => { $('status-box').hidden=false;$('status').textContent=text;$('status').className=error?'error':'';$('dismiss-status').hidden=!error; };
    $('dismiss-status').onclick=()=>{$('status-box').hidden=true;};
    const safe = fn => async () => { try { await fn(); } catch(e){if(!disposed)status(e.message,true);} };
    function getProfile(){return S.profile({mode:$('mode').value,spField:$('spField').value.trim(),includeSubtasks:$('includeSubtasks').checked,statusRules:sharedRules});}
    function filtered(){return S.selection(data,selected,data.profile.includeSubtasks,selectedTypes);}
    function table(rows,parent) {
      const wrap=el('div');wrap.className='table';const t=el('table'),head=el('thead'),tr=el('tr');
      for(const title of ['Задача','Название','Тип','Категория','Текущий исполнитель','После старта',`Старт, ${data.estimation.unit}`,`Конец/сейчас, ${data.estimation.unit}`,`Текущая, ${data.estimation.unit}`])tr.append(el('th',title));
      head.append(tr);t.append(head);const body=el('tbody');
      for(const r of rows){const row=el('tr'),key=el('td'),a=el('a',r.key);a.href=`${data.baseUrl || baseUrl}/browse/${r.key}`;a.target='_blank';a.rel='noopener noreferrer';key.append(a);row.append(key);for(const v of [r.summary,r.issuetype || 'Неизвестный тип',S.labels[r.category],r.assignee,r.added?'Да':'Нет',r.startEstimate,r.endEstimate,r.currentEstimate])row.append(el('td',v==null?'—':typeof v==='number'?Number(v.toFixed(2)):v));body.append(row);}
      t.append(body);wrap.append(t);parent.append(wrap);
    }
    function render(){
      $('comparison').replaceChildren();
      $('export').disabled=false;
      $('loaded').hidden=false;snapshotControls();const rows=filtered(),m=S.metrics(rows,Number($('percentile').value));
      $('meta').textContent=`${data.sprint.name} · ${data.estimation.name} (${data.estimation.unit}) · ${data.sprint.state==='closed'?'завершён':'активен'} · данные ${new Date(data.loadedAt).toLocaleString()} · ${rows.length} из ${data.issues.length} задач`;
      $('warnings').textContent=data.warnings.join('\n');$('stats').replaceChildren();
      $('health').hidden=viewingSnapshot||data.sprint.state!=='active'||!features.metrics||features.health===false;
      if(!$('health').hidden){
        const unfinished=rows.filter(r=>r.category==='unfinished'),risk=unfinished.filter(r=>!r.assigneeId||r.flow?.ageHours>=168);
        const end=Date.parse(data.sprint.endDate),days=Number.isFinite(end)?Math.ceil((end-Date.now())/86400000):null;
        $('health-summary').textContent=`До планового окончания: ${days==null?'дата неизвестна':days+' дн.'}. Не завершены: ${unfinished.length}; добавлены после старта: ${rows.filter(r=>r.added).length}. Ниже — незавершённые без исполнителя или с текущим статусом не менее 7 календарных дней. Возраст неизвестен у ${unfinished.filter(r=>r.flow?.ageHours==null).length} задач.`;
        $('health-issues').replaceChildren();const healthTable=el('table'),head=el('tr');for(const h of ['Задача','Название','Статус','В статусе, ч','Причина внимания'])head.append(el('th',h));healthTable.append(head);
        for(const r of risk){const tr=el('tr'),cell=el('td'),a=el('a',r.key);a.href=`${data.baseUrl||baseUrl}/browse/${r.key}`;a.target='_blank';a.rel='noopener noreferrer';cell.append(a);tr.append(cell);for(const value of [r.summary,r.status,r.flow?.ageHours==null?'—':Math.round(r.flow.ageHours),[!r.assigneeId?'Нет исполнителя':'',r.flow?.ageHours>=168?'≥ 7 дней в статусе':''].filter(Boolean).join('; ')])tr.append(el('td',value));healthTable.append(tr);}$('health-issues').append(healthTable);
      }

      for(const [name,value] of [['Выполнение плана'+(data.estimation.unit==='count'?' · по задачам':''),data.estimation.unit==='count'?(m.initial?`${(100*rows.filter(r=>!r.added&&r.category==='completed').length/m.initial).toFixed(1)}%`:'—'):m.planCompletionPercent==null?'—':`${m.planCompletionPercent.toFixed(1)}%`],['Первоначально',m.initial],['Завершены',m.completed],['Добавлены',m.added],['Удалены',m.removed],['Не завершены',m.unfinished],['Без оценки на старте',m.planned.missing]]){if(data.estimation.unit==='count'&&name==='Без оценки на старте')continue;const card=el('div');card.className='stat';card.append(el('b',value),el('span',name));$('stats').append(card);}
      for(const [name,value]of [[`Cycle time · медиана, ч (n=${m.cycle.n})`,m.cycle.medianHours],[`Cycle time · P${m.cycle.percentile}, ч`,m.cycle.percentileHours],[`Выходы из Done · история ${m.flowKnown}/${m.total}`,m.flowKnown?m.reopened:null]]){const card=el('div');card.className='stat';card.append(el('b',value==null?'—':Number(value.toFixed(1))),el('span',name));$('stats').append(card);}
      for(const [name,total]of (data.estimation.unit==='count'?[]:[['План на старте',m.planned],['Выполнено из плана',m.delivered],['Оценка на конец/сейчас',m.end]])){const card=el('div');card.className='stat';card.append(el('b',`${Number(total.value.toFixed(2))}${total.complete?'':' + ?'} ${data.estimation.unit}`),el('span',`${name}${total.missing?` · без данных: ${total.missing}`:''}`));$('stats').append(card);}
      $('typeStats').replaceChildren();
      if($('splitTypes').checked){
        const t=el('table'),head=el('tr');
        for(const name of ['Тип','Всего','Завершены','Добавлены','Не завершены',`План, ${data.estimation.unit}`,'Выполнение плана','Cycle time · медиана, ч'])head.append(el('th',name));
        t.append(head);
        for(const type of [...new Set(rows.map(r=>r.issuetype||'Неизвестный тип'))].sort()){
          const m=S.metrics(rows.filter(r=>(r.issuetype||'Неизвестный тип')===type)),tr=el('tr');
          for(const value of [type,m.total,m.completed,m.added,m.unfinished,`${Number(m.planned.value.toFixed(2))}${m.planned.complete?'':' + ?'}`,m.planCompletionPercent==null?'—':`${m.planCompletionPercent.toFixed(1)}%`,m.cycle.medianHours==null?'—':`${m.cycle.medianHours.toFixed(1)} (n=${m.cycle.n})`])tr.append(el('td',value));
          t.append(tr);
        }
        const wrap=el('div');wrap.className='table';wrap.append(t);$('typeStats').append(wrap);
      }
      $('table').replaceChildren();
      if($('group').checked){for(const id of [...new Set(rows.map(r=>r.assigneeId))]){const group=rows.filter(r=>r.assigneeId===id);$('table').append(el('h4',`${group[0].assignee} · ${group.length}`));table(group,$('table'));}}else table(rows,$('table'));
      const aging=features.metrics?rows.filter(r=>r.category==='unfinished'&&r.flow).sort((a,b)=>b.flow.ageHours-a.flow.ageHours):[];
      if(aging.length){$('table').append(el('h4','Возраст незавершённых задач в текущем статусе'));for(const r of aging.slice(0,15)){const p=el('p'),a=el('a',r.key);a.href=`${data.baseUrl || baseUrl}/browse/${r.key}`;a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode(` · ${r.flow.statusAtCutoff}: ${r.flow.ageHours.toFixed(1)} ч`));$('table').append(p);}}
      if(aging.length){$('table').append(el('h4','Очереди по статусам на дату среза'));for(const id of new Set(aging.map(r=>r.flow.statusIdAtCutoff))){const group=aging.filter(r=>r.flow.statusIdAtCutoff===id);$('table').append(el('p',`${group[0].flow.statusAtCutoff}: ${group.length} задач · средний возраст ${(group.reduce((sum,r)=>sum+r.flow.ageHours,0)/group.length).toFixed(1)} ч · ${group.map(r=>r.key).join(', ')}`));}}
      $('table').append(el('p',`Время: календарное 24×7 по полной истории Jira. Cycle time — от первого входа в рабочие статусы (${data.profile.statusRules?.workStatusNames||'исторические настройки снимка'}) до последнего входа в Done (${data.profile.statusRules?.doneStatusNames||'исторические настройки снимка'}${data.profile.statusRules?.doneCategory?' + категория Done':''}), только для завершённых задач. P85: ближайший ранг. Для закрытого спринта возраст рассчитан на дату завершения; это не расчёт Timepiece.`));
      onFilter(selected.length||selectedTypes.length?new Set(rows.map(r=>r.key)):null);
    }
    function use(dataset,snapshot=false){viewingSnapshot=snapshot;data=dataset;selected=[];selectedTypes=[];$('types').replaceChildren();for(const name of [...new Set(data.issues.map(r=>r.issuetype||'Неизвестный тип'))].sort())$('types').add(new Option(name,name));$('assignees').replaceChildren();for(const [id,name] of new Map(data.issues.map(r=>[r.assigneeId,r.assignee])))$('assignees').add(new Option(name,id));$('comparison').replaceChildren();render();}
    $('profileSave').onclick=safe(async()=>{await store('profileSet',{profile:getProfile()});status('Паспорт сохранён. Обновите данные, чтобы применить его к расчётам.');});
    async function loadData(){
      const revision=++loadRevision;
      $('load').disabled=true;status('Загрузка отчёта и истории задач…');abort.abort();abort=new AbortController();
      try{await ensureProfile();const current=await store('profileGet');if(disposed||revision!==loadRevision)return;sharedRules=JbpBoard.statusRules(current.statusRules);showRules();const loaded=await client.load(boardId,sprintId,getProfile(),abort.signal);if(!disposed&&revision===loadRevision){use(loaded);$('load').textContent='Обновить данные';status('Данные загружены.');}}catch(e){if(!disposed&&revision===loadRevision)throw e;}finally{if(!disposed&&revision===loadRevision)$('load').disabled=false;}
    }
    $('load').onclick=safe(loadData);
    $('types').onchange=()=>{selectedTypes=[...$('types').selectedOptions].map(o=>o.value);render();};
    $('resetTypes').onclick=()=>{selectedTypes=[];[...$('types').options].forEach(o=>o.selected=false);render();};
    $('splitTypes').onchange=render;$('percentile').onchange=render;
    $('assignees').onchange=()=>{selected=[...$('assignees').selectedOptions].map(o=>o.value);render();};
    $('reset').onclick=()=>{selected=[];[...$('assignees').options].forEach(o=>o.selected=false);render();};$('group').onchange=render;
    $('export').onclick=safe(async()=>{const ids=$('range').value==='filtered'?selected:[],types=$('range').value==='filtered'?selectedTypes:[],rows=S.selection(data,ids,data.profile.includeSubtasks,types);const output=S.exportData(data,rows,{issueTypes:types,issueTypeBasis:'current',assigneeIds:ids,assigneeBasis:'current',includeSubtasks:data.profile.includeSubtasks},{description:$('description').checked,history:$('history').checked,percentile:Number($('percentile').value)});S.download(output,$('format').value);status('Файл сохранён локально; данные никуда не отправлены.');});
    let saved=[],snapshotsReady=false,snapshotBusy=false,listRevision=0;
    function snapshotControls(){
      const hasSelection=snapshotsReady&&saved.some(s=>s.id===$('saved').value);
      $('saved').disabled=!snapshotsReady||snapshotBusy||!saved.length;
      $('snapshot').disabled=!data||snapshotBusy;
      $('restore').disabled=!hasSelection||snapshotBusy;
      $('compare').disabled=!hasSelection||!data||snapshotBusy;
      $('remove-snapshot').disabled=!hasSelection||snapshotBusy;
    }
    async function refreshSnapshots(preferred=$('saved').value){
      const revision=++listRevision;
      try{
        const list=await store('snapshotList');if(disposed||revision!==listRevision)return;
        saved=list;snapshotsReady=true;$('saved').replaceChildren(new Option(saved.length?'Выберите снимок':'Снимков пока нет',''));
        for(const snap of saved)$('saved').add(new Option(`${snap.dataset.sprint.name} · ${new Date(snap.at).toLocaleString()}`,snap.id));
        if(saved.some(s=>s.id===preferred))$('saved').value=preferred;
        $('snapshot-count').textContent=`(${saved.length})`;$('snapshot-status').hidden=true;$('snapshot-retry').hidden=true;snapshotControls();
      }catch(e){if(disposed||revision!==listRevision)return;snapshotsReady=false;$('snapshot-status').textContent=`Не удалось загрузить снимки: ${e.message}`;$('snapshot-status').className='error';$('snapshot-status').hidden=false;$('snapshot-retry').hidden=false;if(!saved.length)$('saved').replaceChildren(new Option('Список недоступен',''));snapshotControls();}
    }
    $('snapshot-retry').onclick=()=>refreshSnapshots();
    $('saved').onchange=()=>{$('snapshot-menu').open=false;snapshotControls();};
    $('snapshot').onclick=safe(async()=>{if(snapshotBusy||!data)return;snapshotBusy=true;snapshotControls();try{const result=await store('snapshotAdd',{dataset:{...data,details:{}}});if(disposed)return;await refreshSnapshots(result.snapshots?.at(-1)?.id||$('saved').value);if(!disposed)status('Снимок сохранён локально, без описаний и полной истории.');}finally{snapshotBusy=false;if(!disposed)snapshotControls();}});
    $('restore').onclick=safe(async()=>{const snap=saved.find(s=>s.id===$('saved').value);if(!snap)throw new Error('Выберите снимок.');use(snap.dataset,true);status('Открыт сохранённый снимок с правилами на момент сохранения. Для текущих правил нажмите «Обновить данные». Описания и полная история в нём не хранятся.');});
    $('remove-snapshot').onclick=safe(async()=>{const id=$('saved').value;if(!id||snapshotBusy)return;if(!confirm('Удалить выбранный локальный снимок?'))return;$('snapshot-menu').open=false;snapshotBusy=true;snapshotControls();try{await store('snapshotDelete',{id});if(disposed)return;await refreshSnapshots('');if(!disposed){$('comparison').replaceChildren();status('Снимок удалён.');}}finally{snapshotBusy=false;if(!disposed)snapshotControls();}});
    $('compare').onclick=safe(async()=>{$('snapshot-menu').open=false;const snap=saved.find(s=>s.id===$('saved').value);if(!data||!snap)throw new Error('Загрузите данные и выберите снимок.');const other=snap.dataset;if(other.estimation.field!==data.estimation.field||other.estimation.unit!==data.estimation.unit||other.profile.includeSubtasks!==data.profile.includeSubtasks)throw new Error('Нельзя сравнить разные поля/единицы оценок или разные правила учёта подзадач.');const a=S.metrics(S.selection(other,selected,other.profile.includeSubtasks,selectedTypes)),b=S.metrics(filtered());$('comparison').replaceChildren(el('h4',`Сравнение с текущими фильтрами (${selectedTypes.join(', ')||'все типы'}): ${other.sprint.name} → ${data.sprint.name}`));for(const [label,key]of [['Завершены','completed'],['Добавлены','added'],['Не завершены','unfinished'],['Удалены','removed']])$('comparison').append(el('p',`${label}: ${a[key]} → ${b[key]} (${b[key]-a[key]>=0?'+':''}${b[key]-a[key]})`));});
    refreshSnapshots();
    let profileReady=false,profileRequest;
    function ensureProfile(){
      if(profileReady)return Promise.resolve();
      if(!profileRequest)profileRequest=store('profileGet').then(p=>{if(!disposed){$('mode').value=p.mode;$('spField').value=p.spField;$('includeSubtasks').checked=p.includeSubtasks;sharedRules=JbpBoard.statusRules(p.statusRules);showRules();profileReady=true;}}).finally(()=>{profileRequest=null;});
      return profileRequest;
    }
    if(autoLoad){$('load').textContent='Обновить данные';safe(loadData)();}
    else ensureProfile().catch(e=>{if(!disposed)status(e.message,true);});
    let rulesTimer;
    function rulesChanged(prefs){if(prefs&&JSON.stringify(JbpBoard.statusRules(prefs))===JSON.stringify(sharedRules))return;clearTimeout(rulesTimer);rulesTimer=setTimeout(()=>{if(disposed)return;if(!viewingSnapshot&&(data||autoLoad))safe(loadData)();else store('profileGet').then(p=>{if(!disposed){sharedRules=JbpBoard.statusRules(p.statusRules);showRules();if(viewingSnapshot)status('Общие правила изменены. Сохранённый снимок остаётся историческим; «Обновить данные» загрузит выбранный спринт с текущими правилами.');}}).catch(e=>{if(!disposed)status(e.message,true);});},100);}
    const onPrefs=message=>{if(message.type==='boardPrefsChanged')rulesChanged(message.prefs);};
    const onStorage=(changes,area)=>{if(area==='local'&&changes.jbpBoardPrefs){features.health=changes.jbpBoardPrefs.newValue?.sprintHealth!==false;if(data)render();rulesChanged(changes.jbpBoardPrefs.newValue);}};
    if(location.protocol==='chrome-extension:')chrome.storage.local?.get('jbpBoardPrefs').then(value=>{if(!disposed){features.health=value.jbpBoardPrefs?.sprintHealth!==false;if(data)render();}}).catch(()=>{});
    chrome.runtime.onMessage?.addListener(onPrefs);
    if(location.protocol==='chrome-extension:')chrome.storage?.onChanged?.addListener(onStorage);
    const dispose=()=>{disposed=true;clearTimeout(rulesTimer);chrome.runtime.onMessage?.removeListener?.(onPrefs);if(location.protocol==='chrome-extension:')chrome.storage?.onChanged?.removeListener?.(onStorage);abort.abort();onFilter(null);root.replaceChildren();};
    return dispose;
  };
})();

