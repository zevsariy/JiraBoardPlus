/* Responsive SVG charts with keyboard drill-down; every graph also has a data table. */
globalThis.JbpAnalyticsCharts=(()=>{
 const NS='http://www.w3.org/2000/svg',palette=['#087e8b','#6574ce','#c47921','#b84d31'],fmt=n=>n==null?'—':Number(n).toLocaleString('ru-RU',{maximumFractionDigits:1});
 const node=(name,attrs={},text)=>{const n=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;};
 function draw(host,{title,kind='line',series=[],labels=[],rows=[],note='',unit='задач',threshold=null,xValues=null,xRange=null,select=()=>{}}){
  host.replaceChildren();const desc=document.createElement('p');desc.textContent=note;host.append(desc);
  if(!labels.length||!series.some(s=>s.values.some(Number.isFinite))){const p=document.createElement('p');p.className='analytics-empty';p.textContent='Нет подходящих данных. Проверьте период, статусы процесса и полноту истории.';host.append(p);return;}
  const w=640,h=300,l=58,r=620,t=30,b=240,rawMax=Math.max(1,threshold||0,...labels.map((_,i)=>kind==='area'?series.reduce((sum,s)=>sum+(s.values[i]||0),0):Math.max(0,...series.map(s=>s.values[i]||0)))),max=unit==='задач'?Math.ceil(rawMax/4)*4:rawMax;
  const svg=node('svg',{viewBox:`0 0 ${w} ${h}`,role:'group','aria-label':title}),y=v=>b-(b-t)*v/max,x=i=>xValues&&xRange?l+(r-l)*(xValues[i]-xRange.start)/(xRange.end-xRange.start):kind==='bar'?l+(r-l)*(i+.5)/labels.length:l+(r-l)*(labels.length===1?.5:i/(labels.length-1));
  host.append(svg);for(let i=0;i<=4;i++){const value=max*i/4;svg.append(node('line',{x1:l,y1:y(value),x2:r,y2:y(value),class:'analytics-grid-line'}),node('text',{x:l-8,y:y(value)+4,'text-anchor':'end'},fmt(value)));}
  svg.append(node('text',{x:5,y:14},unit));
  const stride=Math.max(1,Math.ceil(labels.length/6));labels.forEach((label,i)=>{if(i%stride===0||i===labels.length-1)svg.append(node('text',{x:x(i),y:b+23,'text-anchor':'middle'},String(label).slice(0,16)));});
  function mark(el,label,items){el.classList.add('analytics-mark');el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label',label);el.append(node('title',{},label));el.onclick=()=>select(label,items||[]);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(label,items||[]);}};svg.append(el);}
  let sums=labels.map(()=>0);
  series.forEach((s,j)=>{const color=palette[j%palette.length],valid=s.values.map((v,i)=>({v,i})).filter(p=>Number.isFinite(p.v));
   if(kind==='area'){const lower=[...sums];s.values.forEach((v,i)=>sums[i]+=v||0);const points=sums.map((v,i)=>`${x(i)},${y(v)}`).concat(lower.map((v,i)=>`${x(i)},${y(v)}`).reverse()).join(' ');svg.append(node('polygon',{points,fill:color,opacity:'.55'}));}
   if(kind==='line'){let part=[];const flush=()=>{if(part.length)svg.append(node('polyline',{points:part.join(' '),fill:'none',stroke:color,'stroke-width':2}));part=[];};s.values.forEach((v,i)=>{if(Number.isFinite(v))part.push(`${x(i)},${y(v)}`);else flush();});flush();}
   valid.forEach(({v,i})=>{const label=`${labels[i]} · ${s.name}: ${fmt(v)} ${unit}`,items=s.rows?.[i]||rows[i]||[];let el;
    if(kind==='bar'){const step=(r-l)/Math.max(1,labels.length),bw=Math.min(30,step*.75/series.length);el=node('rect',{x:l+i*step+step/2+(j-series.length/2)*bw,y:y(v),width:Math.max(2,bw-2),height:Math.max(2,b-y(v)),fill:color,rx:2});}
    else el=node('circle',{cx:x(i),cy:y(kind==='area'?sums[i]:v),r:kind==='scatter'?5:3,fill:color});
    mark(el,label,items);
   });
  });
  if(threshold!=null){svg.append(node('line',{x1:l,y1:y(threshold),x2:r,y2:y(threshold),stroke:'#b84d31','stroke-dasharray':'6 4'}),node('text',{x:r,y:Math.max(15,y(threshold)-6),'text-anchor':'end'},'SLE '+fmt(threshold)+' '+unit));}
  const legend=document.createElement('div');legend.className='analytics-legend';series.forEach((s,j)=>{const span=document.createElement('span'),dot=document.createElement('i');dot.style.background=palette[j%palette.length];span.append(dot,document.createTextNode(s.name));legend.append(span);});host.append(legend);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Данные графика';details.append(summary);const table=document.createElement('table'),head=document.createElement('tr');for(const text of ['Период / задача',...series.map(s=>s.name+' · '+unit)]){const th=document.createElement('th');th.textContent=text;head.append(th);}table.append(head);labels.forEach((label,i)=>{const tr=document.createElement('tr');for(const text of [label,...series.map(s=>fmt(s.values[i]))]){const td=document.createElement('td');td.textContent=text;tr.append(td);}table.append(tr);});details.append(table);host.append(details);
 }
 return {draw,fmt};
})();
