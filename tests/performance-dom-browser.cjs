const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:process.env.JBP_TEST_CHANNEL||'chromium',headless:true});try{
 const page=await browser.newPage(),errors=[];let requests=0;page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());assert.equal(u.hostname,'jira.example.com');if(u.pathname.endsWith('.jspa'))return r.fulfill({contentType:'text/html',body:'<div id="noise"></div><div id="wrap"><div id="ghx-detail-view"><a id="issuekey-val">D-1</a><div id="ghx-details"></div></div></div><div id="ghx-pool"><div class="ghx-issue" data-issue-key="D-1">One</div><div class="ghx-issue" data-issue-key="D-2">Two</div></div>'});
 requests++;const key=u.pathname.match(/issue\/(D-\d+)/)?.[1];assert.ok(key,'only mocked issue requests');return r.fulfill({contentType:'application/json',body:JSON.stringify({key,fields:{created:'2026-01-01',updated:'2026-11-27T00:00:05Z',duedate:'2020-01-01',assignee:null,status:{name:'Doing'},issuetype:{name:'Task'},issuelinks:[]}})});});
 await page.goto('https://jira.example.com/secure/RapidBoard.jspa?rapidView=1&view=work');
 await page.evaluate(()=>{
 globalThis.now=Date.parse('2026-11-28T00:00:00Z');Date.now=()=>now;globalThis.hiddenForTest=false;Object.defineProperty(document,'hidden',{get:()=>hiddenForTest});
 globalThis.stats={scans:0,analysis:0,mounts:0,cleanups:0},globalThis.listeners=[];
 const q=Element.prototype.querySelectorAll;Element.prototype.querySelectorAll=function(s){if(s.includes('.ghx-issue[data-issue-key]'))stats.scans++;return q.call(this,s);};
 globalThis.prefs={visuals:true,team:true,daily:false,scope:false,age:false,build:false,summary:false,nativeRefreshMode:'manual',nativeRefreshPauseHidden:false};
 globalThis.rules=[{name:'Unassigned',metric:'unassigned',op:'gte',value:1,color:'#ff0000'}];
 globalThis.send=m=>listeners.forEach(fn=>fn(m));
 globalThis.chrome={runtime:{sendMessage:async m=>({ok:true,data:m.type==='controlRulesGet'?rules:prefs}),onMessage:{addListener:fn=>listeners.push(fn)}}};
 globalThis.JiraBoardPlus={FIELD:'customfield_10200',keyPattern:/^D-\d+$/,Api:class{constructor(context,fetch,field='customfield_10200'){this.field=field;}},features:[{mount({target,key,isCurrent}){stats.mounts++;const host=document.createElement('div');host.dataset.jbp='';host.dataset.issueKey=key;host.textContent=key;target.append(host);globalThis.isCurrent=isCurrent;return ()=>{stats.cleanups++;host.remove();};}}]};
 });
 for(const file of ['board-core','control-core'])await page.addScriptTag({content:fs.readFileSync('src/'+file+'.js','utf8')});
 await page.evaluate(()=>{const a=JbpControl.analyze;JbpControl.analyze=(...args)=>{stats.analysis++;return a(...args);};});
 for(const file of ['active-board','content'])await page.addScriptTag({content:fs.readFileSync('src/'+file+'.js','utf8')});
 await page.waitForFunction(()=>document.querySelectorAll('[data-jbp-risk]').length===2&&document.querySelector('[data-jbp]'));await page.waitForTimeout(250);assert.equal(requests,2);
 const stable=await page.evaluate(()=>({...stats}));
 for(let i=0;i<3;i++){await page.evaluate(i=>document.querySelector('#noise').innerHTML='<div>'+i+'</div>',i);await page.waitForTimeout(160);}
 assert.deepEqual(await page.evaluate(()=>({...stats})),stable,'unrelated DOM causes no scans, analysis or remounts');
 await page.evaluate(async()=>{const before=stats.scans;for(let i=0;i<12;i++){const span=document.createElement('span');span.textContent='moving';document.querySelector('#ghx-pool').append(span);await new Promise(r=>setTimeout(r,20));}if(stats.scans<=before)throw Error('Continuous mutations starved the refresh timer');});
 await page.evaluate(()=>{document.querySelector('[data-issue-key="D-1"].ghx-issue').textContent='Jira replaced content';});await page.waitForFunction(()=>document.querySelectorAll('[data-jbp-card]').length===2);assert.equal(requests,2);assert.equal(await page.evaluate(()=>stats.analysis),stable.analysis,'DOM-only redraw reuses risks');
 await page.evaluate(()=>document.querySelector('.ghx-issue').dataset.issueKey='D-3');await page.waitForFunction(()=>document.querySelector('[data-issue-key="D-3"] [data-jbp-card]'));await page.waitForTimeout(300);assert.equal(requests,3);assert.ok(await page.evaluate(n=>stats.analysis>n,stable.analysis),'new rows invalidate risks');
 await page.evaluate(()=>{document.querySelector('#ghx-pool').outerHTML='<section><div id="ghx-pool"><div class="ghx-issue" data-issue-key="D-2">Rebuilt</div></div></section>';});await page.waitForFunction(()=>document.querySelector('#ghx-pool [data-jbp-risk]'));assert.equal(requests,3);
 await page.evaluate(()=>{send({type:'controlRulesChanged',rules:[{name:'Idle',metric:'idleDays',op:'gte',value:1,color:'#00ff00'}]});});await page.waitForFunction(()=>!document.querySelector('[data-jbp-risk]'));await page.waitForTimeout(250);
 await page.evaluate(()=>{now+=20000;dispatchEvent(new PopStateEvent('popstate'));});await page.getByRole('button',{name:'Риск: Idle',exact:true}).waitFor();
 await page.evaluate(()=>send({type:'boardPrefsChanged',prefs:{...prefs,doneStatusNames:'Doing'}}));await page.waitForFunction(()=>!document.querySelector('[data-jbp-risk]'));
 await page.evaluate(()=>send({type:'boardPrefsChanged',prefs}));await page.getByRole('button',{name:'Риск: Idle',exact:true}).waitFor();
 // Character-data edits, ancestor visibility, removed hosts and replaced panel containers.
 await page.evaluate(()=>{document.querySelector('#issuekey-val').firstChild.data='D-2';});await page.waitForFunction(()=>document.querySelector('[data-jbp]')?.dataset.issueKey==='D-2');
 await page.evaluate(()=>document.querySelector('#wrap').style.display='none');await page.locator('[data-jbp]').waitFor({state:'detached'});
 await page.evaluate(()=>document.querySelector('#wrap').style.display='');await page.locator('[data-jbp]').waitFor();
 await page.evaluate(()=>document.querySelector('[data-jbp]').remove());await page.locator('[data-jbp]').waitFor();
 await page.evaluate(()=>{document.querySelector('#ghx-detail-view').outerHTML='<div id="ghx-detail-contents"><a id="issuekey-val">D-3</a><div id="ghx-details"></div></div>';});await page.waitForFunction(()=>document.querySelector('[data-jbp]')?.dataset.issueKey==='D-3');
 await page.evaluate(()=>document.querySelector('#ghx-detail-contents').id='inactive-panel');await page.locator('[data-jbp]').waitFor({state:'detached'});
 await page.evaluate(()=>document.querySelector('#inactive-panel').id='ghx-detail-contents');await page.locator('[data-jbp]').waitFor();
 // URL-only navigation must still be noticed without any DOM mutation or popstate.
 await page.evaluate(()=>history.pushState({},'','?rapidView=1&view=work&selectedIssue=D-9'));await page.locator('[data-jbp]').waitFor({state:'detached'});
 await page.evaluate(()=>history.pushState({},'','?rapidView=1&view=work&selectedIssue=D-3'));await page.locator('[data-jbp]').waitFor();
 await page.evaluate(()=>{hiddenForTest=true;document.dispatchEvent(new Event('visibilitychange'));document.querySelector('#issuekey-val').textContent='D-4';history.pushState({},'','?rapidView=1&view=work&selectedIssue=D-4');});await page.waitForTimeout(250);assert.equal(await page.locator('[data-jbp]').getAttribute('data-issue-key'),'D-3');
 await page.evaluate(()=>{hiddenForTest=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>document.querySelector('[data-jbp]')?.dataset.issueKey==='D-4');
 assert.deepEqual(errors,[]);console.log('DOM regression: unrelated updates, card/host/pool replacements, key edits, risk invalidation, clock, prefs, panel visibility, URL-only navigation and hidden-tab resume passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
