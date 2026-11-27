/* Pure analytics. Missing history is unknown, never zero. No network or storage. */
globalThis.JbpControl = (() => {
  const DAY=86400000, keyPattern=/^[A-Z][A-Z0-9_]*-\d+$/i;
  const metrics={dueDays:'Дней до срока',idleDays:'Дней без изменений',ageDays:'Дней в статусе',percentile:'Процентиль возраста',reopens:'Возвраты из Done',blockers:'Открытые блокеры',unassigned:'Без исполнителя'};
  const defaults=[
    {name:'Срок истёк',metric:'dueDays',op:'lt',value:0,color:'#c9372c'},
    {name:'Нет изменений 3 дня',metric:'idleDays',op:'gte',value:3,color:'#b65c02'},
    {name:'Нет исполнителя',metric:'unassigned',op:'gte',value:1,color:'#8f46a4'},
    {name:'Есть блокер',metric:'blockers',op:'gte',value:1,color:'#c9372c'}
  ];
  const time=v=>{const t=Date.parse(v);return Number.isFinite(t)?t:null;};
  const name=v=>v==null?'':typeof v==='object'?String(v.name??v.title??v.value??v.id??''):String(v);
  const names=v=>(Array.isArray(v)?v:[v]).filter(v=>v!=null).map(name).sort().join(', ');
  const done=(f,c)=>c.doneNames?.length?c.doneNames.includes(f.status?.name):f.status?.statusCategory?.key==='done';
  const isDoneName=(v,c)=>c.doneNames?.includes(v)===true;
  function rules(input=defaults){
    if(!Array.isArray(input)||input.length>30)throw Error('Допустимо до 30 правил.');
    return input.map(r=>{
      if(!r||!String(r.name||'').trim()||String(r.name).length>120||!Object.hasOwn(metrics,r.metric)||!['gte','lt'].includes(r.op)||!Number.isFinite(Number(r.value))||Math.abs(Number(r.value))>100000||!/^#[0-9a-f]{6}$/i.test(r.color))throw Error('Проверьте название, порог и цвет правила.');
      return {name:String(r.name).trim(),metric:r.metric,op:r.op,value:Number(r.value),color:r.color};
    });
  }
  function history(issue){
    const c=issue.changelog,hs=c?.histories;
    const complete=Array.isArray(hs)&&Number.isInteger(c.total)&&c.total===hs.length&&(c.startAt==null||c.startAt===0)&&hs.every(h=>time(h.created)!==null&&Array.isArray(h.items));
    return {complete,events:(Array.isArray(hs)?hs:[]).flatMap(h=>(h.items||[]).map(i=>({...i,at:h.created}))).sort((a,b)=>(time(a.at)||0)-(time(b.at)||0))};
  }
  function fieldIs(e,id,label){return e.fieldId===id||e.field===id||e.field===label;}
  function sprintIds(value){if(Array.isArray(value))return [...new Set(value.flatMap(sprintIds))];if(value&&typeof value==='object')return value.id==null?[]:[String(value.id)];const text=String(value??'');const embedded=[...text.matchAll(/(?:^|[,\[])id=(\d+)/g)].map(m=>m[1]);return embedded.length?embedded:text.split(',').map(s=>s.trim()).filter(s=>/^\d+$/.test(s));}
  function sprintAt(issue,h,field,at){if(!h.complete)return null;if(time(issue.fields?.created)>at)return [];const changes=h.events.filter(e=>fieldIs(e,field,'Sprint'));const next=changes.find(e=>time(e.at)>at);if(next)return sprintIds(next.from);if(changes.length)return sprintIds(changes.at(-1).to);return Object.hasOwn(issue.fields||{},field)?sprintIds(issue.fields[field]):null;}
  function sprintSummary(snapshot,c){
    const start=time(c.sprintStart),end=Math.min(time(c.sprintEnd)??time(snapshot.at),time(snapshot.at));
    if(!c.sprintId||!c.sprintField||start===null||end<start)return null;
    const out={planned:0,completed:0,remaining:0,unknown:0,plannedEstimate:0,completedEstimate:0,unknownEstimates:0,unit:c.estimateName||c.estimateField||'Оценки не выбраны',start:c.sprintStart,end:new Date(end).toISOString()};
    const estimate=(i,h,at)=>{if(!c.estimateField)return null;const next=h.events.find(e=>fieldIs(e,c.estimateField,c.estimateName)&&time(e.at)>at),v=next?(next.fromString??next.from):i.fields[c.estimateField];return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;};
    for(const i of snapshot.issues){const h=history(i),a=sprintAt(i,h,c.sprintField,start),b=sprintAt(i,h,c.sprintField,end);if(a===null||b===null){out.unknown++;continue;}
      if(a.includes(String(c.sprintId))){out.planned++;const v=estimate(i,h,start);if(v===null)out.unknownEstimates++;else out.plannedEstimate+=v;}
      if(b.includes(String(c.sprintId))){const next=h.events.find(e=>e.field==='status'&&time(e.at)>end),status=next?next.fromString:i.fields.status?.name;if(!c.doneNames?.length){out.unknown++;continue;}if(c.doneNames.includes(status)){out.completed++;const v=estimate(i,h,end);if(v===null)out.unknownEstimates++;else out.completedEstimate+=v;}else out.remaining++;}
    }
    return out;
  }
  function analyze(snapshot,config={}){
    const now=time(snapshot.at);if(now===null||!Array.isArray(snapshot.issues))throw Error('Снимок без даты или списка задач.');
    const selectedRules=rules(config.rules),issues=snapshot.issues,byKey=new Map(issues.map(i=>[i.key,i])),events=[],edges=[],consistency=[],warnings=[];
    const rows=issues.map(issue=>{
      const f=issue.fields||{},h=history(issue),statusEvents=h.events.filter(e=>e.field==='status'),last=statusEvents.at(-1),created=time(f.created);
      const ageStart=h.complete?(last?time(last.at):created):null;
      const ageDays=ageStart===null?null:Math.max(0,(now-ageStart)/DAY);
      const reopens=h.complete&&config.doneNames?.length?statusEvents.filter(e=>isDoneName(e.fromString,config)&&!isDoneName(e.toString,config)).length:null;
      let reopenedAt=null,reworkDays=reopens===null?null:0;
      if(reopens!==null)for(const e of statusEvents){if(isDoneName(e.fromString,config)&&!isDoneName(e.toString,config))reopenedAt=time(e.at);if(isDoneName(e.toString,config)&&reopenedAt!==null){reworkDays+=(time(e.at)-reopenedAt)/DAY;reopenedAt=null;}}
      if(reopenedAt!==null)reworkDays+=Math.max(0,now-reopenedAt)/DAY;
      const returns=h.complete?statusEvents.filter((e,i)=>statusEvents.slice(0,i).some(p=>p.fromString===e.toString)).length:null;
      const blockers=[];
      for(const link of f.issuelinks||[]){
        const inward=link.inwardIssue,outward=link.outwardIssue;
        const selected=config.blockLinkIds?.length?config.blockLinkIds.includes(String(link.type?.id)):/^blocks$/i.test(link.type?.outward||'');
        if(!selected)continue;
        const from=inward?.key||issue.key,to=inward?issue.key:outward?.key;
        if(!keyPattern.test(from)||!keyPattern.test(to||''))continue;
        edges.push({from,to});
        if(inward){const target=byKey.get(from),bf=target?.fields||inward.fields||{};if(!done(bf,config)){const added=h.complete?h.events.filter(e=>['link','issuelinks'].includes(String(e.fieldId||e.field).toLowerCase())&&String(e.to)===from&&link.type?.inward&&String(e.toString).toLowerCase().includes(link.type.inward.toLowerCase())).at(-1):null;blockers.push({key:from,team:target?names(bf[config.teamField]):'',unknown:!bf.status,linkAgeDays:added?Math.max(0,(now-time(added.at))/DAY):null});}}
      }
      const row={key:issue.key,summary:f.summary||'',status:f.status?.name||'Неизвестно',type:f.issuetype?.name||'Неизвестно',team:names(f[config.teamField]),done:done(f,config),assignee:f.assignee?.displayName||'',ageDays,idleDays:time(f.updated)===null?null:Math.max(0,(now-time(f.updated))/DAY),dueDays:time(f.duedate)===null?null:Math.floor(time(f.duedate)/DAY)-Math.floor(now/DAY),reopens,reworkDays,returns,blockers,unassigned:Object.hasOwn(f,'assignee')?(f.assignee?0:1):null,historyComplete:h.complete,percentile:null,signals:[],observations:[]};
      if(reopens>0)row.observations.push(`Возвратов из завершения: ${reopens}`);
      if(returns>0)row.observations.push(`Повторных входов в прежние статусы: ${returns}`);
      if(blockers.length)row.observations.push(`Ожидание: ${blockers.map(b=>b.key).join(', ')}`);
      const start=time(config.sprintStart),end=time(config.sprintEnd)??now;
      for(const e of h.events){
        if(start===null||time(e.at)<start||time(e.at)>end)continue;
        if(config.sprintField&&config.sprintId&&fieldIs(e,config.sprintField,'Sprint')){
          const was=sprintIds(e.from).includes(String(config.sprintId)),is=sprintIds(e.to).includes(String(config.sprintId));
          if(was!==is){events.push({key:issue.key,at:e.at,kind:is?'Добавлена в спринт':'Удалена из спринта',before:e.fromString||'',after:e.toString||'',complete:h.complete});if(is&&time(e.at)>start)row.observations.push('Добавлена после старта спринта');}
        }
        if(config.estimateField&&fieldIs(e,config.estimateField,config.estimateName)&&(!config.sprintId||sprintAt(issue,h,config.sprintField,time(e.at))?.includes(String(config.sprintId))))events.push({key:issue.key,at:e.at,kind:'Изменена оценка',before:e.fromString??e.from??'',after:e.toString??e.to??'',complete:h.complete});
      }
      if(config.sprintField&&h.complete){
        const visits=new Set(sprintIds(f[config.sprintField]));
        for(const e of h.events.filter(e=>fieldIs(e,config.sprintField,'Sprint')))for(const id of [...sprintIds(e.from),...sprintIds(e.to)])visits.add(id);
        if(visits.size>1)row.observations.push(`Участвовала в ${visits.size} спринтах; это признак возможного переноса, не его причина`);
      }
      const parentKey=f.parent?.key||f[config.parentField];
      if(typeof parentKey==='string'&&keyPattern.test(parentKey)){
        const p=byKey.get(parentKey)?.fields;
        if(!p)consistency.push({key:issue.key,parent:parentKey,problem:'Родитель вне выборки — согласованность неизвестна'});
        else{
          for(const [id,label]of [[config.teamField,'Команда'],['fixVersions','Версия']])if(id&&Object.hasOwn(f,id)&&Object.hasOwn(p,id)&&names(f[id])!==names(p[id]))consistency.push({key:issue.key,parent:parentKey,problem:`${label} отличается: «${names(f[id])||'пусто'}» / «${names(p[id])||'пусто'}»`});
          if(time(f.duedate)!==null&&time(p.duedate)!==null&&time(f.duedate)>time(p.duedate))consistency.push({key:issue.key,parent:parentKey,problem:'Срок дочерней задачи позже срока родителя'});
        }
      }
      return row;
    });
    // Completed status visits, not the ages of still-open tasks, form the comparison cohort.
    const cohorts=new Map();
    for(const issue of issues){const h=history(issue);if(!h.complete)continue;let at=time(issue.fields?.created);for(const e of h.events.filter(e=>e.field==='status')){const k=`${issue.fields?.issuetype?.name||'Неизвестно'}\0${e.fromString}`;if(at!==null&&time(e.at)>=at){const a=cohorts.get(k)||[];a.push((time(e.at)-at)/DAY);cohorts.set(k,a);}at=time(e.at);}}
    for(const r of rows){const cohort=cohorts.get(`${r.type}\0${r.status}`)||[];r.cohortSize=cohort.length;if(r.ageDays!==null&&cohort.length>=5)r.percentile=100*cohort.filter(d=>d<=r.ageDays).length/cohort.length;
      if(!r.done)for(const rule of selectedRules){const v=rule.metric==='blockers'?r.blockers.length:r[rule.metric];if(v!==null&&v!==undefined&&(rule.op==='gte'?v>=rule.value:v<rule.value))r.signals.push({...rule,actual:v,reason:`${rule.name}: ${metrics[rule.metric]} = ${Math.round(v*10)/10}; порог ${rule.op==='gte'?'≥':'<'} ${rule.value}`});}
    }
    const uniqueEdges=[...new Map(edges.map(e=>[`${e.from}>${e.to}`,e])).values()],dependencyProblems=[];
    const adjacency=new Map();for(const e of uniqueEdges){const a=adjacency.get(e.from)||[];a.push(e.to);adjacency.set(e.from,a);const aF=byKey.get(e.from)?.fields,bF=byKey.get(e.to)?.fields;
      if(!aF||!bF)dependencyProblems.push({...e,problem:'Конец связи вне выборки: проверка неполная'});
      else if(!aF.duedate||!bF.duedate)dependencyProblems.push({...e,problem:'Не задан срок одной из задач'});
      else if(time(aF.duedate)>time(bF.duedate))dependencyProblems.push({...e,problem:'Блокирующая задача запланирована позже зависимой'});
    }
    // Iterative DFS avoids stack overflow on large chains.
    const color=new Map(),cycles=[];for(const root of adjacency.keys()){if(color.has(root))continue;const stack=[{key:root,index:0}];color.set(root,1);while(stack.length){const node=stack.at(-1),children=adjacency.get(node.key)||[];if(node.index===children.length){color.set(node.key,2);stack.pop();continue;}const child=children[node.index++];if(color.get(child)===1){cycles.push({from:node.key,to:child,problem:'Циклическая зависимость'});}else if(!color.has(child)){color.set(child,1);stack.push({key:child,index:0});}}}
    dependencyProblems.push(...cycles);
    const queues=[...new Set(rows.filter(r=>!r.done).map(r=>r.status))].map(status=>{const group=rows.filter(r=>!r.done&&r.status===status),ages=group.map(r=>r.ageDays).filter(v=>v!==null).sort((a,b)=>a-b);return {status,count:group.length,knownAges:ages.length,medianDays:ages.length?ages[Math.floor((ages.length-1)/2)]:null,stale:group.filter(r=>r.percentile!==null&&r.percentile>=85).length};}).sort((a,b)=>b.stale-a.stale||b.count-a.count);
    if(snapshot.partial)warnings.push('Выборка частичная: итоги относятся только к загруженным задачам.');
    const missing=rows.filter(r=>!r.historyComplete).length;if(missing)warnings.push(`Без полной истории: ${missing}. Возраст и возвраты для них неизвестны.`);
    if(!config.doneNames?.length)warnings.push('Для анализа возвратов укажите названия завершённых статусов.');
    return {at:snapshot.at,rows,events:events.sort((a,b)=>time(a.at)-time(b.at)),queues,dependencyProblems,consistency,warnings,edges:uniqueEdges,sprint:sprintSummary(snapshot,config),counts:{total:rows.length,done:rows.filter(r=>r.done).length,risk:rows.filter(r=>r.signals.length).length,history:rows.length-missing}};
  }
  function diff(previous,current){
    if(!previous)return {available:false,added:[],removed:[],changed:[]};
    if(previous.baseUrl!==current.baseUrl||previous.account!==current.account||previous.jql!==current.jql)throw Error('Снимки должны относиться к одной Jira, учётной записи и JQL.');
    const a=new Map(previous.issues.map(i=>[i.key,i])),b=new Map(current.issues.map(i=>[i.key,i])),changed=[];
    for(const [key,i]of b){if(!a.has(key))continue;const fields=[];for(const f of ['status','assignee','duedate','fixVersions','timeoriginalestimate','description'])if(JSON.stringify(a.get(key).fields?.[f])!==JSON.stringify(i.fields?.[f]))fields.push(f);if(fields.length)changed.push({key,fields});}
    return {available:true,from:previous.at,to:current.at,partial:!!(previous.partial||current.partial),added:[...b.keys()].filter(k=>!a.has(k)),removed:[...a.keys()].filter(k=>!b.has(k)),changed};
  }
  function forecast(snapshot,config,remaining,days=28,runs=2000,random=Math.random){
    if(!Number.isInteger(remaining)||remaining<1||remaining>5000||!Number.isInteger(days)||days<7||days>90||!Number.isInteger(runs)||runs<100||runs>10000)throw Error('Проверьте остаток (1–5000), историю (7–90 дней) и число симуляций.');
    if(snapshot.partial)throw Error('Прогноз недоступен для частичной выборки.');
    const end=new Date(snapshot.at);end.setUTCHours(0,0,0,0);const start=end.getTime()-days*DAY,counts=Array(days).fill(0);
    for(const i of snapshot.issues){if(!done(i.fields||{},config))continue;const t=time(i.fields?.resolutiondate);if(t!==null&&t>=start&&t<end.getTime())counts[Math.floor((t-start)/DAY)]++;}
    const completed=counts.reduce((a,b)=>a+b,0);if(completed<5)throw Error('Нужно хотя бы 5 завершений за выбранные полные календарные дни. Расширьте JQL или период.');
    const durations=[];for(let n=0;n<runs;n++){let left=remaining,d=0;while(left>0&&d<3650){left-=counts[Math.floor(random()*counts.length)];d++;}durations.push(left>0?Infinity:d);}durations.sort((a,b)=>a-b);
    const result={remaining,days,runs,completed,dailyCounts:counts,unit:'Количество задач; календарные дни UTC',assumptions:'Неизменный поток и состав работы, независимая выборка суточных завершений с возвращением. JQL должен включать завершённые задачи той же команды. Добавление новых задач и зависимости не моделируются.'};
    for(const p of [50,85,95]){const d=durations[Math.ceil(runs*p/100)-1];result['p'+p]=Number.isFinite(d)?{days:d,date:new Date(time(snapshot.at)+d*DAY).toISOString().slice(0,10)}:null;}return result;
  }
  function meeting(mode,analysis,snapshot,delta){
    const titles={daily:'Daily',refinement:'Refinement',review:'Sprint review',retro:'Ретроспектива',management:'Сводка руководителю'};
    const lines=[`# ${titles[mode]||'Сводка'}`,`Снимок: ${snapshot.at}`,`JQL: ${snapshot.jql}`,`Выборка: ${analysis.counts.total}; завершено сейчас: ${analysis.counts.done}; с сигналами: ${analysis.counts.risk}.`,...analysis.warnings.map(w=>'Ограничение: '+w),''];
    const list=(title,items)=>{lines.push(`## ${title}`,...(items.length?items:['Нет наблюдений в загруженной выборке.']),'');};
    if(mode==='daily'){list('Изменения между снимками',delta?.available?[`Появились: ${delta.added.join(', ')||'—'}`,`Вышли из выдачи: ${delta.removed.join(', ')||'—'}`,...delta.changed.map(c=>`${c.key}: ${c.fields.join(', ')}`)]:['Сохраните предыдущий и текущий снимки одной выборки.']);list('Обсудить',analysis.rows.filter(r=>r.signals.length).map(r=>`${r.key} — ${r.signals.map(s=>s.reason).join('; ')}`));}
    if(mode==='refinement')list('Проверить перед планированием',snapshot.issues.filter(i=>!done(i.fields||{},snapshot.config||{})).map(i=>{const f=i.fields||{},problems=[];if(!f.description)problems.push('нет описания');if(!f.assignee)problems.push('нет исполнителя');if(snapshot.config?.estimateField&&f[snapshot.config.estimateField]==null)problems.push('нет оценки');return problems.length?`${i.key}: ${problems.join(', ')}`:null;}).filter(Boolean));
    if(mode==='review'){if(analysis.sprint){const s=analysis.sprint;list('План и факт по истории выбранного спринта',[`План на старте: ${s.planned} задач; завершено и остаётся в спринте на конец периода: ${s.completed}; незавершено: ${s.remaining}.`,`Неизвестное участие/завершение: ${s.unknown}. Суммы известных оценок: план ${s.plannedEstimate}, завершено ${s.completedEstimate}; отсутствующих оценок: ${s.unknownEstimates}. Единицы: ${s.unit}.`,`Период: ${s.start} — ${s.end}. Задачи, исключённые JQL, не входят в расчёт.`]);}else lines.push('Для плана/факта укажите поле, ID, начало спринта и загрузите историю.');list('Завершённые результаты в выборке',analysis.rows.filter(r=>r.done).map(r=>`${r.key}: ${r.summary}`));list('Изменение плана',analysis.events.map(e=>`${e.at} · ${e.key}: ${e.kind} (${e.before} → ${e.after})`));list('Открытые задачи',analysis.rows.filter(r=>!r.done).map(r=>`${r.key}: ${r.status}`));lines.push('Текущий Done сам по себе не доказывает завершение в этом спринте.');}
    if(mode==='retro'){list('Возвраты и признаки переносов',analysis.rows.filter(r=>r.observations.length).map(r=>`${r.key}: ${r.observations.join('; ')}`));list('Кандидаты на узкое место',analysis.queues.map(q=>`${q.status}: очередь ${q.count}; возраст известен у ${q.knownAges}; медиана ${q.medianDays===null?'неизвестна':q.medianDays.toFixed(1)+' дн.'}`));lines.push('Вопросы: что вызвало ожидание? Какие изменения процесса проверить в следующем периоде?');}
    if(mode==='management'){list('Риски и необходимые решения',analysis.rows.filter(r=>r.signals.length).map(r=>`${r.key}: ${r.signals.map(s=>s.reason).join('; ')}. Решение/ответственный: определить.`));list('Проблемы зависимостей',analysis.dependencyProblems.map(e=>`${e.from} → ${e.to}: ${e.problem}`));}
    return lines.join('\n');
  }
  return {DAY,metrics,defaults,rules,history,analyze,diff,forecast,meeting,time,names};
})();
