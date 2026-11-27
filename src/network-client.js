/* Shared budget for extension Jira calls, including isolated content scripts. */
(() => {
  if(globalThis.JbpNetwork)return;
  async function rpc(message){if(globalThis.jbpNetworkLocal)return globalThis.jbpNetworkLocal(message);const r=await chrome.runtime.sendMessage({type:'networkBudget',...message});if(!r?.ok)throw Error(r?.error||'Служба бюджета запросов недоступна. Обновите вкладку.');return r.data;}
  const wait=(ms,signal)=>new Promise((resolve,reject)=>{const finish=()=>{signal?.removeEventListener('abort',abort);resolve();},timer=setTimeout(finish,ms),abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason||new DOMException('Отменено','AbortError'));};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
  async function request(url,options={}){
    const absolute=new URL(url,globalThis.location?.href).href;
    if(!new URL(absolute).pathname.includes('/rest/'))return fetch(url,options);
    const signal=options.signal;let ticket;
    do{signal?.throwIfAborted();ticket=await rpc({op:'acquire',url:absolute});if(ticket.waitMs)await wait(ticket.waitMs,signal);}while(ticket.waitMs);
    if(ticket.bypass)return fetch(url,options);
    const at=Date.now();let status=0,retryMs=0;
    try{signal?.throwIfAborted();const response=await fetch(url,{...options,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});status=response.status;const retry=response.headers.get('retry-after');retryMs=retry===null?0:/^\d+$/.test(retry)?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now());
      // Keep the lease until the body has arrived, not merely the HTTP headers.
      const body=await response.arrayBuffer();return new Response([204,205,304].includes(status)?null:body,{status,statusText:response.statusText,headers:response.headers});
    }catch(error){status=0;throw error;}
    finally{await rpc({op:'release',id:ticket.id,status,durationMs:Date.now()-at,retryMs}).catch(()=>{});}
  }
  globalThis.JbpNetwork={fetch:request,rpc};
})();
