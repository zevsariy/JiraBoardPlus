(() => {
  if (location.protocol !== 'https:') return;
  const keyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;
  let enabled = false, timer, modal = null;
  const mounts = new Map();
  const element = (tag, text) => { const el = document.createElement(tag); if (text != null) el.textContent = text; return el; };
  async function send(issueKey, op, body = {}) {
    const r = await chrome.runtime.sendMessage({ type: 'privateNotes', issueKey, op, ...body });
    if (!r?.ok) throw new Error(r?.error || 'Служба расширения недоступна. Перезагрузите вкладку.');
    return r.data;
  }
  function openNotes(key, opener) {
    if (modal && !modal.close()) return;
    const host = element('div'); host.dataset.jbpPrivateDialog = '';
    // Closed shadow root keeps note text out of normal Jira DOM queries.
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}dialog{font:14px/1.5 "Segoe UI",sans-serif;color:#183346;width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 40px);border:1px solid #bfd5de;border-radius:12px;padding:24px;background:white;box-shadow:0 20px 70px #132d4660;overflow:auto}dialog::backdrop{background:#142a4566}h2{font-size:20px;margin:0}header{display:flex;gap:16px;justify-content:space-between;align-items:start}.hint{color:#556b7a;font-size:12px}button,textarea{font:inherit}button{padding:7px 12px;border:1px solid #beced7;border-radius:5px;background:white;color:#183346;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.primary{background:#147d85;color:white;border-color:#147d85}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}article{border:1px solid #dce6eb;border-radius:6px;padding:14px;margin:12px 0}article p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}time{font-size:11px;color:#637987}textarea{display:block;width:100%;min-height:125px;resize:vertical;padding:10px;border:1px solid #aebfc9;border-radius:5px;margin-top:7px}label{display:block;font-weight:600}#message{white-space:pre-wrap;color:#126a78}#message.error{color:#a12d27}#changed{padding:8px;background:#eaf6f5;border-radius:5px}#delete-confirm{border:1px solid #e5b7ae;background:#fff5f3;padding:12px;border-radius:5px}[hidden]{display:none!important}:focus-visible{outline:2px solid #147d85;outline-offset:2px}
    </style><dialog aria-labelledby="title"><header><h2 id="title"></h2><button id="close" type="button" aria-label="Закрыть личные заметки">×</button></header><p class="hint">Только в этом профиле браузера. Не публикуются в Jira и не синхронизируются между устройствами. Любой пользователь этого профиля может прочитать записи.</p><p id="changed" hidden>Записи обновлены в другой вкладке. <button id="refresh" type="button">Обновить список</button></p><p id="message" role="status"></p><div id="list" aria-live="polite"></div><div id="delete-confirm" hidden><p>Удалить выбранную заметку? Восстановить её будет нельзя.</p><button id="confirm-delete" type="button">Удалить заметку</button> <button id="cancel-delete" type="button">Отмена</button></div><form><label id="editor-label" for="text">Новая заметка</label><textarea id="text" maxlength="20000" placeholder="Запишите контекст, вопросы или следующий шаг…" required></textarea><div class="actions"><button id="save" class="primary" type="submit">Добавить заметку</button><button id="cancel-edit" type="button" hidden>Отменить редактирование</button><button id="retry" type="button" hidden>Повторить загрузку</button></div></form></dialog>`;
    globalThis.JbpUI?.mount(root);
    const $ = id => root.getElementById(id), dialog = root.querySelector('dialog');
    $('title').textContent = `Личные заметки · ${key}`;
    let notes = [], editId = '', editRevision, original = '', busy = false, ready = false, disposed = false, deleting = null;
    const dirty = () => $('text').value !== original;
    function message(text = '', error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
    function controls() {
      $('save').disabled = busy || !ready; $('text').disabled = busy || !ready;
      for (const b of root.querySelectorAll('button')) b.disabled = busy;
      $('save').disabled = busy || !ready;
    }
    function resetEditor() { editId = ''; editRevision = undefined; original = ''; $('text').value = ''; $('editor-label').textContent = 'Новая заметка'; $('save').textContent = 'Добавить заметку'; $('cancel-edit').hidden = true; }
    function render() {
      $('list').replaceChildren();
      if (!notes.length) $('list').append(element('p', 'Заметок пока нет. Добавьте первую ниже.'));
      for (const note of [...notes].sort((a, b) => b.createdAt - a.createdAt)) {
        const row = element('article'), at = element('time', `${new Date(note.createdAt).toLocaleString()}${note.revision > 1 ? ` · изменено ${new Date(note.updatedAt).toLocaleString()}` : ''}`);
        const text = element('p', note.text), actions = element('div'); actions.className = 'actions';
        const edit = element('button', 'Редактировать'), remove = element('button', 'Удалить'); edit.type = remove.type = 'button';
        edit.onclick = () => { if (busy || (dirty() && !confirm('Отбросить несохранённый текст?'))) return; editId = note.id; editRevision = note.revision; original = note.text; $('text').value = note.text; $('editor-label').textContent = 'Редактирование заметки'; $('save').textContent = 'Сохранить изменения'; $('cancel-edit').hidden = false; $('delete-confirm').hidden = true; message(); $('text').focus(); };
        remove.onclick = () => { if (busy) return; deleting = note; $('delete-confirm').hidden = false; $('confirm-delete').focus(); };
        actions.append(edit, remove); row.append(at, text, actions); $('list').append(row);
      }
    }
    async function load() {
      if (busy) return; busy = true; controls(); message('Загрузка…');
      try { const state = await send(key, 'list'); if (disposed) return; notes = state.notes; ready = true; render(); $('retry').hidden = true; $('changed').hidden = true; message(); }
      catch (e) { if (!disposed) { message(e.message, true); $('retry').hidden = false; } }
      finally { busy = false; if (!disposed) controls(); }
    }
    async function mutate(op, body) {
      if (busy || !ready) return false; busy = true; controls(); message();
      try { const state = await send(key, op, body); if (disposed) return false; notes = state.notes; render(); $('changed').hidden = true; return true; }
      catch (e) { if (!disposed) { message(e.message, true); $('changed').hidden = false; } return false; }
      finally { busy = false; if (!disposed) controls(); }
    }
    function close(force = false) {
      if (!force && (busy || (dirty() && !confirm('Закрыть окно и отбросить несохранённый текст?')))) return false;
      disposed = true; for (const type of ['keydown','keypress','keyup']) removeEventListener(type, shield, true);
      dialog.close(); host.remove(); if (modal?.host === host) modal = null; if (opener?.isConnected) opener.focus(); return true;
    }
    function shield(e) {
      if (!e.composedPath().includes(host)) return;
      e.stopImmediatePropagation();
      if (e.type === 'keydown' && e.key === 'Escape' && !e.isComposing) { e.preventDefault(); close(); }
    }
    for (const type of ['keydown','keypress','keyup']) addEventListener(type, shield, true);
    for (const type of ['click','mousedown','pointerdown','dblclick']) root.addEventListener(type, e => e.stopPropagation());
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    $('close').onclick = () => close(); $('refresh').onclick = $('retry').onclick = load;
    $('cancel-edit').onclick = () => { if (dirty() && !confirm('Отбросить несохранённые изменения?')) return; resetEditor(); message(); };
    $('cancel-delete').onclick = () => { deleting = null; $('delete-confirm').hidden = true; };
    $('confirm-delete').onclick = async () => {
      if (!deleting || busy) return; const target = deleting;
      if (target.id === editId && dirty() && !confirm('Удалить заметку и отбросить несохранённые изменения?')) return;
      if (await mutate('delete', { id: target.id, revision: target.revision })) { if (target.id === editId) resetEditor(); deleting = null; $('delete-confirm').hidden = true; message('Заметка удалена.'); }
    };
    root.querySelector('form').onsubmit = async e => {
      e.preventDefault(); if (busy || !ready) return;
      const text = $('text').value; if (!text.trim()) { message('Введите текст заметки.', true); return; }
      if (await mutate(editId ? 'update' : 'create', { id: editId, revision: editRevision, text })) { resetEditor(); message('Сохранено только в этом профиле браузера.'); $('text').focus(); }
    };
    modal = { host, key, close, changed() { if (!disposed) $('changed').hidden = false; } };
    document.body.append(host); dialog.showModal(); load();
  }
  function addMount(target, key, floating = false) {
    const old = mounts.get(target); if (old?.key === key && old.host.isConnected) return;
    old?.host.remove(); const host = element('span'); host.dataset.jbpNotesButton = '';
    host.style.cssText = floating ? 'position:fixed;right:24px;bottom:24px;z-index:10000' : 'display:block;clear:both;padding:4px 7px;position:relative;z-index:3;pointer-events:auto!important';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<style>:host{pointer-events:auto!important}button{pointer-events:auto!important;position:relative;font:12px "Segoe UI",sans-serif;color:#126a78;background:#f0f8f8;border:1px solid #b7d9dc;border-radius:4px;padding:4px 7px;cursor:pointer}button:focus-visible{outline:2px solid #147d85}</style>';
    const button = element('button', 'Личные заметки'); button.type = 'button'; button.title = `Личные заметки · ${key}`; button.setAttribute('aria-label', `Личные заметки · ${key}`);
    for (const type of ['pointerdown','pointerup','mousedown','mouseup','dblclick','keydown','keyup']) button.addEventListener(type, e => e.stopPropagation());
    button.onclick = e => { e.preventDefault(); e.stopPropagation(); if (enabled) openNotes(key, button); };
    root.append(button); globalThis.JbpUI?.mount(root,true); target.append(host); mounts.set(target, { key, host });
  }
  function sync() {
    if (!enabled) { for (const v of mounts.values()) v.host.remove(); mounts.clear(); modal?.close(true); return; }
    const wanted = new Set(), url = new URL(location.href);
    if (url.pathname.endsWith('/secure/RapidBoard.jspa') && ['work','planning','detail',null].includes(url.searchParams.get('view'))) {
      for (const card of document.querySelectorAll('.ghx-issue[data-issue-key]')) if (keyPattern.test(card.dataset.issueKey) && card.getClientRects().length) { wanted.add(card); addMount(card, card.dataset.issueKey); }
      const panel = [...document.querySelectorAll('#ghx-detail-view, #ghx-detail-contents')].find(p => p.getClientRects().length);
      const link = panel?.querySelector('#issuekey-val, .ghx-key a, a.issue-link[data-issue-key], a[href*="/browse/"]');
      const key = link?.getAttribute('data-issue-key') || link?.textContent.trim();
      if (panel && keyPattern.test(key || '') && (!url.searchParams.get('selectedIssue') || url.searchParams.get('selectedIssue') === key)) {
        const target = panel.querySelector('#ghx-details, #details-module') || panel; wanted.add(target); addMount(target, key);
      }
    } else {
      const key = url.pathname.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)(?:\/|$)/)?.[1];
      const displayed = document.querySelector('#issuekey-val')?.textContent.trim();
      if (key && (!displayed || displayed === key)) { const target = document.querySelector('#opsbar-opsbar-operations, #opsbar-operations, #stalker') || document.body; wanted.add(target); addMount(target, key, target === document.body); }
    }
    for (const [target, value] of mounts) if (!wanted.has(target) || !target.isConnected) { value.host.remove(); mounts.delete(target); }
  }
  function apply(p) { enabled = p.visuals !== false && p.privateNotes === true; sync(); }
  chrome.runtime.onMessage.addListener(m => { if (m.type === 'boardPrefsChanged') apply(m.prefs); if (m.type === 'privateNotesChanged' && modal?.key === m.issueKey) modal.changed(); });
  chrome.runtime.sendMessage({ type: 'boardPrefsGet' }).then(r => { if (r?.ok) apply(r.data); }).catch(() => {});
  new MutationObserver(records => { if (!records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && !n.matches?.('[data-jbp-notes-button],[data-jbp-private-dialog]')))) return; clearTimeout(timer); timer = setTimeout(sync, 100); }).observe(document.body, { childList: true, subtree: true });
  addEventListener('popstate', sync); setInterval(sync, 1000);
})();
