globalThis.JbpPersonalArchive = (() => {
 const labels={board:'Представления доски',template:'Шаблон',draft:'Черновик',attention:'Задача очереди'};
 const SCHEMA='jira-board-plus/personal-workspace/v1',MAX=25*1024*1024,kinds=['board','template','draft','attention'];
 const fail=()=>{throw Error('Некорректный архив личного пространства.');};
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const string=(v,n)=>{if(typeof v!=='string'||v.length>n)fail();return v;};
 const number=v=>{if(!Number.isSafeInteger(v)||v<0||v>8640000000000000)fail();return v;};
 const id=v=>{if(typeof v!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(v))fail();return v;};
 function safe(v,depth=0){if(depth>20)fail();if(object(v)||Array.isArray(v))for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))fail();safe(v[k],depth+1);}}
 function normalize(r){
  if(!object(r)||!kinds.includes(r.kind))fail();const account=string(r.account,200);if(!account.trim())fail();const v=r.value;if(!object(v))fail();
  const out={kind:r.kind,account};
  if(r.kind==='board'){if(!/^\d{1,15}$/.test(r.board||''))fail();out.board=r.board;out.value=JbpBoardWorkspaceCore.profile(v);return out;}
  if(r.kind==='draft'||r.kind==='template'){
   id(v.id);number(v.revision);number(v.updatedAt);
   const s=JbpComposer.change({}, {...v,op:r.kind==='draft'?'draftPut':'templatePut',revision:0},v.updatedAt);
   out.value={...(r.kind==='draft'?s.drafts:s.templates)[0],revision:v.revision};return out;
  }
  if(!JbpAttention.validKey(v.key)||!['check','waiting','later','done'].includes(v.state)||typeof r.notesIncluded!=='boolean')fail();
  const latest=JbpAttention.sample(v.latest),baseline=JbpAttention.sample(v.baseline),fieldAt={};
  if(!object(v.latest)||!object(v.baseline)||!object(v.fieldAt))fail();
  for(const [k,f]of Object.entries(v.fieldAt)){if(!Object.hasOwn(JbpAttention.fields,k)||!object(f)||!['page','jira'].includes(f.source))fail();fieldAt[k]={at:number(f.at),source:f.source};}
  const value={id:id(v.id),key:v.key,revision:number(v.revision),state:v.state,latest,baseline,fieldAt,remindAt:v.remindAt===null?null:number(v.remindAt),notifiedAt:v.notifiedAt===null?null:number(v.notifiedAt)};
  for(const k of ['checkedAt','restoredRemindAt'])if(v[k]!=null)value[k]=number(v[k]);
  if(v.error!==undefined)value.error=string(v.error,2000);
  out.notesIncluded=r.notesIncluded;if(r.notesIncluded)value.note=string(v.note,5000);
  out.value=value;return out;
 }
 function storageKey(base,r){return r.kind==='board'?JbpBoardWorkspaceCore.storageKey(base,r.account,r.board):r.kind==='attention'?JbpAttention.key(base,r.account):JbpComposer.key(base,r.account);}
 function readRecords(all,base){const records=[];
  for(const [key,s]of Object.entries(all)){
   let m=key.match(/^jbpBoardWorkspace:([^:]+):([^:]+):(\d+)$/);if(m&&decodeURIComponent(m[1])===base){records.push(normalize({kind:'board',account:decodeURIComponent(m[2]),board:m[3],value:s}));continue;}
   m=key.match(/^jbp(Composer|Attention):([^:]+):([^:]+)$/);if(!m||decodeURIComponent(m[2])!==base||!s)continue;const account=decodeURIComponent(m[3]);
   if(m[1]==='Composer')for(const [kind,rows]of [['template',s.templates||[]],['draft',s.drafts||[]]])for(const value of rows)records.push(normalize({kind,account,value}));
   else for(const value of s.items||[])records.push(normalize({kind:'attention',account,notesIncluded:true,value}));
  }return records;
 }
 function identity(r){return JSON.stringify([r.kind,r.account,r.board|| (r.kind==='attention'?r.value.key:r.value.id)]);}
 function content(r){const v={...r.value};delete v.revision;if(r.kind==='draft'||r.kind==='template'){delete v.updatedAt;delete v.id;}const sorted=x=>Array.isArray(x)?x.map(sorted):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;return JSON.stringify(sorted(v));}
 function exportArchive(all,base,accounts,selected,includeTexts){
  if(!base||!Array.isArray(accounts)||!accounts.length||!Array.isArray(selected)||!selected.length||selected.some(k=>!kinds.includes(k)))throw Error('Выберите пользователей и разделы.');
  if(selected.some(k=>['draft','template'].includes(k))&&includeTexts!==true)throw Error('Для черновиков и шаблонов явно разрешите экспорт личных текстов.');
  const records=readRecords(all,base).filter(r=>accounts.includes(r.account)&&selected.includes(r.kind)).map(r=>{if(r.kind==='attention'&&includeTexts!==true){const value={...r.value};delete value.note;return {...r,value,notesIncluded:false};}return r;});
  const archive={schema:SCHEMA,base,at:Date.now(),records};if(new TextEncoder().encode(JSON.stringify(archive,null,2)).byteLength>MAX)throw Error('Архив больше 25 МБ. Выберите меньше разделов.');return archive;
 }
 function parse(archive,base){if(typeof archive==='string'){if(new TextEncoder().encode(archive).byteLength>MAX)fail();archive=JSON.parse(archive);}if(new TextEncoder().encode(JSON.stringify(archive,null,2)).byteLength>MAX)fail();safe(archive);
  if(!object(archive)||archive.schema!==SCHEMA||archive.base!==base||!base||!Array.isArray(archive.records)||archive.records.length>10000)throw Error('Неподдерживаемый формат или архив другой Jira. Настройте тот же сервер отдельно.');
  const records=archive.records.map(normalize),ids=new Set();for(const r of records){const key=identity(r);if(ids.has(key))throw Error('Повторяющиеся записи в архиве.');ids.add(key);}return records;
 }
 function target(r,all,base){const key=storageKey(base,r),s=all[key];if(r.kind==='board')return {key,before:s};const list=r.kind==='attention'?s?.items:r.kind==='draft'?s?.drafts:s?.templates;
  const before=(list||[]).find(v=>r.kind==='attention'?v.key===r.value.key:v.id===r.value.id)|| (list||[]).find(v=>r.kind==='template'?v.name.trim().toLocaleLowerCase()===r.value.name.trim().toLocaleLowerCase():r.kind==='draft'&&v.context===r.value.context&&v.field===r.value.field&&v.text===r.value.text&&v.original===r.value.original);
  return {key,before};
 }
 function candidate(r,before){const value={...before,...r.value,revision:r.kind==='board'?(before?.revision||0)+1:Math.max(before?.revision||0,r.value.revision||0)+1};if(r.kind==='attention'){
   value.note=r.notesIncluded?r.value.note:before?.note||'';
   value.restoredRemindAt=r.value.remindAt??r.value.restoredRemindAt??null;value.remindAt=null;value.notifiedAt=null;
  }if(before?.id)value.id=before.id;return value;}
 function rows(records,all,base){const targets=new Set();return records.map((r,i)=>{const {key,before}=target(r,all,base),after=candidate(r,before),targetId=key+':'+r.kind+':'+(before?.id||r.value.id||r.board);
  if(targets.has(targetId))throw Error('Несколько записей архива заменяют одну текущую запись.');targets.add(targetId);
  const comparable=before?normalize({...r,value:before}):null;if(comparable&&r.kind==='attention'&&!r.notesIncluded)delete comparable.value.note;
  const same=before&&content(comparable)===content(r);
  return {id:String(i),record:r,key,before:before||null,after:same?before:after,status:same?'same':before?'conflict':'new',label:r.account+' · '+labels[r.kind]+' · '+(r.board||r.value.key||r.value.name||r.value.context+' / '+r.value.field)};
 });}
 function put(all,row){const {record:r,key}=row;
  const old=all[key];if(r.kind==='board'){all[key]={...old,...row.after,revision:(old?.revision||0)+1};return;}
  const prop=r.kind==='attention'?'items':r.kind==='draft'?'drafts':'templates',list=[...(old?.[prop]||[])],i=list.findIndex(x=>r.kind==='attention'?x.key===r.value.key:x.id===row.after.id),previous=list[i];
  const value={...row.after,revision:Math.max(previous?.revision||0,r.value.revision||0)+1};if(i<0)list.push(value);else list[i]=value;
  if(list.length>(r.kind==='attention'||r.kind==='draft'?100:50))throw Error('Превышен лимит записей. Выберите меньше записей.');
  all[key]={...(old|| (r.kind==='attention'?{items:[]}:{drafts:[],templates:[]})),[prop]:list};if(r.kind==='attention')all[key].revision=(old?.revision||0)+1;
  if(r.kind!=='attention'&&JSON.stringify(all[key]).length>4000000)throw Error('Локальная библиотека черновиков и шаблонов заполнена.');
 }
 function undo(key,before,current,applied){
  if(key.startsWith('jbpBoardWorkspace:'))return {...(before||JbpBoardWorkspaceCore.empty()),revision:Math.max(before?.revision||0,current?.revision||0)+1};
  const attention=key.startsWith('jbpAttention:'),next={...(before|| (attention?{items:[]}:{drafts:[],templates:[]}))};
  for(const prop of attention?['items']:['drafts','templates'])next[prop]=(before?.[prop]||[]).map(x=>{const now=current?.[prop]?.find(v=>v.id===x.id);if(JSON.stringify(now)===JSON.stringify(x))return x;const out={...x,revision:Math.max(x.revision||0,now?.revision||0,applied?.[prop]?.find(v=>v.id===x.id)?.revision||0)+1};if(attention){out.restoredRemindAt=x.remindAt??x.restoredRemindAt??null;out.remindAt=null;out.notifiedAt=null;}return out;});
  if(attention)next.revision=Math.max(before?.revision||0,current?.revision||0)+1;return next;
 }
 return {SCHEMA,MAX,kinds,normalize,readRecords,identity,exportArchive,parse,rows,put,undo};
})();
