const {test}=require('node:test');const assert=require('node:assert/strict');
require('../src/connection.js');require('../src/sprint-core.js');require('../src/sprint-client.js');
test('connection migrates legacy context and normalizes URL without credentials or query',()=>{
 const C=JbpConnection;assert.deepEqual(C.from({context:'/jira'}),{baseUrl:'',project:''});
 assert.equal(C.normalize(' https://jira.example.com/jira/ '),'https://jira.example.com/jira');
 for(const value of ['http://jira.example','https://user:password@jira.example','https://jira.example?token=x','https://jira.example/#x','not-a-url'])assert.throws(()=>C.normalize(value));
});
test('sprint client paginates server-capped lists and rejects incomplete lists',async()=>{
 const c=new JbpSprint.Client('','https://jira.example/jira');let calls=[];
 c.get=async path=>{calls.push(path);return calls.length===1?{startAt:0,values:[{id:1}],isLast:false}:{startAt:1,values:[{id:2}],isLast:true};};
 assert.deepEqual(await c.boards('DEMO'),[{id:1},{id:2}]);assert.match(calls[0],/projectKeyOrId=DEMO/);assert.match(calls[1],/startAt=1/);
 c.get=async()=>({startAt:0,values:[],isLast:false});await assert.rejects(c.sprints('1'),/полный список/);
 c.get=async()=>({startAt:5,values:[],isLast:true});await assert.rejects(c.boards('DEMO'),/формат/);
});
