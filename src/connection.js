(() => {
  const DEFAULT = '';
  function normalize(value) {
    let u; try { u = new URL(String(value).trim()); } catch { throw new Error('Укажите полный базовый URL Jira, например https://jira.example.com'); }
    if(u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !/^\/(?:[\w-]+\/?)*$/.test(u.pathname)) throw new Error('Нужен HTTPS URL Jira без логина, параметров и #; путь /jira допустим.');
    return u.origin + u.pathname.replace(/\/+$/, '');
  }
  function from(state = {}) { return {baseUrl: state.baseUrl ? normalize(state.baseUrl) : '', project: String(state.project || '')}; }
  globalThis.JbpConnection = {DEFAULT, normalize, from};
})();
