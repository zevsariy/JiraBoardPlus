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
  function explain(capture, inputProbes=[]) {
    const c=cleanCapture(capture),probes=(Array.isArray(inputProbes)?inputProbes:[]).map(cleanProbe),all=c?.resources||[];
    const historical=r=>r.buffered||(finite(c?.startMs)!==null&&finite(r.startMs)!==null&&r.startMs<c.startMs);
    const live=all.filter(r=>!historical(r)),jira=live.filter(r=>r.route.startsWith('/'));
    const findings=[],gaps=[],rank={high:3,medium:2,low:1};
    const dropped=Object.values(c?.dropped||{}).reduce((a,b)=>a+(b||0),0);
    const metric=(label,value,unit='',n=null)=>({label,value:round(value),unit,n});
    const count=(label,rows)=>metric(label,rows.length,'',rows.length);
    const format=m=>`${m.label}: ${m.value??'—'}${m.unit?' '+m.unit:''}${m.n===null?'':` (N=${m.n})`}`;
    function add(id,area,title,level,reason,metrics,interpretation,alternatives,next,limits=[]){
      if(dropped&&level==='high'){level='medium';reason+=' Часть буфера отброшена; уверенность ограничена.';}
      findings.push({id,area,title,confidence:{level,label:{high:'Высокая',medium:'Средняя',low:'Низкая'}[level],reason},metrics,evidence:metrics.map(format).join('; '),interpretation,alternatives,next,limits});
    }
    const repeat=n=>n>=5?'medium':'low';
    const support=(n,slow)=>n>=5&&slow>=3?'medium':'low';
    const supportReason=(n,slow)=>`Измерений: ${n}; выше порога: ${slow}. `+(n>=5&&slow>=3?'Симптом повторяется, но его первопричина не установлена.':'Повторений мало; единичный пик не доказывает устойчивую причину.');
    const reason=n=>n>=5?`Повторяющиеся измерения: N=${n}. Конкретный внутренний компонент не установлен.`:`Малая выборка: N=${n}; единичный пик не доказывает устойчивую причину.`;
    const statusRules=[
      ['rate-limit',s=>s===429,'Сервер / лимиты','Ограничение частоты запросов','Ответ 429 означает отказ по лимиту. Он может объяснять задержки загрузки и повторов.',['Лимит прокси или балансировщика','Лимит приложения; другие вкладки или клиенты'],'Сопоставить UTC и маршрут с правилами rate limit. Не увеличивать частоту проб.'],
      ['upstream-error',s=>s>=500,'Сервер / прокси','Ошибки сервиса или прокси','Получены ответы 5xx; загрузка данных могла прерваться. Из браузера нельзя определить, какой внутренний сервис дал сбой.',['Jira или её зависимости','Шлюз, прокси или балансировщик'],'Передать администратору UTC, группу маршрутов и доступный request ID; проверить серверные логи за этот интервал.'],
      ['access-error',s=>s===401||s===403,'Сессия / доступ','Проблема с сессией или правами','Ответы 401/403 могут останавливать загрузку интерфейса; это не доказательство сетевых потерь.',['Истёкшая сессия или SSO','Недостаточно прав; запрет прокси'],'Проверить вход и доступ к конкретному API. Не повторять запросы непрерывно.']
    ];
    for(const [id,test,area,title,interpretation,alternatives,next]of statusRules){const rs=jira.filter(r=>r.status!==null&&test(r.status)),ps=probes.filter(p=>p.status!==null&&test(p.status));if(!rs.length&&!ps.length)continue;const n=Math.max(rs.length,ps.length);add(id,area,title,n>=3?'high':'medium',`Наблюдались явные HTTP-ответы. Ресурсы и пробы не суммируются как независимые подтверждения; максимум N=${n}. Уверенность относится к типу отказа, не к его первопричине.`,[count('Новые ресурсы Jira с ошибкой',rs),count('Пробы с ошибкой',ps)],interpretation,alternatives,next,['По ответу нельзя измерить CPU, GC, очереди или БД.']);}
    const failed=probes.filter(p=>['timeout','network-error'].includes(p.outcome));
    if(failed.length)add('request-failure','Сеть / доступность','Запрос не завершился полноценным ответом',failed.length>=3&&failed.every(p=>p.visible===true)?'medium':'low','Наблюдается только исход fetch/тайм-аут; браузер не раскрывает точку отказа.',[count('Неуспешные пробы',failed),metric('Максимум ожидания',stats(failed.map(p=>p.durationMs)).max,'мс',failed.length)],'Доступность пути запроса или завершение ответа нарушены. Тайм-аут не равен потере пакетов.',['DNS/TLS/VPN/прокси','Редирект на SSO, отмена соединения или долгий серверный ответ','Фоновые таймеры и планирование браузера'],'Повторить короткую серию в видимой вкладке; сопоставить Network/Console и время с системной сетевой диагностикой.');
    const html=probes.filter(p=>p.outcome==='http'&&p.status>=200&&p.status<300&&p.json===false);
    if(html.length)add('unexpected-response','Сессия / API','API вернул не JSON','medium','Тип ответа измерен напрямую, но тело не сохраняется.',[count('Успешные HTTP-ответы не JSON',html)],'Ожидаемый API вернул другой формат, поэтому данные могут не загрузиться.',['Страница входа или ответ прокси','Изменение endpoint/формата API'],'Проверить сессию и Content-Type в DevTools; не включать тело ответа в общий отчёт.');
    const limited=probes.filter(p=>p.outcome==='response-limit');
    if(limited.length)add('probe-limit','Ограничение диагностики','Измерение прервано лимитом размера','low','Это локальный предел диагностической пробы, а не сетевой сбой.',[count('Пробы, превысившие 256 КиБ',limited)],'Диагностика перестала читать тело ответа. Сам по себе этот результат не объясняет тормоза Jira.',['Большой штатный ответ','Неожиданный ответ API или прокси'],'Посмотреть размер и тип ответа в Network без увеличения нагрузки на Jira.');
    // Keep sources, endpoints, visibility and caches separate. Never mix probes
    // to different endpoints into a "jitter" estimate or add them to resource N.
    const cohorts=new Map();
    for(const r of jira.filter(r=>r.cache!=='local-cache'&&r.timingExposed&&r.visible!==false)){
      const key='resource:'+r.route;if(!cohorts.has(key))cohorts.set(key,{source:'Новые ресурсы Jira',route:r.route,rows:[]});cohorts.get(key).rows.push(r);
    }
    const probeRoutes={serverInfo:'/rest/api/2/serverInfo',session:'/rest/api/2/myself'};
    for(const kind of Object.keys(probeRoutes)){
      const ps=probes.filter(p=>p.kind===kind&&p.visible===true&&p.outcome==='http'&&p.status>=200&&p.status<300);
      if(!cohorts.has('resource:'+probeRoutes[kind])){const phases=ps.filter(p=>p.phases?.timingExposed&&p.phases.cache!=='local-cache').map(p=>({...p.phases,visible:true,serverTiming:p.serverTiming}));if(phases.length)cohorts.set('probe:'+kind,{source:'HTTP-пробы '+kind,route:probeRoutes[kind],rows:phases});}
      const durations=stats(ps.map(p=>p.durationMs));
      if(durations.n>=5&&durations.p95-durations.p50>500)add('variation:'+kind,'Сеть / сервер','Нестабильное время ответа '+kind,'low','Сравниваются только успешные пробы одного endpoint в видимой вкладке.',[metric('P50',durations.p50,'мс',durations.n),metric('P95',durations.p95,'мс',durations.n),metric('Разница P95 − P50',round(durations.p95-durations.p50),'мс',durations.n)],'Сквозное время заметно меняется; источник нестабильности ещё не локализован.',['Сеть, очередь или обработка сервера','Браузер и обработка завершения fetch'],'Повторить тот же сценарий; сравнить фазы запроса, а не разные endpoints.',['Пробы могут быть сняты вне интервала пассивной записи.']);
    }
    const measured=[...cohorts.values()].flatMap(g=>g.rows);
    for(const [key,label]of [['dnsMs','DNS'],['tcpMs','Установление соединения без TLS'],['tlsMs','TLS']]){
      const values=measured.filter(r=>finite(r[key])!==null&&r[key]>0),s=stats(values.map(r=>r[key]));
      if(s.p95>300)add('connection:'+key,'Сеть',label+' занимает заметное время',support(s.n,values.filter(r=>r[key]>300).length),supportReason(s.n,values.filter(r=>r[key]>300).length),[metric(label+' P50',s.p50,'мс',s.n),metric(label+' P95',s.p95,'мс',s.n),metric('Порог проверки',300,'мс')],'В раскрытых фазах есть задержка установления доступа к ресурсу. Это направление проверки, а не установленная неисправность сети.',['DNS/маршрут/VPN/прокси','Повторное подключение или особенности браузера'],'Сопоставить фазу с Network в том же сценарии; сравнить доступные новые соединения.',['Нули при повторном использовании соединения исключены из этой выборки.','Поле соединения не доказывает использование TCP: при HTTP/3 используется QUIC.']);
    }
    const slowCohorts=[...cohorts.entries()].filter(([,g])=>g.route.startsWith('/rest/')&&stats(g.rows.map(r=>r.ttfbMs)).p95>1500).sort((a,b)=>stats(b[1].rows.map(r=>r.ttfbMs)).p95-stats(a[1].rows.map(r=>r.ttfbMs)).p95).slice(0,3);
    for(const [key,g]of slowCohorts){const s=stats(g.rows.map(r=>r.ttfbMs)),slow=g.rows.filter(r=>r.ttfbMs>1500).length;add('first-byte:'+key,'Сервер / путь запроса','API долго отдаёт первый байт: '+g.route,support(s.n,slow),supportReason(s.n,slow),[metric('TTFB P50',s.p50,'мс',s.n),metric('TTFB P95',s.p95,'мс',s.n),metric('Ответов выше 1500 мс',slow,'',s.n)],'Ожидание после отправки запроса может задерживать появление данных. Оно включает путь до сервера, очередь, прокси и обработку.',['Очередь или обработка Jira/зависимостей','Прокси, балансировщик или сетевой путь'],'Сравнить Server-Timing этого маршрута и передать UTC администратору. Проверить серверные логи/APM за тот же период.',[g.source+'; обезличенная группа может объединять разные запросы.','Высокий TTFB не доказывает перегрузку CPU, БД или GC.']);}
    const server=new Map(),serverSources=new Map();
    for(const r of jira.filter(r=>r.cache!=='local-cache'&&r.serverTiming.length)){const key='resource:'+r.route;if(!serverSources.has(key))serverSources.set(key,{source:'Новые ресурсы Jira',route:r.route,rows:[]});serverSources.get(key).rows.push(r);}
    for(const kind of Object.keys(probeRoutes)){const route=probeRoutes[kind];if(!serverSources.has('resource:'+route)){const rows=probes.filter(p=>p.kind===kind&&p.outcome==='http'&&p.serverTiming.length);if(rows.length)serverSources.set('probe:'+kind,{source:'HTTP-пробы '+kind,route,rows});}}
    for(const [key,g]of serverSources)for(const r of g.rows)for(const m of r.serverTiming){const id=key+':'+m.name;if(!server.has(id))server.set(id,{name:m.name,source:g.source,route:g.route,values:[]});server.get(id).values.push(m.duration);}
    for(const [id,g]of [...server].filter(([,g])=>stats(g.values).p95>1000).sort((a,b)=>stats(b[1].values).p95-stats(a[1].values).p95).slice(0,3)){const s=stats(g.values);add('server-timing:'+id,'Сервер / измерения','Сервер сообщает длительный этап: '+g.name,support(s.n,g.values.filter(v=>v>1000).length),supportReason(s.n,g.values.filter(v=>v>1000).length)+' Значение сообщено сервером, назначение имени требует проверки.',[metric('Server-Timing '+g.name+' P50',s.p50,'мс',s.n),metric('Server-Timing '+g.name+' P95',s.p95,'мс',s.n)],'В ответах '+g.route+' присутствует большой server-reported duration. Это прямой дополнительный сигнал для администратора.',['Имя может обозначать время приложения, кэша, прокси или составной этап'],'Уточнить значение метрики у администратора и сопоставить с трассировкой запроса.',[g.source,'Метрики могут перекрываться: их нельзя складывать или вычитать из TTFB для вычисления «чистого сетевого времени».','Имя db не является измерением загрузки БД.']);}
    const before=measured.filter(r=>r.beforeRequestMs>1000&&finite(r.dnsMs)!==null&&finite(r.connectMs)!==null&&r.dnsMs+r.connectMs<r.beforeRequestMs*.25);
    if(before.length){const s=stats(before.map(r=>r.beforeRequestMs));add('before-request','Браузер / путь запроса','Запрос задерживается до отправки',repeat(before.length),reason(before.length),[metric('До отправки P95',s.p95,'мс',s.n)],'Доступные DNS/соединение объясняют менее четверти времени до отправки в этих запросах. Остальная задержка требует разбора.',['Очередь и планирование браузера','Service Worker, редиректы или другие этапы до requestStart'],'Открыть Timing запроса в DevTools и проверить очередь/Service Worker. Не считать это временем обработки Jira.');}
    const large=measured.filter(r=>r.downloadMs>1000&&r.transferBytes>=1048576&&finite(r.durationMs)!==null&&r.downloadMs>r.durationMs*.5);
    if(large.length){const s=stats(large.map(r=>r.downloadMs));add('large-download','Сеть / объём данных','Получение крупных ответов занимает большую часть времени',repeat(large.length),reason(large.length),[metric('Получение тела P95',s.p95,'мс',s.n),metric('Максимум переданных данных',stats(large.map(r=>r.transferBytes)).max,'байт',large.length)],'В этих запросах передаётся не менее 1 МиБ, а получение тела занимает больше половины полной длительности.',['Большой объём ответа','Подача данных сервером, пропускная способность или работа клиента'],'Проверить размер, сжатие, кэширование и необходимость полной выдачи. Не вычислять скорость канала по одному запросу.');}
    const tasks=(c?.longTasks||[]).filter(t=>t.visible&&finite(t.duration)!==null&&(finite(c?.startMs)===null||finite(t.startMs)===null||t.startMs>=c.startMs)),stalls=stats(tasks.map(t=>t.duration)),lag=stats(c?.lagMs||[]);
    if(stalls.max>200||lag.p95>200){const many=tasks.filter(t=>t.duration>200).length,level=many>=3&&(c?.visibleObservedMs||0)>=5000?'high':stalls.max>200?'medium':'low';add('main-thread','Браузер','Главный поток страницы занят',level,stalls.max>200?`В видимой вкладке зафиксированы long tasks; задач длиннее 200 мс: ${many}. Это подтверждает блокировку потока, но не виновный скрипт.`:'Есть задержка таймера без подтверждающих long tasks. Она может возникать из-за планирования ОС/браузера.',[metric('Long task max',stalls.max,'мс',stalls.n),metric('Сумма видимых long tasks',round(tasks.reduce((s,t)=>s+t.duration,0)),'мс',stalls.n),metric('Задержка таймера P95',lag.p95,'мс',lag.n)],'Обработка действий пользователя могла ждать освобождения главного потока.',['Код Jira, приложений/плагинов или расширений','Перестроение DOM/layout; загрузка устройства'],'Снять Performance trace во время того же действия и проверить стек длинных задач. Сравнение с выключенной функцией — эксперимент, не доказательство.', ['Фоновые long tasks исключены. Это не процент CPU и не доказательство утечки памяти.']);}
    const errors=(c?.errors?.js||0)+(c?.errors?.rejections||0);
    if(errors)add('javascript','Браузер / JavaScript','Ошибки JavaScript могут прерывать работу страницы',errors>=3?'medium':'low','Есть счётчики необработанных ошибок, но нет стеков и текстов.',[metric('JS errors',c.errors.js||0),metric('Unhandled rejections',c.errors.rejections||0)],'Часть действий могла завершиться ошибкой вместо ожидаемого обновления интерфейса.',['Ошибка Jira или плагина','Ошибка стороннего скрипта или отклонённый запрос'],'Сопоставить Console с действием пользователя и UTC отметки; не публиковать содержимое задач.');
    const buckets=new Map();for(const r of jira){if(finite(r.startMs)===null)continue;const sec=Math.floor((r.startMs-(c?.startMs||0))/1000);buckets.set(sec,(buckets.get(sec)||0)+1);}const peak=Math.max(0,...buckets.values());
    if(jira.length>=50&&peak>=15&&(findings.some(f=>f.id==='main-thread')||jira.some(r=>r.status===429)))add('request-burst','Нагрузка страницы','Всплеск запросов совпал с другими симптомами','low','Частота запросов сама по себе не означает неисправность; причинность не установлена.',[metric('Пик стартов новых ресурсов Jira',peak,'/с'),count('Новые ресурсы Jira',jira)],'В той же записи есть всплеск стартов и блокировка потока или HTTP 429.',['Нормальная загрузка ресурсов','Повторные запросы или активные модули страницы'],'Проверить Initiator в Network и повторить один пользовательский сценарий. Эти записи не позволяют отделить Jira от расширения.');
    if(!c)gaps.push('Пассивной записи нет: состояние интерфейса и его главного потока не наблюдалось.');
    if(c&&(c.visibleObservedMs||0)<5000)gaps.push('Меньше 5 секунд наблюдения видимой вкладки: воспроизведите действие, оставаясь в Jira.');
    const buffered=all.length-live.length;if(buffered)gaps.push(`Ресурсов до старта: ${buffered}. Они видны в таблицах, но не используются для текущих причин.`);
    const external=live.length-jira.length;if(external)gaps.push(`Внешние или нераспознанные новые ресурсы: ${external}. Их ошибки не приписываются серверу Jira.`);
    const hidden=jira.filter(r=>!r.timingExposed).length;if(hidden)gaps.push(`Фазы не раскрыты у ${hidden} новых ресурсов Jira. Неизвестное время не считается нулевым.`);
    const unknown=jira.filter(r=>r.status===null).length;if(unknown)gaps.push(`HTTP-статус неизвестен у ${unknown} новых ресурсов Jira; они не считаются успешными.`);
    if(jira.some(r=>r.visible===null))gaps.push('У части ресурсов не сохранена видимость вкладки (старый формат); фазовые выводы требуют осторожности.');
    if(probes.some(p=>p.visible!==true))gaps.push('Фоновые пробы или пробы без признака видимости не используются для оценки скорости и разброса.');
    if(c&&!c.capabilities.longTask)gaps.push('Long Tasks API не подтверждён: отсутствие длинных задач не доказывает свободный главный поток.');
    if(dropped)gaps.push(`Ограниченные буферы отбросили ${dropped} записей. Выборка неполная.`);
    if(![...server.values()].length)gaps.push('Нет доступного Server-Timing в используемых измерениях. Внутренние этапы сервера не видны.');
    const windows=(c?.marks||[]).filter(m=>m.kind==='user-symptom').map(m=>{if(finite(m.startMs)===null)return {at:m.at,available:false};const near=(start,duration)=>finite(start)!==null&&finite(duration)!==null&&start<=m.startMs+2000&&start+duration>=m.startMs-2000;return {at:m.at,available:true,resources:jira.filter(r=>near(r.startMs,r.durationMs)).length,slowResponses:jira.filter(r=>r.ttfbMs>1500&&near(r.startMs,r.durationMs)).length,longTasks:tasks.filter(t=>near(t.startMs,t.duration)&&t.duration>200).length};});
    findings.sort((a,b)=>rank[b.confidence.level]-rank[a.confidence.level]||a.id.localeCompare(b.id));
    const enough=measured.length>=5||probes.filter(p=>p.outcome==='http'&&p.visible===true&&finite(p.durationMs)!==null).length>=3||((c?.visibleObservedMs||0)>=5000&&(c?.capabilities.longTask||lag.n>=5));
    return {method:'browser-evidence/v1',thresholds:{connectionMs:300,ttfbMs:1500,serverTimingMs:1000,longTaskMs:200,lagMs:200,downloadMs:1000,largeResponseBytes:1048576,symptomWindowMs:2000},status:findings.length?'signals':enough?'no-clear-signal':'insufficient',findings,gaps,windows,scope:{newJiraResources:jira.length,bufferedResources:buffered,otherResources:external,probes:probes.length},limits:['Уверенность — сила поддержки указанного вывода, не вероятность и не точный диагноз.','Пороги — эвристики для проверки, не SLO и не норматив Jira.','CPU/RAM сервера, JVM/GC, БД и внутренние очереди не измеряются браузером.','HTTP-пробы не измеряют ICMP ping или потери пакетов.','Бюджет расширения накоплен за сессию; его счётчики не доказывают причину текущего торможения.']};
  }
  function summarize(capture, probes=[]) {
    capture=cleanCapture(capture);probes=(Array.isArray(probes)?probes:[]).map(cleanProbe);
    const resources=capture?.resources || [], live=resources.filter(r=>!r.buffered), known=resources.filter(r=>r.status!==null);
    const http=stats(probes.filter(p=>p.outcome==='http').map(p=>p.durationMs));
    const ttfb=stats(resources.map(r=>r.ttfbMs)), byRoute=new Map();
    for (const r of resources) {if(!byRoute.has(r.route))byRoute.set(r.route,[]);byRoute.get(r.route).push(r);}
    const endpoints=[...byRoute].map(([route,rs])=>({route,count:rs.length,httpKnown:rs.filter(r=>r.status!==null).length,errors:rs.filter(r=>r.status>=400).length,duration:stats(rs.map(r=>r.durationMs)),ttfb:stats(rs.map(r=>r.ttfbMs)),bytes:rs.reduce((s,r)=>s+(r.transferBytes||0),0)})).sort((a,b)=>b.duration.p95-a.duration.p95);
    const buckets=new Map();for(const r of live){const sec=Math.floor((r.startMs-(capture?.startMs||0))/1000);buckets.set(sec,(buckets.get(sec)||0)+1);}
    const visibleTasks=(capture?.longTasks||[]).filter(t=>t.visible), lag=stats(capture?.lagMs||[]), stalls=stats(visibleTasks.map(t=>t.duration));
    const assessment=explain(capture,probes);
    const totalServerMetrics=resources.reduce((s,r)=>s+r.serverTiming.length,0)+probes.reduce((s,p)=>s+(p.serverTiming?.length||0),0);
    return {http,ttfb,endpoints,knownStatuses:known.length,httpErrors:known.filter(r=>r.status>=400).length,resourceCount:resources.length,liveCount:live.length,peakStartsPerSecond:Math.max(0,...buckets.values()),lag,stalls,totalServerMetrics,findings:assessment.findings,assessment};
  }
  const pickNumbers=(input,keys)=>Object.fromEntries(keys.split(' ').map(k=>[k,finite(input?.[k])]));
  const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
  const routes=new Set(['unknown','external-resource','same-origin-other-app','/rest/other','/assets/*','/other','/rest/api/2/search','/rest/api/2/serverInfo','/rest/api/2/myself','/rest/api/2/field','/secure/RapidBoard.jspa',...['/rest/api/2/issue','/rest/api/2/project','/rest/agile/1.0/board','/rest/agile/1.0/sprint','/rest/greenhopper','/plugins','/download','/s'].map(p=>p+'/*')]);
  function cleanTiming(r={}){return {...pickNumbers(r,'startMs durationMs dnsMs connectMs tcpMs tlsMs ttfbMs downloadMs beforeRequestMs transferBytes encodedBytes decodedBytes workerMs'),route:routes.has(r.route)?r.route:'unknown',kind:['fetch','xmlhttprequest','script','css','img','link','navigation'].includes(r.kind)?r.kind:'other',status:Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:null,protocol:/^[a-z0-9./-]{1,20}$/i.test(r.protocol||'')?r.protocol:null,cache:r.cache==='local-cache'?'local-cache':'unknown-or-network',timingExposed:r.timingExposed===true,buffered:r.buffered===true,visible:typeof r.visible==='boolean'?r.visible:null,serverTiming:serverTiming(r.serverTiming)};}
  function cleanProbe(p={}) {
    if(!p||typeof p!=='object')p={};
    const id=v=>typeof v==='string'&&/^[\w.:-]{1,160}$/.test(v)?v:undefined;
    const meta=Object.fromEntries(['version','buildNumber','deploymentType'].filter(k=>typeof p.meta?.[k]==='string'&&/^[a-z0-9 ._-]{1,80}$/i.test(p.meta[k])).map(k=>[k,p.meta[k]]));
    return {...pickNumbers(p,'durationMs headersMs bytes retryMs'),at:iso(p.at),kind:['serverInfo','session'].includes(p.kind)?p.kind:'unknown',outcome:['http','timeout','network-error','cancelled','response-limit'].includes(p.outcome)?p.outcome:'unknown',status:Number.isInteger(p.status)&&p.status>=100&&p.status<=599?p.status:null,visible:typeof p.visible==='boolean'?p.visible:null,json:typeof p.json==='boolean'?p.json:null,phases:p.phases?cleanTiming(p.phases):null,serverTiming:serverTiming(p.serverTiming),meta,requestId:id(p.requestId),nodeId:id(p.nodeId),serverDate:iso(p.serverDate)};
  }
  function cleanCapture(c){
    if(!c||typeof c!=='object')return null;
    const list=(key,n)=>Array.isArray(c[key])?c[key].filter(v=>v&&typeof v==='object').slice(-n):[];
    const env=c.environment||{},net=env.networkEstimate,heap=env.heap;
    return {...pickNumbers(c,'deadline startMs visibleObservedMs layoutShift lcpMs fcpMs'),running:c.running===true,startedAt:iso(c.startedAt),endedAt:iso(c.endedAt),capturedAt:iso(c.capturedAt),pageRoute:routes.has(c.pageRoute)?c.pageRoute:'unknown',
      resources:list('resources',2000).map(cleanTiming),longTasks:list('longTasks',500).map(t=>({...pickNumbers(t,'startMs duration'),visible:t.visible===true})),lagMs:(Array.isArray(c.lagMs)?c.lagMs:[]).filter(v=>finite(v)!==null).slice(-1000),marks:list('marks',100).map(m=>({at:iso(m.at),startMs:finite(m.startMs),kind:['online','offline','user-symptom'].includes(m.kind)?m.kind:'unknown'})),
      errors:pickNumbers(c.errors,'js rejections resources'),dropped:pickNumbers(c.dropped,'resources longTasks lagMs marks'),capabilities:Object.fromEntries(['resource','longTask','layoutShift','lcp','responseStatus'].map(k=>[k,c.capabilities?.[k]===true])),
      environment:{online:env.online===true,visible:env.visible===true,browser:/^(Edg|Chrome|Firefox)\/[\d.]{1,30}$/.test(env.browser||'')?env.browser:'unknown',domElements:finite(env.domElements),networkEstimate:net?{...pickNumbers(net,'rttMs downlinkMbps'),effectiveType:['slow-2g','2g','3g','4g'].includes(net.effectiveType)?net.effectiveType:'unknown',saveData:net.saveData===true}:null,heap:heap?pickNumbers(heap,'usedBytes allocatedBytes limitBytes'):null},
      navigation:c.navigation?{...cleanTiming(c.navigation),...pickNumbers(c.navigation,'domInteractiveMs domContentLoadedMs loadMs'),type:['navigate','reload','back_forward','prerender'].includes(c.navigation.type)?c.navigation.type:'unknown'}:null};
  }
  function report(input, includeIdentifiers=false) {
    // Only these measurements leave the extension; no DOM, raw resource URLs or bodies.
    const out={schema:'jira-board-plus/diagnostics/v1',at:input.at,extensionVersion:input.extensionVersion,
      capture:cleanCapture(input.capture),probes:(Array.isArray(input.probes)?input.probes:[]).slice(-100).map(cleanProbe),budget:structuredClone(input.budget||null),tabs:input.tabs,
      limitations:['HTTP-пробы не являются ICMP ping.','CPU/JVM/GC/БД, число TCP-сокетов и потери пакетов недоступны из браузера.','TTFB включает сеть, сервер и прокси; Server-Timing может содержать перекрывающиеся метрики.','Буфер Resource Timing может быть неполным; неизвестный HTTP-статус не считается успехом.']};
    if(includeIdentifiers)out.baseUrl=input.baseUrl;
    for(const p of out.probes)if(!includeIdentifiers){delete p.requestId;delete p.nodeId;}
    out.summary=summarize(out.capture,out.probes);return out;
  }
  return {finite,round,route,timing,serverTiming,parseServerTiming,stats,summarize,explain,report,cleanCapture,cleanProbe};
})();
