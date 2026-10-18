globalThis.JbpReportsMount=function(document,options={}){
  const R = globalThis.JbpReports, $ = id => document.getElementById(id);
  let disposed=false,state, defaultTeamField='', editingId = null, columns = [], fields = { ...R.FIELDS }, refreshTimer;
  async function send(type, data = {}) {
    const result = await chrome.runtime.sendMessage(options.embedded?{type:'embeddedReport',command:{type,...data}}:{type,...data});
    if (!result?.ok) throw new Error(result?.error || 'Фоновая служба недоступна. Перезагрузите расширение.');
    if(disposed)throw Error('Раздел закрыт');return result.data;
  }
  const date = value => value ? new Date(value).toLocaleString('ru-RU') : '—';
  function node(tag, text, className) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
  function button(text, action) { const el = node('button', text); el.type = 'button'; el.addEventListener('click', () => safe(action)); return el; }
  function error(message) { if(disposed)return; $('message-text').textContent = message; $('message').hidden = !message; }
  async function safe(action) { try { error(''); await action(); } catch (e) { error(e.message); } }
  function link(row) { const a = node('a', row.key); a.href = `${state.baseUrl || R.ORIGIN + state.context}/browse/${encodeURIComponent(row.key)}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  function render() {
    fields = { ...R.FIELDS, ...fields, ...state.fieldNames };
    $('empty').hidden = state.queries.length > 0; $('run-all').disabled = !state.queries.length;
    $('jira-url').textContent=state.baseUrl || 'Настроить Jira';$('jira-url').href=state.baseUrl || 'onboarding.html';
    $('reports').replaceChildren(); $('index').replaceChildren();
    $('notice-error').hidden=!state.noticeError;$('notice-text').textContent=state.noticeError||'';$('dismiss-notice').dataset.errorId=state.noticeErrorId||'';
    for (const q of state.queries) {
      const result = state.results[q.id], job = state.jobs[q.id];
      const section = node('section', null, 'report'); section.id = q.id;
      const nav = node('a', q.name); nav.href = `#${q.id}`; $('index').append(nav);
      const head = node('div', null, 'report-head'), title = node('div'); title.append(node('h2', q.name));
      title.append(node('p', `Последний успех: ${date(result?.finishedAt)} · ${q.enabled ? `Каждые ${q.minutes} мин. · Следующий: ${date(q.nextRun)}` : 'Расписание выключено'}`, 'meta'));
      if (result) title.append(node('p', `Пользователь: ${result.account} · Сравнение с: ${date(result.previousAt)}`, 'meta'));
      if (job) title.append(node('p', `Выполняется… загружено ${job.rows.length}${job.total == null ? '' : ` из ${job.total}`}`, 'meta'));
      const actions = node('div', null, 'actions');
      const run = button('Запустить', async () => { state = await send('run', { id: q.id }); render(); }); run.disabled = !!job;
      actions.append(run, button('Настроить', () => edit(q)), button('Удалить', async () => { if (confirm(`Удалить «${q.name}» и его сохранённые результаты?`)) { state = await send('delete', { id: q.id }); render(); } }));
      head.append(title, actions); section.append(head);
      if (q.lastError) section.append(node('p', `${date(q.lastAttempt)}: ${q.lastError} Показан последний успешный результат.`, 'error'));
      const jql = node('details'), summary = node('summary', 'Показать JQL'); jql.append(summary, node('pre', q.jql)); section.append(jql);
      if (!result) section.append(node('p', job ? 'Ожидаем первую полную выдачу…' : 'Результатов пока нет. Нажмите «Запустить» или дождитесь расписания.', 'no-results'));
      else {
        const d = result.delta, stats = node('div', null, 'stats'); stats.append(node('span', `Всего: ${result.rows.length}`, 'badge'));
        if (d.baseline) stats.append(node('span', 'База сравнения создана', 'badge'));
        else for (const [text, count, cls] of [['Новых', d.added.length, 'added'], ['Вышли из выдачи', d.removed.length, 'removed'], ['Изменились', d.changed.length, 'changed']]) stats.append(node('span', `${text}: ${count}`, `badge ${cls}`));
        section.append(stats);
        if (result.rows.length) {
          const wrap = node('div', null, 'table-wrap'), table = node('table'), thead = node('thead'), tr = node('tr');
          for (const label of ['Задача', ...q.columns.map(c => fields[c] || c)]) { const th = node('th', label); th.scope = 'col'; tr.append(th); }
          thead.append(tr); table.append(thead); const tbody = node('tbody');
          const added = new Set(d.added.map(r => r.id)), changed = new Set(d.changed.map(r => r.id));
          for (const row of result.rows) {
            const tr = node('tr', null, added.has(row.id) ? 'new' : changed.has(row.id) ? 'changed' : '');
            const td = node('td'); td.append(link(row));
            if (added.has(row.id) || changed.has(row.id)) td.append(node('div', added.has(row.id) ? 'Новая' : 'Изменена', 'meta'));
            tr.append(td); for (const c of q.columns) tr.append(node('td', row.cells[c] || '—')); tbody.append(tr);
          }
          table.append(tbody); wrap.append(table); section.append(wrap);
        } else section.append(node('p', 'Запрос выполнен успешно. Задач в выдаче нет.', 'no-results'));
        if(d.changed.some(r=>r.changes?.length)){
          const details=node('details');details.className='change-details';details.append(node('summary','Что изменилось в полях'));
          for(const row of d.changed){if(!row.changes?.length)continue;const heading=node('p');heading.append(link(row));details.append(heading);for(const change of row.changes)details.append(node('p',`${change.field==='key'?'Ключ':fields[change.field]||change.field}: ${change.before||'—'} → ${change.after||'—'}`));}
          section.append(details);
        }
        if (d.removed.length) { const details = node('details'); details.append(node('summary', `Вышли из выдачи (${d.removed.length})`)); const list = node('div', null, 'removed-list'); d.removed.forEach(row => list.append(link(row))); details.append(list); section.append(details); }
      }
      $('reports').append(section);
    }
  }
  function renderColumns() {
    $('selected-columns').replaceChildren();
    columns.forEach((id, index) => {
      const chip = node('span', null, 'column'); chip.append(node('span', fields[id] || id));
      const up = button('←', () => { if (index > 0) { [columns[index - 1], columns[index]] = [columns[index], columns[index - 1]]; renderColumns(); } }); up.setAttribute('aria-label', `Переместить ${fields[id] || id} влево`); up.disabled = index === 0;
      const remove = button('×', () => { columns.splice(index, 1); renderColumns(); }); remove.setAttribute('aria-label', `Убрать ${fields[id] || id}`); chip.append(up, remove); $('selected-columns').append(chip);
    });
    $('field-list').replaceChildren(); for (const [id, name] of Object.entries(fields)) { const option = node('option'); option.value = id; option.label = name; $('field-list').append(option); }
  }
  function edit(query) {
    editingId = query?.id || null; columns = [...(query?.columns || R.defaultColumns(defaultTeamField))];
    $('editor-title').textContent = query ? 'Настройка запроса' : 'Новый запрос';
    $('name').value = query?.name || ''; $('jql').value = query?.jql || ''; $('minutes').value = query?.minutes || 60;
    $('notify').value = query?.notify || 'new'; $('enabled').checked = query?.enabled ?? true;
    $('form-error').hidden = true; $('fields-status').textContent = ''; $('field-id').value = '';
    renderColumns(); $('editor').showModal(); $('name').focus();
  }
  $('dismiss-notice').onclick=()=>{const errorId=$('dismiss-notice').dataset.errorId;safe(async()=>{state=await send('dismissNotice',{errorId});render();});};
  $('test-notice').onclick=()=>safe(async()=>{$('test-notice').disabled=true;try{state=await send('testNotice');render();$('test-notice-status').textContent=state.noticeError?'Тест не удался; ошибка показана выше.':'Chrome принял тестовое уведомление. Если его не видно, проверьте разрешения уведомлений и режим «Не беспокоить» в системе.';}finally{$('test-notice').disabled=false;}});
  $('add').onclick = $('empty-add').onclick = () => edit();
  $('close').onclick = $('cancel-edit').onclick = () => $('editor').close();
  $('add-column').onclick = () => {
    const id = $('field-id').value.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(id) || columns.includes(id) || columns.length >= 15) { $('fields-status').textContent = 'Укажите новый ID поля; максимум 15 колонок.'; return; }
    columns.push(id); $('field-id').value = ''; $('fields-status').textContent = ''; renderColumns();
  };
  $('load-fields').onclick = async () => {
    $('load-fields').disabled = true; $('fields-status').textContent = 'Загрузка полей…';
    try { const loaded = await send('fields'); fields = { ...fields, ...Object.fromEntries(loaded.map(f => [f.id, f.name])) }; renderColumns(); $('fields-status').textContent = `Доступных полей: ${loaded.length}. Введите ID в поле выше.`; }
    catch (e) { $('fields-status').textContent = e.message; }
    finally { $('load-fields').disabled = false; }
  };
  $('query-form').onsubmit = async event => {
    event.preventDefault(); const submit = event.submitter; submit.disabled = true;
    try {
      const query = R.validate({ name: $('name').value, jql: $('jql').value, minutes: $('minutes').value, columns, notify: $('notify').value, enabled: $('enabled').checked });
      state = await send('save', { query: { ...query, id: editingId } }); $('editor').close(); render();
    } catch (e) { $('form-error').textContent = e.message; $('form-error').hidden = false; }
    finally { submit.disabled = false; }
  };
  $('dismiss-message').onclick=()=>error('');
  $('run-all').onclick = () => safe(async () => { state = await send('run'); render(); });
  async function refresh() { state = await send('get'); defaultTeamField=state.defaultTeamField||''; render(); }
  const changed=(changes,area)=>{if(!disposed&&area==='local'&&changes.jbpReportsV1){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>safe(refresh),150);}};chrome.storage.onChanged.addListener(changed);
  const notified=m=>{if(m.type==='embeddedReportChanged')changed({jbpReportsV1:true},'local');};if(options.embedded)chrome.runtime.onMessage.addListener(notified);
  safe(async () => { await refresh(); if (!options.embedded&&location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); });
return ()=>{disposed=true;clearTimeout(refreshTimer);chrome.storage.onChanged.removeListener(changed);if(options.embedded)chrome.runtime.onMessage.removeListener(notified);$('editor').close();};
};
if(!globalThis.jbpShellInstalled)JbpReportsMount(document);
