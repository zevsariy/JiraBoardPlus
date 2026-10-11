// Marked tokenizes Markdown; only this DOM allowlist renders model output.
// Never pass model text to innerHTML or Marked's HTML renderer.
globalThis.JbpMarkdown = (() => {
 function decode(text){return String(text||'').replace(/&(?:#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]{1,31});/gi,entity=>{const box=document.createElement('textarea');box.innerHTML=entity;return box.value;});}
 function safeURL(href){
  try{const raw=decode(href);if(/[\u0000-\u0020\u007f]/.test(raw))return null;const url=new URL(raw);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
 }
 function render(target,source){
  const text=String(source??''),fragment=document.createDocumentFragment();
  const node=(tag,value)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;return n;};
  function tokens(items,parent,depth=0){
   for(const t of items||[]){
    if(depth>64){parent.append(document.createTextNode(t.raw||t.text||''));continue;}
    const nested=(tag,children=t.tokens)=>{const n=node(tag);tokens(children,n,depth+1);parent.append(n);return n;};
    switch(t.type){
     case 'space':break;
     case 'heading':nested('h'+Math.max(1,Math.min(6,t.depth)));break;
     case 'paragraph':nested('p');break;
     case 'text':if(t.tokens)tokens(t.tokens,parent,depth+1);else parent.append(document.createTextNode(decode(t.text)));break;
     case 'escape':parent.append(document.createTextNode(decode(t.text)));break;
     case 'strong':nested('strong');break;
     case 'em':nested('em');break;
     case 'del':nested('del');break;
     case 'codespan':parent.append(node('code',t.text));break;
     case 'code':{const pre=node('pre');pre.append(node('code',t.text));parent.append(pre);break;}
     case 'br':parent.append(node('br'));break;
     case 'hr':parent.append(node('hr'));break;
     case 'blockquote':nested('blockquote');break;
     case 'list':{const list=node(t.ordered?'ol':'ul');if(t.ordered&&Number.isSafeInteger(t.start)&&t.start>0)list.start=t.start;for(const item of t.items){const li=node('li');if(item.task){const check=node('input');check.type='checkbox';check.disabled=true;check.checked=!!item.checked;check.setAttribute('aria-label',item.checked?'Выполнено':'Не выполнено');li.append(check,document.createTextNode(' '));}tokens(item.tokens,li,depth+1);list.append(li);}parent.append(list);break;}
     case 'table':{const wrap=node('div'),table=node('table'),head=node('thead'),body=node('tbody');wrap.className='md-table';const row=(cells,tag)=>{const tr=node('tr');cells.forEach((cell,i)=>{const td=node(tag);if(['left','right','center'].includes(t.align[i]))td.style.textAlign=t.align[i];tokens(cell.tokens,td,depth+1);tr.append(td);});return tr;};head.append(row(t.header,'th'));for(const cells of t.rows)body.append(row(cells,'td'));table.append(head,body);wrap.append(table);parent.append(wrap);break;}
     case 'link':{const href=safeURL(t.href);if(!href){tokens(t.tokens,parent,depth+1);break;}const a=nested('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';if(t.title)a.title=decode(t.title);break;}
     // Images become alt text. Rendering must not silently contact model-supplied URLs.
     case 'image':parent.append(document.createTextNode(decode(t.text)||'[изображение]'));break;
     case 'html':parent.append(document.createTextNode(t.raw||t.text||''));break;
     default:parent.append(document.createTextNode(t.raw||t.text||''));
    }
   }
  }
  try{if(text.length>200000)throw Error('Large response');tokens(marked.lexer(text,{gfm:true,breaks:false}),fragment);}catch{fragment.replaceChildren(node('pre',text));}
  target.replaceChildren(fragment);
 }
 return {render,safeURL};
})();
