(() => {
 const R=JbpRoadmap;
 R.Client=class extends JbpSprint.Client {
  async metadata(project,signal){
   const [fields,details,versions,components]=await Promise.all([this.get('api/2/field',signal),this.get('api/2/project/'+encodeURIComponent(project),signal),this.get('api/2/project/'+encodeURIComponent(project)+'/versions',signal),this.get('api/2/project/'+encodeURIComponent(project)+'/components',signal)]);
   if(!Array.isArray(fields)||!Array.isArray(details.issueTypes)||!Array.isArray(versions)||!Array.isArray(components)||components.some(c=>!/^\d+$/.test(String(c.id))||typeof c.name!=='string'))throw Error('Неизвестный формат справочников проекта Jira.');return {fields,types:details.issueTypes,versions,components,project:details};
  }
  async search(jql,fields,signal){
   const all=[],seen=new Set();let total;
   for(let startAt=0;;){const query=new URLSearchParams({jql,fields:fields.join(','),startAt:String(startAt),maxResults:'100'}),page=await this.get('api/2/search?'+query,signal);
    if(!Array.isArray(page.issues)||!Number.isInteger(page.total)||page.total>(this.issueLimit||2000)||page.total<0||startAt+page.issues.length>page.total||page.startAt!==startAt)throw Error('Нужна полная выборка не более '+(this.issueLimit||2000)+' задач. Сузьте область или измените лимит загрузки.');
    if(total!==undefined&&total!==page.total)throw Error('Состав релиза изменился во время загрузки. Обновите роадмэп.');total=page.total;
    for(const issue of page.issues){if(!R.KEY.test(issue.key||'')||!issue.fields||seen.has(issue.key))throw Error('Jira вернула повторную или некорректную задачу.');all.push(issue);seen.add(issue.key);}
    startAt+=page.issues.length;if(startAt>=total)return all;if(!page.issues.length)throw Error('Jira вернула неполную страницу задач.');
   }
  }
  async load(project,version,c,prefs,signal,progress=()=>{},componentIds=[],versionField='fixVersion',issueLimit=2000){
   if(![2000,5000].includes(issueLimit))throw Error('Допустимый лимит: 2000 или 5000 задач.');this.issueLimit=issueLimit;
   if(!['fixVersion','affectedVersion'].includes(versionField))throw Error('Выберите поле релиза из списка.');const scope=R.scope(componentIds);componentIds=scope.mode==='components'?scope.values:[];c=R.config(c);if(!/^\d+$/.test(String(version.id)))throw Error('Выберите релиз проекта.');
   const warnings=[],fields=[...new Set(['summary','timeoriginalestimate',c.storyPointsField,'status','issuetype','duedate','fixVersions','versions','issuelinks','parent',...c.columns,...c.dependencyColumns,...c.qualityColumns,c.rankField,c.teamField,c.startField,c.endField,c.sprintField,...c.levels.map(l=>l.parentField)].filter(Boolean))],order=` ORDER BY ${R.fieldJql(c.rankField)} ASC, key ASC`;
   const types=l=>l.types.map(R.quote).join(',');
   progress('Загрузка корневых задач релиза…');
   let previous=await this.search(`project = ${R.quote(project)}${scope.jql?' AND ('+scope.jql+')':''} AND ${versionField} = ${version.id} AND issuetype IN (${types(c.levels[0])})`+order,fields,signal);
   previous=previous.filter(issue=>!R.excluded(issue,c.excludeMasks));
   let parentChecks=0;const raw=previous.map(issue=>({issue,level:0,parent:''})),seen=new Set(previous.map(i=>i.key));
   for(let level=1;level<c.levels.length&&previous.length;level++){
    progress(`Загрузка уровня ${level+1} из ${c.levels.length}…`);const next=[],rule=c.levels[level],parents=new Map();for(const issue of previous){parents.set(issue.key,issue.key);if(issue.id)parents.set(String(issue.id),issue.key);}
    for(let i=0;i<previous.length;i+=25){const keys=previous.slice(i,i+25).map(x=>R.quote(x.key)).join(','),rows=await this.search(`issuetype IN (${types(rule)}) AND ${R.fieldJql(rule.parentField)} IN (${keys})`+order,fields,signal);
     const unresolved=rows.filter(issue=>!R.excluded(issue,c.excludeMasks)&&!parents.has(R.parentRef(issue.fields[rule.parentField]))),verified=new Map();
     if(unresolved.length){
      const candidates=previous.slice(i,i+25);if(parentChecks+candidates.length>100)throw Error('Jira не возвращает поля родителей: превышен лимит дополнительных проверок связи (100). Сузьте область роадмэпа.');
      progress('Проверка связей родителей через JQL…');
      for(const candidate of candidates){parentChecks++;const matches=await this.search(`issuetype IN (${types(rule)}) AND ${R.fieldJql(rule.parentField)} = ${R.quote(candidate.key)}`+order,['key'],signal),wanted=new Set(unresolved.map(x=>x.key));for(const match of matches){if(!wanted.has(match.key))continue;if(verified.has(match.key))throw Error(`${match.key}: найдены несколько родителей по выбранному полю связи.`);verified.set(match.key,candidate.key);}}
      warnings.push(`Уровень ${level+1}: для ${unresolved.length} задач выполнена дополнительная проверка связи через JQL; поле родителя отсутствует или имеет неизвестный формат.`);
     }
     for(const issue of rows){if(R.excluded(issue,c.excludeMasks))continue;const parent=parents.get(R.parentRef(issue.fields[rule.parentField]))||verified.get(issue.key);const orphanLabel=!parent?'Без родителя · '+([...new Set(previous.map(p=>p.fields.issuetype?.name).filter(Boolean))].join(' / ')||'уровень '+level):'';if(seen.has(issue.key))throw Error('Задача повторяется на нескольких уровнях. Проверьте иерархию.');seen.add(issue.key);next.push(issue);raw.push({issue,level,parent,orphanLabel});if(raw.length>issueLimit)throw Error('Превышен лимит '+issueLimit+' задач в иерархии. Сузьте область роадмэпа.');}
    }previous=next;
   }
   progress('Загрузка блокирующих задач…');const blockerKeys=[...new Set(raw.flatMap(r=>(r.issue.fields.issuelinks||[]).filter(l=>String(l.type?.inward||'').trim().toLowerCase()===c.dependency.toLowerCase()).map(l=>l.inwardIssue?.key).filter(k=>R.KEY.test(k||'')&&!seen.has(k))))];
   if(blockerKeys.length>500)throw Error('Более 500 внешних зависимостей. Уточните объём роадмэпа.');
   for(let i=0;i<blockerKeys.length;i+=50){const rows=await this.search('key IN ('+blockerKeys.slice(i,i+50).map(R.quote).join(',')+')'+order,fields,signal);for(const issue of rows)raw.push({issue,level:-1,parent:'',external:true});}
   const found=new Set(raw.map(r=>r.issue.key)),missing=blockerKeys.filter(k=>!found.has(k));if(missing.length)warnings.push('Недоступные внешние зависимости: '+missing.join(', '));
   const ids=[...new Set(raw.flatMap(r=>R.sprintIds(c.sprintField?r.issue.fields[c.sprintField]:null)))];if(ids.length>250)throw Error('Более 250 связанных спринтов. Уточните релиз или отключите Sprint в настройках роадмэпа.');
   const sprints={},queue=[...ids];progress(`Загрузка дат спринтов (${ids.length})…`);
   await Promise.all(Array.from({length:4},async()=>{while(queue.length){const id=queue.shift();try{sprints[id]=await this.get('agile/1.0/sprint/'+id,signal);}catch(e){if(signal?.aborted)throw e;warnings.push(`Sprint ${id}: ${e.message}`);}}}));
   const teams={};if(raw.length){try{const seenTeams=new Set();for(let page=1;page<=100;page++){const values=await this.get(`teams-api/1.0/team?page=${page}&size=100`,signal);if(!Array.isArray(values))throw Error('Неизвестный формат Teams');if(!values.length)break;let added=0;for(const t of values){if(t.id!=null&&!seenTeams.has(String(t.id))){seenTeams.add(String(t.id));added++;teams[String(t.id)]=String(t.title||t.name||t.id);}}if(!added)throw Error('Повторная страница Teams');if(page===100)throw Error('Слишком много Teams');}}catch(e){if(signal?.aborted)throw e;warnings.push('Названия Shared Team загружены не полностью; неизвестные команды показаны по ID.');}}
   const model=R.build(raw,c,prefs,sprints,teams,version);model.warnings=[...warnings,'Показаны доступные задачи настроенных типов. Фильтр области применяется к корневым задачам. Дочерние задачи загружаются независимо от их проекта, Component/s, Fix Version и Affects Version. Закрытые спринты не растягивают план, если есть активные/будущие; иначе используется последний закрытый.','Даты — календарные дни из Jira. Зависимость требует завершения блокера раньше дня старта задачи. Это проверка плана, не автоматический прогноз или оценка загрузки команды.'];model.versionField=versionField;model.componentIds=componentIds;model.selection=scope;model.config=c;model.rules={doneStatusNames:prefs.doneStatusNames,doneCategory:prefs.doneCategory,unblockingStatusNames:prefs.unblockingStatusNames};model.project=project;return model;
  }
 };
})();
