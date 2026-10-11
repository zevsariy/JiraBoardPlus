globalThis.JbpNotes = (() => {
  const keyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;
  function storageKey(base, key) {
    if (!keyPattern.test(key || '')) throw new Error('Некорректный ключ задачи.');
    return `jbpPrivateNotes:${encodeURIComponent(base)}:${key}`;
  }
  function change(state, message, now = Date.now(), uuid = () => crypto.randomUUID()) {
    const notes = (state?.notes || []).map(n => ({ ...n }));
    const result = { revision: (state?.revision || 0) + 1, notes };
    const op = message.op;
    if (!['create', 'update', 'delete'].includes(op)) throw new Error('Неизвестная операция заметок.');
    let text;
    if (op !== 'delete') {
      if (typeof message.text !== 'string' || !message.text.trim()) throw new Error('Введите текст заметки.');
      if (message.text.length > 20000) throw new Error('В заметке допустимо до 20 000 символов.');
      text = message.text.trim();
    }
    if (op === 'create') {
      if (notes.length >= 200) throw new Error('На задаче уже 200 заметок. Удалите ненужные.');
      notes.push({ id: uuid(), text, createdAt: now, updatedAt: now, revision: 1 });
    } else {
      const index = notes.findIndex(n => n.id === message.id);
      if (index < 0 || notes[index].revision !== message.revision) throw new Error('Заметка изменена или удалена в другой вкладке. Обновите список; ваш текст сохранён в редакторе.');
      if (op === 'delete') notes.splice(index, 1);
      else notes[index] = { ...notes[index], text, updatedAt: now, revision: notes[index].revision + 1 };
    }
    return result;
  }
  return { storageKey, change };
})();
