/* Serialized by scripting.executeScript into the selected Jira tab, ISOLATED world. */
globalThis.JbpDiagnosticProbe=async function(base,kind,id){
  const endpoints={serverInfo:'serverInfo',session:'myself'},path=endpoints[kind];
  if(!path||!location.href.startsWith(base+'/'))throw Error('Недопустимая проба или вкладка.');
  if(globalThis.jbpDiagnosticActiveProbe)throw Error('Проба уже выполняется.');
  const controller=new AbortController(),at=new Date().toISOString(),start=performance.now(),url=base+'/rest/api/2/'+path;
  const record={id,controller};globalThis.jbpDiagnosticActiveProbe=record;
  let visible=!document.hidden;const visibility=()=>{if(document.hidden)visible=false;};document.addEventListener('visibilitychange',visibility);
  let timeout=false,timer=setTimeout(()=>{timeout=true;controller.abort();},15000),status=null,headersMs=null,bytes=0,serverTiming=[],meta={},requestId,nodeId,serverDate,retryMs=0,contentType='';
  try{
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
    status=response.status;headersMs=performance.now()-start;contentType=response.headers.get('content-type')||'';
    const retry=response.headers.get('retry-after');if(retry)retryMs=Math.min(3600000,Math.max(0,/^\d+$/.test(retry)?Number(retry)*1000:Date.parse(retry)-Date.now())||0);
    serverTiming=JbpDiagnostics.parseServerTiming(response.headers.get('server-timing'));
    const safeId=value=>value&&/^[\w.:-]{1,160}$/.test(value)?value:undefined;
    requestId=safeId(response.headers.get('x-arequestid'));nodeId=safeId(response.headers.get('x-anodeid'));
    const date=Date.parse(response.headers.get('date'));serverDate=Number.isFinite(date)?new Date(date).toISOString():null;
    const reader=response.body?.getReader(),chunks=[];
    if(reader)while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>262144){await reader.cancel();throw Error('response-limit');}if(kind==='serverInfo')chunks.push(part.value);}
    if(kind==='serverInfo'&&response.ok&&/application\/json/i.test(contentType)){
      const dataBytes=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){dataBytes.set(chunk,offset);offset+=chunk.byteLength;}
      try{const data=JSON.parse(new TextDecoder().decode(dataBytes));for(const key of ['version','buildNumber','deploymentType'])if(typeof data[key]==='string'&&/^[a-z0-9 ._-]{1,80}$/i.test(data[key]))meta[key]=data[key];}catch{}
    }
    const durationMs=performance.now()-start;
    // Timing delivery can lag fetch resolution; yielding once does not send another request.
    await new Promise(resolve=>setTimeout(resolve,0));
    const entries=performance.getEntriesByName(url,'resource').filter(e=>e.startTime>=start&&e.startTime<=start+durationMs);
    const phases=entries.length===1?JbpDiagnostics.timing(entries[0],base):null;
    return {at,kind,outcome:'http',status,durationMs:JbpDiagnostics.round(durationMs),headersMs:JbpDiagnostics.round(headersMs),bytes,phases,serverTiming,meta,requestId,nodeId,serverDate,retryMs,json:/application\/json/i.test(contentType),visible};
  }catch(e){return {at,kind,outcome:timeout?'timeout':controller.signal.aborted?'cancelled':e.message==='response-limit'?'response-limit':'network-error',status,durationMs:JbpDiagnostics.round(performance.now()-start),headersMs:JbpDiagnostics.round(headersMs),bytes,serverTiming,meta,requestId,nodeId,serverDate,retryMs,visible};}
  finally{document.removeEventListener('visibilitychange',visibility);clearTimeout(timer);if(globalThis.jbpDiagnosticActiveProbe===record)delete globalThis.jbpDiagnosticActiveProbe;}
};
