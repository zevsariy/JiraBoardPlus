globalThis.JbpControlClient=class {
  constructor(baseUrl){this.baseUrl=JbpConnection.normalize(baseUrl);}
  async json(path,signal,body){const res=await JbpNetwork.fetch(this.baseUrl+'/rest/api/2/'+path,{method:body?'POST':'GET',credentials:'include',redirect:'error',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});if(!res.ok)throw Error(`Jira HTTP ${res.status}: ${res.status===401?'войдите в Jira':res.status===403?'недостаточно прав':res.status===404?'API или задача недоступны':'проверьте JQL, соединение и доступность API'}`);if(!res.headers.get('content-type')?.includes('application/json'))throw Error('Вместо JSON получена страница входа.');return res.json();}
  async load(jql,config,signal,progress){
    if(!jql.trim()||jql.length>20000)throw Error('Введите JQL до 20 000 символов.');
    const me=await this.json('myself',signal),account=me.key||me.name||me.accountId;if(!account)throw Error('Не удалось определить учётную запись.');
    const fields=[...new Set(['summary','status','issuetype','assignee','created','updated','duedate','resolutiondate','description','issuelinks','parent','fixVersions',config.teamField,config.sprintField,config.parentField,config.estimateField].filter(Boolean))];
    const issues=[],seen=new Set(),limit=config.withHistory?300:3000;let total=null;
    do{signal.throwIfAborted();progress(`Загрузка задач: ${issues.length}${total===null?'':' / '+total}`);const page=await this.json('search',signal,{jql,startAt:issues.length,maxResults:Math.min(100,limit-issues.length),fields});
      if(!Array.isArray(page.issues)||!Number.isInteger(page.total)||page.total<0||page.issues.length>Math.min(100,limit-issues.length)||page.startAt!==issues.length||total!==null&&page.total!==total)throw Error('Выдача изменилась или Jira вернула некорректную страницу.');
      if(page.warningMessages?.length)throw Error(page.warningMessages.join(' '));total=page.total;
      for(const i of page.issues){if(!/^[A-Z][A-Z0-9_]*-\d+$/i.test(i.key)||seen.has(i.key)||!i.fields)throw Error('Повтор или неверный формат задачи.');seen.add(i.key);issues.push(i);}
      if(issues.length>total)throw Error('Количество задач изменилось при загрузке.');
      if(!page.issues.length&&issues.length<total)throw Error('Jira вернула пустую промежуточную страницу.');
    }while(issues.length<total&&issues.length<limit);
    const warnings=['Jira не предоставляет атомарный снимок: данные могут измениться во время загрузки.'];
    if(config.withHistory)for(let n=0;n<issues.length;n++){signal.throwIfAborted();progress(`История: ${n+1} / ${issues.length}`);try{const detail=await this.json(`issue/${issues[n].key}?fields=${fields.join(',')}&expand=changelog`,signal);if(!detail.fields||detail.key!==issues[n].key)throw Error('Некорректная задача');issues[n]=detail;}catch(e){if(signal.aborted)throw e;warnings.push(`${issues[n].key}: ${e.message}`);}}
    const finalMe=await this.json('myself',signal);if((finalMe.key||finalMe.name||finalMe.accountId)!==account)throw Error('Учётная запись изменилась во время загрузки. Снимок не сохранён.');
    return {schema:'jira-board-plus/control/v1',id:crypto.randomUUID(),baseUrl:this.baseUrl,account,jql,at:new Date().toISOString(),total,partial:issues.length<total,issues,config,warnings};
  }
};
