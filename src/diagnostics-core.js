/* Browser observations are evidence, not access to Jira's JVM or the network stack. */
globalThis.JbpDiagnostics = (() => {
  const finite = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const round = v => v === null ? null : Math.round(v * 10) / 10;
  function route(value, base) {
    let url, root;
    try { url = new URL(value); root = new URL(base); } catch { return 'unknown'; }
    if (url.origin !== root.origin) return 'external-resource';
    const prefix = root.pathname.replace(/\/$/, '');
    if (prefix && !url.pathname.startsWith(prefix + '/')) return 'same-origin-other-app';
    const path = url.pathname.slice(prefix.length);
    for (const p of ['/rest/api/2/search','/rest/api/2/serverInfo','/rest/api/2/myself','/rest/api/2/field','/secure/RapidBoard.jspa']) if (path === p) return p;
    for (const p of ['/rest/api/2/issue','/rest/api/2/project','/rest/agile/1.0/board','/rest/agile/1.0/sprint','/rest/greenhopper','/plugins','/download','/s']) if (path.startsWith(p + '/')) return p + '/*';
    if (path.startsWith('/rest/')) return '/rest/other';
    if (/\.(?:js|css|png|jpg|jpeg|svg|gif|woff2?|ico)$/i.test(path)) return '/assets/*';
    return '/other';
  }
  function serverTiming(entries) {
    return (Array.isArray(entries) ? entries : []).slice(0, 30).filter(e => e && /^[a-z0-9_.-]{1,64}$/i.test(e.name) && finite(e.duration) !== null).map(e => ({name:e.name, duration:round(e.duration)}));
  }
  function parseServerTiming(header) {
    // Descriptions are intentionally discarded; split only outside quoted strings.
    return serverTiming(String(header || '').slice(0, 8192).match(/(?:[^,"]|"(?:\\.|[^"\\])*")+/g)?.map(part => {
      const name = part.trim().split(';')[0], match = /(?:^|;)\s*dur\s*=\s*(\d+(?:\.\d+)?)/i.exec(part);
      return {name, duration:match ? Number(match[1]) : NaN};
    }) || []);
  }
  function timing(e, base) {
    const sameOrigin = (() => {try{return new URL(e.name).origin === new URL(base).origin;}catch{return false;}})();
    const exposed = finite(e.requestStart) !== null && e.requestStart > 0 && e.responseStart >= e.requestStart;
    const delta = (a,b) => exposed && finite(e[a]) !== null && finite(e[b]) !== null && e[b] >= e[a] ? round(e[b]-e[a]) : null;
    const status = Number.isInteger(e.responseStatus) && e.responseStatus >= 100 && e.responseStatus <= 599 ? e.responseStatus : null;
    return {
      route:route(e.name,base), kind:['fetch','xmlhttprequest','script','css','img','link','navigation'].includes(e.initiatorType || e.entryType) ? e.initiatorType || e.entryType : 'other',
      startMs:round(finite(e.startTime)), durationMs:round(finite(e.duration)), status,
      dnsMs:delta('domainLookupStart','domainLookupEnd'), connectMs:delta('connectStart','connectEnd'),
      tcpMs:exposed && e.secureConnectionStart > 0 ? delta('connectStart','secureConnectionStart') : delta('connectStart','connectEnd'),
      tlsMs:exposed && e.secureConnectionStart > 0 ? delta('secureConnectionStart','connectEnd') : null,
      ttfbMs:delta('requestStart','responseStart'), downloadMs:delta('responseStart','responseEnd'),
      beforeRequestMs:delta('fetchStart','requestStart'),
      protocol:exposed && /^[a-z0-9./-]{1,20}$/i.test(e.nextHopProtocol || '') ? e.nextHopProtocol : null,
      transferBytes:exposed || sameOrigin ? finite(e.transferSize) : null,
      encodedBytes:exposed || sameOrigin ? finite(e.encodedBodySize) : null,
      decodedBytes:exposed || sameOrigin ? finite(e.decodedBodySize) : null,
      cache:exposed && e.transferSize === 0 && e.encodedBodySize > 0 ? 'local-cache' : 'unknown-or-network',
      timingExposed:exposed, serverTiming:serverTiming(e.serverTiming),
      workerMs:exposed && e.workerStart > 0 ? delta('workerStart','fetchStart') : null
    };
  }
  function stats(values) {
    const a=values.filter(v=>finite(v)!==null).sort((x,y)=>x-y);
    if (!a.length) return {n:0,min:null,p50:null,p95:null,max:null,mean:null};
    const q=p=>round(a[Math.ceil(a.length*p)-1]);
    return {n:a.length,min:round(a[0]),p50:q(.5),p95:q(.95),max:round(a.at(-1)),mean:round(a.reduce((s,v)=>s+v,0)/a.length)};
  }
  function summarize(capture, probes=[]) {
    const resources=capture?.resources || [], live=resources.filter(r=>!r.buffered), known=resources.filter(r=>r.status!==null), findings=[];
    const http=stats(probes.filter(p=>p.outcome==='http').map(p=>p.durationMs));
    const ttfb=stats(resources.map(r=>r.ttfbMs)), byRoute=new Map();
    for (const r of resources) {if(!byRoute.has(r.route))byRoute.set(r.route,[]);byRoute.get(r.route).push(r);}
    const endpoints=[...byRoute].map(([route,rs])=>({route,count:rs.length,httpKnown:rs.filter(r=>r.status!==null).length,errors:rs.filter(r=>r.status>=400).length,duration:stats(rs.map(r=>r.durationMs)),ttfb:stats(rs.map(r=>r.ttfbMs)),bytes:rs.reduce((s,r)=>s+(r.transferBytes||0),0)})).sort((a,b)=>b.duration.p95-a.duration.p95);
    const buckets=new Map();for(const r of live){const sec=Math.floor((r.startMs-(capture?.startMs||0))/1000);buckets.set(sec,(buckets.get(sec)||0)+1);}
    const visibleTasks=(capture?.longTasks||[]).filter(t=>t.visible), lag=stats(capture?.lagMs||[]), stalls=stats(visibleTasks.map(t=>t.duration));
    const statuses=probes.filter(p=>p.status>=400).map(p=>p.status).concat(known.filter(r=>r.status>=400).map(r=>r.status));
    const add=(area,evidence,interpretation,next)=>findings.push({area,evidence,interpretation,next});
    if(statuses.includes(429))add('Сервер / лимиты','Наблюдался HTTP 429.','Сервер или прокси ограничивает запросы.','Сопоставить время с rate limit на прокси и нагрузкой вкладок; активные пробы остановлены.');
    if(statuses.some(s=>s>=500))add('Сервер / прокси','Наблюдался HTTP 5xx.','Ошибка на стороне ответившего сервиса или промежуточного прокси.','Передать администратору время UTC, маршрут и request ID, если он доступен. Проверить логи Jira, балансировщика и БД.');
    if(statuses.some(s=>s===401||s===403))add('Сессия / доступ','Наблюдался HTTP 401/403.','Истекла сессия или недостаточно прав; это не измерение потери пакетов.','Проверить вход в Jira, SSO/VPN и права на endpoint.');
    const failed=probes.filter(p=>p.outcome!=='http'&&p.outcome!=='cancelled');
    if(failed.length)add('Сеть / доступность',`${failed.length} проб без полноценного HTTP-ответа.`, 'Браузер не различает здесь DNS, TLS, VPN, прокси и обрыв сети.','Сопоставить с системными DNS/маршрутными проверками и журналами прокси. Тайм-ауты не равны ICMP packet loss.');
    for(const [metric,label] of [['dnsMs','DNS'],['tcpMs','TCP'],['tlsMs','TLS']]){const s=stats(resources.map(r=>r[metric]).filter(v=>v>0));if(s.p95>300)add('Сеть',`${label}: P95 ${s.p95} мс, наблюдений ${s.n}.`,'Длительный этап установления соединения в доступных измерениях.','Проверить VPN, DNS, прокси и маршрут. Нули могут означать повторное использование соединения.');}
    if(ttfb.p95>1500)add('Сервер / путь запроса',`TTFB P95 ${ttfb.p95} мс по ${ttfb.n} запросам.`, 'Ожидание первого байта включает сеть, очередь, Jira, прокси и downstream; это не чистое время CPU.','Сравнить Server-Timing и активные пробы разных endpoints; запросить серверные логи/APM за тот же интервал.');
    if(http.n>=3 && http.p95-http.p50>500)add('Сеть / сервер',`Разброс HTTP: P95 − P50 = ${round(http.p95-http.p50)} мс.`,'Нестабильность сквозной задержки; источник ещё не локализован.','Сопоставить пики с TTFB, подключением, Server-Timing и long tasks.');
    if(stalls.max>200||lag.p95>200)add('Браузер',`В видимой вкладке: long task max ${stalls.max??'—'} мс; задержка таймера P95 ${lag.p95??'—'} мс.`,'Главный поток не успевал обрабатывать работу. Фоновые интервалы из таймерной метрики исключены.','Снять Performance trace в DevTools; проверить скрипты и DOM. Long task не доказывает виновность расширения.');
    const errors=capture?.errors;if(errors && errors.js+errors.rejections>0)add('Браузер / JavaScript',`JS errors: ${errors.js}; unhandled rejections: ${errors.rejections}.`,'За период записи зафиксированы необработанные ошибки.','Сопоставить время с Console/DevTools. Тексты ошибок не собирались.');
    const totalServerMetrics=resources.reduce((s,r)=>s+r.serverTiming.length,0)+probes.reduce((s,p)=>s+(p.serverTiming?.length||0),0);
    return {http,ttfb,endpoints,knownStatuses:known.length,httpErrors:known.filter(r=>r.status>=400).length,resourceCount:resources.length,liveCount:live.length,peakStartsPerSecond:Math.max(0,...buckets.values()),lag,stalls,totalServerMetrics,findings};
  }
  const pickNumbers=(input,keys)=>Object.fromEntries(keys.split(' ').map(k=>[k,finite(input?.[k])]));
  const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
  const routes=new Set(['unknown','external-resource','same-origin-other-app','/rest/other','/assets/*','/other','/rest/api/2/search','/rest/api/2/serverInfo','/rest/api/2/myself','/rest/api/2/field','/secure/RapidBoard.jspa',...['/rest/api/2/issue','/rest/api/2/project','/rest/agile/1.0/board','/rest/agile/1.0/sprint','/rest/greenhopper','/plugins','/download','/s'].map(p=>p+'/*')]);
  function cleanTiming(r={}){return {...pickNumbers(r,'startMs durationMs dnsMs connectMs tcpMs tlsMs ttfbMs downloadMs beforeRequestMs transferBytes encodedBytes decodedBytes workerMs'),route:routes.has(r.route)?r.route:'unknown',kind:['fetch','xmlhttprequest','script','css','img','link','navigation'].includes(r.kind)?r.kind:'other',status:Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:null,protocol:/^[a-z0-9./-]{1,20}$/i.test(r.protocol||'')?r.protocol:null,cache:r.cache==='local-cache'?'local-cache':'unknown-or-network',timingExposed:r.timingExposed===true,buffered:r.buffered===true,serverTiming:serverTiming(r.serverTiming)};}
  function cleanCapture(c){
    if(!c||typeof c!=='object')return null;
    const list=(key,n)=>Array.isArray(c[key])?c[key].filter(v=>v&&typeof v==='object').slice(-n):[];
    const env=c.environment||{},net=env.networkEstimate,heap=env.heap;
    return {...pickNumbers(c,'deadline startMs visibleObservedMs layoutShift lcpMs fcpMs'),running:c.running===true,startedAt:iso(c.startedAt),endedAt:iso(c.endedAt),capturedAt:iso(c.capturedAt),pageRoute:routes.has(c.pageRoute)?c.pageRoute:'unknown',
      resources:list('resources',2000).map(cleanTiming),longTasks:list('longTasks',500).map(t=>({...pickNumbers(t,'startMs duration'),visible:t.visible===true})),lagMs:(Array.isArray(c.lagMs)?c.lagMs:[]).filter(v=>finite(v)!==null).slice(-1000),marks:list('marks',100).map(m=>({at:iso(m.at),kind:['online','offline','user-symptom'].includes(m.kind)?m.kind:'unknown'})),
      errors:pickNumbers(c.errors,'js rejections resources'),dropped:pickNumbers(c.dropped,'resources longTasks lagMs marks'),capabilities:Object.fromEntries(['resource','longTask','layoutShift','lcp','responseStatus'].map(k=>[k,c.capabilities?.[k]===true])),
      environment:{online:env.online===true,visible:env.visible===true,browser:/^(Edg|Chrome|Firefox)\/[\d.]{1,30}$/.test(env.browser||'')?env.browser:'unknown',domElements:finite(env.domElements),networkEstimate:net?{...pickNumbers(net,'rttMs downlinkMbps'),effectiveType:['slow-2g','2g','3g','4g'].includes(net.effectiveType)?net.effectiveType:'unknown',saveData:net.saveData===true}:null,heap:heap?pickNumbers(heap,'usedBytes allocatedBytes limitBytes'):null},
      navigation:c.navigation?{...cleanTiming(c.navigation),...pickNumbers(c.navigation,'domInteractiveMs domContentLoadedMs loadMs'),type:['navigate','reload','back_forward','prerender'].includes(c.navigation.type)?c.navigation.type:'unknown'}:null};
  }
  function report(input, includeIdentifiers=false) {
    // Only these measurements leave the extension; no DOM, raw resource URLs or bodies.
    const out={schema:'jira-board-plus/diagnostics/v1',at:input.at,extensionVersion:input.extensionVersion,
      capture:cleanCapture(input.capture),probes:structuredClone(input.probes||[]),budget:structuredClone(input.budget||null),tabs:input.tabs,
      limitations:['HTTP-пробы не являются ICMP ping.','CPU/JVM/GC/БД, число TCP-сокетов и потери пакетов недоступны из браузера.','TTFB включает сеть, сервер и прокси; Server-Timing может содержать перекрывающиеся метрики.','Буфер Resource Timing может быть неполным; неизвестный HTTP-статус не считается успехом.']};
    if(includeIdentifiers)out.baseUrl=input.baseUrl;
    for(const p of out.probes)if(!includeIdentifiers){delete p.requestId;delete p.nodeId;}
    out.summary=summarize(out.capture,out.probes);return out;
  }
  return {finite,round,route,timing,serverTiming,parseServerTiming,stats,summarize,report,cleanCapture};
})();
