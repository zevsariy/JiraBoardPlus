(() => {
 JbpDashboard.load=async(client,board,prefs,range,signal)=>{
  const [config,statuses]=await Promise.all([client.get(`agile/1.0/board/${board.id}/configuration`,signal),client.get('api/2/status',signal)]);
  if(!/^\d+$/.test(String(config.filter?.id)))throw Error('Jira не вернула ID фильтра доски. Обзор недоступен.');
  const resolved=JbpBoard.resolveStatusRules(statuses,prefs),done=resolved.doneStatuses;
  // Query current board membership. Widen the date by a day for Jira/browser timezone differences.
  const since=new Date(range.start-JbpDashboard.D).toISOString().slice(0,10);
  const jql=`filter = ${config.filter.id}${done?` AND (status NOT IN (${done}) OR updated >= "${since}")`:''} ORDER BY key ASC`;
  const issues=[],seen=new Set();let total;
  for(let startAt=0;;){
   const query=new URLSearchParams({jql,startAt:String(startAt),maxResults:'100',fields:'summary,status,issuetype,assignee,created,issuelinks',expand:'changelog'});
   const page=await client.get('api/2/search?'+query,signal);
   if(!Array.isArray(page.issues)||page.startAt!==startAt||!Number.isInteger(page.total)||page.total>3000)throw Error('Нужен полный список не более 3000 задач. Сузьте фильтр доски или период.');
   if(total!==undefined&&total!==page.total)throw Error('Состав выборки изменился во время загрузки. Повторите обновление.');total=page.total;
   for(const i of page.issues){if(!i.fields||seen.has(i.key)||!/^[A-Z][A-Z0-9_]*-\d+$/i.test(i.key||''))throw Error('Некорректная или повторная задача в ответе Jira.');seen.add(i.key);issues.push(i);}
   startAt+=page.issues.length;if(startAt>=total)break;if(!page.issues.length)throw Error('Jira вернула неполный список.');
  }
  const now=Date.now(),rows=JbpDashboard.rows(issues,statuses,prefs,range,now);
  return {board,range,loadedAt:new Date(now).toISOString(),rows,statuses,rules:resolved,warnings:[...resolved.warnings,'Исторические показатели относятся к текущему фильтру доски. Удалённые и ушедшие из фильтра задачи недоступны; дата создания не равна дате попадания на доску.','История из Jira может быть усечена. Такие задачи входят в текущие счётчики, но исключаются из времени прохождения и завершений. Исторический WIP и рост очереди не реконструируются.']};
 };
})();
