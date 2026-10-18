globalThis.JbpDashboard = (() => {
 const H=3600000,D=24*H;
 const formatNumber=n=>n==null||!Number.isFinite(Number(n))?'—':Number(n)>0&&Number(n)<0.01?'<0,01':Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
 const names=s=>String(s||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 const quantile=(values,p)=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.max(0,Math.ceil(a.length*p)-1)]:null;};
 function period(from,to,now=Date.now()){
  const start=Date.parse(from+'T00:00:00Z'),end=Math.min(Date.parse(to+'T00:00:00Z')+D,now);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*D||new Date(start).toISOString().slice(0,10)!==from||new Date(Date.parse(to+'T00:00:00Z')).toISOString().slice(0,10)!==to||to>new Date(now).toISOString().slice(0,10))throw Error('Выберите период от 1 до 366 дней, не позднее сегодняшнего дня.');
  return {from,to,start,end};
 }
 function timeline(issue,now){
  const log=issue.changelog,created=Date.parse(issue.fields.created);
  if(!log||log.startAt!==0||log.total!==log.histories?.length||!Number.isFinite(created)||created>now)return null;
  if(log.histories.some(h=>!Number.isFinite(Date.parse(h.created))))return null;
  const changes=log.histories.flatMap(h=>(h.items||[]).filter(i=>i.field==='status'||i.fieldId==='status').map(i=>({...i,at:Date.parse(h.created)}))).sort((a,b)=>a.at-b.at);
  let status=String(changes[0]?.from??issue.fields.status?.id??''),since=created;const visits=[];
  for(const c of changes){if(c.at<since||c.at>now||String(c.from)!==status||c.to==null)return null;visits.push({status,from:since,to:c.at});since=c.at;status=String(c.to);}
  if(status!==String(issue.fields.status?.id))return null;
  visits.push({status,from:since,to:now});return visits;
 }
 function rows(issues,statuses,prefs,range,now=Date.now()){
  const resolved=JbpBoard.resolveStatusRules(statuses,prefs),work=new Set(resolved.workStatuses.split(',').filter(Boolean)),done=new Set(resolved.doneStatuses.split(',').filter(Boolean)),blocked=names(prefs.blockedStatusNames),unblock=names(prefs.unblockingStatusNames);
  return issues.map(issue=>{
   const f=issue.fields,visits=timeline(issue,now),currentDone=done.has(String(f.status?.id)),created=Date.parse(f.created);
   const clipped=visits?.filter(v=>v.from<range.end),last=clipped?.at(-1),doneAtEnd=!!last&&done.has(last.status);
   // Moving between two terminal statuses is one completion, not a second delivery.
   let finish=null;if(doneAtEnd){let i=clipped.length-1;while(i>0&&done.has(clipped[i-1].status))i--;finish=clipped[i].from;}
   const workStart=clipped?.find(v=>work.has(v.status))?.from;
   const durations={};for(const v of visits||[]){if(done.has(v.status))continue;const hours=Math.max(0,Math.min(v.to,range.end)-Math.max(v.from,range.start))/H;if(hours)durations[v.status]=(durations[v.status]||0)+hours;}
   const blockers=(f.issuelinks||[]).filter(l=>l.inwardIssue&&String(l.type?.inward).trim().toLowerCase()==='is blocked by').map(l=>({key:l.inwardIssue.key,status:l.inwardIssue.fields?.status?.name||null}));
   const isBlocked=!currentDone&&blocked.includes(String(f.status?.name).toLowerCase());
   return {key:issue.key,summary:f.summary||'',type:f.issuetype?.name||'Неизвестный тип',subtask:!!f.issuetype?.subtask,status:f.status?.name||'Неизвестный статус',statusId:String(f.status?.id||''),assignee:f.assignee?.displayName||null,done:currentDone,wip:!currentDone&&work.has(String(f.status?.id)),blocked:isBlocked,blockers,unblocked:isBlocked&&blockers.length>0&&blockers.every(b=>b.status&&unblock.includes(b.status.toLowerCase())),created:Number.isFinite(created)?created:null,historyKnown:!!visits,ageHours:!currentDone&&visits?(now-visits.at(-1).from)/H:null,workAgeHours:!currentDone&&workStart!=null?(now-workStart)/H:null,completedAt:doneAtEnd&&finish>=range.start&&finish<range.end?finish:null,leadHours:doneAtEnd&&finish!=null?(finish-created)/H:null,cycleHours:doneAtEnd&&finish!=null&&workStart!=null&&workStart<=finish?(finish-workStart)/H:null,durations};
  });
 }
 function aggregate(rows,range,ageDays=7,percentile=85){
  percentile=[50,70,80,85].includes(Number(percentile))?Number(percentile):85;
  const completed=rows.filter(r=>r.completedAt!=null),arrived=rows.filter(r=>r.created>=range.start&&r.created<range.end),unfinished=rows.filter(r=>!r.done);
  const weeks=[];let monday=new Date(range.start);monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);monday.setUTCHours(0,0,0,0);
  for(let t=+monday;t<range.end;t+=7*D){const start=Math.max(t,range.start),end=Math.min(t+7*D,range.end);weeks.push({week:new Date(t).toISOString().slice(0,10),partial:start!==t||end!==t+7*D,arrived:arrived.filter(r=>r.created>=start&&r.created<end),completed:completed.filter(r=>r.completedAt>=start&&r.completedAt<end)});}
  const distribution=key=>{const values=completed.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);return {n:values.length,median:values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null,p85:quantile(values,.85),percentile,percentileValue:quantile(values,percentile/100)};};
  return {total:rows.length,unfinished,wip:unfinished.filter(r=>r.wip),blocked:unfinished.filter(r=>r.blocked),aging:unfinished.filter(r=>r.ageHours>=ageDays*24),unassigned:unfinished.filter(r=>!r.assignee),unknown:rows.filter(r=>!r.historyKnown),arrived,completed,weeks,lead:distribution('leadHours'),cycle:distribution('cycleHours')};
 }
 function sprintTrend(datasets,type='',subtasks=false,percentile=85){
  const rows=datasets.map(d=>{const issues=d.issues.filter(r=>(subtasks||!r.subtask)&&(!type||r.issuetype===type)),m=JbpSprint.metrics(issues,percentile);return {id:d.sprint.id,name:d.sprint.name,end:d.sprint.completeDate,unit:d.estimation.unit,issues,metrics:m};});
  const recurring=new Map();for(const d of rows)for(const r of d.issues.filter(r=>r.category==='unfinished')){const item=recurring.get(r.key)||{key:r.key,summary:r.summary,sprints:[]};item.sprints.push(d.name);recurring.set(r.key,item);}
  return {sprints:rows,recurring:[...recurring.values()].filter(r=>r.sprints.length>1).sort((a,b)=>b.sprints.length-a.sprints.length)};
 }
 return {H,D,formatNumber,quantile,period,timeline,rows,aggregate,sprintTrend};
})();
