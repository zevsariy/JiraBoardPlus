globalThis.JbpComposerStore = {async handle(m,sender,base,transaction){
 if(!base||sender.id!==chrome.runtime.id||!sender.tab?.id||sender.frameId!==0||!sender.url?.startsWith(base+'/'))throw Error('Недопустимая страница Jira.');
 const key=JbpComposer.key(base,m.account);
 if(m.op==='get')return (await chrome.storage.local.get(key))[key]||{drafts:[],templates:[]};
 return transaction(async raw=>{const old=(await chrome.storage.local.get(key))[key];const next=JbpComposer.change(old,m);await raw.set({[key]:next});return next;});
}};
