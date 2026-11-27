/* Settings only: imported result data never becomes a storage write. */
globalThis.JbpRestore=(()=>{
 const SCHEMA='jira-board-plus/settings-archive/v1',MAX=25000000;
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(v||{},k)).map(k=>[k,v[k]]));
 const copy=v=>JSON.parse(JSON.stringify(v));
 const merge=(old,next)=>object(next)?Object.fromEntries(Object.entries({...old,...next}).map(([k,v])=>[k,Object.hasOwn(next,k)&&object(v)?merge(old?.[k]||{},v):v])):next;
 function safe(v,depth=0){if(depth>40)throw Error('Слишком глубокая структура файла.');if(v&&typeof v==='object')for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Недопустимые свойства файла.');safe(v[k],depth+1);}}
 function connection(v){const baseUrl=v?.baseUrl?JbpConnection.normalize(v.baseUrl):'',context=baseUrl?new URL(baseUrl).pathname.replace(/\/$/,''):'';if(v?.context&&v.context!==context)throw Error('Путь Jira не соответствует адресу.');const project=String(v?.project||'');if(project&&!/^(?:[A-Za-z][A-Za-z0-9_]*|[0-9]+)$/.test(project))throw Error('Некорректный ключ проекта.');return {baseUrl,context,project};}
 const aiKeys=['enabled','board','sprint','roadmap','endpoint','model','prompt'];
 const configKeys=['baseUrl','jql','teamField','parentField','sprintField','estimateField','estimateName','sprintId','doneNames','blockLinkIds','sprintStart','sprintEnd','withHistory','rules'];
 function controlConfig(v){const c=pick(v,configKeys);if(c.baseUrl)c.baseUrl=JbpConnection.normalize(c.baseUrl);for(const k of ['teamField','parentField','sprintField','estimateField'])if(c[k]&&!/^(customfield_\d+|timeoriginalestimate)$/.test(c[k]))throw Error('Некорректное поле анализа.');if(c.sprintId&&!/^\d+$/.test(c.sprintId))throw Error('Некорректный спринт.');for(const k of ['doneNames','blockLinkIds'])if(c[k]&&(!Array.isArray(c[k])||c[k].length>100||c[k].some(x=>typeof x!=='string'||x.length>200)))throw Error('Некорректные статусы или связи.');for(const k of ['sprintStart','sprintEnd'])if(c[k]&&!Number.isFinite(Date.parse(c[k])))throw Error('Некорректная дата анализа.');if(c.jql&&(typeof c.jql!=='string'||c.jql.length>10000))throw Error('Некорректный JQL анализа.');if('withHistory' in c&&typeof c.withHistory!=='boolean')throw Error('Некорректный переключатель истории.');if(c.blockLinkIds?.some(x=>!/^\d+$/.test(x)))throw Error('Некорректные ID связей.');if(c.sprintStart&&c.sprintEnd&&Date.parse(c.sprintStart)>Date.parse(c.sprintEnd))throw Error('Некорректный период анализа.');if(c.rules)c.rules=JbpControl.rules(c.rules);return c;}
 function dashboard(v){if(!object(v))throw Error('Некорректные настройки метрик.');const c=pick(v,['percentile','charts','scatterKey','planUnit','period','from','to','age','limit','subtasks','overview','history','trend']);if(c.percentile!=null&&![50,70,80,85].includes(Number(c.percentile)))throw Error('Некорректный перцентиль.');if(c.scatterKey&&!['cycleHours','leadHours'].includes(c.scatterKey))throw Error('Некорректная диаграмма.');if(c.planUnit&&!['count','SP','h'].includes(c.planUnit))throw Error('Некорректные единицы.');for(const k of ['subtasks','overview','history','trend'])if(k in c&&typeof c[k]!=='boolean')throw Error('Некорректный переключатель метрик.');if(c.period!=null&&!['7','30','90','custom'].includes(String(c.period)))throw Error('Некорректный период метрик.');for(const k of ['age','limit'])if(k in c&&(!Number.isFinite(Number(c[k]))||Number(c[k])<(k==='limit'?0:1)||Number(c[k])>(k==='limit'?3000:365)))throw Error('Некорректный предел метрик.');for(const k of ['from','to'])if(c[k]&&JbpRoadmap.day(c[k])==null)throw Error('Некорректная дата метрик.');if(c.charts){if(!object(c.charts))throw Error('Некорректные графики.');c.charts=pick(c.charts,['weekly','aging','status','scatter','plan','recurring']);if(Object.values(c.charts).some(x=>typeof x!=='boolean'))throw Error('Некорректные графики.');}return c;}
 function scopeSettings(v){
  if(!object(v)||!['components','labels','filter','jql','project'].includes(v.mode))throw Error('Некорректный отбор роадмэпа.');
  const c={mode:v.mode};
  if(['components','labels'].includes(v.mode)){if(!Array.isArray(v.values)||v.values.length>100||v.values.some(x=>typeof x!=='string'||x.length>2000||(v.mode==='components'&&!/^\d+$/.test(x))))throw Error('Некорректные значения отбора.');c.values=v.values;}
  if(v.mode==='filter'){c.id=String(v.id||'');if(c.id&&!/^\d+$/.test(c.id))throw Error('Некорректный фильтр.');}
  if(v.mode==='jql'){if(typeof v.jql!=='string'||v.jql.length>10000)throw Error('Некорректный JQL роадмэпа.');c.jql=v.jql;}
  return c; // Empty selections are persisted drafts; the roadmap validates them before loading Jira.
 }
 function rows(data,base){
  const result=[],ignored=[];
  const add=(id,key,label,value,path='')=>result.push({id,key,label,value,path});
  for(const [key,v]of Object.entries(data)){
   if(key==='jbpReportsV1'){if(!object(v))throw Error('Некорректные настройки подключения.');if(Object.hasOwn(v,'baseUrl'))add('connection',key,'Подключение и проект',connection(v),'connection');if(Object.hasOwn(v,'queries')){if(!Array.isArray(v.queries)||v.queries.length>100)throw Error('Некорректный список JQL.');add('queries',key,'JQL-запросы — добавить отсутствующие на паузе',v.queries.map(q=>({...JbpReports.validate(q),enabled:false})),'queries');}}
   else if(key==='jbpBoardPrefs'){if(!object(v))throw Error('Некорректные настройки досок.');const p=pick(v,Object.keys(JbpBoard.defaults));for(const [k,x]of Object.entries(p))if(typeof x!==typeof JbpBoard.defaults[k])throw Error('Некорректный тип настройки '+k);add(key,key,'Доски, карточки и общие настройки',pick(JbpBoard.validate(p),Object.keys(p)));}
   else if(key==='jbpRefinement'){if(!object(v))throw Error('Некорректные правила refinement.');add(key,key,'Правила refinement',JbpTools.settings(v));}
   else if(key==='jbpNetworkConfig'){const b=new JbpBudget();b.configure(v);add(key,key,'Лимиты запросов',b.config);}
   else if(key==='jbpTheme'){if(!['system','light','dark'].includes(v))throw Error('Некорректная тема.');add(key,key,'Тема интерфейса',v);}
   else if(key==='jbpAI'){if(!object(v))throw Error('Некорректные настройки ИИ.');const c=pick(JbpAI.config(pick(v,aiKeys)),aiKeys);add(key,key,'ИИ — ключ API сохраняется, активация не переносится',{...c,enabled:false});}
   else if(key==='jbpControlRules'){if(!object(v)||JbpConnection.normalize(v.baseUrl)!==base)throw Error('Правила рисков относятся к другой Jira.');add(key,key,'Правила рисков',{baseUrl:base,rules:JbpControl.rules(v.rules)});}
   else if(key==='jbpControlV1'){if(v?.config&&Object.keys(v.config).length){const c=controlConfig(v.config);if(c.baseUrl&&c.baseUrl!==base)throw Error('Параметры анализа относятся к другой Jira.');add(key,key,'Параметры анализа команды',c,'config');}}
   else {
    const m=key.match(/^jbp(Sprint|Dashboard|Roadmap):([^:]+):([^:]+)(?::(.+))?$/);
    if(!m){ignored.push(key);continue;}
    if(JbpConnection.normalize(decodeURIComponent(m[2]))!==base){ignored.push(key);continue;}
    const [,kind,,id,suffix='']=m;if(!/^[\w-]+$/.test(id))throw Error('Некорректный идентификатор настроек.');
    if(kind==='Sprint'&&!suffix&&/^\d+$/.test(id)&&v?.profile){add(key,key,'Паспорт метрик доски '+id,pick(JbpSprint.profile(v.profile),Object.keys(v.profile)),'profile');continue;}
    if(kind==='Dashboard'&&!suffix&&/^\d+$/.test(id)){add(key,key,'Отображение метрик доски '+id,dashboard(v));continue;}
    if(kind==='Roadmap'&&['','scope','components','versionField','view','treeWidth'].includes(suffix)||kind==='Roadmap'&&/^cutoff:\d+$/.test(suffix)){
     if(suffix==='view'){if(!object(v))throw Error('Некорректный вид роадмэпа.');const c=pick(v,['group','zoom','edge-mode','links','sprints','dues']);for(const [k,x]of Object.entries(c))if(['links','sprints','dues'].includes(k)?typeof x!=='boolean':!({group:['tree','team'],zoom:['week','month'],'edge-mode':['selected','conflicts','all']}[k]||[]).includes(x))throw Error('Некорректный вид роадмэпа.');add(key,key,'Роадмэп '+id+' · вид',c);continue;}
     const value=suffix===''?pick(JbpRoadmap.config(v),Object.keys(v)):suffix==='scope'?scopeSettings(v):v;
     // An empty component selection is valid saved UI state.
     if(suffix!=='scope')JbpRoadmap.backupEntries({format:'jbp-roadmap-backup-v1',context:'restore',entries:[[suffix,value]]},'restore');
     add(key,key,'Роадмэп '+id+' · '+(suffix||'иерархия'),value);continue;
    }
    ignored.push(key);
   }
  }
  if(result.length>500)throw Error('Слишком много разделов настроек.');return {rows:result,ignored};
 }
 function parse(input){if(!object(input)||![SCHEMA,'jira-board-plus/local-archive/v1'].includes(input.schema)||!object(input.data)||JSON.stringify(input).length>MAX)throw Error('Выберите архив настроек или общий локальный архив Board Plus до 25 МБ.');safe(input);const base=connection({baseUrl:input.baseUrl,...input.data.jbpReportsV1}).baseUrl;const parsed=rows(input.data,base);return {base,...parsed};}
 function current(row,all){const value=all[row.key];if(row.path==='connection')return connection(value||{});if(row.path==='queries')return (value?.queries||[]).map(q=>JbpReports.validate(q));if(row.path)return value?.[row.path]??{};if(row.key==='jbpAI')return pick(value||{},aiKeys);return value??null;}
 function merged(row,all){const old=all[row.key];if(row.path==='connection')return {...(old||{queries:[],results:{},jobs:{},fieldNames:{}}),...row.value};if(row.path==='queries'){
   const queries=copy(old?.queries||[]),known=new Set(queries.map(q=>JSON.stringify({...JbpReports.validate(q),enabled:false})));
   for(const q of row.value){const signature=JSON.stringify(q);if(!known.has(signature)){known.add(signature);queries.push({...q,id:crypto.randomUUID(),nextRun:Date.now()+q.minutes*60000,lastError:''});}}
   if(queries.length>30&&queries.length>(old?.queries?.length||0))throw Error('После восстановления будет больше 30 JQL-запросов.');return {...(old||{results:{},jobs:{}}),queries};
  }
  if(row.path){const value=merge(old?.[row.path]||{},row.value);if(row.path==='profile')JbpSprint.profile(value);return {...(old||{}),[row.path]:value};}
  if(object(row.value)){const value=merge(object(old)?old:{},row.value);if(row.key==='jbpBoardPrefs')JbpBoard.validate(value);return value;}return row.value;
 }
 function exportSettings(all){const base=connection(all.jbpReportsV1||{}).baseUrl,data={jbpReportsV1:{...connection(all.jbpReportsV1||{}),queries:all.jbpReportsV1?.queries||[]},jbpBoardPrefs:{...JbpBoard.defaults,...all.jbpBoardPrefs},jbpRefinement:all.jbpRefinement||JbpTools.settings({types:[{name:'*',checks:{estimate:true,description:true,team:true}}]}),jbpNetworkConfig:all.jbpNetworkConfig||{concurrency:2,intervalMs:500},jbpTheme:all.jbpTheme||'system',jbpAI:all.jbpAI||{enabled:false,board:true,sprint:true,roadmap:false}};
  for(const [key,v]of Object.entries(all))if(['jbpAI','jbpControlRules','jbpControlV1'].includes(key)||/^jbp(Sprint|Roadmap|Dashboard):/.test(key)){if(key==='jbpControlRules'&&v?.baseUrl!==base||key==='jbpControlV1'&&v?.config?.baseUrl&&v.config.baseUrl!==base)continue;data[key]=/^jbpSprint:/.test(key)&&v?.profile?{...v,profile:{...JbpSprint.defaults,...v.profile}}:v;}
  const clean={};const parsed=rows(data,base);for(const row of parsed.rows){if(row.path==='connection')clean[row.key]={...clean[row.key],...row.value};else if(row.path)clean[row.key]={...clean[row.key],[row.path]:row.value};else clean[row.key]=row.value;}
  return {schema:SCHEMA,at:new Date().toISOString(),baseUrl:base,data:clean};
 }
 return {SCHEMA,MAX,parse,rows,current,merged,exportSettings,pick,connection};
})();
