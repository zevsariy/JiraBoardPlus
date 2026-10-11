(() => {
 const roots=new Set([document]),original=new WeakMap(),media=matchMedia('(prefers-color-scheme:dark)');let choice='system';
 function patch(rules){for(const rule of rules){if(rule.media){const saved=original.get(rule)||rule.media.mediaText;if(saved.includes('prefers-color-scheme')){original.set(rule,saved);rule.media.mediaText=choice==='system'?saved:(saved.includes('dark')===(choice==='dark')?'all':'not all');}}if(rule.cssRules)patch(rule.cssRules);}}
 function applyRoot(root){for(const sheet of root.styleSheets||[...root.querySelectorAll('style')].map(s=>s.sheet).filter(Boolean)){try{patch(sheet.cssRules);}catch{}}if(root.host)root.host.style.colorScheme=choice==='system'?'light dark':choice;}
 function apply(){const effective=choice==='system'?(media.matches?'dark':'light'):choice;document.documentElement.dataset.theme=effective;document.documentElement.style.colorScheme=effective;for(const root of roots)applyRoot(root);const control=document.getElementById('theme-choice');if(control)control.value=choice;dispatchEvent(new CustomEvent('jbp-theme-change',{detail:{choice,effective}}));}
 globalThis.JbpTheme={register(root){roots.add(root);applyRoot(root);},async set(value){if(!['system','light','dark'].includes(value))return;await chrome.storage.local.set({jbpTheme:value});choice=value;apply();}};
 chrome.storage.local.get('jbpTheme').then(s=>{choice=['light','dark'].includes(s.jbpTheme)?s.jbpTheme:'system';apply();}).catch(apply);
 chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.jbpTheme){choice=['light','dark'].includes(changes.jbpTheme.newValue)?changes.jbpTheme.newValue:'system';apply();}});
 media.addEventListener('change',apply);document.addEventListener('DOMContentLoaded',apply);apply();
})();
