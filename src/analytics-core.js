/* Pure calculations shared by the flow dashboard and metric preview. Times are milliseconds UTC. */
globalThis.JbpAnalytics=(()=>{
 const H=3600000,DAY=24*H,MAX_METRICS=20,clockCache=new Map();
 const ids=v=>{if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string'||!/^\d+$/.test(x)))throw Error('Выберите статусы из списка Jira.');return [...new Set(v)];};
 const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00Z'))&&new Date(s+'T00:00Z').toISOString().slice(0,10)===s;
 function calendar(input={}){
  const c={mode:input.mode||'elapsed',zone:input.zone||'UTC',days:input.days||[1,2,3,4,5],start:input.start||'09:00',end:input.end||'18:00',holidays:input.holidays||[]};
  if(!['elapsed','business'].includes(c.mode))throw Error('Выберите календарное или рабочее время.');
  try{new Intl.DateTimeFormat('en',{timeZone:c.zone}).format();}catch{throw Error('Укажите часовой пояс, например Europe/Moscow.');}
  if(!Array.isArray(c.days)||!c.days.length||c.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Выберите рабочие дни.');
  c.days=[...new Set(c.days)];
  if(![c.start,c.end].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||c.start>=c.end)throw Error('Начало рабочего дня должно быть раньше окончания. Ночные смены не поддерживаются.');
  if(!Array.isArray(c.holidays)||c.holidays.length>500||c.holidays.some(d=>!date(d)))throw Error('Нерабочие даты: по одной дате ГГГГ-ММ-ДД на строке, до 500 дат.');
  c.holidays=[...new Set(c.holidays)];return c;
 }
 function metric(input){
  if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw Error('Название метрики: от 1 до 80 символов.');
  const m={id:String(input.id||''),name:input.name.trim(),start:ids(input.start||[]),end:ids(input.end||[]),created:input.created===true,rule:input.rule||'final',measure:input.measure||'elapsed',counted:ids(input.counted||[]),excluded:ids(input.excluded||[]),types:input.types||[],sle:Number(input.sle??0)};
  if(!/^[\w-]{1,80}$/.test(m.id)||m.id.startsWith('hist-')||['process-map','throughput','aging','cfd','wip','velocity','plan','burnup','burndown'].includes(m.id))throw Error('Некорректный идентификатор метрики.');
  if(!m.created&&!m.start.length||!m.end.length)throw Error('Выберите хотя бы один начальный и конечный статус.');
  if(m.start.some(id=>m.end.includes(id)))throw Error('Начальные и конечные статусы не должны совпадать.');
  if(!['final','first','each'].includes(m.rule)||!['elapsed','statuses'].includes(m.measure))throw Error('Выберите правило возвратов и способ расчёта.');
  if(m.created&&m.rule==='each')throw Error('Для каждого прохождения выберите начальные статусы вместо даты создания.');
  if(m.measure==='statuses'&&!m.counted.length)throw Error('Выберите статусы, время в которых нужно суммировать.');
  if(!Array.isArray(m.types)||m.types.length>50||m.types.some(t=>typeof t!=='string'||t.length>100))throw Error('Некорректный список типов задач.');
  if(!Number.isFinite(m.sle)||m.sle<0||m.sle>100000)throw Error('Ориентир SLE: от 0 до 100000 часов; 0 — автоматически по P85.');
  return m;
 }
 function profile(input){
  if(!input||input.schema!==1||!Array.isArray(input.metrics)||!input.metrics.length||input.metrics.length>MAX_METRICS)throw Error('Профиль должен содержать от 1 до 20 метрик.');
  if(input.revision!=null&&(!Number.isSafeInteger(input.revision)||input.revision<1))throw Error('Некорректная версия профиля.');
  const metrics=input.metrics.map(metric);if(new Set(metrics.map(m=>m.id)).size!==metrics.length)throw Error('Идентификаторы метрик повторяются.');
  const p={schema:1,revision:Number(input.revision)||1,template:input.template==='scrum'?'scrum':'kanban',calendar:calendar(input.calendar),metrics,primary:String(input.primary||metrics[0].id),hidden:input.hidden||[],order:input.order||[],views:input.views||[],statusRoles:input.statusRoles||{}};
  if(!p.statusRoles||typeof p.statusRoles!=='object'||Array.isArray(p.statusRoles)||Object.keys(p.statusRoles).length>200||Object.entries(p.statusRoles).some(([id,role])=>!/^\d+$/.test(id)||!['active','wait','unknown'].includes(role)))throw Error('Роли статусов: выберите активную работу, ожидание или не задано.');
  if(!metrics.some(m=>m.id===p.primary))throw Error('Основная метрика не найдена.');
  for(const list of [p.hidden,p.order])if(!Array.isArray(list)||list.length>50||list.some(x=>typeof x!=='string'||!/^[-\w]{1,100}$/.test(x)))throw Error('Некорректный список графиков.');
  if(!Array.isArray(p.views)||p.views.length>10||p.views.some(v=>!v||typeof v.name!=='string'||!v.name.trim()||v.name.length>60||!Array.isArray(v.hidden)||!Array.isArray(v.order)||[...v.hidden,...v.order].some(x=>typeof x!=='string'||!/^[-\w]{1,100}$/.test(x))||v.hidden.length>50||v.order.length>50))throw Error('Можно сохранить до 10 представлений с названием до 60 символов.');
  return p;
 }
 function template(mode,rules){
  const start=String(rules.workStatuses||'').split(',').filter(Boolean),end=String(rules.doneStatuses||'').split(',').filter(Boolean);
  return {schema:1,revision:1,template:mode==='scrum'?'scrum':'kanban',calendar:calendar(),primary:'cycle',hidden:[],order:mode==='scrum'?['velocity','plan','burnup','burndown','cycle','process-map','throughput','aging','cfd','wip']:['cycle','process-map','throughput','aging','cfd','wip'],views:[],metrics:[{id:'cycle',name:'Cycle Time',start,end,created:false,rule:'final',measure:'elapsed',counted:[],excluded:[],types:[],sle:0},{id:'lead',name:'Lead Time',start:[],end,created:true,rule:'final',measure:'elapsed',counted:[],excluded:[],types:[],sle:0}].filter(m=>m.id==='cycle'||end.length)};
 }
 // Prefix sums of UTC working windows make interval queries independent of issue lifetime.
 function clock(c,min,max){
  c=calendar(c);if(c.mode==='elapsed')return (a,b)=>Math.max(0,b-a)/H;
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<min)return ()=>0;
  if(max-min>100*366*DAY)throw Error('История длиннее 100 лет: проверьте даты задач.');
  const cacheKey=JSON.stringify([c,Math.floor(min/DAY),Math.ceil(max/DAY)]);if(clockCache.has(cacheKey))return clockCache.get(cacheKey);
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:c.zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts=t=>Object.fromEntries(format.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const wall=t=>{const p=parts(t);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);};
  const utc=(day,time,isEnd=false)=>{const [h,m]=time.split(':').map(Number),target=day+h*H+m*60000;
   const offsets=[...new Set([-12*H,0,12*H].map(delta=>wall(target+delta)-(target+delta)))],candidates=offsets.map(offset=>target-offset),exact=candidates.filter(t=>wall(t)===target).sort((a,b)=>a-b);
   // Repeated times: earliest start/latest end. Missing times shift forward by the DST gap.
   if(exact.length)return isEnd?exact.at(-1):exact[0];return candidates.filter(t=>wall(t)>target).sort((a,b)=>wall(a)-wall(b))[0];
  };
  const windows=[],prefix=[0],holiday=new Set(c.holidays);
  for(let d=Math.floor(min/DAY)*DAY-2*DAY;d<=max+2*DAY;d+=DAY){const label=new Date(d).toISOString().slice(0,10);if(!c.days.includes(new Date(d).getUTCDay())||holiday.has(label))continue;const a=utc(d,c.start),b=utc(d,c.end,true);if(b>a){windows.push([a,b]);prefix.push(prefix.at(-1)+b-a);}}
  const integral=t=>{let lo=0,hi=windows.length;while(lo<hi){const mid=(lo+hi)>>1;if(windows[mid][1]<=t)lo=mid+1;else hi=mid;}return prefix[lo]+(lo<windows.length?Math.max(0,Math.min(t,windows[lo][1])-windows[lo][0]):0);};
  const measure=(a,b)=>Math.max(0,integral(b)-integral(a))/H;if(clockCache.size>=4)clockCache.delete(clockCache.keys().next().value);clockCache.set(cacheKey,measure);return measure;
 }
 function intervals(visits,m,cutoff){
  if(!visits?.length)return {complete:[],active:null};
  const list=visits.filter(v=>v.from<cutoff),complete=[];if(!list.length)return {complete,active:null};
  const starts=new Set(m.start),ends=new Set(m.end);let first=m.created?list[0].from:null,active=first,finish=null,previous=null;
  for(const v of list){
   if(first==null&&starts.has(v.status)){first=v.from;active=v.from;}
   if(m.rule==='each'&&active==null&&starts.has(v.status))active=v.from;
   if(ends.has(v.status)&&!ends.has(previous)&&first!=null){finish=v.from;if(m.rule==='first')return {complete:[{from:first,to:finish}],active:null};if(m.rule==='each'&&active!=null){complete.push({from:active,to:finish});active=null;}}
   previous=v.status;
  }
  if(m.rule==='final')return {complete:ends.has(list.at(-1).status)&&finish!=null?[{from:first,to:finish}]:[],active:ends.has(list.at(-1).status)?null:first};
  return {complete,active};
 }
 function summarize(values){const a=values.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>a.length?a[Math.ceil(a.length*p)-1]:null;return {n:a.length,median:a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null,p85:q(.85),p95:q(.95)};}
 function calculate(rows,input,cal,range,now){
  const m=metric(input),eligible=rows.filter(r=>!m.types.length||m.types.includes(r.type)),known=eligible.filter(r=>r.visits),min=Math.min(now,...known.map(r=>r.visits[0]?.from??now)),hours=clock(cal,min,now),samples=[],active=[],unknown=eligible.filter(r=>!r.visits);
  const duration=(visits,span)=>visits.reduce((sum,v)=>{if(m.excluded.includes(v.status)||m.measure==='statuses'&&!m.counted.includes(v.status))return sum;const a=Math.max(v.from,span.from),b=Math.min(v.to,span.to);return b>a?sum+hours(a,b):sum;},0);
  for(const row of known){
   const spans=intervals(row.visits,m,range.end);
   for(const span of spans.complete)if(span.to>=range.start&&span.to<range.end)samples.push({...row,completedAt:span.to,value:duration(row.visits,span),span});
   const live=intervals(row.visits,m,now+1);if(live.active!=null){const span={from:live.active,to:now};active.push({...row,value:duration(row.visits,span),span});}
  }
  const stats=summarize(samples.map(s=>s.value));return {metric:m,samples,active,unknown,eligible:eligible.length,stats,sle:m.sle||stats.p85,calendar:calendar(cal)};
 }
 function history(rows,m,range){
  const result=[],known=rows.filter(r=>r.visits&&(!m.types.length||m.types.includes(r.type))).map(row=>({row,index:-1,started:m.created})),starts=new Set(m.start),ends=new Set(m.end);
  for(let day=Math.floor(range.start/DAY)*DAY;day<range.end;day+=DAY){const at=Math.min(day+DAY,range.end)-1,groups={queue:[],work:[],done:[]};
   for(const item of known){const visits=item.row.visits;while(item.index+1<visits.length&&visits[item.index+1].from<=at){item.index++;if(starts.has(visits[item.index].status))item.started=true;}if(item.index<0)continue;const status=visits[item.index].status;groups[ends.has(status)?'done':item.started?'work':'queue'].push(item.row);}
   result.push({at,label:new Date(day).toISOString().slice(5,10),groups});
  }
  return result;
 }
 function histogram(samples){if(!samples.length)return [];const max=Math.max(...samples.map(s=>s.value),1),count=Math.min(10,Math.max(1,Math.ceil(Math.sqrt(samples.length)))),step=max/count;return Array.from({length:count},(_,i)=>({label:`${(i*step).toFixed(1)}–${((i+1)*step).toFixed(1)} ч`,rows:samples.filter(s=>s.value>=i*step&&(i===count-1?s.value<=max:s.value<(i+1)*step))}));}

 function sprintIds(value){
  if(value==null||value==='')return [];
  if(Array.isArray(value)){const result=[];for(const v of value){const ids=sprintIds(v);if(ids==null)return null;result.push(...ids);}return [...new Set(result)];}
  if(typeof value==='object')return /^\d+$/.test(String(value.id))?[String(value.id)]:null;
  const text=String(value);if(/^\s*\[?\s*\d+(?:\s*,\s*\d+)*\s*\]?\s*$/.test(text))return text.match(/\d+/g);
  const legacy=text.match(/(?:\[|,)id=(\d+)(?:,|\])/);return legacy?[legacy[1]]:null;
 }
 function sprintHistory(dataset){
  const start=Date.parse(dataset.sprint.startDate),end=Math.min(Date.parse(dataset.sprint.completeDate||dataset.sprint.endDate),Date.parse(dataset.loadedAt)||Date.now());
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*DAY)return [];
  const done=new Set(String(dataset.profile.doneStatuses||'').split(','));
  const sources=dataset.issues.map(row=>{const detail=dataset.details?.[row.key],issue=detail?.historyIssue;return {row,issue,field:detail?.sprintField,visits:issue&&globalThis.JbpDashboard?.timeline(issue,Math.max(end,Date.parse(dataset.loadedAt)||Date.now()))};});
  function member(source,at){
   if(!source.issue)return null;
   if(Date.parse(source.issue.fields.created)>at)return false;
   if(!source.field||!Object.hasOwn(source.issue.fields,'sprint')||source.issue.fields.sprint===undefined||!source.visits)return null;
   let ids=sprintIds(source.issue.fields.sprint);if(ids==null)return null;
   for(const h of [...source.issue.changelog.histories].sort((a,b)=>Date.parse(b.created)-Date.parse(a.created))){if(Date.parse(h.created)<=at)continue;for(const c of [...(h.items||[])].reverse())if(c.fieldId===source.field||String(c.field).toLowerCase()==='sprint'){ids=sprintIds(c.from);if(ids==null)return null;}}
   return ids.includes(String(dataset.sprint.id));
  }
  const points=[];const dates=[start];for(let day=Math.floor(start/DAY)*DAY+DAY;day<end;day+=DAY)dates.push(day-1);dates.push(end);
  for(const at of dates){let total=0,completed=0,unknown=0;const rows=[];for(const source of sources){const inSprint=member(source,at);if(inSprint==null){unknown++;continue;}if(!inSprint)continue;total++;rows.push(source.row);const visit=source.visits.filter(v=>v.from<=at).at(-1);if(!visit){unknown++;continue;}if(done.has(visit.status))completed++;}points.push({at,label:new Date(at).toISOString().slice(5,10),total:unknown?null:total,done:unknown?null:completed,remaining:unknown?null:total-completed,unknown,rows});}
  return points;
 }
 return {H,DAY,calendar,metric,profile,template,clock,intervals,summarize,calculate,history,histogram,sprintIds,sprintHistory};
})();
