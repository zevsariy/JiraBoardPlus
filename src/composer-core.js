globalThis.JbpComposer = (() => {
 const text=(v,max)=>{if(typeof v!=='string'||v.length>max)throw Error('Недопустимый размер текста.');return v;};
 function key(base,account){if(typeof account!=='string'||!account||account.length>200)throw Error('Не удалось определить пользователя Jira.');return 'jbpComposer:'+encodeURIComponent(base)+':'+encodeURIComponent(account);}
 function change(old,m,now=Date.now()){
  const state={...old,drafts:[...(old?.drafts||[])],templates:[...(old?.templates||[])]};
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(m.id||''))throw Error('Некорректный идентификатор.');
  const list=m.op.startsWith('template')?state.templates:state.drafts;
  const i=list.findIndex(x=>x.id===m.id),previous=list[i];
  if((previous?.revision||0)!==m.revision)throw Error('Запись изменена в другой вкладке. Обновите список.');
  if(['draftDelete','templateDelete'].includes(m.op)){if(i>=0)list.splice(i,1);return state;}
  let record;
  if(m.op==='draftPut'){
   if(!['comment','description','summary'].includes(m.field))throw Error('Неизвестное поле.');
   record={id:m.id,field:m.field,context:text(m.context,300),text:text(m.text,100000),original:text(m.original,100000)};
  }else if(m.op==='templatePut'){
   record={id:m.id,name:text(m.name,100).trim(),summary:text(m.summary,1000),description:text(m.description,100000),comment:text(m.comment,100000)};
   if(!record.name)throw Error('Введите название шаблона.');
  }else throw Error('Неизвестная операция.');
  if(i<0&&list.length>=(m.op==='draftPut'?100:50))throw Error('Достигнут лимит. Удалите ненужные записи в локальной библиотеке.');
  record.revision=(previous?.revision||0)+1;record.updatedAt=now;
  if(i<0)list.push(record);else list[i]=record;
  if(JSON.stringify(state).length>4000000)throw Error('Локальная библиотека заполнена. Удалите ненужные записи.');
  return state;
 }
 return {key,change};
})();
