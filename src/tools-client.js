(() => {
  const T=JbpTools,S=JbpSprint;
  T.Client=class extends S.Client {
    async post(path,body,signal){
      const res=await fetch(`${this.baseUrl}/rest/${path}`,{method:'POST',credentials:'include',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
      if(!res.ok)throw new Error(`Jira HTTP ${res.status}: проверьте JQL, сессию и права.`);
      if(!res.headers.get('content-type')?.includes('application/json'))throw new Error('Вместо JSON получена страница входа.');
      return res.json();
    }
    async refinement({board,jql='',config,source=board?'backlog':'jql',sprint,columnIndex},signal){
      board=String(board||'');
      if(!['jql','backlog','sprint','column'].includes(source))throw new Error('Неизвестный источник анализа.');
      if(board&&!/^\d+$/.test(board))throw new Error('Выберите доску из списка.');
      if(source!=='jql'&&!board)throw new Error('Выберите доску из списка.');
      if(source==='jql'&&(!jql.trim()||jql.length>20000))throw new Error('Введите JQL до 20 000 символов.');
      if(source==='sprint'&&!/^\d+$/.test(String(sprint||'')))throw new Error('Выберите спринт.');
      config=T.settings(config);
      const [fields,boardConfig]=await Promise.all([this.get('api/2/field',signal),board?this.get(`agile/1.0/board/${board}/configuration`,signal):{}]);
      if(!Array.isArray(fields))throw new Error('Неизвестный формат полей.');
      const checkEstimate=config.types.some(t=>t.checks.estimate);
      if(checkEstimate&&config.mode==='auto'&&!board)throw new Error('Для оценок из настроек доски выберите доску.');
      if(checkEstimate&&config.mode==='auto'&&!boardConfig.estimation?.field?.fieldId)throw new Error('Jira не задала поле оценки для этой доски. Выберите Story Points или Original Time Estimate либо отключите проверку оценки.');
      const estimate=checkEstimate?S.estimation(boardConfig,fields,config):{field:null,name:'Оценки не проверяются',unit:'—'};
      let endpoint,scopeJql='',sourceLabel;
      const boardName=boardConfig.name||`#${board}`;
      if(source==='backlog'){endpoint=`agile/1.0/board/${board}/backlog`;sourceLabel=`Бэклог · ${boardName} (без активных и будущих спринтов)`;}
      if(source==='sprint'){
        if(boardConfig.type==='kanban')throw new Error('У Kanban-доски нет спринтов.');
        endpoint=`agile/1.0/board/${board}/sprint/${sprint}/issue`;
        const details=await this.get(`agile/1.0/sprint/${sprint}`,signal);sourceLabel=`Спринт «${details.name}» · ${boardName}`;
      }
      if(source==='column'){
        if(boardConfig.type!=='kanban')throw new Error('Анализ колонки доступен для Kanban-досок.');
        const column=boardConfig.columnConfig?.columns?.[Number(columnIndex)];
        if(!Number.isInteger(Number(columnIndex))||columnIndex==null||!column||!column.statuses?.length)throw new Error('Выберите колонку с настроенными статусами.');
        const ids=[...new Set(column.statuses.map(s=>String(s.id)))];
        if(ids.some(id=>!/^\d+$/.test(id)))throw new Error('Неизвестный формат статусов колонки.');
        scopeJql=`status in (${ids.join(',')})`;
        if(boardConfig.subQuery?.query)scopeJql+=` AND (${boardConfig.subQuery.query})`;
        endpoint=`agile/1.0/board/${board}/issue`;sourceLabel=`Колонка «${column.name}» · ${boardName}`;
      }
      if(source==='jql')sourceLabel=`JQL: ${jql}`;
      const epic=fields.find(f=>f.schema?.custom==='com.pyxis.greenhopper.jira:gh-epic-link')?.id;
      const requested=['summary','issuetype','description','assignee','priority','components','fixVersions','labels','duedate','customfield_10200',...(estimate.field?[estimate.field]:[]),...(epic?[epic]:[])];
      const issues=[],seen=new Set();let total;
      do {
        const start=issues.length;
        const page=source!=='jql'?await this.get(`${endpoint}?startAt=${start}&maxResults=100&fields=${requested.join(',')}${scopeJql?'&jql='+encodeURIComponent(scopeJql):''}`,signal):await this.post('api/2/search',{jql,startAt:start,maxResults:100,fields:requested},signal);
        JbpReports.pageCheck(page,start,total);if(page.warningMessages?.length)throw new Error(page.warningMessages.join(' '));total=page.total;
        for(const issue of page.issues){if(!/^[A-Z][A-Z0-9_]*-\d+$/.test(issue.key||'')||seen.has(issue.key))throw new Error('Повтор или некорректный ключ: повторите загрузку.');seen.add(issue.key);issues.push(issue);}
        if(issues.length>total)throw new Error('Выдача изменилась. Повторите проверку.');
      }while(issues.length<total);
      return {rows:T.inspect(issues,config,estimate.field,epic),total,estimate,at:new Date().toISOString(),source:sourceLabel};
    }
    async history(board,limit,signal,onProgress,detailProfile){
      if(!/^\d+$/.test(board)||!Number.isInteger(limit)||limit<2||limit>30)throw new Error('Укажите ID доски и от 2 до 30 спринтов.');
      const all=await this.sprints(board,signal);
      if(all.some(s=>!Number.isFinite(Date.parse(s.startDate))))throw new Error('У спринта нет даты старта: нельзя определить период.');
      const chosen=all.sort((a,b)=>Date.parse(b.startDate)-Date.parse(a.startDate)).slice(0,limit),reports=[];
      for(const sprint of chosen){onProgress?.(`Загрузка ${reports.length+1} / ${chosen.length}: ${sprint.name}`);const report=await this.get(`greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${board}&sprintId=${sprint.id}`,signal);reports.push({sprint,rows:S.reportRows(report)});}
      const rows=T.transfers(reports);let estimate;
      if(detailProfile){
        if(rows.length>500)throw new Error('Более 500 повторяющихся задач. Уменьшите период или отключите подробности.');
        const [config,fields]=await Promise.all([this.get(`agile/1.0/board/${board}/configuration`,signal),this.get('api/2/field',signal)]);
        estimate=S.estimation(config,fields,detailProfile);
        const queue=[...rows];let completed=0;
        await Promise.all(Array.from({length:3},async()=>{while(queue.length){const row=queue.shift();try{
          const issue=await this.get(`api/2/issue/${row.key}?fields=summary,created,status,${estimate.field}&expand=changelog`,signal);
          row.summary=issue.fields.summary||row.summary;
          const since=JbpBoard.statusSince(issue);row.status=issue.fields.status?.name||'—';row.ageHours=since==null?null:Math.max(0,(Date.now()-since)/3600000);
          row.estimates=row.visits.map(v=>({sprint:v.name,start:S.at(issue,estimate,Date.parse(v.start)),end:v.state==='closed'?S.at(issue,estimate,Date.parse(v.end)):S.at(issue,estimate,Date.now())}));
        }catch(e){if(signal.aborted)throw e;row.detailError=e.message;}onProgress?.(`История задач: ${++completed} / ${rows.length}`);}}));
      }
      return {rows,sprints:chosen,totalSprints:all.length,estimate,detailsEnabled:!!detailProfile,at:new Date().toISOString()};
    }
  };
})();
