const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const ref=process.argv[2]||'v0.32.1';
const source=(file,old)=>old?execFileSync('git',['show',`${ref}:src/${file}.js`],{encoding:'utf8'}):fs.readFileSync(`src/${file}.js`,'utf8');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{const results=[];
 for(const old of [true,false]){const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="noise"></div><div id="ghx-pool"></div><div id="ghx-detail-view"><a id="issuekey-val">D-1</a><div id="ghx-details"></div></div>'}));
 await page.goto('https://jira.example.com/secure/RapidBoard.jspa?rapidView=1&view=work');
 await page.evaluate(()=>{globalThis.perf={scans:0,analysis:0,syncs:0,draws:0,writes:0,scheduled:0};const later=globalThis.setTimeout;globalThis.setTimeout=(fn,delay,...args)=>{if(delay===80||delay===120)perf.scheduled++;return later(fn,delay,...args);};const q=Element.prototype.querySelectorAll;Element.prototype.querySelectorAll=function(s){if(s.includes('.ghx-issue[data-issue-key]'))perf.scans++;return q.call(this,s);};
 globalThis.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async()=>({ok:false})}};
 globalThis.JiraBoardPlus={FIELD:'customfield_1',keyPattern:/^D-\d+$/,Api:class {constructor(){this.field='customfield_1';}},features:[{mount({target,key}){const host=document.createElement('div');host.dataset.jbp='';host.textContent=key;target.append(host);return ()=>host.remove();}}]};
 document.querySelector('#ghx-pool').innerHTML=Array.from({length:300},(_,i)=>`<div class="ghx-issue" data-issue-key="D-${i+1}">Task</div>`).join('');
 new MutationObserver(rs=>perf.writes+=rs.length).observe(document.querySelector('#ghx-pool'),{attributes:true,subtree:true});});
 for(const file of ['board-core','control-core'])await page.addScriptTag({content:source(file,false)});
 await page.evaluate(()=>{const a=JbpControl.analyze;JbpControl.analyze=(...args)=>{perf.analysis++;return a(...args);};});
 let board=source('active-board',old).replace('    if(tooltip&&!tooltipAnchor?.isConnected)','    perf.draws++;if(tooltip&&!tooltipAnchor?.isConnected)');
 const seed=`globalThis.seedBoard=()=>{prefs=B.validate({visuals:true,daily:false,summary:true,nativeRefreshMode:'manual',nativeRefreshPauseHidden:false});controlRules=[{name:'Due',metric:'dueDays',op:'lt',value:0,color:'#ff0000'}];const at=Date.now(),config=fetchKey(prefs);rows=new Map(Array.from({length:300},(_,i)=>{const key='D-'+(i+1);return [key,{at,config,controlIssue:{key,fields:{created:'2026-01-01',updated:'2026-01-01',duedate:'2020-01-01',status:{name:'Doing'},issuetype:{name:'Task'},issuelinks:[]},changelog:{total:20,histories:Array.from({length:20},(_,j)=>({created:new Date(Date.UTC(2026,0,j+2)).toISOString(),items:[{field:'status',fromString:j%2?'Test':'Doing',toString:j%2?'Doing':'Test'}]}))}}}];}));current='1';fetchedAt=at;refresh();};`;
 board=board.replace('  new MutationObserver',seed+'\n  new MutationObserver');await page.addScriptTag({content:board});
 await page.evaluate(()=>{chrome.runtime.sendMessage=async()=>({ok:true,data:{visuals:true,team:true}});});
 let content=source('content',old).replace('    const next = detect();','    perf.syncs++;const next = detect();');await page.addScriptTag({content});
 await page.evaluate(()=>seedBoard());await page.waitForTimeout(250);
 const reset=()=>page.evaluate(()=>{for(const k of Object.keys(perf))perf[k]=0;});await reset();
 const samples=[];let forced;for(let sample=0;sample<5;sample++){await reset();samples.push(await page.evaluate(()=>{const start=performance.now();for(let i=0;i<30;i++)dispatchEvent(new PopStateEvent('popstate'));return performance.now()-start;}));await page.waitForTimeout(200);forced=await page.evaluate(()=>({...perf}));}const refresh=samples.sort((a,b)=>a-b)[2];
 await reset();for(let i=0;i<10;i++){await page.evaluate(i=>{document.querySelector('#noise').innerHTML='<span>'+i+'</span>';},i);await page.waitForTimeout(150);}await page.waitForTimeout(250);const noise=await page.evaluate(()=>({...perf}));
 const state=await page.evaluate(()=>({tags:document.querySelectorAll('[data-jbp-card]').length,risks:document.querySelectorAll('[data-jbp-risk]').length,text:document.querySelector('[data-jbp-card]').shadowRoot.textContent}));assert.equal(state.tags,300);assert.equal(state.risks,300);assert.deepEqual(errors,[]);results.push({version:old?ref:'working',refreshMs:refresh,forced,noise,state});await page.close();}
 assert.deepEqual(results[0].state,results[1].state);for(const r of results){delete r.state;console.log(JSON.stringify(r));}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
