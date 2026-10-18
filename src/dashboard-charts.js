// Local SVG charts. Labels are text nodes; no remote assets or executable model content.
globalThis.JbpCharts = (() => {
 const colors=['#087e8b','#6574ce','#c47921'],NS='http://www.w3.org/2000/svg';
 const fmt=JbpDashboard.formatNumber;
 const svg=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n;};
 function frame(target,title,note,width=820,height=320){target.replaceChildren();const h=document.createElement('h4');h.textContent=title;const p=document.createElement('p');p.textContent=note;const wrap=document.createElement('div');wrap.className='chart-scroll';const root=svg('svg',{viewBox:`0 0 ${width} ${height}`,width,height,role:'group','aria-label':title});root.style.minWidth=width+'px';wrap.append(root);target.append(h,p,wrap);return root;}
 function empty(target,title,text='Нет данных для выбранной выборки.'){target.replaceChildren();const h=document.createElement('h4'),p=document.createElement('p');h.textContent=title;p.textContent=text;target.append(h,p);}
 function interactive(n,title,rows,select){n.setAttribute('tabindex','0');n.setAttribute('role','button');n.setAttribute('aria-label',title);n.classList.add('chart-mark');n.append(svg('title',{},title));n.addEventListener('click',()=>select(title,rows));n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(title,rows);}});}
 function legend(root,series){series.forEach((s,i)=>{root.append(svg('rect',{x:60+i*245,y:10,width:12,height:12,fill:colors[i%colors.length]}),svg('text',{x:78+i*245,y:21},s));});}
 function bars(target,{title,groups,series,unit='задач',note='',select}){
  if(!groups.length)return empty(target,title);
  const width=Math.max(820,groups.length*68+110),height=330,root=frame(target,title,note,width,height),left=62,top=45,bottom=260,plot=width-left-20;
  const values=groups.flatMap(g=>g.values.map(v=>v.value)).filter(Number.isFinite),rawMax=Math.max(1,...values),ticks=unit==='задач'?Math.min(4,Math.ceil(rawMax)):4,max=unit==='задач'?Math.ceil(rawMax/ticks)*ticks:rawMax,step=plot/groups.length,bw=Math.min(24,(step-12)/series.length);
  legend(root,series);
  for(let i=0;i<=ticks;i++){const value=max*i/ticks,y=bottom-(bottom-top)*i/ticks;root.append(svg('line',{x1:left,y1:y,x2:width-20,y2:y,stroke:'#dce5ec'}),svg('text',{x:left-8,y:y+4,'text-anchor':'end'},fmt(value)));}
  root.append(svg('text',{x:4,y:18},unit));
  groups.forEach((g,i)=>{const x=left+i*step+step/2;g.values.forEach((v,j)=>{const bx=x+(j-series.length/2)*bw;
    if(v.value==null){const mark=svg('text',{x:bx+bw/2,y:bottom-5,'text-anchor':'middle'},'?');interactive(mark,g.label+' · '+series[j]+': данные неполны',v.rows||[],select);root.append(mark);return;}
    const h=(bottom-top)*v.value/max,rect=svg('rect',{x:bx+1,y:bottom-Math.max(2,h),width:Math.max(3,bw-2),height:Math.max(2,h),rx:2,fill:colors[j%colors.length]});interactive(rect,`${g.label} · ${series[j]}: ${fmt(v.value)} ${unit}`,v.rows||[],select);root.append(rect);
   });const label=svg('text',{x,y:281,'text-anchor':'middle'},g.label.length>16?g.label.slice(0,15)+'…':g.label);label.append(svg('title',{},g.label));root.append(label);});
 }
 function horizontal(target,{title,groups,series=['Значение'],unit='ч',note='',threshold,select}){
  if(!groups.length)return empty(target,title);
  const width=820,rowH=series.length*19+17,height=65+groups.length*rowH,root=frame(target,title,note,width,height),left=170,right=745,top=45;
  const rawMax=Math.max(1,Number(threshold)||0,...groups.flatMap(g=>g.values.map(v=>v.value)).filter(Number.isFinite)),ticks=unit==='спринтов'?Math.min(4,Math.ceil(rawMax)):4,max=unit==='спринтов'?Math.ceil(rawMax/ticks)*ticks:rawMax;legend(root,series);
  for(let i=0;i<=ticks;i++){const x=left+(right-left)*i/ticks;root.append(svg('line',{x1:x,y1:top-10,x2:x,y2:height-25,stroke:'#e0e7ee'}),svg('text',{x,y:height-7,'text-anchor':'middle'},fmt(max*i/ticks)));}
  groups.forEach((g,i)=>{const y=top+i*rowH,label=svg('text',{x:left-10,y:y+13,'text-anchor':'end'},g.label.length>23?g.label.slice(0,22)+'…':g.label);label.append(svg('title',{},g.label));root.append(label);g.values.forEach((v,j)=>{if(v.value==null)return;const bar=svg('rect',{x:left,y:y+j*19,width:Math.max(2,(right-left)*v.value/max),height:14,rx:2,fill:threshold!=null&&v.value>=threshold?'#b84d31':colors[j%colors.length]});interactive(bar,`${g.label} · ${series[j]}: ${fmt(v.value)} ${unit}`,v.rows||[],select);root.append(bar,svg('text',{x:left+(right-left)*v.value/max+5,y:y+j*19+12},fmt(v.value)));});});
  if(threshold!=null){const x=left+(right-left)*threshold/max;root.append(svg('line',{x1:x,y1:top-10,x2:x,y2:height-25,stroke:'#b84d31','stroke-dasharray':'5 4'}));}
 }
 function scatter(target,{title,rows,key,range,median,percentile,value,select}){
  const sample=rows.filter(r=>Number.isFinite(r[key])&&Number.isFinite(r.completedAt));if(!sample.length)return empty(target,title,'Нет завершённых задач с достаточной историей.');
  const width=820,height=330,left=65,right=790,top=45,bottom=270,max=Math.max(1,...sample.map(r=>r[key]),median||0,value||0),root=frame(target,title,`Календарные часы · n=${sample.length}. Каждая точка — задача. Линии: медиана и P${percentile} (nearest rank). Клик открывает задачу.`,width,height);
  const y=v=>bottom-(bottom-top)*v/max,x=t=>left+(right-left)*(t-range.start)/(range.end-range.start);
  for(let i=0;i<=4;i++){const v=max*i/4,t=range.start+(range.end-range.start)*i/4;root.append(svg('line',{x1:left,y1:y(v),x2:right,y2:y(v),stroke:'#dce5ec'}),svg('text',{x:left-8,y:y(v)+4,'text-anchor':'end'},fmt(v)),svg('text',{x:x(t),y:295,'text-anchor':'middle'},new Date(t).toISOString().slice(5,10)));}
  root.append(svg('text',{x:5,y:20},'ч'),svg('text',{x:width/2,y:320,'text-anchor':'middle'},'Дата завершения · UTC'));
  for(const [label,v,color,dash]of [['Медиана',median,'#6574ce',''],['P'+percentile,value,'#b84d31','6 4']])if(v!=null){root.append(svg('line',{x1:left,y1:y(v),x2:right,y2:y(v),stroke:color,'stroke-dasharray':dash}));const text=svg('text',{x:label==='Медиана'?left:440,y:20,fill:color},`${label}: ${fmt(v)} ч`);root.append(text);}
  for(const r of sample){const dot=svg('circle',{cx:x(r.completedAt),cy:y(r[key]),r:5,fill:'#087e8b',stroke:'white','stroke-width':1});interactive(dot,`${r.key} · ${new Date(r.completedAt).toISOString().slice(0,10)} · ${fmt(r[key])} ч`,[r],select);root.append(dot);}
 }
 return {bars,horizontal,scatter,empty};
})();
