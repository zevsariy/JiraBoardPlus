/* Isolated world: settings transport and a small, explicit compatibility status. */
(() => {
  if(globalThis.jbpNativeRefreshUI||!location.pathname.endsWith('/secure/RapidBoard.jspa'))return;
  globalThis.jbpNativeRefreshUI=true;
  let prefs={},state={},host;
  const send=async type=>{const r=await chrome.runtime.sendMessage({type});if(!r?.ok)throw Error(r?.error||'Служба расширения недоступна');return r.data;};
  function render(){
    const u=new URL(location.href),pool=document.querySelector('#ghx-pool');
    if(!pool||!pool.getClientRects().length||![null,'work','detail'].includes(u.searchParams.get('view'))){host?.remove();host=null;return;}
    if(!host?.isConnected){
      host=document.createElement('div');host.dataset.jbpRefresh='';
      const root=host.attachShadow({mode:'open'});
      root.innerHTML='<style>:host{display:block;margin:6px 10px;font:12px sans-serif;color:#344269}.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px 10px;border:1px solid #dfe3f4;border-radius:4px;background:#f0f2ff}button{font:inherit;padding:4px 8px;cursor:pointer}span{flex:1}</style><div class="bar"><span role="status"></span><button type="button">Проверить Jira</button></div>';
      globalThis.JbpUI?.mount(root,true);pool.before(host);
      root.querySelector('button').onclick=async()=>{try{state=await send('nativeRefreshNow');render();}catch(e){root.querySelector('span').textContent=e.message;}};
    }
    const mode=prefs.nativeRefreshMode||'jira';
    const text=!state.supported?'Jira · управление таймером не подтверждено. Перезагрузите вкладку; версия Jira может не поддерживаться.':state.error||`Jira · ${state.running?'проверка…':state.paused?'пауза: вкладка неактивна':mode==='manual'?'только вручную':mode==='auto'?`автопроверка каждые ${prefs.nativeRefreshSeconds} с`:'штатный интервал'} · новые данные через уведомление Jira`;
    const label=host.shadowRoot.querySelector('span');if(label.textContent!==text)label.textContent=text;
    host.shadowRoot.querySelector('button').disabled=!state.supported||state.running;
  }
  async function sync(value){prefs=value;try{state=await send('nativeRefreshConfigure');}catch(e){state={error:e.message};}render();}
  document.addEventListener('jbp-native-refresh-status',event=>{try{const v=JSON.parse(event.detail);state={supported:v.supported===true,running:v.running===true,paused:v.paused===true,error:typeof v.error==='string'?v.error.slice(0,300):''};render();}catch{}});
  chrome.runtime.onMessage.addListener(m=>{if(m.type==='boardPrefsChanged')sync(m.prefs);});
  chrome.runtime.sendMessage({type:'boardPrefsGet'}).then(r=>{if(r?.ok)sync(r.data);}).catch(()=>{});
  setInterval(()=>{if(!document.hidden)render();},1000);
})();
