(() => {
const $=id=>document.getElementById('ai-'+id);
const send=async(type,extra={})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(!r?.ok)throw Error(r?.error||'Служба недоступна');return r.data;};
let defaultPrompt='',baseline=null;
const snapshot=()=>Object.fromEntries(['endpoint','model','prompt','key','enabled','board','sprint','roadmap','clear'].map(k=>[k,$(k).type==='checkbox'?$(k).checked:$(k).value]));
const dirty=()=>baseline&&JSON.stringify(snapshot())!==JSON.stringify(baseline);
const cancel=document.createElement('button');cancel.id='ai-cancel';cancel.type='button';cancel.textContent='Отменить изменения';$('save').after(cancel);cancel.onclick=()=>{if(!baseline)return;for(const [k,value]of Object.entries(baseline)){if($(k).type==='checkbox')$(k).checked=value;else $(k).value=value;}$('status').textContent='Изменения ИИ отменены.';};
window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
$('form').addEventListener('input',()=>{$('status').textContent=dirty()?'Есть несохранённые изменения подключения ИИ.':'';});
send('aiGet').then(c=>{defaultPrompt=c.defaultPrompt;for(const k of ['endpoint','model','prompt'])$(k).value=c[k]||'';for(const k of ['enabled','board','sprint','roadmap'])$(k).checked=c[k];$('key').placeholder=c.hasKey?'Ключ сохранён; оставьте пустым для сохранения':'Необязательно';$('save').disabled=false;baseline=snapshot();}).catch(e=>$('status').textContent=e.message);
$('reset').onclick=()=>{$('prompt').value=defaultPrompt;$('prompt').dispatchEvent(new Event('input',{bubbles:true}));};
$('form').onsubmit=async e=>{e.preventDefault();$('save').disabled=true;try{const c={};for(const k of ['endpoint','model','prompt'])c[k]=$(k).value;for(const k of ['enabled','board','sprint','roadmap'])c[k]=$(k).checked;c.clearKey=$('clear').checked;if($('key').value)c.key=$('key').value;JbpAI.config(c);if(c.enabled&&!await chrome.permissions.request({origins:[new URL(JbpAI.endpoint(c.endpoint)).origin+'/*']}))throw Error('Доступ не предоставлен.');await send('aiSave',{config:c});$('key').value='';$('clear').checked=false;baseline=snapshot();$('status').textContent='Сохранено. Обновите вкладки Jira для применения кнопок анализа.';}catch(e){$('status').textContent=e.message;}finally{$('save').disabled=false;}};
})();
