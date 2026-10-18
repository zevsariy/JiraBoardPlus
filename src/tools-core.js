globalThis.JbpTools = (() => {
  const rules = { estimate:'Нет оценки', description:'Нет описания', team:'Нет Team', epic:'Нет Epic', assignee:'Нет исполнителя', priority:'Нет приоритета', components:'Нет компонента', fixVersions:'Нет целевой версии', labels:'Нет меток', duedate:'Нет срока выполнения' };
  function settings(input = {}) {
    const mode=input.mode||'auto',field=input.spField||'',types=input.types||[];
    if(!['auto','points','time'].includes(mode)||field&&!/^customfield_\d+$/.test(field))throw new Error('Проверьте источник оценки и ID поля SP.');
    if(!Array.isArray(types)||types.length>100)throw new Error('Слишком много правил типов.');
    const normalized=types.map(t=>{
      if(typeof t.name!=='string'||!t.name.trim()||t.name.length>120)throw new Error('Введите название типа.');
      const checks=Object.fromEntries(Object.keys(rules).map(k=>[k,t.checks?.[k]===true]));
      return {name:t.name.trim(),checks};
    });
    if(new Set(normalized.map(t=>t.name.toLowerCase())).size!==normalized.length)throw new Error('Типы не должны повторяться.');
    return {mode,spField:field,types:normalized};
  }
  function inspect(issues, input, estimateField, epicField, teamField='customfield_10200') {
    const config=settings(input);
    return issues.map(issue=>{
      const f=issue.fields||{},type=f.issuetype?.name||'Неизвестный тип';
      const rule=config.types.find(t=>t.name.toLocaleLowerCase()===type.toLocaleLowerCase())||config.types.find(t=>t.name==='*');
      const problems=[],unknown=[];
      for(const [key,enabled]of Object.entries(rule?.checks||{})){
        if(!enabled)continue;
        const field={estimate:estimateField,description:'description',team:teamField,epic:epicField,assignee:'assignee',priority:'priority',components:'components',fixVersions:'fixVersions',labels:'labels',duedate:'duedate'}[key];
        if(!field||!Object.hasOwn(f,field)){unknown.push(rules[key]);continue;}
        const value=f[field];
        if(value==null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length)problems.push(rules[key]);
      }
      return {key:issue.key,summary:f.summary||'',type,checked:!!rule&&Object.values(rule.checks).some(Boolean),problems,unknown};
    });
  }
  function transfers(reports) {
    const sorted=[...reports].sort((a,b)=>Date.parse(a.sprint.startDate)-Date.parse(b.sprint.startDate));
    if(sorted.some(r=>!Number.isFinite(Date.parse(r.sprint.startDate))))throw new Error('У спринта нет даты старта.');
    if(new Set(sorted.map(r=>String(r.sprint.id))).size!==sorted.length)throw new Error('Повторяющиеся спринты: повторите загрузку.');
    const issues=new Map();
    for(const report of sorted)for(const row of report.rows){
      const item=issues.get(row.key)||{key:row.key,summary:row.summary,visits:[],transfers:0};
      item.visits.push({sprintId:report.sprint.id,name:report.sprint.name,state:report.sprint.state,start:report.sprint.startDate,end:report.sprint.completeDate||null,category:row.category});issues.set(row.key,item);
    }
    for(const issue of issues.values())for(let i=1;i<issue.visits.length;i++){
      const prev=issue.visits[i-1],next=issue.visits[i];
      if(prev.state==='closed'&&prev.category==='unfinished'&&next.category!=='removed'&&Number.isFinite(Date.parse(prev.end))&&Date.parse(prev.end)<=Date.parse(next.start))issue.transfers++;
    }
    return [...issues.values()].filter(i=>i.visits.length>1).sort((a,b)=>b.transfers-a.transfers||a.key.localeCompare(b.key));
  }
  function bundle(input) {
    if(!input||input.schema!=='jira-board-plus/team-profile/v1'||(input.origin!==''&&!/^https:\/\/[^/]+$/.test(input.origin||''))||JSON.stringify(input).length>1000000)throw new Error('Неверный формат, домен или размер профиля.');
    if(input.origin){let u;try{u=new URL(input.origin);}catch{throw new Error('Некорректный адрес в профиле.');}if(u.origin!==input.origin||u.username||u.password)throw new Error('Некорректный адрес в профиле.');}
    if(!Array.isArray(input.queries)||input.queries.length>100)throw new Error('Допустимо до 100 JQL-настроек.');
    const context=String(input.context||'');if(context&&!/^\/[\w/-]*$/.test(context))throw new Error('Некорректный context path.');
    const profiles=Object.entries(input.profiles||{});if(profiles.length>100)throw new Error('Допустимо до 100 досок.');
    const cleanProfiles=Object.fromEntries(profiles.map(([id,p])=>{if(!/^\d+$/.test(id))throw new Error('Некорректный ID доски.');return[id,JbpSprint.profile(p)];}));
    const visual=Object.fromEntries(Object.keys(JbpBoard.defaults).filter(k=>Object.hasOwn(input.visual||{},k)).map(k=>[k,input.visual[k]]));
    return {schema:input.schema,origin:input.origin,context,visual:JbpBoard.validate(visual),refinement:settings(input.refinement),profiles:cleanProfiles,queries:input.queries.map(q=>({...JbpReports.validate(q),enabled:false}))};
  }
  return {rules,settings,inspect,transfers,bundle};
})();
