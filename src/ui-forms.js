globalThis.JbpFormsMount=function(root=document){
  const doc=root.ownerDocument||root;
  // Keep native inputs and their keyboard/form behavior; style settings as switches.
  function switches(){for(const input of root.querySelectorAll('input[type=checkbox]')){
    if(input.closest('#settings,#ai-form')||input.closest('label.toggle'))input.classList.add('ui-switch');
  }}
  function normalize(){for(const label of root.querySelectorAll('label')){if(label.classList.contains('ui-check-row'))continue;const inputs=label.querySelectorAll('input');if(inputs.length!==1||!['checkbox','radio'].includes(inputs[0].type))continue;const input=inputs[0];if(input.parentElement!==label)continue;const copy=doc.createElement('span');copy.className='ui-check-copy';for(const node of [...label.childNodes])if(node!==input)copy.append(node);label.replaceChildren(input,copy);label.classList.add('ui-check-row');}for(const input of root.querySelectorAll('input,select,textarea')){if(!input.name&&input.id)input.name=input.id;if(!input.autocomplete&&input.matches('input:not([type=checkbox]):not([type=radio]),textarea'))input.autocomplete='off';if(input.matches('input[type=url],input[type=password]'))input.spellcheck=false;}}
  normalize();switches();let queued=false;const observer=new MutationObserver(records=>{if(queued||!records.some(r=>r.addedNodes.length))return;queued=true;queueMicrotask(()=>{queued=false;normalize();switches();});});observer.observe(root.body||root,{childList:true,subtree:true});return ()=>observer.disconnect();
};
