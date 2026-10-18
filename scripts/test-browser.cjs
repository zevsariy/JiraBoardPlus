// Offline regression suite. Individual tests intercept Jira requests with fixtures.
const {spawnSync}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
mkdirSync(path.join(root,'test-output'),{recursive:true});
const tests=['browser','active-board-browser','board-regression','parents-browser','notes-browser','report-browser','sprint-browser','metrics-browser','dashboard-browser','tools-browser','roadmap-browser','ai-browser','jira-ui-browser','onboarding-browser','ui-browser','team-settings-browser','extension-smoke'];
const failed=[];
for(const name of tests){
  console.log(`\n[Browser test] ${name}`);
  const result=spawnSync(process.execPath,[path.join(root,'tests',name+'.cjs')],{cwd:root,stdio:'inherit',timeout:180000,env:process.env});
  if(result.error)console.error(result.error.message);
  if(result.status!==0)failed.push(name);
}
console.log(`\nBrowser tests: ${tests.length-failed.length}/${tests.length} passed.`);
if(failed.length){console.error('Failed: '+failed.join(', '));process.exitCode=1;}
