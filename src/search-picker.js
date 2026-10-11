// Single-field searchable selection. Typing filters; only click or Enter commits an ID.
globalThis.JbpSearchPicker = function(container, {onSelect, onClear = () => {}}) {
  const input=container.querySelector('input'),list=document.createElement('div');
  list.id=input.id+'-options';list.className='search-options';list.role='listbox';list.hidden=true;container.append(list);
  input.role='combobox';input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',list.id);
  let items=[],matches=[],selected=null,index=-1;
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function paint(){
    list.replaceChildren();
    if(!matches.length){const empty=document.createElement('p');empty.textContent='Ничего не найдено';list.append(empty);}
    matches.forEach((item,i)=>{const option=document.createElement('div');option.role='option';option.id=list.id+'-'+i;option.setAttribute('aria-selected',String(i===index));option.textContent=item.label;option.onclick=()=>commit(item);list.append(option);});
    if(index>=0){input.setAttribute('aria-activedescendant',list.id+'-'+index);list.children[index]?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
  }
  function show(all=false){if(input.disabled)return;matches=items.filter(item=>all||item.label.toLocaleLowerCase().includes(input.value.trim().toLocaleLowerCase()));index=matches.length?0:-1;list.hidden=false;input.setAttribute('aria-expanded','true');paint();}
  function commit(item){selected=item;input.value=item.label;close();onSelect(item);}
  input.onfocus=()=>{show(!!selected);input.select();};
  input.onclick=()=>{if(list.hidden)show(!!selected);};
  input.oninput=()=>{if(selected){selected=null;onClear();}show();};
  input.onkeydown=e=>{
    if(e.key==='Escape'){close();e.preventDefault();return;}
    if(e.key==='Enter'){e.preventDefault();if(!list.hidden&&index>=0)commit(matches[index]);return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden){show(!!selected);return;}if(!matches.length)return;index=(index+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;paint();}
  };
  list.onmousedown=e=>e.preventDefault();
  input.onblur=close;
  return {set(values,placeholder){items=values;selected=null;input.value='';input.placeholder=placeholder;input.disabled=!values.length;close();},select(id){const item=items.find(item=>String(item.id)===String(id));if(item)commit(item);}};
};
