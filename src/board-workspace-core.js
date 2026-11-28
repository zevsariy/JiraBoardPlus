/* Personal board tools operate only on observations already present in this tab. */
globalThis.JbpBoardWorkspaceCore = (() => {
  const fields = {summary:'Название',status:'Статус',assignee:'Исполнитель',type:'Тип',team:'Команда',parent:'Родитель',due:'Срок',updated:'Обновлено'};
  const keyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase();
  const empty = () => ({version:1,revision:0,views:[],active:'',context:{enabled:false,fields:['status','assignee','parent','due']}});
  function filters(value = {}) {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Некорректные фильтры.');
    for (const key of ['text','status','assignee','type','team','parent','due']) {
      const item = value[key] ?? '';
      if (typeof item !== 'string' || item.length > 200) throw Error('Фильтр должен быть текстом до 200 символов.');
      result[key] = item.trim();
    }
    if (!['','overdue','none','set'].includes(result.due)) throw Error('Неизвестный фильтр срока.');
    return result;
  }
  function profile(value = empty()) {
    if (!value || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.views) || value.views.length > 20) throw Error('Неизвестный формат личных представлений.');
    const ids = new Set(), names = new Set();
    const views = value.views.map(v => {
      if (!v || typeof v.id !== 'string' || !/^[\w-]{1,80}$/.test(v.id) || ids.has(v.id) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || names.has(normalize(v.name))) throw Error('Названия представлений должны быть уникальными, до 80 символов.');
      ids.add(v.id); names.add(normalize(v.name));
      return {id:v.id,name:v.name.trim(),filters:filters(v.filters)};
    });
    if (typeof value.active !== 'string' || value.active && !ids.has(value.active)) throw Error('Сохранённое представление не найдено.');
    const context = value.context;
    if (!context || typeof context.enabled !== 'boolean' || !Array.isArray(context.fields) || !context.fields.length || context.fields.length > 8 || new Set(context.fields).size !== context.fields.length || context.fields.some(f => !Object.hasOwn(fields,f))) throw Error('Выберите от 1 до 8 различных полей контекста.');
    return {version:1,revision:value.revision,views,active:value.active,context:{enabled:context.enabled,fields:[...context.fields]}};
  }
  function storageKey(base, account, board) {
    if (typeof account !== 'string' || !account.trim() || account.length > 200 || !/^\d{1,15}$/.test(String(board))) throw Error('Не удалось определить пользователя или доску.');
    return `jbpBoardWorkspace:${encodeURIComponent(base)}:${encodeURIComponent(account)}:${board}`;
  }
  function matches(row, input, today = new Date().toISOString().slice(0,10)) {
    const f = filters(input), reasons = [], unknown = [];
    if (f.text) {
      if (!normalize(row.key).includes(normalize(f.text)) && row.summary == null) unknown.push('Название');
      else if (!normalize(`${row.key} ${row.summary || ''}`).includes(normalize(f.text))) reasons.push('Ключ или название не содержит «'+f.text+'».');
    }
    for (const k of ['status','assignee','type','team','parent']) if (f[k]) {
      if (row[k] == null) unknown.push(fields[k]);
      else if (f[k] === '__empty' ? row[k] !== '' : normalize(row[k]) !== normalize(f[k])) reasons.push(`${fields[k]}: ${row[k] || 'не заполнено'}; фильтр: ${f[k] === '__empty' ? 'не заполнено' : f[k]}.`);
    }
    if (f.due) {
      if (row.due == null) unknown.push(fields.due);
      else if (f.due === 'none' ? row.due !== '' : f.due === 'set' ? row.due === '' : !row.due || row.due >= today) reasons.push('Срок не соответствует личному фильтру.');
    }
    return {visible:!reasons.length,reasons,unknown}; // Unknown never becomes an exclusion.
  }
  function diagnose(key, records, input, config) {
    if (!keyPattern.test(key)) throw Error('Введите ключ задачи, например DEMO-42.');
    const observed = records.filter(r => r.key === key), result = [];
    if (!observed.length) return ['Задачи нет среди карточек, доступных в DOM этой доски. Это не доказывает, что она удалена или недоступна.', 'Без новых запросов нельзя проверить фильтр доски, права и индекс. Откройте задачу по ссылке и проверьте штатные фильтры Jira.'];
    if (observed.some(r => r.nativeVisible)) {
      const verdict = matches(observed.find(r => r.nativeVisible),input);
      result.push(verdict.visible ? 'Карточка присутствует на доске и не исключена личным представлением.' : 'Карточка скрыта личным представлением JBP: '+verdict.reasons.join(' '));
      if (verdict.unknown.length) result.push('Неизвестные поля не исключают карточку: '+verdict.unknown.join(', ')+'.');
    } else result.push('Карточка есть в DOM, но скрыта самой Jira или свёрнутым разделом. Личный фильтр JBP не является подтверждённой причиной.');
    const row = observed[0], columns = config?.columnConfig?.columns;
    if (row.statusId && Array.isArray(columns) && columns.length && columns.every(c => Array.isArray(c.statuses))) {
      const mapped = columns.some(c => c.statuses.some(s => String(s.id) === String(row.statusId)));
      result.push(mapped ? 'По последней загруженной конфигурации статус связан с колонкой.' : 'По последней загруженной конфигурации статус не связан с колонкой. Проверьте настройки колонок у администратора.');
    }
    result.push('Проверены только данные текущей вкладки. Фильтр сервера, права, спринт и индекс не перепроверялись.');
    return result;
  }
  return {fields,keyPattern,normalize,empty,filters,profile,storageKey,matches,diagnose};
})();
