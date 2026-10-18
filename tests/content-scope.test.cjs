const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const files=['content.js','active-board.js','ai-board.js','sprint-report.js','private-notes.js'];
test('Plans and unrelated Jira pages start no content work, even if scripts are injected',()=>{
 for(const pathname of ['/plugins/servlet/ac/portfolio/plan','/secure/PortfolioPlanView.jspa','/jira/plugins/servlet/portfolio/plan/1','/secure/Dashboard.jspa','/plugins/servlet/structure'])for(const file of files){
  const sandbox={location:{protocol:'https:',pathname}};
  // No DOM, messaging, timers or globals: any initialization would throw.
  assert.doesNotThrow(()=>vm.runInNewContext(fs.readFileSync(require.resolve('../src/'+file),'utf8'),sandbox),file+' '+pathname);
 }
});
