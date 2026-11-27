const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
require('../src/board-core.js');
const ref=process.argv[2]||'v0.32.1';
function load(old){const ctx={JbpBoard};vm.createContext(ctx);vm.runInContext(old?execFileSync('git',['show',`${ref}:src/roadmap-core.js`],{encoding:'utf8'}):fs.readFileSync('src/roadmap-core.js','utf8'),ctx);return ctx.JbpRoadmap;}
const before=load(true),after=load(false),c={teamField:'team',rankField:'rank',dependency:'is blocked by',columns:[]},prefs=JbpBoard.defaults;
function chain(count,cycle=false){const raw=Array.from({length:count},(_,i)=>({level:0,issue:{key:`D-${i}`,id:String(i),fields:{summary:'Task',status:{name:'Doing'},issuetype:{name:'Task'},team:'A',issuelinks:i?[{type:{inward:'is blocked by'},inwardIssue:{key:`D-${i-1}`}}]:[]}}}));if(cycle)raw[0].issue.fields.issuelinks.push({type:{inward:'is blocked by'},inwardIssue:{key:`D-${count-1}`}});return raw;}
const build=(r,raw)=>r.build(raw,c,prefs,{},{},{},Date.UTC(2026,10,28));
function time(fn){fn();const times=[];for(let i=0;i<5;i++){const start=performance.now();fn();times.push(performance.now()-start);}return times.sort((a,b)=>a-b)[2];}
for(const cycle of [false,true]){const raw=chain(2000,cycle);assert.equal(JSON.stringify(build(after,raw)),JSON.stringify(build(before,raw)));console.log(JSON.stringify({nodes:raw.length,cycle,beforeMs:time(()=>build(before,raw)),afterMs:time(()=>build(after,raw))}));}
const large=chain(12000,true);try{build(before,large);console.log('Old 12000-node cycle: passed');}catch(e){console.log('Old 12000-node cycle: '+e.name);}
const start=performance.now(),result=build(after,large);assert.equal(result.cycles.length,12000);console.log(`New 12000-node cycle: ${(performance.now()-start).toFixed(2)} ms; all cycle nodes found`);
// Fixed pseudo-random graphs cover branching, cross edges, multiple cycles and self loops.
let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let trial=0;trial<50;trial++){const raw=chain(30);for(const row of raw){row.issue.fields.issuelinks=[];for(let i=0;i<3;i++)if(random()<0.6)row.issue.fields.issuelinks.push({type:{inward:'is blocked by'},inwardIssue:{key:`D-${Math.floor(random()*35)}`}});}assert.equal(JSON.stringify(build(after,raw)),JSON.stringify(build(before,raw)));}
console.log('50 deterministic branching graphs: exact output equivalence');
