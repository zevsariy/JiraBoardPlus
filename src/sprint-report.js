(() => {
  if(location.protocol!=='https:')return;
  // Do not start observers, timers or messaging on Plans and unrelated Jira pages.
  if (!location.pathname.endsWith('/secure/RapidBoard.jspa')) return;
  let prefs={},active='',host,dispose,chosenKeys;const hidden=new Map();
  function restore(){for(const [row,wasHidden]of hidden)row.hidden=wasHidden;hidden.clear();}
  function filter(keys){chosenKeys=keys;restore();if(!keys)return;for(const row of document.querySelectorAll('table tbody tr')){if(row.closest('[data-jbp-sprint]'))continue;const link=row.querySelector('a[href*="/browse/"]');const key=link?.textContent.trim();if(!/^[A-Z][A-Z0-9_]*-\d+$/.test(key||''))continue;hidden.set(row,row.hidden);row.hidden=!keys.has(key);}}
  function sync(){
    const u=new URL(location.href),board=u.searchParams.get('rapidView'),sprint=u.searchParams.get('sprint');
    const isSprintReport=['report','reporting'].includes(u.searchParams.get('view'))&&(u.searchParams.get('chart')||u.searchParams.get('report'))==='sprintRetrospective';
    const id=prefs.visuals!==false&&prefs.sprintTools&&u.pathname.endsWith('/secure/RapidBoard.jspa')&&isSprintReport&&/^\d+$/.test(board||'')&&/^\d+$/.test(sprint||'')?`${board}:${sprint}`:'';
    const signature=id?`${id}:${prefs.sprintExport!==false}:${prefs.sprintAssignee!==false}:${prefs.sprintMetrics!==false}:${prefs.sprintHealth!==false}`:'';
    if(active===signature&&(!id||host?.isConnected)){if(chosenKeys)filter(chosenKeys);return;}
    dispose?.();host?.remove();restore();dispose=null;host=null;active='';if(!id)return;
    const header=document.querySelector('#ghx-report-head, .ghx-report-head, #ghx-chart-selector');
    if(!header)return;active=signature;host=document.createElement('div');host.dataset.jbpSprint='';host.style.cssText='margin:12px 0;clear:both';header.after(host);
    const root=host.attachShadow({mode:'open'});dispose=JbpSprint.mount(root,{boardId:board,sprintId:sprint,context:document.querySelector('meta[name="ajs-context-path"]')?.content||'',onFilter:filter,features:{export:prefs.sprintExport!==false,assignee:prefs.sprintAssignee!==false,metrics:prefs.sprintMetrics!==false,health:prefs.sprintHealth!==false}});
  }
  chrome.runtime.onMessage.addListener(m=>{if(m.type==='boardPrefsChanged'){prefs=m.prefs;sync();}});
  chrome.runtime.sendMessage({type:'boardPrefsGet'}).then(r=>{if(r?.ok){prefs=r.data;sync();}}).catch(()=>{});
  setInterval(sync,1000);addEventListener('popstate',sync);
})();
