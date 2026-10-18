(() => {
 if(location.protocol!=='https:')return;
 let config,prefs,host;
 function sync(){
  const route=/RapidBoard\.jspa?$/.test(location.pathname)&&!new URLSearchParams(location.search).get('chart');
  const visible=route&&config?.enabled&&config.board&&prefs?.visuals;
  if(!visible){host?.remove();host=null;return;}
  if(host?.isConnected)return;
  host=document.createElement('div');host.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2000';
  const root=host.attachShadow({mode:'closed'}),button=document.createElement('button');
  button.textContent='Анализ доски через ИИ';button.className='primary';root.append(button);globalThis.JbpUI?.mount(root,true);document.documentElement.append(host);
  button.onclick=()=>JbpAIUI.open('board',()=>{
   const cards=[...document.querySelectorAll('.ghx-issue[data-issue-key], .ghx-issue-compact[data-issue-key]')].filter(n=>n.getClientRects().length);
   return JbpAIUI.send('aiBoardData',{keys:[...new Set(cards.map(n=>n.dataset.issueKey))]});
  });
 }
 Promise.all([JbpAIUI.send('aiGet'),chrome.runtime.sendMessage({type:'boardPrefsGet'})]).then(([c,r])=>{config=c;prefs=r?.data;sync();}).catch(()=>{});
 chrome.runtime.onMessage.addListener(m=>{if(m.type==='boardPrefsChanged'){prefs=m.prefs;sync();}});
 setInterval(sync,2000);
})();
