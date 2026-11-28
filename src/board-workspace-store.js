globalThis.JbpBoardWorkspaceStore = {
  async handle(message, sender, base, transaction) {
    const C = JbpBoardWorkspaceCore;
    let url; try { url = new URL(sender.url); } catch { throw Error('Недопустимая страница.'); }
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab?.id || !base || url.origin !== new URL(base).origin || url.pathname !== new URL(base).pathname.replace(/\/$/,'')+'/secure/RapidBoard.jspa' || url.searchParams.get('rapidView') !== String(message.board)) throw Error('Недопустимая страница доски.');
    const key = C.storageKey(base,message.account,message.board);
    if (message.op === 'get') return C.profile((await chrome.storage.local.get(key))[key]);
    if (message.op !== 'set') throw Error('Неизвестная операция личного представления.');
    return transaction(async raw => {
      const stored = (await chrome.storage.local.get(key))[key], old = C.profile(stored);
      if (message.revision !== old.revision) throw Error('Представления изменились в другой вкладке. Нажмите «Перечитать сохранённое» перед повторным сохранением.');
      const next = C.profile(message.value);
      next.revision = old.revision + 1;
      await raw.set({[key]:{...stored,...next}});
      return next;
    });
  }
};
