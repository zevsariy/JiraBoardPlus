(() => {
  document.getElementById('theme-choice').onchange=async e=>{try{await JbpTheme.set(e.target.value);}catch(error){const status=document.getElementById('menu-status');status.hidden=false;status.textContent=error.message;}};
  chrome.storage.local.get('jbpOnboarding').then(s=>{if(!s.jbpOnboarding?.completedAt)[...document.getElementById('onboarding').childNodes].filter(n=>n.nodeType===3).forEach(n=>n.textContent='Завершить первоначальную настройку ↗');}).catch(()=>{});
  for(const [id,file]of Object.entries({report:'report.html',metrics:'metrics.html',roadmap:'roadmap.html',tools:'tools.html','open-settings':'settings.html',onboarding:'onboarding.html',help:'help.html'})){
    document.getElementById(id).onclick=async()=>{try{await chrome.tabs.create({url:chrome.runtime.getURL(file)});window.close();}catch(e){const status=document.getElementById('menu-status');status.hidden=false;status.textContent=e.message;}};
  }
})();
