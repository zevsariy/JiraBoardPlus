(() => {
  if(location.protocol!=='https:')return;
  const B=JbpBoard,TTL=120000,keyPattern=/^[A-Z][A-Z0-9_]*-\d+$/;
  const context=document.querySelector('meta[name="ajs-context-path"]')?.content||'';
  if(context&&!/^\/[\w/-]*$/.test(context))return;
  let prefs={...B.defaults},current='',controller,running=false,rerun=false,forceNext=false,timer,rows=new Map(),additions=new Map(),scopeAt=0,scopeError='',errors=[],bar,fetchedAt=0;
  let tooltip,tooltipAnchor,hideTimer;
  function hideTooltip(){clearTimeout(hideTimer);tooltip?.remove();tooltip=null;tooltipAnchor?.setAttribute('aria-expanded','false');tooltipAnchor=null;}
  function scheduleHide(){clearTimeout(hideTimer);hideTimer=setTimeout(hideTooltip,220);}
  function showTooltip(anchor,title,description,items=[]){
    hideTooltip();tooltipAnchor=anchor;anchor.setAttribute('aria-expanded','true');tooltip=document.createElement('div');tooltip.dataset.jbpTooltip='';
    Object.assign(tooltip.style,{position:'fixed',zIndex:'2147483647',width:'330px',maxWidth:'calc(100vw - 16px)',pointerEvents:'auto'});
    const root=tooltip.attachShadow({mode:'open'});root.innerHTML='<style>:host{font:12px "Segoe UI",sans-serif;color:#172b4d}.box{background:white;border:1px solid #d9ddf0;border-radius:7px;box-shadow:0 8px 30px #172b4d33;padding:14px;max-height:min(360px,calc(100vh - 24px));overflow:auto}h3{margin:0 0 5px;font-size:13px}p{white-space:pre-line;font-size:11px;color:#667085;line-height:1.5;margin:5px 0 10px}table{font:inherit;width:100%;border-collapse:collapse}td{padding:6px 3px;border-top:1px solid #eef0f7;overflow-wrap:anywhere}td:last-child{white-space:nowrap;text-align:right}.current{background:#eef0ff;color:#303bba;font-weight:600}</style><section class="box" role="tooltip"><h3></h3><p></p><table><tbody></tbody></table></section>';globalThis.JbpUI?.mount(root,true);
    root.querySelector('h3').textContent=title;root.querySelector('p').textContent=description;
    for(const item of items){const tr=document.createElement('tr');if(item.current)tr.className='current';for(const value of [item.name,B.formatHours(item.hours,prefs.timeUnit)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}root.querySelector('tbody').append(tr);}
    tooltip.addEventListener('pointerenter',()=>clearTimeout(hideTimer));tooltip.addEventListener('pointerleave',scheduleHide);document.body.append(tooltip);
    const rect=anchor.getBoundingClientRect(),height=tooltip.offsetHeight;tooltip.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-tooltip.offsetWidth-8))}px`;tooltip.style.top=`${Math.max(8,rect.bottom+height+8<=innerHeight?rect.bottom+6:rect.top-height-6)}px`;
  }
  addEventListener('keydown',e=>{if(e.key==='Escape'&&tooltip){e.stopPropagation();hideTooltip();}},true);addEventListener('resize',hideTooltip);addEventListener('scroll',e=>{if(tooltip&&!e.composedPath().includes(tooltip))hideTooltip();},true);
  function route(){const u=new URL(location.href),id=u.searchParams.get('rapidView');return u.pathname.endsWith('/secure/RapidBoard.jspa')&&/^\d+$/.test(id||'')&&['work','detail','planning','planning.nodetail',null].includes(u.searchParams.get('view'))?id:null;}
  function planning(){return ['planning','planning.nodetail'].includes(new URL(location.href).searchParams.get('view'));}
  function cardPool(){return planning()?document.querySelector('#ghx-plan, #ghx-backlog'):document.querySelector('#ghx-pool');}
  function cards(pool){return [...pool.querySelectorAll('.ghx-issue[data-issue-key], .ghx-issue-compact[data-issue-key]')].filter(el=>keyPattern.test(el.dataset.issueKey)&&el.getClientRects().length);}
  function clearCardStyle(el){el.removeAttribute('data-jbp-added');el.removeAttribute('data-jbp-filled');for(const key of ['--jbp-added','--jbp-width','--jbp-fill'])el.style.removeProperty(key);}
  function clean(){hideTooltip();document.querySelectorAll('[data-jbp-card],[data-jbp-board]').forEach(el=>el.remove());document.querySelectorAll('[data-jbp-added],[data-jbp-filled]').forEach(clearCardStyle);bar=null;}
  const css=document.createElement('style');css.textContent='[data-jbp-added]{outline:var(--jbp-width) solid var(--jbp-added)!important;outline-offset:calc(-1 * var(--jbp-width))}[data-jbp-filled]{background-color:var(--jbp-fill)!important}[data-jbp-card]{display:block;clear:both;padding:4px 7px;pointer-events:auto!important;position:relative;z-index:2}[data-jbp-board]{display:block;clear:both;margin:6px 10px}';document.head.append(css);
  async function get(path,signal){const res=await fetch(`${context}/rest/${path}`,{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});if(!res.ok)throw new Error(`HTTP ${res.status}: ${res.status===401?'войдите в Jira':res.status===403?'нет доступа':'данные недоступны'}`);if(!res.headers.get('content-type')?.includes('application/json'))throw new Error('Ответ не JSON: проверьте сессию Jira.');return res.json();}
  async function loadScope(id, signal) {
    const result = new Map(); let start = 0;
    for (let page = 0; page < 20; page++) {
      const data = await get(`agile/1.0/board/${id}/sprint?state=active&startAt=${start}&maxResults=50`, signal);
      if (!Array.isArray(data.values) || data.startAt !== start) throw new Error('Неизвестный формат списка спринтов.');
      for (const sprint of data.values) {
        if (!Number.isInteger(sprint.id) || sprint.state !== 'active') continue;
        const report = await get(`greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${id}&sprintId=${sprint.id}`, signal);
        const added = B.addedKeys(report);
        // Exclude tasks removed from this sprint, including tasks moved between parallel sprints.
        const contents = report.contents;
        if (!Array.isArray(contents.completedIssues) || !Array.isArray(contents.issuesNotCompletedInCurrentSprint)) throw new Error('Sprint Report: не удалось определить текущий состав.');
        const members = new Set([...contents.completedIssues, ...contents.issuesNotCompletedInCurrentSprint, ...(contents.issuesCompletedInAnotherSprint || [])].map(i => i.key));
        for (const key of added) if (members.has(key)) result.set(key, [...(result.get(key) || []), sprint.name]);
      }
      start += data.values.length;
      if (data.isLast === true || (Number.isInteger(data.total) && start >= data.total)) return result;
      if (!data.values.length) throw new Error('Неполный список спринтов.');
    }
    throw new Error('Слишком много активных спринтов.');
  }

  function parentEnabled(p=prefs){return planning()?p.parentBacklog:p.parentBoard;}
  function fetchKey(p){return JSON.stringify([parentEnabled(p),p.parentTypes,p.epicLinkField,p.componentLinkField,p.epicFields,p.componentFields,p.build,p.buildField,p.buildStatusNames,p.blockedStatusNames,p.unblockingStatusNames,p.daily,p.staleDays,p.flagged,p.doneStatusNames,p.doneCategory,p.age,p.source,p.calendar,p.timeMode]);}
  function draw(pool){
    if(tooltip&&!tooltipAnchor?.isConnected)hideTooltip();
    let attention=0,added=0;const visible=cards(pool);
    for(const card of visible){
      const key=card.dataset.issueKey,data=rows.get(key),tags=[];
      const scoped=prefs.scope&&additions.has(key);if(scoped)added++;
      if(scoped&&prefs.scopeOutline){card.dataset.jbpAdded='';card.style.setProperty('--jbp-added',prefs.color);card.style.setProperty('--jbp-width',`${prefs.borderWidth}px`);}else{card.removeAttribute('data-jbp-added');card.style.removeProperty('--jbp-added');card.style.removeProperty('--jbp-width');}
      if(scoped&&prefs.scopeFill){card.dataset.jbpFilled='';card.style.setProperty('--jbp-fill',prefs.fillColor);}else{card.removeAttribute('data-jbp-filled');card.style.removeProperty('--jbp-fill');}
      if(scoped&&prefs.scopeLabel)tags.push({type:'scope',text:'+ После старта',title:`Добавлена после старта: ${additions.get(key).join(', ')}.\nИсточник: Jira Sprint Report.${scopeError?'\nПоследние доступные данные; обновление не удалось.':''}`});
      if(data){
        if(parentEnabled()&&data.parents)tags.push({type:"parents",text:"↥ Родители",title:data.parents});
        if(prefs.daily){const daily=(data.daily||[]).filter(t=>prefs[t.type]);if(daily.length)attention++;tags.push(...daily);}
        if(prefs.build&&data.build)tags.push({type:'build',text:'Есть билд',title:`Поле ${prefs.buildField} заполнено; статус соответствует настройкам.`});
        if(prefs.build&&data.buildError)tags.push({type:'error',text:'Билд: ?',title:data.buildError});
        if(prefs.age)tags.push({type:'age',text:data.hours==null?'Время: ?':B.formatHours(data.hours,prefs.timeUnit),title:data.ageError||data.ageTitle||'Нет данных о времени.',items:data.ageError?[]:data.statuses,source:data.source||prefs.source});
        if(data.error)tags.push({type:'error',text:'Данные: ?',title:`${data.error}${data.daily||data.hours!=null?'\nПоказаны последние доступные данные.':''}`});
      }
      const old=card.querySelector('[data-jbp-card]');
      const signature=JSON.stringify([tags,prefs.agePopup,prefs.timeUnit,prefs.timeMode,prefs.source]);
      if(old?.shadowRoot&&old.dataset.signature===signature)continue;
      if(old&&tooltipAnchor&&old.shadowRoot?.contains(tooltipAnchor))hideTooltip();old?.remove();if(!tags.length)continue;
      const host=document.createElement('div');host.dataset.jbpCard='';host.dataset.signature=signature;
      const root=host.attachShadow({mode:'open'});root.innerHTML='<style>:host{font:11px "Segoe UI",sans-serif;pointer-events:auto!important}.tags{display:flex;flex-wrap:wrap;gap:3px;pointer-events:auto}button{font:inherit;border:0;padding:2px 5px;background:#fff0ce;color:#694600;border-radius:3px;line-height:1.4;pointer-events:auto!important;cursor:help;display:inline-flex;align-items:center;gap:4px}.age{background:#edf0ff;color:#333e8a}.scope{background:#eee8ff;color:#422d73}.blocked{background:#ffebe6;color:#a02018}.build,.unblocked{background:#dcf5e7;color:#155c37}.error,.unknown{background:#fff0ce;color:#694600}</style><div class="tags"></div>';globalThis.JbpUI?.mount(root,true);
      for(const tag of tags){
        const button=document.createElement('button');button.type='button';button.textContent=tag.text;button.className=`${tag.type||''} ${tag.tone||''}`;button.title=tag.title;
        if(tag.type==='age'){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 16 16');icon.setAttribute('width','13');icon.setAttribute('height','13');icon.setAttribute('aria-hidden','true');icon.innerHTML='<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4v4l3 2" fill="none" stroke="currentColor" stroke-width="1.4"/>';button.prepend(icon);}
        const popup=tag.type!=='age'||prefs.agePopup;
        const show=()=>{if(!popup)return;showTooltip(button,tag.type==='age'?`${tag.source==='timepiece'?'Timepiece':'Jira'} · ${key}`:`${tag.text} · ${key}`,tag.title,tag.items||[]);};
        for(const type of ['pointerdown','mousedown','dblclick'])button.addEventListener(type,e=>e.stopPropagation());
        button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();show();});
        if(popup){button.title='';button.setAttribute('aria-expanded','false');button.addEventListener('pointerenter',show);button.addEventListener('pointerleave',scheduleHide);button.addEventListener('focus',show);button.addEventListener('blur',scheduleHide);}
        root.querySelector('.tags').append(button);
      }
      card.append(host);
    }
    if(!prefs.summary){bar?.remove();bar=null;return;}
    if(!bar?.isConnected){bar=document.createElement('div');bar.dataset.jbpBoard='';const root=bar.attachShadow({mode:'open'});root.innerHTML='<style>:host{font:12px "Segoe UI",sans-serif;color:#344269}.bar{display:flex;align-items:center;gap:10px;padding:7px 10px;background:#f0f2ff;border:1px solid #dfe3f4;border-radius:4px}button{font:inherit;padding:3px 8px;border:1px solid #bec5df;background:white;color:#303bea;cursor:pointer}p{margin:4px 0;color:#a32720;white-space:pre-wrap}</style><div class="bar"><span id="text" role="status"></span><button>Обновить</button></div><p id="error" role="status"></p>';globalThis.JbpUI?.mount(root,true);root.querySelector('button').onclick=()=>{forceNext=true;refresh();};pool.before(bar);}
    if(bar.previousElementSibling!==pool&&bar.nextElementSibling!==pool)pool.before(bar);
    const text=`Board Plus · карточек: ${visible.length}${prefs.daily?` · требуют внимания: ${attention}`:''}${prefs.scope?` · после старта: ${added}`:''} · ${running?'обновление…':fetchedAt?`обновлено ${new Date(fetchedAt).toLocaleTimeString()}`:'ожидание'}`;
    if(bar.shadowRoot.getElementById('text').textContent!==text)bar.shadowRoot.getElementById('text').textContent=text;
    bar.shadowRoot.getElementById('error').textContent=errors.join('\n');
  }
  async function refresh(){
    const id=route();
    if(!id||!prefs.visuals||(planning()&&!prefs.backlog)||!(prefs.daily||prefs.scope||prefs.age||prefs.build||parentEnabled())){
      controller?.abort();if(current){clean();rows.clear();additions.clear();scopeAt=0;current='';errors=[];}return;
    }
    if(current!==id){controller?.abort();clean();rows.clear();additions.clear();scopeAt=0;scopeError='';fetchedAt=0;errors=[];current=id;}
    const pool=cardPool();
    // Jira can temporarily detach/hide the pool while opening Details. Keep the cache.
    if(!pool||!pool.getClientRects().length||document.hidden)return;
    draw(pool);if(running){rerun=true;return;}
    const signature=fetchKey(prefs),keys=[...new Set(cards(pool).map(c=>c.dataset.issueKey))].slice(0,300);
    const queue=(prefs.daily||prefs.age||prefs.build||parentEnabled())?keys.filter(k=>forceNext||!rows.has(k)||rows.get(k).config!==signature||Date.now()-rows.get(k).at>=TTL):[];
    const scopeDue=prefs.scope&&(forceNext||!scopeAt||Date.now()-scopeAt>=TTL);
    if(!queue.length&&!scopeDue)return;
    forceNext=false;running=true;controller=new AbortController();const signal=controller.signal,p=prefs,nextRows=new Map(rows);let nextScope=additions,nextScopeAt=scopeAt,nextScopeError=scopeError;const nextErrors=[];
    if(cards(pool).length>300)nextErrors.push('Обрабатываются первые 300 карточек. Уточните фильтр доски.');draw(pool);
    try{
      if(scopeDue){try{const config=await get(`agile/1.0/board/${id}/configuration`,signal);nextScope=config.type==='kanban'?new Map():await loadScope(id,signal);nextScopeError='';}catch(e){if(signal.aborted)throw e;nextScopeError=e.message;}nextScopeAt=Date.now();}
      if(nextScopeError)nextErrors.push(`Состав спринта: ${nextScopeError}`);
      let buildField,buildError;
      if(p.build&&queue.length){try{buildField=B.resolveBuildField(await get('api/2/field',signal),p.buildField);}catch(e){if(signal.aborted)throw e;buildError=e.message;}}
      let parentConfig,parentError;const parentCache=new Map();
      if(parentEnabled(p)&&queue.length){try{parentConfig=B.parentConfig(await get('api/2/field',signal),p);}catch(e){if(signal.aborted)throw e;parentError=e.message;}}
      const fetchParent=key=>{if(!parentCache.has(key)){const fields=[...new Set(['issuetype',parentConfig.component,...parentConfig.epicFields.map(f=>f.id),...parentConfig.componentFields.map(f=>f.id)].filter(Boolean))];parentCache.set(key,get(`api/2/issue/${key}?fields=${fields.join(',')}`,signal).then(i=>{if(!i.fields)throw Error('Поля родителя недоступны');return i;}));}return parentCache.get(key);};
      const linked=new Map();
      const linkedStatus=key=>{if(!linked.has(key))linked.set(key,get(`api/2/issue/${key}?fields=status`,signal).then(v=>{if(!v.fields?.status?.name)throw new Error('Статус недоступен');return {key,status:v.fields.status};}).catch(e=>{if(signal.aborted)throw e;return {key,error:e.message};}));return linked.get(key);};
      await Promise.all(Array.from({length:3},async()=>{while(queue.length&&!signal.aborted){const key=queue.shift();try{
        const fields=['issuetype',...(parentConfig?[parentConfig.epic]:[]),...(buildField?[buildField]:[]),'updated','assignee','duedate','status','created',...(p.daily&&p.flagged?['issuelinks']:[])];
        const issue=await get(`api/2/issue/${key}?fields=${fields.join(',')}${p.age&&p.source==='jira'?'&expand=changelog':''}`,signal);if(!issue.fields)throw new Error('Ответ Jira не содержит fields.');
        const entry={at:Date.now(),config:signature,source:p.source,daily:p.daily?B.daily(issue,p.staleDays,Date.now(),p):[]};
        if(parentEnabled(p)&&B.parentList(p.parentTypes).some(t=>t.toLowerCase()===String(issue.fields.issuetype?.name).toLowerCase())){try{if(parentError)throw Error(parentError);entry.parents=await B.parentInfo(issue,p,parentConfig,fetchParent);}catch(e){if(signal.aborted)throw e;entry.parents='Родительские поля: '+e.message;}}
        if(p.daily&&!Object.hasOwn(issue.fields,'assignee'))entry.error='Jira не вернула assignee: исполнитель неизвестен.';
        if(p.daily&&p.flagged){try{const blockers=[];for(const linkedKey of B.blockerKeys(issue,p))blockers.push(await linkedStatus(linkedKey));const tag=B.blockage(blockers,p);if(tag)entry.daily.push(tag);}catch(e){if(signal.aborted)throw e;entry.daily.push({type:'flagged',tone:'unknown',text:'БЛОКИРОВКА: ?',title:e.message});}}
        if(p.build){try{if(buildError)throw new Error(buildError);entry.build=B.hasBuild(issue,buildField,p);}catch(e){entry.buildError=e.message;}}
        if(p.age){try{
          if(p.source==='timepiece'){const params=new URLSearchParams({issueKey:key,columnsBy:'statusDuration',multiVisitBehavior:p.timeMode,calendar:p.calendar,dayLength:'24HourDays',viewFormat:'hours',outputType:'json'});const report=await get(`tis/report/1.0/api/issue?${params}`,signal);entry.statuses=B.timepieceStatuses(report,key,issue.fields.status?.id,p.timeMode,p.timeUnit);}
          else entry.statuses=B.jiraTimes(issue,p.timeMode);
          entry.hours=entry.statuses.find(v=>v.current)?.hours;
          entry.ageTitle=`${p.source==='timepiece'?'Timepiece 5.1':'Jira'} · ${issue.fields.status?.name}\n${p.timeMode==='last'?'Текущий визит (для других статусов — последний)':'Сумма всех визитов в каждый статус'} · календарь ${p.source==='timepiece'?p.calendar:'24×7'}\nДень = 24 ч, неделя = 168 ч. Данные на ${new Date(entry.at).toLocaleTimeString()}.`;
        }catch(e){if(signal.aborted)throw e;entry.ageError=e.message;}}
        nextRows.set(key,entry);
      }catch(e){if(!signal.aborted)nextRows.set(key,{...rows.get(key),at:Date.now(),config:signature,error:e.message,ageError:e.message});}}}));
      if(!signal.aborted&&current===id&&fetchKey(prefs)===signature){rows=nextRows;additions=nextScope;scopeAt=nextScopeAt;scopeError=nextScopeError;errors=nextErrors;fetchedAt=Date.now();}
    }catch(e){if(!signal.aborted)errors=[e.message];}
    finally{running=false;const live=cardPool();if(current===id&&route()===id&&live&&!document.hidden)draw(live);if(rerun||forceNext){rerun=false;setTimeout(refresh,0);}}
  }
  function apply(value){try{const next=B.validate(value);if(fetchKey(prefs)!==fetchKey(next))controller?.abort();prefs=next;refresh();}catch(e){console.warn('Board Plus:',e.message);}}
  chrome.runtime.onMessage.addListener(m=>{if(m.type==='boardPrefsChanged')apply(m.prefs);});chrome.runtime.sendMessage({type:'boardPrefsGet'}).then(r=>{if(r?.ok)apply(r.data);}).catch(()=>{});
  new MutationObserver(records=>{if(!records.some(r=>!r.target.closest?.('[data-jbp-card],[data-jbp-board],[data-jbp-tooltip]')&&[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&!n.matches?.('[data-jbp-card],[data-jbp-board],[data-jbp-tooltip]'))))return;clearTimeout(timer);timer=setTimeout(refresh,80);}).observe(document.body,{childList:true,subtree:true});
  setInterval(refresh,15000);addEventListener('popstate',refresh);document.addEventListener('visibilitychange',refresh);
})();
