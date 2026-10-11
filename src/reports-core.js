/* Shared pure helpers, usable in the worker, report page, and offline tests. */
globalThis.JbpReports = (() => {
  const ORIGIN = '';
  const DEFAULT_COLUMNS = ['summary', 'status', 'assignee', 'customfield_10200'];
  const FIELDS = { summary: 'Название', status: 'Статус', issuetype: 'Тип', assignee: 'Исполнитель', reporter: 'Автор', priority: 'Приоритет', project: 'Проект', created: 'Создано', updated: 'Обновлено', duedate: 'Срок', labels: 'Метки', components: 'Компоненты', fixVersions: 'Fix version', customfield_10200: 'Team' };
  function validate(input) {
    const name = String(input.name || '').trim(), jql = String(input.jql || '').trim();
    if (!name || name.length > 120) throw new Error('Название: от 1 до 120 символов.');
    if (!jql || jql.length > 20000) throw new Error('Введите JQL (до 20 000 символов).');
    const minutes = Number(input.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) throw new Error('Интервал: от 1 до 10080 минут.');
    const columns = [...new Set(input.columns || [])];
    if (!columns.length || columns.length > 15 || columns.some(c => typeof c !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(c))) throw new Error('Выберите от 1 до 15 колонок. Для custom field используйте customfield_12345.');
    if (!['none', 'new', 'membership', 'all'].includes(input.notify)) throw new Error('Неизвестный режим уведомлений.');
    return { name, jql, minutes, columns, notify: input.notify, enabled: !!input.enabled };
  }
  function valueText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(valueText).join(', ');
    if (typeof value === 'object') {
      for (const key of ['displayName', 'name', 'title', 'value', 'key', 'id']) if (value[key] != null) return valueText(value[key]);
      return JSON.stringify(value);
    }
    return String(value);
  }
  function row(issue, columns) {
    if (!issue.id || !/^[A-Z][A-Z0-9_]*-\d+$/.test(issue.key || '') || !issue.fields) throw new Error('Неизвестный формат задачи в ответе Jira.');
    return { id: String(issue.id), key: issue.key, cells: Object.fromEntries(columns.map(c => [c, valueText(issue.fields[c])])) };
  }
  function changes(before,after){
    const result=[];
    if(before.key!==after.key)result.push({field:'key',before:before.key,after:after.key});
    for(const field of [...new Set([...Object.keys(before.cells||{}),...Object.keys(after.cells||{})])].sort()){
      const old=before.cells?.[field]??'',value=after.cells?.[field]??'';
      if(old!==value)result.push({field,before:old,after:value});
    }
    return result;
  }
  function diff(previous, current) {
    if (!previous) return { baseline: true, added: [], removed: [], changed: [] };
    const before = new Map(previous.map(r => [String(r.id), r])), after = new Map(current.map(r => [String(r.id), r]));
    return {
      baseline: false,
      added: current.filter(r => !before.has(String(r.id))),
      removed: previous.filter(r => !after.has(String(r.id))),
      changed: current.flatMap(r=>{const old=before.get(String(r.id));if(!old)return [];const detail=changes(old,r);return detail.length?[{...r,changes:detail}]:[];})
    };
  }
  function shouldNotify(mode, delta) {
    return !delta.baseline && mode !== 'none' && (delta.added.length > 0 || (['membership', 'all'].includes(mode) && delta.removed.length > 0) || (mode === 'all' && delta.changed.length > 0));
  }
  function pageCheck(data, startAt, expectedTotal) {
    if (!Array.isArray(data.issues) || !Number.isInteger(data.total) || data.total < 0 || data.startAt !== startAt) throw new Error('Неизвестный формат или неверная страница поиска Jira.');
    if (data.total > 5000) throw new Error('Больше 5000 задач. Уточните JQL; неполная выборка не будет сохранена.');
    if (expectedTotal != null && expectedTotal !== data.total) throw new Error('Выдача изменилась во время загрузки. Повторите запуск.');
    if (!data.issues.length && startAt < data.total) throw new Error('Jira вернула неполную выдачу. Предыдущие результаты сохранены.');
    return data;
  }
  return { ORIGIN, FIELDS, DEFAULT_COLUMNS, validate, row, diff, shouldNotify, pageCheck };
})();
