/* Board-scoped analytics workspace. No Jira writes; editing recalculates the loaded history. */
globalThis.JbpAnalyticsUI=(()=>{
 const A=JbpAnalytics,C=JbpAnalyticsCharts;
 const rules={final:'Полный цикл с возвратами',first:'Первое прохождение',each:'Каждое прохождение отдельно'};
 function mount(host,{store,key,mode,select,onTrend}){
  const doc=host.ownerDocument,el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  let data,rows=[],datasets=[],saved=null,current=null,disposed=false,editing=null,returnFocus=null,busy=false;
  const loaded=store.get(key).then(s=>{if(s[key])saved=A.profile(s[key]);}).catch(e=>{message.textContent='Профиль не загружен: '+e.message;});
  const heading=el('div',null,'analytics-heading'),intro=el('div');intro.append(el('h2','Аналитика команды'),el('p','От скорости поставки до конкретной задачи. Настройки сохраняются для этой доски.'));
  const actions=el('div',null,'actions'),newButton=button('Создать метрику',()=>edit(null)),configure=button('Процесс и календарь',()=>edit(current.metrics.find(m=>m.id===current.primary)));
  newButton.className='primary';actions.append(configure,newButton);heading.append(intro,actions);
  const message=el('p');message.id='analytics-status';message.setAttribute('role','status');
  const templates=el('div',null,'analytics-toolbar');templates.setAttribute('aria-label','Шаблоны дашборда');
  const kanban=button('Kanban',()=>applyTemplate('kanban')),scrum=button('Scrum',()=>applyTemplate('scrum'));
  const primary=el('select');primary.id='analytics-primary';const primaryLabel=el('label','Основной процесс');primaryLabel.append(primary);primary.onchange=()=>persist({...current,primary:primary.value});
  const views=el('select');views.id='analytics-view';const viewLabel=el('label','Представление');viewLabel.append(views);views.onchange=()=>{if(views.value==='')return;const view=current.views[Number(views.value)];if(view)persist({...current,order:view.order,hidden:view.hidden});};
  const viewName=el('input');viewName.placeholder='Название представления';viewName.maxLength=60;viewName.setAttribute('aria-label','Название представления');
  const loadSprints=button('Загрузить графики спринтов',()=>onTrend?.());loadSprints.hidden=mode!=='scrum';templates.append(loadSprints);
  templates.append(kanban,scrum,primaryLabel,viewLabel,viewName,button('Сохранить вид',()=>{const name=viewName.value.trim();if(!name){message.textContent='Введите название представления.';viewName.focus();return;}persist({...current,views:[...current.views.filter(v=>v.name!==name),{name,order:[...current.order],hidden:[...current.hidden]}]}).then(ok=>{if(ok)viewName.value='';});}));
  const facts=el('div',null,'analytics-kpis'),quality=el('p',null,'analytics-quality'),grid=el('div',null,'analytics-grid'),manager=el('details'),managerSummary=el('summary','Графики и метрики на экране'),managerBody=el('div',null,'analytics-widget-list');manager.append(managerSummary,managerBody);
  const editor=el('section',null,'analytics-editor');editor.hidden=true;editor.id='analytics-editor';
  host.classList.add('analytics-workspace');host.append(heading,templates,message,editor,quality,facts,manager,grid);
  function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
  function label(text,input){const l=el('label',text);l.append(input);return l;}
  function input(id,type,value){const i=el('input');i.id='metric-'+id;i.type=type;i.value=value??'';return i;}
  function options(id,choices,value){const s=el('select');s.id='metric-'+id;for(const [v,t]of choices){const o=el('option',t);o.value=v;s.append(o);}s.value=value;return s;}
  async function persist(next){
   if(disposed||busy)return false;busy=true;
   try{next=A.profile({...next,revision:(saved?.revision||0)+1});const latest=(await store.get(key))[key];if((latest?.revision||0)!==(saved?.revision||0))throw Error('Профиль изменён в другой вкладке. Обновите обзор перед сохранением. Ваш черновик остаётся открытым.');
    await store.set({[key]:next});if(disposed)return false;const focused=doc.activeElement?.id;saved=current=next;message.textContent='Профиль сохранён. Графики пересчитаны по загруженной истории.';render();if(focused)host.querySelector('#'+CSS.escape(focused))?.focus();return true;
   }catch(e){message.textContent=e.message;return false;}finally{busy=false;}
  }
  function applyTemplate(name){if(!current)return;const defaults=A.template(name,data.rules);persist({...current,template:name,order:defaults.order,hidden:[]});}
  function metricTitle(m){const status=id=>data.statuses.find(s=>String(s.id)===id)?.name||'#'+id;return `${m.created?'Создание':m.start.map(status).join(', ')} → ${m.end.map(status).join(', ')}. ${rules[m.rule]}. ${current.calendar.mode==='business'?'Рабочие':'Календарные'} часы.`;}
  function edit(item){
   if(!current)return;editing=item?.id||null;returnFocus=doc.activeElement;editor.replaceChildren();editor.hidden=false;
   const m=item?structuredClone(item):{...structuredClone(current.metrics[0]),id:crypto.randomUUID(),name:'Новая метрика',types:[],sle:0},cal=structuredClone(current.calendar);
   const title=el('h3',item?'Настроить «'+item.name+'»':'Создать метрику');title.tabIndex=-1;editor.append(title,el('p','Выберите границы процесса. Сначала проверьте расчёт на примере задачи, затем сохраните. Календарь общий для всех метрик этой доски.'));
   const form=el('form');form.noValidate=true;const fields=el('div',null,'analytics-form-grid');
   const name=input('name','text',m.name);name.maxLength=80;
   const startMode=options('start-mode',[['status','Вход в выбранный статус'],['created','Создание задачи']],m.created?'created':'status');
   const rule=options('rule',Object.entries(rules),m.rule),measure=options('measure',[['elapsed','Весь интервал между началом и концом'],['statuses','Сумма времени в выбранных статусах']],m.measure);
   fields.append(label('Название',name),label('Начало отсчёта',startMode));
   const statusList=[...data.statuses];for(const id of [...new Set(rows.flatMap(r=>(r.visits||[]).map(v=>v.status)))])if(!statusList.some(s=>String(s.id)===id))statusList.push({id,name:'Исторический статус #'+id});
   function picker(title,id,selected,choices){
    const field=el('fieldset',null,'analytics-picker');field.append(el('legend',title));const search=input(id+'-search','search','');search.placeholder='Найти в списке';search.setAttribute('aria-label',title+': поиск');search.hidden=choices.length<=7;field.append(search);const list=el('div',null,'analytics-choices');
    const boxes=choices.map(([value,text])=>{const box=input(id+'-'+value,'checkbox','');box.value=value;box.checked=selected.includes(value);const l=label(text,box);l.className='analytics-choice';list.append(l);return box;});search.oninput=()=>boxes.forEach(b=>b.parentElement.hidden=!b.parentElement.textContent.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));field.append(list);fields.append(field);return {field,read:()=>boxes.filter(b=>b.checked).map(b=>b.value)};
   }
   const statusChoices=statusList.map(s=>[String(s.id),s.name+' · #'+s.id]);
   const start=picker('Начальные статусы','start',m.start,statusChoices),end=picker('Конечные статусы','end',m.end,statusChoices);
   fields.append(label('Если задача возвращается в работу',rule),label('Что измерять',measure));
   const help=el('p',null,'analytics-explanation');fields.append(help);
   const counted=picker('Статусы, время в которых считаем','counted',m.counted,statusChoices),excluded=picker('Исключить время в статусах · необязательно','excluded',m.excluded,statusChoices),types=picker('Типы задач · пусто означает все','types',m.types,[...new Set(rows.map(r=>r.type))].map(t=>[t,t]));
   const sle=input('sle','number',m.sle);sle.min='0';sle.max='100000';sle.step='0.5';fields.append(label('Ориентир SLE, часов · 0 = исторический P85',sle));
   const calendarMode=options('calendar',[['elapsed','Календарное время · 24×7'],['business','Рабочее время']],cal.mode),zone=input('zone','text',cal.zone),from=input('day-start','time',cal.start),to=input('day-end','time',cal.end);
   fields.append(label('Календарь для всех метрик',calendarMode),label('Часовой пояс · например Europe/Moscow',zone),label('Рабочий день: с',from),label('Рабочий день: до',to));
   const days=picker('Рабочие дни','days',cal.days.map(String),[[1,'Пн'],[2,'Вт'],[3,'Ср'],[4,'Чт'],[5,'Пт'],[6,'Сб'],[0,'Вс']].map(([id,t])=>[String(id),t]));
   const holidays=el('textarea');holidays.id='metric-holidays';holidays.rows=3;holidays.value=cal.holidays.join('\n');holidays.placeholder='2026-01-01\n2026-01-02';fields.append(label('Праздники и выходные · ГГГГ-ММ-ДД, по строке',holidays));
   const preview=el('div',null,'analytics-preview'),previewSelect=options('preview',rows.filter(r=>r.visits).slice(0,100).map(r=>[r.key,r.key+' · '+r.summary]),rows.find(r=>r.visits)?.key||'');preview.append(el('h4','Проверка на конкретной задаче'),label('Задача · первые 100 с полной историей',previewSelect));const previewResult=el('div');preview.append(previewResult);
   const error=el('p',null,'analytics-error');error.setAttribute('role','alert');const footer=el('div',null,'actions'),submit=el('button','Сохранить метрику и календарь','primary');submit.type='submit';footer.append(submit,button('Отменить',closeEditor));if(editing&&current.metrics.length>1){const confirmation=el('div');confirmation.hidden=true;confirmation.append(el('p','Удалить определение и его графики? Данные Jira сохранятся.'),button('Удалить',async()=>{const metrics=current.metrics.filter(x=>x.id!==editing);if(await persist({...current,metrics,primary:current.primary===editing?metrics[0].id:current.primary}))closeEditor();}),button('Оставить',()=>confirmation.hidden=true));footer.append(button('Удалить метрику',()=>confirmation.hidden=false));footer.append(confirmation);}function section(id,text,nodes){const block=el('details',null,'analytics-editor-section');block.id=id;const summary=el('summary',text),body=el('div',null,'analytics-form-grid');body.append(...nodes);block.append(summary,body);return {block,summary};}
   const extra=section('metric-extra','Дополнительные правила',[measure.parentElement,counted.field,excluded.field,types.field,sle.parentElement]);
   const calendar=section('metric-calendar-section','Рабочий календарь',[calendarMode.parentElement,zone.parentElement,from.parentElement,to.parentElement,days.field,holidays.parentElement]);
   const example=section('metric-example','Проверить на задаче',[preview]);
   form.append(fields,extra.block,calendar.block,example.block,error,footer);editor.append(form);
   function draft(){return {m:A.metric({...m,name:name.value,created:startMode.value==='created',start:startMode.value==='created'?[]:start.read(),end:end.read(),rule:rule.value,measure:measure.value,counted:counted.read(),excluded:excluded.read(),types:types.read(),sle:sle.value}),cal:A.calendar({mode:calendarMode.value,zone:zone.value.trim(),days:days.read().map(Number),start:from.value,end:to.value,holidays:holidays.value.split(/[\s,]+/).filter(Boolean)})};}
   function update(){
    extra.summary.textContent='Дополнительные правила · '+(measure.value==='statuses'?'выбранные статусы':'весь интервал')+(excluded.read().length?' · исключений: '+excluded.read().length:'')+(types.read().length?' · типов: '+types.read().length:' · все типы')+' · SLE '+(Number(sle.value)>0?sle.value+' ч':'авто');
    calendar.summary.textContent='Календарь · '+(calendarMode.value==='business'?zone.value+' · '+from.value+'–'+to.value+' · дней: '+days.read().length+' · выходных дат: '+holidays.value.split(/[\s,]+/).filter(Boolean).length:'24×7')+' · общий для доски';
    start.field.hidden=startMode.value==='created';counted.field.hidden=measure.value!=='statuses';for(const control of [zone,from,to,holidays]){control.disabled=calendarMode.value!=='business';control.parentElement.hidden=calendarMode.value!=='business';}days.field.hidden=calendarMode.value!=='business';
    help.textContent={final:'Полный цикл: первое начало → окончательный вход в группу конечных статусов на дату отчёта. Возвраты и ожидание входят в интервал.',first:'Первое прохождение: после первого достижения конечного статуса дальнейшие возвраты не меняют результат.',each:'Каждое прохождение: после завершения новый вход в начальные статусы начинает новый цикл. Одна задача может дать несколько измерений.'}[rule.value];
    previewResult.replaceChildren();try{const d=draft(),row=rows.find(r=>r.key===previewSelect.value);if(!row){previewResult.append(el('p','Нет задач с полной историей для предпросмотра.'));return;}
     const now=Date.parse(data.loadedAt),result=A.calculate([row],d.m,d.cal,{start:row.visits[0].from,end:now+1},now);
     previewResult.append(el('p',`Завершённых измерений: ${result.samples.length}. ${d.cal.mode==='business'?'Рабочие часы · '+d.cal.zone:'Календарные часы'}.`));
     for(const sample of [...result.samples,...result.active])previewResult.append(el('p',`${new Date(sample.span.from).toLocaleString('ru-RU',{timeZone:d.cal.zone})} → ${new Date(sample.span.to).toLocaleString('ru-RU',{timeZone:d.cal.zone})}: ${C.fmt(sample.value)} ч${sample.completedAt?'':' · ещё в работе'}`));
     const timeline=el('ol');for(const v of row.visits){const item=el('li',`${data.statuses.find(s=>String(s.id)===v.status)?.name||v.status}: ${new Date(v.from).toLocaleString('ru-RU',{timeZone:d.cal.zone})} — ${new Date(v.to).toLocaleString('ru-RU',{timeZone:d.cal.zone})}`);if(d.m.start.includes(v.status)||d.m.end.includes(v.status))item.className='analytics-boundary';timeline.append(item);}previewResult.append(timeline);
    }catch(e){previewResult.append(el('p',e.message));}
   }
   form.addEventListener('change',update);let timer;form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,160);});
   form.onsubmit=async e=>{e.preventDefault();error.textContent='';submit.disabled=true;try{const d=draft(),next={...current,calendar:d.cal,metrics:editing?current.metrics.map(x=>x.id===editing?d.m:x):[...current.metrics,d.m]};if(await persist(next))closeEditor();else error.textContent=message.textContent;}catch(e){error.textContent=e.message;extra.block.open=true;calendar.block.open=true;error.tabIndex=-1;error.focus();}finally{submit.disabled=false;}};
   update();title.focus();editor.scrollIntoView({block:'start'});
  }
  function closeEditor(){editor.hidden=true;editor.replaceChildren();editing=null;returnFocus?.focus?.();}
  function widget(id,title,note,draw,metric){
   const article=el('article',null,'analytics-widget');article.dataset.widget=id;article.hidden=current.hidden.includes(id);
   const head=el('div',null,'analytics-widget-heading');head.append(el('h3',title));const actions=el('div',null,'actions');if(metric)actions.append(button('Настроить',()=>edit(metric)));
   const expand=button('Развернуть',()=>{const active=article.classList.toggle('analytics-expanded');expand.textContent=active?'Свернуть':'Развернуть';expand.setAttribute('aria-expanded',String(active));});expand.setAttribute('aria-expanded','false');actions.append(expand);head.append(actions);const chart=el('div',null,'analytics-plot');article.append(head,el('p',note),chart);draw(chart);grid.append(article);
   const row=el('div',null,'analytics-widget-control'),check=el('input');row.dataset.widgetControl=id;check.type='checkbox';check.id='analytics-visible-'+id;check.checked=!article.hidden;check.onchange=()=>persist({...current,hidden:check.checked?current.hidden.filter(k=>k!==id):[...current.hidden,id]});const l=label(title,check);row.append(l);
   for(const [delta,text]of [[-1,'Выше'],[1,'Ниже']]){const b=button(text,()=>{const order=[...grid.children].map(n=>n.dataset.widget),index=order.indexOf(id),next=index+delta;if(next<0||next>=order.length)return;[order[index],order[next]]=[order[next],order[index]];persist({...current,order});});b.setAttribute('aria-label',title+': '+text.toLowerCase());row.append(b);}managerBody.append(row);
  }
  function render(){
   if(!current||!data||disposed)return;
   primary.replaceChildren(...current.metrics.map(m=>{const o=el('option',m.name);o.value=m.id;return o;}));primary.value=current.primary;
   views.replaceChildren(el('option','Выбрать сохранённый вид'));views.firstChild.value='';current.views.forEach((v,i)=>{const o=el('option',v.name);o.value=String(i);views.append(o);});
   loadSprints.hidden=current.template!=='scrum'||mode!=='scrum';
   kanban.setAttribute('aria-pressed',String(current.template==='kanban'));scrum.setAttribute('aria-pressed',String(current.template==='scrum'));
   facts.replaceChildren();grid.replaceChildren();managerBody.replaceChildren();
   const now=Date.parse(data.loadedAt),results=[];for(const m of current.metrics){try{results.push(A.calculate(rows,m,current.calendar,data.range,now));}catch(e){message.textContent=m.name+': '+e.message;}}
   const result=results.find(r=>r.metric.id===current.primary);if(!result){quality.textContent='Настройте начальные и конечные статусы через «Процесс и календарь».';return;}
   const calendarText=current.calendar.mode==='business'?`Рабочие часы · ${current.calendar.zone} · ${current.calendar.start}–${current.calendar.end}`:'Календарные часы · 24×7';
   quality.textContent=`${calendarText}. История известна для ${result.eligible-result.unknown.length} из ${result.eligible} задач выбранного процесса. CFD и WIP отражают текущий состав фильтра доски; ушедшие из фильтра задачи не восстановлены.`;
   const liveResult=A.calculate(rows,{...result.metric,rule:'final'},current.calendar,data.range,now);
   const deliveries=[...new Map(result.samples.map(r=>[r.key,r])).values()],late=result.sle==null?[]:liveResult.active.filter(r=>r.value>result.sle);
   for(const [title,value,note,items]of [[result.metric.name+' · P85',C.fmt(result.stats.p85)+' ч',`Медиана ${C.fmt(result.stats.median)} · P95 ${C.fmt(result.stats.p95)} · n=${result.stats.n}`,result.samples],['Throughput',deliveries.length,'Уникальные задачи за выбранный период',deliveries],['WIP',liveResult.active.length,'Начаты и ещё не завершены; включая повторно открытые',liveResult.active],['Старше SLE',result.sle==null?'—':late.length,'Ориентир '+C.fmt(result.sle)+' ч; не обещание срока',late]]){const b=button('',()=>select(title,items));b.className='analytics-kpi';b.append(el('span',title),el('strong',String(value)),el('small',note));facts.append(b);}
   const selectItems=(title,items)=>select(title,[...new Map(items.map(i=>[i.key,i])).values()]);
   for(const r of results){
    const ordered=[...r.samples].sort((a,b)=>a.completedAt-b.completedAt);
    widget(r.metric.id,r.metric.name,metricTitle(r.metric),host=>C.draw(host,{title:r.metric.name,kind:'scatter',xValues:ordered.map(s=>s.completedAt),xRange:data.range,labels:ordered.map(s=>new Date(s.completedAt).toISOString().slice(0,10)),series:[{name:r.metric.name,values:ordered.map(s=>s.value)}],rows:ordered.map(r=>[r]),unit:'ч',threshold:r.sle,note:`Медиана ${C.fmt(r.stats.median)} ч · P85 ${C.fmt(r.stats.p85)} ч · P95 ${C.fmt(r.stats.p95)} ч. Измерений: ${r.stats.n}; задач: ${new Set(r.samples.map(s=>s.key)).size}. ${calendarText}.`,select:selectItems}),r.metric);
    widget('hist-'+r.metric.id,'Распределение · '+r.metric.name,'Сколько измерений укладывается в каждый диапазон времени.',host=>{const bins=A.histogram(r.samples);C.draw(host,{title:'Распределение',kind:'bar',labels:bins.map(b=>b.label),series:[{name:'Измерений',values:bins.map(b=>b.rows.length),rows:bins.map(b=>b.rows)}],note:'Клик по столбцу открывает задачи этого диапазона.',select:selectItems});});
   }
   const history=A.history(rows,result.metric,data.range),weeks=[];for(let start=data.range.start;start<data.range.end;start+=7*A.DAY){const end=Math.min(data.range.end,start+7*A.DAY),items=deliveries.filter(r=>r.completedAt>=start&&r.completedAt<end);weeks.push({label:new Date(start).toISOString().slice(0,10)+(end-start<7*A.DAY?' *':''),items});}
   widget('throughput','Throughput · завершения','Количество уникальных задач по дате завершения основного процесса.',host=>C.draw(host,{title:'Throughput',kind:'bar',labels:weeks.map(w=>w.label),series:[{name:'Завершено',values:weeks.map(w=>w.items.length),rows:weeks.map(w=>w.items)}],note:'Интервалы по 7 дней от начала периода; * — неполный интервал. При нескольких прохождениях задача учитывается по последнему завершению в периоде.',select:selectItems}));
   const aging=[...liveResult.active].sort((a,b)=>b.value-a.value).slice(0,30);
   widget('aging','Aging WIP · возраст работы','Время от начала выбранного процесса до момента загрузки. Не возраст текущего статуса.',host=>C.draw(host,{title:'Aging WIP',kind:'bar',labels:aging.map(r=>r.key),series:[{name:'Возраст',values:aging.map(r=>r.value)}],rows:aging.map(r=>[r]),threshold:result.sle,unit:'ч',note:`30 самых старых задач. ${calendarText}.`,select:selectItems}));
   widget('cfd','CFD · накопление работы','Состояние задач на конец каждого дня UTC. Этапы определяются границами основного процесса.',host=>C.draw(host,{title:'CFD',kind:'area',labels:history.map(p=>p.label),series:[['done','Завершены'],['work','В работе'],['queue','До начала']].map(([key,name])=>({name,values:history.map(p=>p.groups[key].length),rows:history.map(p=>p.groups[key])})),note:'Только полная история текущего состава доски; это не историческое членство в доске.',select:selectItems}));
   widget('wip','WIP · динамика','Начаты, но ещё не завершены на конец каждого дня UTC.',host=>C.draw(host,{title:'WIP',labels:history.map(p=>p.label),series:[{name:'В работе',values:history.map(p=>p.groups.work.length),rows:history.map(p=>p.groups.work)}],note:'Работа, вернувшаяся из конечных статусов, снова входит в WIP.',select:selectItems}));
   if(current.template==='scrum')renderSprints(widget,selectItems);
   const ordering=new Map(current.order.map((id,i)=>[id,i]));[...grid.children].sort((a,b)=>(ordering.get(a.dataset.widget)??999)-(ordering.get(b.dataset.widget)??999)).forEach(n=>{grid.append(n);const control=[...managerBody.children].find(c=>c.dataset.widgetControl===n.dataset.widget);if(control)managerBody.append(control);});
  }
  function renderSprints(widget,selectItems){
   const unit=el('select');for(const [value,text]of [['count','Задачи'],['SP','Story Points'],['h','Часы оценки']]){const o=el('option',text);o.value=value;unit.append(o);}
   widget('velocity','Velocity · завершённый объём','Включает завершённые добавленные задачи. SP разных команд не являются шкалой сравнения производительности.',host=>{
    const plot=el('div');host.append(label('Единицы',unit),plot);const draw=()=>{const items=datasets.filter(d=>unit.value==='count'||d.estimation.unit===unit.value);C.draw(plot,{title:'Velocity',kind:'bar',labels:items.map(d=>d.sprint.name),series:[{name:'Завершено',values:items.map(d=>{const done=d.issues.filter(r=>r.category==='completed');return unit.value==='count'?done.length:done.some(r=>r.endEstimate==null)?null:done.reduce((n,r)=>n+r.endEstimate,0);}),rows:items.map(d=>d.issues.filter(r=>r.category==='completed'))}],unit:unit.value==='count'?'задач':unit.value,note:datasets.length?'Полный завершённый объём по оценкам на конец спринта; пропуски не заменяются нулём.':mode==='scrum'?'Нажмите «Загрузить графики спринтов» выше.':'Для графиков спринтов выберите Scrum-доску.',select:selectItems});};unit.onchange=draw;draw();
   });
   widget('plan','План-факт спринтов','Первоначальный состав и завершённая часть первоначального плана. Добавления показаны отдельно.',host=>C.draw(host,{title:'План-факт',kind:'bar',labels:datasets.map(d=>d.sprint.name),series:[{name:'План',values:datasets.map(d=>d.issues.filter(r=>!r.added).length),rows:datasets.map(d=>d.issues.filter(r=>!r.added))},{name:'Выполнено плана',values:datasets.map(d=>d.issues.filter(r=>!r.added&&r.category==='completed').length),rows:datasets.map(d=>d.issues.filter(r=>!r.added&&r.category==='completed'))},{name:'Добавлено',values:datasets.map(d=>d.issues.filter(r=>r.added).length),rows:datasets.map(d=>d.issues.filter(r=>r.added))}],note:'Единицы — задачи. Выполненная часть входит в план: столбцы не складываются.',select:selectItems}));
   for(const kind of ['burnup','burndown'])widget(kind,kind==='burnup'?'Burnup · объём и выполнение':'Burndown · остаток спринта','История состава и статусов спринта; единицы — задачи.',host=>{
    const choose=el('select');for(const d of datasets){const o=el('option',d.sprint.name);o.value=String(d.sprint.id);choose.append(o);}const plot=el('div');host.append(label('Спринт',choose),plot);const draw=()=>{const d=datasets.find(d=>String(d.sprint.id)===choose.value),points=d&&A.sprintHistory?A.sprintHistory(d):[];C.draw(plot,{title:kind,labels:points.map(p=>p.label),series:kind==='burnup'?[{name:'Объём спринта',values:points.map(p=>p.total)},{name:'Завершено',values:points.map(p=>p.done)}]:[{name:'Осталось',values:points.map(p=>p.remaining)}],rows:points.map(p=>p.rows),note:!d?(mode==='scrum'?'Нажмите «Загрузить графики спринтов» выше.':'Для графиков спринтов выберите Scrum-доску.'):points.length?'Изменения состава учитываются; день с неполной историей показан разрывом.':'История состава спринта недоступна. Нужны поле Sprint и полная история задач.',select:selectItems});};choose.onchange=draw;draw();
   });
  }
  return {async update(next,selected,trend=[]){await loaded;if(disposed)return;if(data&&data.loadedAt!==next.loadedAt&&!editing){try{const value=(await store.get(key))[key];saved=value?A.profile(value):null;current=saved;}catch(e){message.textContent=e.message;}}if(disposed)return;data=next;rows=selected;datasets=trend;if(!current)current=saved||A.template(mode,next.rules);render();},export:()=>({profile:current,results:current&&data?current.metrics.map(m=>{try{const r=A.calculate(rows,m,current.calendar,data.range,Date.parse(data.loadedAt));return {metric:r.metric,stats:r.stats,sle:r.sle,unknown:r.unknown.map(x=>x.key),samples:r.samples.map(x=>({key:x.key,hours:x.value,start:x.span.from,end:x.span.to})),active:r.active.map(x=>({key:x.key,hours:x.value,start:x.span.from}))};}catch(e){return {metric:m,error:e.message};}}):[]}),dispose(){disposed=true;host.replaceChildren();}};
 }
 return {mount};
})();
