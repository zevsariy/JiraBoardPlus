// Runs on every page of the configured Jira, independently of board enhancements.
(() => {
  if(globalThis.jbpJiraStyleInstalled)return;
  globalThis.jbpJiraStyleInstalled=true;
  let sheet,revision=0;
  const rule=(selectors,css)=>selectors.split(',').map(s=>'html[data-jbp-jira-style] '+s.trim()).join(',')+'{'+css+'}';
  function apply(id){
    if(!document.documentElement){document.addEventListener('DOMContentLoaded',()=>apply(id),{once:true});return;}
    const p=JbpBoard.jiraStyles.find(p=>p.id===id);
    sheet?.remove();sheet=null;
    document.documentElement.removeAttribute('data-jbp-jira-style');
    if(!p?.bg)return;
    document.documentElement.setAttribute('data-jbp-jira-style',p.id);
    const tokens={
      '--ds-surface':p.surface,'--ds-surface-raised':p.surface,'--ds-surface-overlay':p.surface,'--ds-surface-sunken':p.bg,
      '--ds-text':p.text,'--ds-text-subtle':p.subtle,'--ds-text-subtlest':p.subtle,'--ds-link':p.accent,'--ds-link-pressed':p.accent,
      '--ds-background-neutral':p.muted,'--ds-background-neutral-hovered':p.muted,'--ds-background-input':p.surface,
      '--ds-background-selected':p.muted,'--ds-text-selected':p.accent,'--ds-border':p.subtle,'--ds-border-input':p.subtle,
      '--ds-background-brand-bold':p.accent,'--ds-text-inverse':p.onAccent,
      '--aui-body-background':p.bg,'--aui-panel-bg-color':p.surface,'--aui-text-color':p.text,'--aui-text-color-subtle':p.subtle,
      '--aui-link-color':p.accent,'--aui-border-color':p.subtle,'--aui-button-default-bg-color':p.muted,'--aui-button-default-text-color':p.text,
      '--aui-button-primary-bg-color':p.accent,'--aui-button-primary-text-color':p.onAccent,
      '--aui-form-input-background-color':p.surface,'--aui-form-input-text-color':p.text
    };
    sheet=document.createElement('style');sheet.id='jbp-jira-style';
    sheet.textContent='html[data-jbp-jira-style]{'+Object.entries(tokens).map(([k,v])=>`${k}:${v} !important;`).join('')+`color-scheme:${p.dark?'dark':'light'};background:${p.bg};color:${p.text}}`+
      rule('body,#page,#content,#main,main,.aui-page-panel,.aui-page-panel-content,.ghx-work,.ghx-work-wrapper,#ghx-pool,#ghx-plan, .dashboard',`background-color:${p.bg} !important;color:${p.text} !important;`)+
      rule('.aui-header,#header,.aui-sidebar,.aui-sidebar-wrapper,nav[aria-label],.ghx-column,.ghx-column-headers,.ghx-swimlane-header,.ghx-backlog-container',`background-color:${p.muted} !important;color:${p.text} !important;`)+
      rule('.aui-page-header,.aui-page-panel-inner,.issue-container,.issue-body-content,.module,.mod-content,.ghx-issue,.js-issue,.ghx-issue-content,.ghx-issue-fields,.ghx-backlog-group,.aui-dialog2,.aui-dialog2-header,.aui-dialog2-content,.aui-dialog2-footer,.aui-dropdown2,.aui-dropdown2-section,.aui-inline-dialog-contents,[role="dialog"],[role="menu"],.issue-table,table.aui',`background-color:${p.surface} !important;color:${p.text} !important;border-color:${p.subtle} !important;`)+
      rule('h1,h2,h3,h4,h5,h6,label,.ghx-summary,.ghx-key,.issue-link,.aui-header a,.aui-sidebar a,.aui-nav a,table.aui th,table.aui td',`color:${p.text} !important;`)+
      rule('a:not(.aui-button):not(.aui-lozenge)',`color:${p.accent} !important;`)+
      rule('input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="submit"]),textarea,select,.select2-container .select2-choice',`background-color:${p.surface} !important;color:${p.text} !important;border-color:${p.subtle} !important;border-radius:${p.radius} !important;`)+
      rule('.aui-button,button:not(.aui-button-primary):not(.aui-button-link)',`background-color:${p.muted} !important;color:${p.text} !important;border-color:${p.subtle} !important;border-radius:${p.radius} !important;`)+
      rule('.aui-button.aui-button-primary,input[type="submit"],#create_link',`background-color:${p.accent} !important;color:${p.onAccent} !important;border-color:${p.accent} !important;border-radius:${p.radius} !important;`)+
      rule('.ghx-issue,.aui-dialog2,.aui-inline-dialog-contents',`border-radius:${p.radius} !important;`)+
      rule('a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible',`outline:2px solid ${p.accent} !important;outline-offset:2px;`);
    (document.head||document.documentElement).append(sheet);
  }
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='boardPrefsChanged'){revision++;apply(message.prefs?.jiraStyle);}});
  const initial=revision;
  chrome.runtime.sendMessage({type:'boardPrefsGet'}).then(r=>{if(r?.ok&&revision===initial)apply(r.data.jiraStyle);}).catch(()=>{});
})();
