globalThis.JbpBoard = (() => {
  const defaults = { teamField: 'customfield_10200', parentBoard: false, parentBacklog: false, parentTypes: "Task, Story", epicLinkField: "Epic Link", componentLinkField: "Parent Link", epicFields: "", componentFields: "", privateNotes: false, backlog: false, build: false, blockedStatusNames: 'Blocked', unblockingStatusNames: 'Done, Closed, Resolved, Obsolete', buildStatusNames: 'Resolved', buildField: 'Fixed In', visuals: true, sprintTools: false, sprintExport: true, sprintAssignee: true, sprintMetrics: true, sprintHealth: true, team: true, summary: true, stale: true, unassigned: true, overdue: true, flagged: true, daily: false, scope: false, scopeOutline: true, scopeLabel: true, scopeFill: false, fillColor: '#f0eaff', borderWidth: 2, age: false, agePopup: true, color: '#8b5cf6', staleDays: 3, source: 'timepiece', calendar: 'normalHours', timeUnit: 'hours', timeMode: 'last', workStatusNames: 'In Progress', doneStatusNames: 'Done, Closed, Resolved, Obsolete', doneCategory: true };
  function validate(input) {
    const p = { ...defaults, ...input };
    p.teamField = String(p.teamField).trim();
    if (!/^customfield_\d+$/.test(p.teamField)) throw Error('Поле Team: укажите ID вида customfield_10107.');
    for(const k of ['parentTypes','epicLinkField','componentLinkField','epicFields','componentFields']){if(typeof p[k]!=='string'||p[k].length>4000)throw Error('Настройки родительских полей: допустим текст до 4000 символов.');p[k]=p[k].trim();}
    if(parentList(p.epicFields).length+parentList(p.componentFields).length>20)throw Error('Выберите не более 20 родительских полей.');
    if((p.parentBoard||p.parentBacklog)&&(!p.parentTypes||!p.epicLinkField||(!p.epicFields&&!p.componentFields)||(p.componentFields&&!p.componentLinkField)))throw Error('Укажите типы карточек, поля связи и хотя бы одно поле родителя.');
    if (!/^#[0-9a-f]{6}$/i.test(p.color)) throw new Error('Выберите цвет подсветки.');
    if (!/^#[0-9a-f]{6}$/i.test(p.fillColor)) throw new Error('Выберите цвет заливки.');
    p.borderWidth = Number(p.borderWidth);
    if (!Number.isInteger(p.borderWidth) || p.borderWidth < 1 || p.borderWidth > 8) throw new Error('Толщина рамки: от 1 до 8 px.');
    p.staleDays = Number(p.staleDays);
    if (!Number.isInteger(p.staleDays) || p.staleDays < 1 || p.staleDays > 365) throw new Error('Порог: от 1 до 365 дней.');
    if (!['jira', 'timepiece'].includes(p.source)) throw new Error('Неизвестный источник времени.');
    if(!['hours','days','weeks'].includes(p.timeUnit))throw new Error('Единицы времени: часы, дни или недели.');
    if(!['last','total'].includes(p.timeMode))throw new Error('Режим времени: текущий визит или сумма визитов.');
    for(const key of ['workStatusNames','doneStatusNames','blockedStatusNames','unblockingStatusNames','buildStatusNames']){
      if(typeof p[key]!=='string'||p[key].length>2000)throw new Error('Введите названия статусов через запятую (до 2000 символов).');
      p[key]=[...new Map(p[key].split(',').map(s=>s.trim()).filter(Boolean).map(s=>[normalized(s),s])).values()].join(', ');
    }
    const work=p.workStatusNames.split(',').map(normalized).filter(Boolean),done=p.doneStatusNames.split(',').map(normalized).filter(Boolean);
    if(work.some(name=>done.includes(name)))throw new Error('Один статус не может одновременно быть рабочим и завершённым.');
    p.buildField=String(p.buildField??'').trim();
    if(!p.buildField||p.buildField.length>200)throw new Error('Укажите название или ID поля билда (до 200 символов).');
    p.calendar = String(p.calendar).trim();
    if (!/^(normalHours|\d+)$/.test(p.calendar)) throw new Error('Календарь: normalHours, 0 или ID календаря Timepiece.');
    for (const key of Object.keys(defaults)) if (typeof defaults[key] === 'boolean') p[key] = !!p[key];
    return p;
  }
  function duration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '?';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}м`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}ч ${minutes % 60}м` : `${Math.floor(hours / 24)}д ${hours % 24}ч`;
  }
  function statusSince(issue) {
    const log = issue.changelog;
    if (!log || !Array.isArray(log.histories) || log.startAt !== 0 || log.total !== log.histories.length) return null;
    const changes = log.histories.flatMap(h => (h.items || []).filter(i => i.field === 'status').map(item => ({ item, time: Date.parse(h.created) }))).sort((a, b) => b.time - a.time);
    if (changes.some(c => !Number.isFinite(c.time))) return null;
    if (changes.length) return String(changes[0].item.to) === String(issue.fields.status?.id) ? changes[0].time : null;
    const created = Date.parse(issue.fields.created); return Number.isFinite(created) ? created : null;
  }
  const normalized = value => String(value ?? '').trim().toLocaleLowerCase();
  function statusRules(input = defaults){
    const p=validate(input);return {workStatusNames:p.workStatusNames,doneStatusNames:p.doneStatusNames,doneCategory:p.doneCategory};
  }
  function resolveStatusRules(statuses,input){
    if(!Array.isArray(statuses)||statuses.some(s=>!s?.id||typeof s.name!=='string'))throw new Error('Неизвестный формат справочника статусов Jira.');
    const rules=statusRules(input),work=rules.workStatusNames.split(',').map(normalized).filter(Boolean);
    const workMatches=statuses.filter(s=>work.includes(normalized(s.name))),doneMatches=statuses.filter(s=>isDone(s,rules));
    if(workMatches.some(s=>doneMatches.some(d=>String(d.id)===String(s.id))))throw new Error('Рабочий статус также считается завершённым. Проверьте общие названия статусов и галочку категории Done.');
    const names=new Set(statuses.map(s=>normalized(s.name))),warnings=[];
    for(const [label,text] of [['Рабочие',rules.workStatusNames],['Завершённые',rules.doneStatusNames]]){const missing=text.split(',').map(s=>s.trim()).filter(s=>s&&!names.has(normalized(s)));if(missing.length)warnings.push(`${label} статусы не найдены в Jira: ${missing.join(', ')}.`);}
    if(!workMatches.length||!doneMatches.length)warnings.push('Cycle time и возвраты из завершённых статусов недоступны: настройте рабочие и завершённые статусы в меню расширения.');
    return {workStatuses:[...new Set(workMatches.map(s=>String(s.id)))].join(','),doneStatuses:[...new Set(doneMatches.map(s=>String(s.id)))].join(','),statusRules:rules,warnings};
  }
  function isDone(status, prefs = defaults) {
    return (!!prefs.doneCategory && status?.statusCategory?.key === 'done') || String(prefs.doneStatusNames ?? defaults.doneStatusNames).split(',').map(normalized).filter(Boolean).includes(normalized(status?.name));
  }
  function daily(issue, staleDays, now = Date.now(), prefs = defaults) {
    const f = issue.fields, tags = [];
    if(isDone(f.status,prefs))return tags;
    const updated = Date.parse(f.updated);
    if (Number.isFinite(updated) && now - updated >= staleDays * 86400000) tags.push({ type:'stale', text: `Без обновл. ${duration(now - updated)}`, title: 'С момента обновления задачи в Jira; это не время последнего перехода статуса.' });
    if(Object.hasOwn(f,'assignee') && (!f.assignee || ![f.assignee.key,f.assignee.name,f.assignee.accountId,f.assignee.id].some(v=>v!=null && String(v).trim() && String(v)!=='-1')))tags.push({type:'unassigned',text:'Нет исполнителя',title:'Задача не назначена.'});
    if (f.duedate && /^\d{4}-\d{2}-\d{2}$/.test(f.duedate) && now >= new Date(`${f.duedate}T00:00:00`).getTime() + 86400000) tags.push({ type:'overdue',text: 'Просрочено', title: `Срок задачи: ${f.duedate}` });
    return tags;
  }
  function matchesStatus(status,names){return String(names).split(',').map(normalized).filter(Boolean).includes(normalized(status?.name));}
  function resolveBuildField(fields,name){
    if(!Array.isArray(fields))throw new Error('Справочник полей Jira недоступен.');
    const found=fields.filter(f=>normalized(f.id)===normalized(name)||normalized(f.name)===normalized(name));
    if(found.length!==1)throw new Error(`Поле «${name}»: ${found.length?'найдено несколько, укажите ID в настройках':'не найдено'}.`);
    if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(found[0].id))throw new Error('Некорректный ID поля билда.');
    return found[0].id;
  }
  function hasBuild(issue,field,prefs=defaults){
    if(!matchesStatus(issue.fields?.status,prefs.buildStatusNames??defaults.buildStatusNames))return false;
    if(!Object.hasOwn(issue.fields,field))throw new Error('Jira не вернула поле билда: значение неизвестно.');
    const filled=v=>v!=null&&(typeof v==='string'?!!v.trim():Array.isArray(v)?v.some(filled):typeof v==='object'?Object.values(v).some(filled):v!==false);
    return filled(issue.fields[field]);
  }
  function blockerKeys(issue,prefs=defaults){
    if(!matchesStatus(issue.fields?.status,prefs.blockedStatusNames??defaults.blockedStatusNames))return [];
    if(!Array.isArray(issue.fields.issuelinks))throw new Error('Jira не вернула связи блокировки.');
    const keys=[];
    for(const link of issue.fields.issuelinks){
      if(link.inwardIssue && normalized(link.type?.inward)==='is blocked by')keys.push(link.inwardIssue.key);
      if(link.outwardIssue && normalized(link.type?.outward)==='is blocked by')keys.push(link.outwardIssue.key);
    }
    if(keys.some(k=>! /^[A-Z][A-Z0-9_]*-\d+$/.test(k||'')))throw new Error('Неизвестный ключ блокирующей задачи.');
    return [...new Set(keys)];
  }
  function blockage(blockers,prefs=defaults){
    if(!blockers.length)return null;
    const unresolved=blockers.filter(b=>!b.error && b.status && !matchesStatus(b.status,prefs.unblockingStatusNames??defaults.unblockingStatusNames));
    const unknown=blockers.filter(b=>b.error || !b.status);
    return {type:'flagged',text:unresolved.length?'ЗАБЛОКИРОВАНА':unknown.length?'БЛОКИРОВКА: ?':'РАЗБЛОКИРОВАНА',tone:unresolved.length?'blocked':unknown.length?'unknown':'unblocked',title:blockers.map(b=>`${b.key}: ${b.error||b.status?.name||'Статус неизвестен'}`).join('\n')};
  }
  function formatHours(hours,unit='hours'){
    if(hours==null||!Number.isFinite(hours)||hours<0)return '—';
    const divisor={hours:1,days:24,weeks:168}[unit];
    if(!divisor)throw new Error('Неизвестная единица времени.');
    return `${hours>0&&hours/divisor<0.005?'< 0,01':(hours/divisor).toLocaleString('ru-RU',{maximumFractionDigits:2})} ${{hours:'ч',days:'д',weeks:'нед'}[unit]}`;
  }
  function jiraTimes(issue,mode='last',now=Date.now()){
    const h=issue.changelog,f=issue.fields,created=Date.parse(f.created);
    if(!h||h.startAt!==0||!Array.isArray(h.histories)||h.total!==h.histories.length||!Number.isFinite(created)||created>now||!f.status?.id)throw new Error('Jira вернула неполную историю: время неизвестно.');
    const changes=h.histories.flatMap(e=>(e.items||[]).filter(i=>i.field==='status').map(i=>({...i,at:Date.parse(e.created)}))).sort((a,b)=>a.at-b.at);
    if(changes.some(c=>!Number.isFinite(c.at)||c.at<created||c.at>now||c.from==null||c.to==null))throw new Error('Некорректная история статусов.');
    let id=String(changes[0]?.from??f.status.id),name=changes[0]?.fromString||f.status.name||id,since=created;
    const visits=new Map();
    function add(end){const prior=visits.get(id)||{id,name,total:0,last:0};prior.name=name;prior.last=(end-since)/3600000;prior.total+=prior.last;visits.set(id,prior);}
    for(const c of changes){if(String(c.from)!==id)throw new Error('История переходов не согласована.');add(c.at);id=String(c.to);name=c.toString||id;since=c.at;}
    if(id!==String(f.status.id))throw new Error('Текущий статус не совпадает с историей.');add(now);
    return [...visits.values()].map(v=>({id:v.id,name:v.name,current:v.id===id,hours:mode==='total'?v.total:v.last}));
  }
  function addedKeys(report) {
    const raw = report.contents?.issueKeysAddedDuringSprint;
    if (Array.isArray(raw) && raw.every(k => typeof k === 'string')) return new Set(raw);
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.values(raw).every(v => typeof v === 'boolean')) return new Set(Object.keys(raw).filter(k => raw[k]));
    throw new Error('Sprint Report: неизвестный формат добавленных задач.');
  }
  function timepieceHours(cell,format='hours'){
    if(cell && /^\d+(\.\d+)?$/.test(String(cell.raw)))return Number(cell.raw)/3600000;
    if(!cell || !/^\d+(\.\d+)?$/.test(String(cell.value)))return null;
    const multiplier={hours:1,days:24,minutes:1/60,seconds:1/3600,milliseconds:1/3600000}[format];
    return multiplier==null?null:Number(cell.value)*multiplier;
  }
  function timepieceStatuses(data,key,statusId,mode='last',unit='hours'){
    if(data.multiVisitBehavior && data.multiVisitBehavior!==mode)throw new Error('Timepiece вернул другой режим визитов.');
    if(data.calendar?.calendarSuccessfullyLoaded===false)throw new Error('Timepiece не смог загрузить выбранный календарь.');
    const row=data.table?.body?.rows?.find(r=>r.headerColumns?.some(c=>c.id==='issuekey'&&normalized(c.value)===normalized(key)));
    if(!Array.isArray(row?.valueColumns))throw new Error('Timepiece: задача не найдена в ответе.');
    const names=new Map((data.table.header?.valueColumns||[]).map(c=>[String(c.id),String(c.value)]));
    const values=row.valueColumns.map(cell=>{
      const current=String(cell.id)===String(statusId);
      let hours=timepieceHours(cell,data.viewFormat||'hours');
      // Outside working hours Timepiece may omit the duration but explicitly report a zero current state.
      const state=current&&Array.isArray(row.currentState)?row.currentState.find(s=>String(s.id)===String(statusId)):null;
      if(hours==null&&current&&String(cell.count)==='0'&&timepieceHours(state,data.viewFormat||'hours')===0)hours=0;
      return {id:String(cell.id),name:names.get(String(cell.id))||(current?'Текущий статус':`Статус ${cell.id}`),current,hours,text:formatHours(hours,unit)};
    });
    if(!values.some(v=>v.current&&v.hours!=null))throw new Error('Timepiece: длительность текущего статуса не найдена или формат ответа отличается.');
    return values;
  }
  function timepieceValue(data,key,statusId,mode='last',unit='hours'){return timepieceStatuses(data,key,statusId,mode,unit).find(v=>v.current).text.replace(' ч','ч');}
  function parentList(value){return [...new Set(String(value||'').split(/[\n,]/).map(v=>v.trim()).filter(Boolean))];}
  function parentKey(value){if(value==null||value==='')return null;const v=typeof value==='object'?(value.key||value.data?.key):value;if(!/^[A-Z][A-Z0-9_]*-\d+$/.test(v||''))throw Error('Неизвестный формат ссылки на родителя.');return v;}
  function parentText(value){if(value==null||value==='')return 'Не заполнено';if(Array.isArray(value))return value.length?value.map(parentText).join(', '):'Не заполнено';if(typeof value==='object'){for(const k of ['displayName','name','value','key'])if(value[k]!=null)return parentText(value[k]);return JSON.stringify(value);}return String(value);}
  function parentConfig(fields,p){const resolve=name=>{const id=resolveBuildField(fields,name);return {id,name:fields.find(f=>f.id===id).name};};return {epic:resolve(p.epicLinkField).id,component:p.componentFields?resolve(p.componentLinkField).id:null,epicFields:parentList(p.epicFields).map(resolve),componentFields:parentList(p.componentFields).map(resolve)};}
  async function parentInfo(issue,p,c,fetchParent){
    if(!matchesStatus({name:issue.fields.issuetype?.name},p.parentTypes))return null;
    const lines=[];let current=issue;
    for(const [label,link,fields] of [['Epic',c.epic,c.epicFields],['Component',c.component,c.componentFields]]){
      if(!link)break;
      if(!Object.hasOwn(current.fields,link)){lines.push(label+': поле связи недоступно');break;}
      const key=parentKey(current.fields[link]);if(!key){lines.push(label+': родитель не назначен');break;}
      if(key===issue.key||key===current.key){lines.push(label+': цикл родительских связей');break;}
      try{current=await fetchParent(key);}catch(e){lines.push(label+' · '+key+': '+e.message);break;}
      lines.push(label+' · '+key);
      for(const field of fields)lines.push(field.name+': '+(Object.hasOwn(current.fields,field.id)?parentText(current.fields[field.id]):'Поле недоступно'));
    }
    return lines.join('\n');
  }
  return {parentList,parentKey,parentText,parentConfig,parentInfo,defaults,validate,resolveBuildField,hasBuild,statusRules,resolveStatusRules,duration,statusSince,daily,isDone,blockerKeys,blockage,formatHours,jiraTimes,addedKeys,timepieceValue,timepieceStatuses};
})();
