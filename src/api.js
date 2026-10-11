/* Isolated content-script namespace; no page bridge or credentials storage. */
globalThis.JiraBoardPlus = (() => {
  const FIELD = 'customfield_10200';
  const keyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;
  function teamId(value) {
    if (value == null || value === '') return '';
    const id = typeof value === 'object' ? value.id : value;
    if (!/^\d+$/.test(String(id))) throw new Error('Неизвестный формат Team в ответе Jira.');
    return String(id);
  }
  class Api {
    constructor(base = '', transport = globalThis.fetch.bind(globalThis)) {
      if (base && !/^\/[\w/-]*$/.test(base)) throw new Error('Недопустимый context path');
      this.base = base.replace(/\/$/, '');
      this.transport = transport;
    }
    async request(path, { method = 'GET', body, signal } = {}) {
      const response = await this.transport(`${this.base}/rest/${path}`, {
        method, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const hints = { 401: 'Войдите в Jira и обновите страницу.', 403: 'Нет прав на операцию в Jira / Plans.', 404: 'Задача или API Plans недоступны.', 429: 'Слишком много запросов. Повторите позже.' };
        let detail = '';
        try { const data = await response.json(); detail = [...(data.errorMessages || []), ...Object.values(data.errors || {})].join(' '); } catch {}
        throw new Error(`HTTP ${response.status}. ${hints[response.status] || ''} ${detail}`.trim());
      }
      if (response.status === 204) return null;
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Jira вернула не JSON. Проверьте сессию входа.');
      return response.json();
    }
    issuePath(key) {
      if (!keyPattern.test(key)) throw new Error('Некорректный ключ задачи');
      return `api/2/issue/${key}`;
    }
    async read(key, signal) {
      const data = await this.request(`${this.issuePath(key)}?fields=${FIELD}`, { signal });
      if (!data.fields || !(FIELD in data.fields)) throw new Error('Поле Team недоступно в этой задаче.');
      return teamId(data.fields[FIELD]);
    }
    async metadata(key, signal) {
      const data = await this.request(`${this.issuePath(key)}/editmeta`, { signal });
      const field = data.fields?.[FIELD];
      if (!field || !field.operations?.includes('set')) throw new Error('Team нельзя редактировать. Добавьте поле на Edit Screen и проверьте права Edit Issues.');
      return field;
    }
    async teams(signal) {
      const teams = new Map();
      const seen = new Set();
      // Server API pagination is one-based. Continue until an empty page, even if the server caps size.
      for (let page = 1; page <= 500; page++) {
        const data = await this.request(`teams-api/1.0/team?page=${page}&size=100`, { signal });
        if (!Array.isArray(data)) throw new Error('Неизвестный формат списка Plans Teams. Нужна адаптация под версию сервера.');
        if (!data.length) return [...teams.values()].sort((a, b) => a.title.localeCompare(b.title));
        let added = 0;
        for (const item of data) {
          const id = teamId(item);
          if (!id) throw new Error('Команда без ID');
          if (!seen.has(id)) { seen.add(id); added++; }
          if (item.shareable === true) teams.set(id, { id, title: String(item.title || `Team ${id}`) });
        }
        if (!added) throw new Error('API повторяет страницу команд. Список неполный; сохранение отключено.');
      }
      throw new Error('Превышен лимит страниц команд.');
    }
    async save(key, value, expected, signal) {
      if (await this.read(key, signal) !== expected) throw new Error('Team уже изменена. Нажмите «Обновить» и выберите команду заново.');
      const metadata = await this.metadata(key, signal);
      const id = teamId(value);
      if (!id && metadata.required) throw new Error('Поле Team обязательное.');
      // Portfolio Server Team custom field accepts the numeric team ID encoded as a string.
      await this.request(this.issuePath(key), { method: 'PUT', body: { fields: { [FIELD]: id || null } }, signal });
      const actual = await this.read(key, signal);
      if (actual !== id) throw new Error('Проверка после сохранения: Team отличается. Обновите данные задачи.');
      return actual;
    }
  }
  return { Api, FIELD, teamId, keyPattern, features: [] };
})();
