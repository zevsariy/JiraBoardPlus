globalThis.JbpSprint = (() => {
  const origin = globalThis.location?.protocol==='https:' ? location.origin : '';
  const groups = { completedIssues: 'completed', issuesNotCompletedInCurrentSprint: 'unfinished', puntedIssues: 'removed', issuesCompletedInAnotherSprint: 'completedElsewhere' };
  const labels = { completed: 'Завершены', unfinished: 'Не завершены', removed: 'Удалены из спринта', completedElsewhere: 'Завершены в другом спринте' };
  const defaults = { mode: 'auto', spField: '', includeSubtasks: false, workStatuses: '', doneStatuses: '' };
  function profile(input) {
    const p = { ...defaults, ...input };
    if (!['auto', 'points', 'time', 'none'].includes(p.mode)) throw new Error('Выберите SP, Original Time Estimate или настройку доски.');
    if (p.spField && !/^customfield_\d+$/.test(p.spField)) throw new Error('Поле SP: customfield_12345.');
    for(const field of ['workStatuses','doneStatuses'])if(p[field]&&!/^\d+(\s*,\s*\d+)*$/.test(p[field]))throw new Error('Статусы: числовые ID через запятую.');
    return { mode: p.mode, spField: p.spField, includeSubtasks: !!p.includeSubtasks, workStatuses:p.workStatuses, doneStatuses:p.doneStatuses, ...(p.statusRules?{statusRules:globalThis.JbpBoard.statusRules(p.statusRules)}:{}) };
  }
  function estimation(config, fields, input) {
    const p = profile(input); if(p.mode==='none'||(p.mode==='auto'&&config.estimation?.type==='issueCount'))return {field:null,name:'Без оценок',unit:'count',rawUnit:'count',divisor:1}; const configured = config.estimation?.field?.fieldId;
    let field = p.mode === 'time' ? 'timeoriginalestimate' : p.mode === 'points' ? p.spField : configured;
    if (!field && p.mode === 'points') {
      const candidates = fields.filter(f => /^story points?$/i.test(f.name));
      if (candidates.length === 1) field = candidates[0].id;
    }
    if (field !== 'timeoriginalestimate' && !/^customfield_\d+$/.test(field || '')) throw new Error('Поле оценки не определено. Выберите Original Time Estimate или укажите ID поля Story Points.');
    const meta = fields.find(f => f.id === field);
    if (field !== 'timeoriginalestimate' && p.mode === 'auto' && !/^story points?$/i.test(meta?.name || config.estimation?.field?.displayName || '')) throw new Error('На доске нестандартное поле оценки. Явно выберите SP и ID поля либо Original Time Estimate.');
    return { field, name: field === 'timeoriginalestimate' ? 'Original Time Estimate' : (meta?.name || 'Story Points'), unit: field === 'timeoriginalestimate' ? 'h' : 'SP', rawUnit: field === 'timeoriginalestimate' ? 'seconds' : 'points', divisor: field === 'timeoriginalestimate' ? 3600 : 1 };
  }
  function numeric(value) { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; }
  function at(issue, estimate, date) {
    if(estimate.unit==='count')return Number.isFinite(date)&&Number.isFinite(Date.parse(issue.fields.created))&&Date.parse(issue.fields.created)<=date?1:null;
    const log = issue.changelog;
    if (!Number.isFinite(date) || !log || log.startAt !== 0 || !Array.isArray(log.histories) || log.total !== log.histories.length || !(estimate.field in issue.fields)) return null;
    if (!Number.isFinite(Date.parse(issue.fields.created)) || Date.parse(issue.fields.created) > date) return null;
    let value = numeric(issue.fields[estimate.field]);
    const names = [estimate.field, estimate.name, ...(estimate.field === 'timeoriginalestimate' ? ['Original Estimate', 'Time Original Estimate'] : [])].map(s => s.toLowerCase());
    if (log.histories.some(h => !Number.isFinite(Date.parse(h.created)))) return null;
    for (const h of [...log.histories].sort((a,b) => Date.parse(b.created)-Date.parse(a.created))) {
      if (Date.parse(h.created) <= date) continue;
      for (const change of [...(h.items || [])].reverse()) {
        if (change.fieldId === estimate.field || names.includes(String(change.field).toLowerCase())) {
          if (change.from != null && change.from !== '' && numeric(change.from) == null) return null;
          value = numeric(change.from);
        }
      }
    }
    return value == null ? null : value / estimate.divisor;
  }
  function reportRows(report) {
    const c = report.contents;
    if (!c || !Array.isArray(c.completedIssues) || !Array.isArray(c.issuesNotCompletedInCurrentSprint) || !Array.isArray(c.puntedIssues)) throw new Error('Неизвестный формат Sprint Report. Неполный отчёт не выгружается.');
    const added = JbpBoard.addedKeys(report), result = new Map();
    for (const [field, category] of Object.entries(groups)) {
      if (c[field] != null && !Array.isArray(c[field])) throw new Error('Некорректная группа Sprint Report.');
      for (const item of c[field] || []) {
        if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(item.key || '')) throw new Error('Некорректный ключ в Sprint Report.');
        if (result.has(item.key)) throw new Error('Задача встречается в нескольких группах Sprint Report. Повторите загрузку.');
        result.set(item.key, { key: item.key, category, added: added.has(item.key), summary: String(item.summary || '') });
      }
    }
    return [...result.values()];
  }
  function enrich(base, issue, estimate, sprint) {
    const f = issue.fields;
    if (!f) throw new Error('Jira не вернула поля задачи.');
    const end = sprint.state === 'closed' ? Date.parse(sprint.completeDate) : Date.now();
    return { ...base, summary: f.summary ?? base.summary, assigneeId: f.assignee?.key || f.assignee?.name || '', assignee: f.assignee?.displayName || 'Без исполнителя', status: f.status?.name || '', issuetype: f.issuetype?.name || '', subtask: !!f.issuetype?.subtask,
      currentEstimate: estimate.unit==='count'?1:numeric(f[estimate.field]) == null ? null : numeric(f[estimate.field]) / estimate.divisor,
      startEstimate: at(issue, estimate, Date.parse(sprint.startDate)), endEstimate: at(issue, estimate, end),
      historyComplete: !!issue.changelog && issue.changelog.startAt === 0 && issue.changelog.total === issue.changelog.histories?.length };
  }
  function totals(rows, key) { const missing = rows.filter(r => r[key] == null).length; return { value: rows.reduce((s,r) => s + (r[key] ?? 0), 0), missing, complete: missing === 0 }; }
  function metrics(rows, percentileChoice = 85) {
    percentileChoice=[50,70,80,85].includes(Number(percentileChoice))?Number(percentileChoice):85;
    const initial = rows.filter(r => !r.added), delivered = initial.filter(r => r.category === 'completed');
    const planned = totals(initial, 'startEstimate'), done = totals(delivered, 'startEstimate');
    const cycles=rows.filter(r=>r.category==='completed'&&r.flow?.cycleHours!=null).map(r=>r.flow.cycleHours).sort((a,b)=>a-b);
    const percentile=p=>cycles.length?cycles[Math.max(0,Math.ceil(p*cycles.length)-1)]:null;
    return { total: rows.length, initial: initial.length, completed: rows.filter(r => r.category === 'completed').length, added: rows.filter(r => r.added).length, removed: rows.filter(r => r.category === 'removed').length, unfinished: rows.filter(r => r.category === 'unfinished').length,
      cycle:{n:cycles.length,medianHours:cycles.length?(cycles[Math.floor((cycles.length-1)/2)]+cycles[Math.floor(cycles.length/2)])/2:null,p85Hours:percentile(.85),percentile:percentileChoice,percentileHours:percentile(percentileChoice/100)},reopened:rows.reduce((sum,r)=>sum+(r.flow?.reopened||0),0),flowKnown:rows.filter(r=>r.flow).length,
      planned, delivered: done, current: totals(rows.filter(r => r.category !== 'removed'), 'currentEstimate'), end: totals(rows.filter(r => r.category !== 'removed'), 'endEstimate'),
      planCompletionPercent: planned.complete && done.complete && planned.value > 0 ? 100 * done.value / planned.value : null };
  }
  function flow(issue,sprint,p){
    const h=issue.changelog,created=Date.parse(issue.fields.created),cutoff=sprint.state==='closed'?Date.parse(sprint.completeDate):Date.now();
    if(!h||h.startAt!==0||h.total!==h.histories?.length||!Number.isFinite(created)||!Number.isFinite(cutoff))return null;
    const work=new Set(p.workStatuses.split(',').map(v=>v.trim()).filter(Boolean)),done=new Set(p.doneStatuses.split(',').map(v=>v.trim()).filter(Boolean));
    if(!work.size||!done.size||[...work].some(id=>done.has(id)))return null;
    const changes=h.histories.flatMap(entry=>(entry.items||[]).filter(i=>i.field==='status').map(i=>({...i,time:Date.parse(entry.created)}))).sort((a,b)=>a.time-b.time);
    if(changes.some(c=>!Number.isFinite(c.time)))return null;
    let status=String(changes[0]?.from??issue.fields.status?.id??''),name=changes[0]?.fromString||issue.fields.status?.name||status,since=created,start=work.has(status)?created:null,finish=null,reopened=0;
    const durations=new Map();const add=(id,n,hours)=>{const old=durations.get(id)||{statusId:id,status:n,hours:0};old.hours+=Math.max(0,hours);durations.set(id,old);};
    for(const change of changes){if(change.time>cutoff)break;add(status,name,(change.time-since)/3600000);if(done.has(status)&&!done.has(String(change.to))&&change.time>=Date.parse(sprint.startDate))reopened++;status=String(change.to);name=change.toString||status;since=change.time;if(start==null&&work.has(status))start=since;if(done.has(status)&&start!=null)finish=since;}
    add(status,name,(cutoff-since)/3600000);
    return{calendar:'24x7',statusAtCutoff:name,statusIdAtCutoff:status,ageHours:Math.max(0,(cutoff-since)/3600000),cycleHours:start!=null&&finish!=null&&done.has(status)?(finish-start)/3600000:null,reopened,statusDurations:[...durations.values()]};
  }
  function selection(dataset, ids = [], includeSubtasks = dataset.profile.includeSubtasks, types = []) { return dataset.issues.filter(r => (includeSubtasks || !r.subtask) && (!ids.length || ids.includes(r.assigneeId)) && (!types.length || types.includes(r.issuetype || 'Неизвестный тип'))); }
  function exportData(dataset, rows, filter, options = {}) {
    return { schema: 'jira-board-plus/sprint/v1', exportedAt: new Date().toISOString(), source: dataset.baseUrl || origin + (dataset.context || ''), board: dataset.board, sprint: dataset.sprint, estimation: dataset.estimation, profile: dataset.profile,
      filters: filter, definitions: { assignee: 'CURRENT assignee at fetch time, not sprint-end assignee.', estimates: 'start/end reconstructed from complete Jira changelog; current is fetched now. Null means unknown or unestimated, never zero.', scope: 'Jira Sprint Report categories and added-after-start set.', completion: 'Completed initial work measured using start estimates / all initial start estimates. Unknown if any required estimate is missing.', originalTime: 'Raw seconds converted to hours by /3600; SP and hours are never combined.', time: 'Calendar 24x7 from complete Jira history, not Timepiece. Cycle: first work entry to last Done entry, only completed items; median and selected nearest-rank percentile (cycle.percentile/percentileHours); p85Hours retained for compatibility. Median averages central values for even n; n is available sample size. Reopened counts exits from Done during sprint.', subtasks: 'Excluded by default to avoid parent/subtask double counting; controlled by profile.' },
      loadedAt: dataset.loadedAt, warnings: dataset.warnings, metrics: metrics(rows,options.percentile), issues: rows.map(row => ({ ...row, url: `${dataset.baseUrl || origin + (dataset.context || '')}/browse/${row.key}`, ...(options.description ? { description: dataset.details[row.key]?.description ?? null } : {}), ...(options.history ? { changelog: dataset.details[row.key]?.changelog ?? null } : {}) })) };
  }
  function csv(data) {
    const cell = v => { let text = v == null ? '' : String(v); if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"','""')}"`; };
    const keys = ['key','summary','issuetype','category','assignee','added','startEstimate','endEstimate','currentEstimate','url'];
    return '\ufeff' + [keys.concat('unit').map(cell).join(','), ...data.issues.map(r => keys.map(k => cell(r[k])).concat(cell(data.estimation.unit)).join(','))].join('\r\n');
  }
  function markdown(data) {
    const esc = v => String(v ?? '—').replaceAll('|','\\|').replaceAll('<','&lt;').replace(/[\r\n]+/g,' ');
    return `# ${esc(data.sprint.name)}\n\nДоска: ${data.board.id} · Оценки: ${esc(data.estimation.name)} (${data.estimation.unit})\nВыгружено: ${data.exportedAt}\nИсполнители: текущие на момент загрузки.\nФильтры: ${JSON.stringify(data.filters)}\n\n${data.warnings.map(w => `- ${esc(w)}`).join('\n')}\n\n| Задача | Название | Тип | Категория | Исполнитель | На старте | На завершении/сейчас |\n|---|---|---|---|---|---:|---:|\n${data.issues.map(r => `| [${r.key}](${r.url}) | ${esc(r.summary)} | ${esc(r.issuetype)} | ${labels[r.category]} | ${esc(r.assignee)} | ${esc(r.startEstimate)} | ${esc(r.endEstimate)} |`).join('\n')}\n\nПолные определения, описания и история доступны в JSON.\n`;
  }
  function download(data, format) { const text = format === 'json' ? JSON.stringify(data,null,2) : format === 'csv' ? csv(data) : markdown(data); const url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `sprint-${data.sprint.id}-${new Date().toISOString().replaceAll(':','-')}.${format === 'markdown' ? 'md' : format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  return { origin, labels, defaults, profile, estimation, at, reportRows, enrich, totals, metrics, flow, selection, exportData, csv, markdown, download };
})();
