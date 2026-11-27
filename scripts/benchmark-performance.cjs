const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),ref=process.argv[2]||'v0.32.0';
function load(file,old){const ctx={};vm.createContext(ctx);vm.runInContext(old?execFileSync('git',['show',`${ref}:src/${file}`],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'src',file),'utf8'),ctx);return ctx;}
const oldC=load('control-core.js',true).JbpControl,newC=load('control-core.js').JbpControl;
const oldR=load('roadmap-core.js',true).JbpRoadmap,newR=load('roadmap-core.js').JbpRoadmap;
const DAY=86400000,start=Date.parse('2026-01-01T00:00:00Z');
function snapshot(count,visits){return {at:'2026-11-28T00:00:00Z',issues:Array.from({length:count},(_,i)=>({key:`DEMO-${i+1}`,fields:{created:new Date(start).toISOString(),updated:new Date(start).toISOString(),status:{name:'Doing'},issuetype:{name:'Task'},assignee:null,issuelinks:[],customfield_1:[{id:7}]},changelog:{total:visits,histories:Array.from({length:visits},(_,j)=>({created:new Date(start+(j+1)*(i%5+1)*3600000).toISOString(),items:[{field:'status',fromString:j%2?'Test':'Doing',toString:j%2?'Doing':'Test'}]}))}}))};}
const config={doneNames:['Done'],sprintId:'7',sprintField:'customfield_1',sprintStart:'2026-01-01',sprintEnd:'2026-11-28'};
function model(count){return {config:{excludeMasks:''},version:{},loadedAt:'2026-11-28',roots:[],nodes:Array.from({length:count},(_,i)=>({key:`D-${i}`,parent:'',type:'Task',status:'Doing',team:'Команда "A"\n😀',start,end:start+DAY,due:null,children:[],segments:[],unknown:0,done:false,source:'Targets'})),edges:Array.from({length:count},(_,i)=>({from:`D-${i}`,to:`D-${i+1}`,clear:false,conflict:i%3===0,unknown:false}))};}
function median(fn){const times=[];fn();for(let i=0;i<5;i++){const t=performance.now();fn();times.push(performance.now()-t);}return times.sort((a,b)=>a-b)[2];}
function compare(label,before,after){assert.equal(JSON.stringify(after()),JSON.stringify(before()),label+' output equivalence');const a=median(before),b=median(after);console.log(`${label}: ${a.toFixed(2)} ms -> ${b.toFixed(2)} ms (${(a/b).toFixed(2)}x)`);}
const large=snapshot(2500,20);compare('Control: 2500 issues x 20 transitions',()=>oldC.analyze(large,config),()=>newC.analyze(large,config));
const long=snapshot(1,10000);compare('Control: 10000 transitions',()=>oldC.analyze(long,{}),()=>newC.analyze(long,{}));
for(const n of [0,5,2500]){const m=model(n);compare(`Roadmap AI: ${n} issues and edges`,()=>oldR.compactAI(m),()=>newR.compactAI(m));}
