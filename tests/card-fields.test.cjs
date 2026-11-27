const {test}=require('node:test'),assert=require('node:assert/strict');require('../src/board-core.js');const B=JbpBoard;
test('card fields resolve IDs, preserve order, validate limits and distinguish unavailable/empty/zero',()=>{
 const catalog=[{id:'duedate',name:'Due Date'},{id:'customfield_1',name:'Risk'},{id:'customfield_2',name:'Risk'}];const c=B.cardFieldConfig(catalog,'Due Date, Risk, customfield_1');assert.equal(c[0].id,'duedate');assert.match(c[1].error,/несколько/);const v=B.cardFieldValues({duedate:null,customfield_1:0},c);assert.equal(v[0].empty,true);assert.ok(v[1].error);assert.equal(v[2].value,'0');assert.equal(v[2].empty,false);assert.throws(()=>B.validate({cardFieldsBoard:true}));assert.throws(()=>B.validate({cardFields:Array.from({length:9},(_,i)=>'F'+i).join(',')}));
 assert.equal(B.cardValue([{displayName:'Alice'},{value:'Parent',child:{value:'Child'}},false]),'Alice, Parent / Child, Нет');
 assert.equal(B.cardValue({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'safe <script>'}]}]}),'safe <script>');
});
test('direct fields come from selected ancestor, not the card; null links and cycles are explicit',async()=>{
 const task={key:'D-1',fields:{epic:'D-2',duedate:'2030-01-01'}},parents={'D-2':{key:'D-2',fields:{component:'D-3',duedate:'2027-01-01'}},'D-3':{key:'D-3',fields:{duedate:'2028-01-01'}}};let calls=[];const fetch=async k=>{calls.push(k);return parents[k];};
 assert.equal((await B.cardParent(task,{epic:'epic',component:'component'},'epic',fetch)).fields.duedate,'2027-01-01');assert.equal((await B.cardParent(task,{epic:'epic',component:'component'},'component',fetch)).fields.duedate,'2028-01-01');
 assert.equal(await B.cardParent({key:'D-1',fields:{epic:null}},{epic:'epic'},'epic',fetch),null);await assert.rejects(B.cardParent(task,{epic:'missing'},'epic',fetch),/недоступно/);parents['D-2'].fields.component='D-1';await assert.rejects(B.cardParent(task,{epic:'epic',component:'component'},'component',fetch),/Цикл/);
});
