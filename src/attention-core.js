globalThis.JbpAttention = (() => {
 const fields={summary:'Название',status:'Статус',assignee:'Исполнитель',duedate:'Срок',priority:'Приоритет'};
 const validKey=k=>typeof k==='string'&&/^[A-Z][A-Z0-9_]*-\d+$/.test(k);
 function key(base,account){if(typeof account!=='string'||!account.trim()||account.length>200)throw Error('Не удалось определить пользователя.');return 'jbpAttention:'+encodeURIComponent(base)+':'+encodeURIComponent(account);}
 function sample(input){const out={};for(const k of Object.keys(fields))if(Object.hasOwn(input||{},k)){if(typeof input[k]!=='string'||input[k].length>2000)throw Error('Некорректные данные задачи.');out[k]=input[k];}return out;}
 function fromIssue(issue){const f=issue.fields||{},out={};for(const k of Object.keys(fields))if(Object.hasOwn(f,k))out[k]=f[k]==null?'':typeof f[k]==='object'?String(f[k].displayName??f[k].name??''):String(f[k]);return sample(out);}
 function observe(item,values,now,source){values=sample(values);const baseline={...item.baseline},latest={...item.latest},fieldAt={...item.fieldAt};for(const [k,v]of Object.entries(values)){if(source==='page'&&fieldAt[k]?.source==='jira')continue;if(!Object.hasOwn(baseline,k))baseline[k]=v;latest[k]=v;fieldAt[k]={at:now,source};}return {...item,baseline,latest,fieldAt,revision:item.revision+1};}
 function changes(item){return Object.keys(fields).filter(k=>Object.hasOwn(item.baseline||{},k)&&Object.hasOwn(item.latest||{},k)&&item.baseline[k]!==item.latest[k]).map(k=>({field:k,label:fields[k],before:item.baseline[k],after:item.latest[k],...item.fieldAt?.[k]}));}
 function change(old,m,now=Date.now(),uuid=()=>crypto.randomUUID()){
  const state={...old,revision:(old?.revision||0)+1,items:[...(old?.items||[])]};
  if(!validKey(m.key))throw Error('Введите ключ задачи, например DEMO-123.');
  const i=state.items.findIndex(x=>x.key===m.key),item=state.items[i];
  if(m.op==='pin'){
   if(item)return old;
   if(state.items.length>=100)throw Error('В очереди уже 100 задач. Удалите ненужные.');
   const data=sample(m.values);state.items.push(observe({id:uuid(),key:m.key,revision:0,state:'check',note:'',remindAt:null,notifiedAt:null,baseline:{},latest:{},fieldAt:{}},data,now,'page'));return state;
  }
  if(!item||item.revision!==m.revision)throw Error('Задача изменена в другой вкладке. Обновите список; введённый текст оставлен в форме.');
  if(m.op==='remove'){state.items.splice(i,1);return state;}
  if(m.op==='seen')state.items[i]={...item,revision:item.revision+1,baseline:{...item.latest}};
  else if(m.op==='edit'){
   if(!['check','waiting','later','done'].includes(m.state)||typeof m.note!=='string'||m.note.length>5000)throw Error('Проверьте состояние и заметку (до 5000 символов).');
   if(m.remindAt!==null&&(!Number.isSafeInteger(m.remindAt)||m.remindAt<0||m.remindAt>now+366*86400000))throw Error('Выберите дату в пределах года.');
   const due=m.state==='done'?null:m.remindAt;
   state.items[i]={...item,revision:item.revision+1,state:m.state,note:m.note,remindAt:due,notifiedAt:due===item.remindAt?item.notifiedAt:null};
  }else throw Error('Неизвестная операция очереди.');
  return state;
 }
 return {fields,key,validKey,sample,fromIssue,observe,changes,change};
})();
