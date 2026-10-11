(() => {
  const S = JbpSprint;
  S.Client = class {
    constructor(context = '', baseUrl = S.origin + context) {
      const u=new URL(baseUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!/^\/(?:[\w-]+\/?)*$/.test(u.pathname))throw new Error('Некорректный базовый URL Jira');
      this.baseUrl=u.origin+u.pathname.replace(/\/+$/,'');this.context=u.pathname.replace(/\/+$/,'');
    }
    async boards(project, signal) {
      if(!project)throw new Error('Укажите проект в настройках расширения.');
      return this.pages(`agile/1.0/board?projectKeyOrId=${encodeURIComponent(project)}`,signal);
    }
    async pages(path,signal) {
      const all=[];
      for(let start=0;start<10000;){
        const page=await this.get(`${path}&startAt=${start}&maxResults=50`,signal);
        if(!Array.isArray(page.values)||page.startAt!==start)throw new Error('Неизвестный формат списка Jira.');
        all.push(...page.values);start+=page.values.length;
        if(page.isLast===true||(Number.isInteger(page.total)&&start>=page.total))return all;
        if(!page.values.length)break;
      }
      throw new Error('Не удалось загрузить полный список Jira.');
    }
    async get(path, signal) {
      const res = await fetch(`${this.baseUrl}/rest/${path}`, { credentials: 'include', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: проверьте доступ к Jira и сессию входа.`);
      if (!res.headers.get('content-type')?.includes('application/json')) throw new Error('Вместо JSON получена страница входа Jira.');
      return res.json();
    }
    async sprints(boardId, signal) {
      if (!/^\d+$/.test(String(boardId))) throw new Error('Введите числовой ID доски.');
      return (await this.pages(`agile/1.0/board/${boardId}/sprint?state=active,closed`,signal)).reverse();
    }

    async load(boardId, sprintId, profile, signal) {
      if (![boardId,sprintId].every(v => /^\d+$/.test(String(v)))) throw new Error('Некорректный ID доски или спринта.');
      const [config, fields, sprint, report, statuses] = await Promise.all([
        this.get(`agile/1.0/board/${boardId}/configuration`,signal), this.get('api/2/field',signal), this.get(`agile/1.0/sprint/${sprintId}`,signal), this.get(`greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${boardId}&sprintId=${sprintId}`,signal), this.get('api/2/status',signal)
      ]);
      if (!Array.isArray(fields) || !['active','closed'].includes(sprint.state)) throw new Error('Нужен активный или завершённый спринт.');
      const estimate = S.estimation(config,fields,profile), base = S.reportRows(report);
      const resolved=JbpBoard.resolveStatusRules(statuses,profile.statusRules);
      profile=S.profile({...profile,...resolved});
      const epicField=fields.find(f=>f.schema?.custom==='com.pyxis.greenhopper.jira:gh-epic-link')?.id;
      if (base.length > 3000) throw new Error('Более 3000 задач. Выгрузка отменена, чтобы не создавать неполный файл.');
      const issues = [], details = {}, warnings = [...resolved.warnings], queue = [...base];
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (queue.length) {
          const row = queue.shift();
          try {
            const issue = await this.get(`api/2/issue/${row.key}?fields=summary,assignee,status,issuetype,priority,customfield_10200,created,description,${estimate.field||'created'}${epicField?','+epicField:''}&expand=changelog`,signal);
            const enriched = S.enrich(row,issue,estimate,sprint); enriched.flow=S.flow(issue,sprint,profile); issues.push(enriched); details[row.key] = { description: issue.fields.description ?? null, changelog: issue.changelog ?? null };
            enriched.priority=issue.fields.priority?.name??null;enriched.team=issue.fields.customfield_10200??null;enriched.epic=epicField?(issue.fields[epicField]??null):null;
            if (!enriched.historyComplete) warnings.push(`${row.key}: история неполная, исторические оценки неизвестны.`);
          } catch(error) { if (signal?.aborted) throw error; issues.push({ ...row, assigneeId: '__unknown', assignee: 'Не удалось получить', startEstimate:null, endEstimate:null, currentEstimate:null, subtask:false, error:error.message }); warnings.push(`${row.key}: ${error.message}`); }
        }
      }));
      if (issues.some(r => r.error)) warnings.push('Итоги частичные: у недоступных задач неизвестны исполнитель и тип, фильтр подзадач для них неприменим.');
      warnings.push('Исполнители и описания — текущие. История Jira не является атомарным снимком; данные могут изменяться во время загрузки.');
      return { board:{ id:String(boardId), name:config.name || `Доска ${boardId}` }, sprint, context:this.context, baseUrl:this.baseUrl, estimation:estimate, profile:S.profile(profile), issues:issues.sort((a,b)=>a.key.localeCompare(b.key)), details, warnings, loadedAt:new Date().toISOString() };
    }
  };
})();
