/* Historical workload by sprint and CURRENT issue type; opt-in, bounded loads. */
(() => {
 const S=JbpSprint;
 S.capacitySeries=function(datasets,mode='planned'){
  if(!['planned','completed'].includes(mode))throw Error('Неизвестный показатель capacity.');
  const first=datasets[0];if(!first)return {unit:'count',types:[],sprints:[]};
  if(datasets.some(d=>d.estimation.unit!==first.estimation.unit||d.estimation.field!==first.estimation.field))throw Error('Нельзя смешивать разные единицы и поля оценок.');
  const types=new Set(datasets.flatMap(d=>S.selection(d).map(r=>r.issuetype||'Неизвестный тип')));
  const sprints=datasets.map(d=>{
   const rows=S.selection(d).filter(r=>mode==='planned'?!r.added:r.category==='completed'),groups=new Map();
   for(const row of rows){const type=row.issuetype||'Неизвестный тип';types.add(type);const g=groups.get(type)||{type,value:0,known:0,missing:0,count:0};g.count++;const value=row[mode==='planned'?'startEstimate':'endEstimate'];if(value==null||!Number.isFinite(value)||value<0)g.missing++;else{g.value+=value;g.known++;}groups.set(type,g);}
   const segments=[...groups.values()];return {id:String(d.sprint.id),name:d.sprint.name,state:d.sprint.state,segments,total:segments.reduce((n,g)=>n+g.value,0),missing:segments.reduce((n,g)=>n+g.missing,0),known:segments.reduce((n,g)=>n+g.known,0)};
  });
  return {unit:first.estimation.unit,types:[...types].sort((a,b)=>a.localeCompare(b)),sprints};
 };
 S.capacitySprints=function(list,selected,count){
  if(![3,5,10].includes(Number(count)))throw Error('Выберите 3, 5 или 10 спринтов.');
  const date=s=>Date.parse(s.completeDate||s.endDate||s.startDate),cutoff=date(selected);
  if(!Number.isFinite(cutoff))throw Error('У выбранного спринта нет корректных дат.');
  const unique=[...new Map(list.map(s=>[String(s.id),s])).values()];
  return [...unique.filter(s=>String(s.id)!==String(selected.id)&&s.state==='closed'&&Number.isFinite(date(s))&&date(s)<=cutoff).sort((a,b)=>date(a)-date(b)||Number(a.id)-Number(b.id)).slice(-(count-1)),selected];
 };
 S.Client.prototype.capacity=async function(boardId,sprintId,count,profile,signal,onProgress=()=>{}){
  if(![boardId,sprintId].every(v=>/^\d+$/.test(String(v))))throw Error('Некорректный ID доски или спринта.');
  const config=await this.get(`agile/1.0/board/${boardId}/configuration`,signal);
  if(config.type==='kanban')throw Error('Для диаграммы нужны спринты Scrum-доски.');
  const fields=await this.get('api/2/field',signal);if(!Array.isArray(fields))throw Error('Неизвестный список полей Jira.');
  const estimate=S.estimation(config,fields,profile),list=await this.sprints(boardId,signal);
  const selected=list.find(s=>String(s.id)===String(sprintId));if(!selected||!['active','closed'].includes(selected.state))throw Error('Выбранный активный или закрытый спринт отсутствует в списке доски.');
  const sprints=S.capacitySprints(list,selected,count),reports=[],keys=new Set();
  for(const sprint of sprints){if(!/^\d+$/.test(String(sprint.id)))throw Error('Некорректный ID спринта в ответе Jira.');signal?.throwIfAborted();onProgress(`Состав спринтов: ${reports.length+1}/${sprints.length}`);const rows=S.reportRows(await this.get(`greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${boardId}&sprintId=${sprint.id}`,signal));for(const r of rows)keys.add(r.key);if(keys.size>3000)throw Error('Более 3000 уникальных задач. Выберите меньше спринтов.');reports.push({sprint,rows});}
  const issues=new Map(),all=[...keys],warnings=[];
  for(let chunk=0;chunk<all.length;chunk+=50){
   const batch=all.slice(chunk,chunk+50);let total;
   for(let startAt=0;;){
    signal?.throwIfAborted();onProgress(`Поля задач: ${Math.min(chunk+50,all.length)}/${all.length}`);
    const params=new URLSearchParams({jql:`key in (${batch.join(',')}) ORDER BY key`,startAt:String(startAt),maxResults:'50',fields:['issuetype','created',estimate.field].filter(Boolean).join(',')});if(estimate.unit!=='count')params.set('expand','changelog');
    const page=await this.get('api/2/search?'+params,signal);
    if(!Array.isArray(page.issues)||page.startAt!==startAt||!Number.isInteger(page.total)||page.total>batch.length||(total!==undefined&&page.total!==total))throw Error('Состав выдачи задач изменился или ответ Jira неполный.');total=page.total;
    for(const issue of page.issues){if(!batch.includes(issue.key)||issues.has(issue.key)||!issue.fields)throw Error('Некорректная или повторная задача в ответе Jira.');issues.set(issue.key,issue);}
    startAt+=page.issues.length;if(startAt>total)throw Error('Некорректный размер страницы Jira.');if(startAt===total)break;if(!page.issues.length)throw Error('Неполная выдача задач.');
   }
  }
  const datasets=reports.map(({sprint,rows})=>({sprint,profile:S.profile(profile),estimation:estimate,issues:rows.map(row=>{
   const issue=issues.get(row.key);if(!issue){warnings.push(`${row.key}: задача недоступна, тип и оценка неизвестны.`);return {...row,startEstimate:null,endEstimate:null,subtask:false,issuetype:'Неизвестный тип'};}
   return S.enrich(row,issue,estimate,sprint);
  })}));
  return {datasets,warnings:[...new Set(warnings)],loadedAt:new Date().toISOString(),boardId:String(boardId),profile:S.profile(profile)};
 };
 const colors=['#0052cc','#00875a','#6554c0','#c25100','#b31d4b','#007b83','#806000','#596780'];
 const format=v=>v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 S.mountCapacity=function(parent,{client,boardId,sprintId,getProfile}){
  const doc=parent.ownerDocument,section=doc.createElement('section');section.className='capacity';
  section.innerHTML='<style>.capacity{margin-top:20px;border-top:1px solid #dce0ef;padding-top:16px}.capacity h4{font-size:16px;margin:0 0 8px}.capacity .chart{overflow:auto;max-width:100%}.capacity svg{display:block;max-width:none}.capacity .legend{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.capacity .legend span{display:flex;gap:5px;align-items:center}.capacity .swatch{width:12px;height:12px;display:inline-block;border-radius:3px}.capacity rect:focus{outline:2px solid #172b4d;outline-offset:2px}.capacity .chart-table{max-height:320px;overflow:auto}.capacity table{width:100%;border-collapse:collapse}.capacity td,.capacity th{padding:6px;text-align:left;border-bottom:1px solid #dce0ef}</style><h4>Capacity по спринтам · типы задач</h4><p>Объём работы, а не доступность сотрудников. План — состав и оценки на старте, включая позднее удалённые задачи. Завершено — завершённые в этом спринте задачи, включая добавленные после старта, по оценке на завершении (для активного — на текущий момент). Типы задач — текущие.</p><div class="controls"><label>Спринтов<select data-cap="count"><option>3</option><option selected>5</option><option>10</option></select></label><label>Показатель<select data-cap="mode"><option value="planned">План на старте</option><option value="completed">Завершено</option></select></label><button data-cap="load">Построить диаграмму</button><button data-cap="cancel" hidden>Отменить</button></div><p data-cap="status" role="status">Загрузка только по кнопке. Единицы и подзадачи — из паспорта метрик; фильтры исполнителей выбранного спринта здесь не применяются.</p><div data-cap="output"></div>';
  parent.append(section);const $=id=>section.querySelector(`[data-cap="${id}"]`);let result,controller,revision=0,disposed=false;
  const element=(name,text)=>{const e=doc.createElement(name);if(text!==undefined)e.textContent=text;return e;};
  function draw(){
   if(!result)return;const series=S.capacitySeries(result.datasets,$('mode').value),output=$('output');output.replaceChildren();
   const unit=series.unit==='count'?'задач':series.unit==='h'?'часы':'SP';
   output.append(element('p',`${$('mode').selectedOptions[0].textContent} · ${unit} · ${result.datasets.length} спринтов по дату выбранного · ${result.profile.includeSubtasks?'с подзадачами':'без подзадач'} · загружено ${new Date(result.loadedAt).toLocaleString()}`));
   const missing=series.sprints.reduce((n,s)=>n+s.missing,0);if(missing)output.append(element('p',`Частичные итоги: у ${missing} записей нет достоверной оценки или доступа. Столбики показывают только известный объём; неизвестное не считается нулём.`));
   const legend=element('div');legend.className='legend';series.types.forEach((type,i)=>{const item=element('span'),dot=element('i');dot.className='swatch';dot.style.background=colors[i%colors.length];item.append(dot,doc.createTextNode(type));legend.append(item);});output.append(legend);
   const width=Math.max(600,Math.min(1100,parent.clientWidth-32),series.sprints.length*120+70),height=300,top=35,bottom=230,scale=Math.max(1,...series.sprints.map(s=>s.total)),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('role','img');svg.setAttribute('aria-label',`Распределение ${unit} по спринтам и типам задач. Точные значения в таблице ниже.`);
   const add=(tag,attrs,text)=>{const e=doc.createElementNS(svg.namespaceURI,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;};
   for(let i=0;i<=4;i++){const y=bottom-(bottom-top)*i/4;add('line',{x1:55,x2:width-10,y1:y,y2:y,stroke:'#dce0ef'});add('text',{x:48,y:y+4,'text-anchor':'end','font-size':11,fill:'#344563'},format(scale*i/4));}
   series.sprints.forEach((s,i)=>{const slot=(width-70)/series.sprints.length,x=55+i*slot+(slot-72)/2;let y=bottom;for(const type of series.types){const g=s.segments.find(v=>v.type===type);if(!g||!g.value)continue;const h=(bottom-top)*g.value/scale,label=`${s.name}: ${type} — ${format(g.value)} ${unit}${g.missing?`; неизвестно ${g.missing}`:''}`;y-=h;const rect=add('rect',{x,y,width:72,height:h,fill:colors[series.types.indexOf(type)%colors.length],tabindex:0,'aria-label':label});const title=doc.createElementNS(svg.namespaceURI,'title');title.textContent=label;rect.append(title);}
    add('text',{x:x+36,y:Math.max(15,y-8),'text-anchor':'middle','font-size':12,fill:'#172b4d'},s.missing&&!s.known?'?':format(s.total)+(s.missing?' + ?':''));
    const label=add('text',{x:x+36,y:250,'text-anchor':'middle','font-size':11,fill:'#344563'},s.name.length>16?s.name.slice(0,15)+'…':s.name);const title=doc.createElementNS(svg.namespaceURI,'title');title.textContent=s.name;label.append(title);if(s.state==='active')add('text',{x:x+36,y:268,'text-anchor':'middle','font-size':10,fill:'#596780'},'активный');
   });
   const chart=element('div');chart.className='chart';chart.append(svg);output.append(chart);
   const details=element('details'),summary=element('summary','Точные значения и неизвестные оценки'),wrap=element('div'),table=element('table');wrap.className='chart-table';const head=element('tr');for(const label of ['Спринт','Тип',unit,'Без оценки'])head.append(element('th',label));const thead=element('thead');thead.append(head);table.append(thead);const body=element('tbody');
   for(const s of series.sprints)for(const g of s.segments){const row=element('tr');for(const value of [s.name,g.type,g.missing&&!g.known?'Неизвестно':format(g.value)+(g.missing?' + ?':''),String(g.missing)])row.append(element('td',value));body.append(row);}table.append(body);wrap.append(table);details.append(summary,wrap);output.append(details);
   if(result.warnings.length)output.append(element('p',result.warnings.slice(0,10).join(' ')+(result.warnings.length>10?' …':'')));
  }
  $('mode').onchange=draw;
  $('count').onchange=()=>{if(result)$('status').textContent='Число спринтов изменено. Нажмите «Построить диаграмму».';};
  $('cancel').onclick=()=>{revision++;controller?.abort();$('load').disabled=false;$('cancel').hidden=true;$('status').textContent='Загрузка отменена.';};
  $('load').onclick=async()=>{const seq=++revision;controller?.abort();controller=new AbortController();const signal=controller.signal;$('load').disabled=true;$('cancel').hidden=false;$('status').textContent='Загрузка состава спринтов…';try{const profile=await getProfile();signal.throwIfAborted();const loaded=await client.capacity(boardId,sprintId,Number($('count').value),profile,signal,text=>{if(!disposed&&seq===revision)$('status').textContent=text;});if(disposed||seq!==revision)return;result=loaded;draw();$('status').textContent='Диаграмма построена. Переключение показателя не обращается к Jira.';}catch(e){if(!disposed&&seq===revision)$('status').textContent=e.message;}finally{if(!disposed&&seq===revision){$('load').disabled=false;$('cancel').hidden=true;}}};
  return ()=>{disposed=true;revision++;controller?.abort();section.remove();};
 };
})();
