(() => {
  if (location.protocol !== 'https:') return;
  // Do not start observers, timers or messaging on Plans and unrelated Jira pages.
  if (!location.pathname.endsWith('/secure/RapidBoard.jspa')) return;
  const app = globalThis.JiraBoardPlus;
  const context = document.querySelector('meta[name="ajs-context-path"]')?.content || '';
  let api = new app.Api(context);
  let active = null, timer, lastHref = location.href;
  const panelSelector = '#ghx-detail-view, #ghx-detail-contents';
  let enabled = false;
  const applyPrefs = prefs => { const field = prefs.teamField || app.FIELD; if (field !== api.field) { active?.cleanup.forEach(fn => fn()); active = null; api = new app.Api(context, globalThis.fetch.bind(globalThis), field); } enabled = prefs.visuals !== false && prefs.team !== false; sync(); };
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'boardPrefsChanged') applyPrefs(message.prefs); });
  chrome.runtime.sendMessage({ type: 'boardPrefsGet' }).then(r => { if (r?.ok) applyPrefs(r.data); }).catch(() => {});
  function detailsTarget(panel) {
    const section = panel.querySelector('#ghx-details, #details-module, [data-section="details"]') ||
      [...panel.querySelectorAll('h2, h3, h4, .ghx-detail-section-title')]
        .find(el => /^(details?|детали|подробности)$/i.test(el.textContent.trim()))
        ?.closest('.ghx-detail-section, .module, section');
    if (!section) return null;
    return section.querySelector('.ghx-detail-section-content, .mod-content, .ghx-detail-section-body') || section;
  }
  function detect() {
    if (!enabled) return null;
    const url = new URL(location.href);
    if (!url.pathname.endsWith('/secure/RapidBoard.jspa') || !['planning','planning.nodetail','work','detail',null].includes(url.searchParams.get('view'))) return null;
    const panel = [...document.querySelectorAll(panelSelector)].find(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    if (!panel) return null;
    const link = panel.querySelector('#issuekey-val, .ghx-key a, a.issue-link[data-issue-key], a[href*="/browse/"]');
    const key = link?.getAttribute('data-issue-key') || link?.textContent.trim();
    if (!app.keyPattern.test(key || '')) return null;
    const selected = url.searchParams.get('selectedIssue');
    if (selected && selected !== key) return null; // Do not bind during a panel transition.
    const target = detailsTarget(panel);
    return target ? { panel, key, target } : null;
  }
  function sync() {
    if (document.hidden) return;
    lastHref = location.href;
    const next = detect();
    if (active && next?.panel === active.panel && next.key === active.key && next.target === active.target && active.target.querySelector('[data-jbp]')) return;
    active?.cleanup.forEach(fn => fn()); active = null;
    if (!next) return;
    const state = { ...next, cleanup: [] }; active = state;
    const isCurrent = () => { const now = detect(); return active === state && now?.panel === state.panel && now?.key === state.key; };
    state.cleanup = app.features.map(feature => feature.mount({ ...next, api, isCurrent }));
  }
  const schedule = () => { if (document.hidden || timer) return; timer = setTimeout(() => { timer = null; sync(); }, 120); };
  const containsPanel = node => node.nodeType === 1 && (node.matches(panelSelector) || node.querySelector(panelSelector));
  new MutationObserver(records => {
    if (!enabled || document.hidden) return;
    if (location.href !== lastHref || records.some(r => {
      const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      // Ignore changes inside our UI, but still remount if Jira removes its host.
      if (target?.closest('[data-jbp]')) return false;
      if (target?.closest(panelSelector) || target === active?.panel) return true;
      if (r.type === 'attributes') return containsPanel(target);
      return [...r.addedNodes, ...r.removedNodes].some(containsPanel);
    })) schedule();
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'data-issue-key', 'id'] });
  addEventListener('popstate', schedule);
  // Poll only the URL: pushState has no event, and DOM changes are observed above.
  setInterval(() => { if (location.href !== lastHref) schedule(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  sync();
})();
