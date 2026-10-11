const {chromium}=require('playwright'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jbp-ai-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,args:[`--disable-extensions-except=${path.resolve(__dirname,'..')}`,`--load-extension=${path.resolve(__dirname,'..')}`],ignoreDefaultArgs:['--disable-extensions']});
 try{
 await context.route('https://**/*',r=>r.abort());
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),base=worker.url().replace('src/background.js','');
 await worker.evaluate(()=>{chrome.permissions.contains=async()=>true;globalThis.requests=[];globalThis.fetch=async(u,o)=>{requests.push({u,body:JSON.parse(o.body)});return new Response(JSON.stringify({choices:[{message:{content:'## Сводка спринта\n\n**DEMO-1** — проверьте блокировку.\n\n- Первый шаг\n  - Уточнить зависимость\n- Второй шаг\n\n| Метрика | Значение |\n| --- | ---: |\n| WIP | 4 |\n\n> Требует внимания\n\n```jql\nproject = DEMO\n```\n\n[Открыть задачу](https://jira.example/browse/DEMO-1)\n\n<img src=x onerror=alert(1)>'}}]}));};});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'settings.html');await page.evaluate(()=>{chrome.permissions.request=async()=>true;});
 await page.locator('#ai-enabled').check();await page.locator('#ai-endpoint').fill('http://localhost:1234/v1');await page.locator('#ai-model').fill('local-model');await page.locator('#ai-key').fill('local-secret');await page.locator('#ai-save').click();await page.waitForFunction(()=>document.querySelector('#ai-status').textContent.includes('Сохранено'));
 await page.reload();assert.equal(await page.locator('#ai-key').inputValue(),'');assert.equal(await page.locator('#ai-model').inputValue(),'local-model');
 await page.evaluate(()=>{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){const r=attach.call(this,o);if(o.mode==='closed')globalThis.testRoot=r;return r;};});
 for(const file of ['vendor/marked.umd.js','ai-markdown.js','ai-ui.js'])await page.addScriptTag({url:base+'src/'+file});
 await page.evaluate(()=>JbpAIUI.open('sprint',()=>({scope:'Демо-спринт',estimation:{unit:'Story Points'},issues:[{key:'DEMO-1',summary:'Подготовить релиз',status:'Blocked'}]})));
 assert.equal(await worker.evaluate(()=>requests.length),0);await page.evaluate(()=>testRoot.getElementById('run').click());await page.waitForFunction(()=>!testRoot.getElementById('answer').hidden);
 assert.equal(await worker.evaluate(()=>requests.length),1);assert.equal(await page.evaluate(()=>testRoot.getElementById('answer').querySelector('img')),null);assert.match(await page.evaluate(()=>testRoot.getElementById('answer').textContent),/DEMO-1/);
 assert.equal(await page.evaluate(()=>testRoot.querySelector('#answer h2').textContent),'Сводка спринта');assert.equal(await page.evaluate(()=>testRoot.querySelectorAll('#answer table tbody tr').length),1);assert.equal(await page.evaluate(()=>testRoot.querySelectorAll('#answer ul ul li').length),1);assert.equal(await page.evaluate(()=>testRoot.querySelector('#answer pre code').textContent),'project = DEMO');
 await page.screenshot({path:path.join(__dirname,'../test-output/ai-markdown.png')});
 const attacks='[bad](javascript:alert%281%29) [data](data:text/html,test) [encoded](jav&#x61;script:alert%281%29) ![Tracking](https://tracker.example/pixel) <svg onload="alert(1)"></svg> <iframe src="https://tracker.example/"></iframe>';
 await page.evaluate(value=>JbpMarkdown.render(testRoot.getElementById('answer'),value),attacks);
 assert.equal(await page.evaluate(()=>testRoot.querySelectorAll('#answer a, #answer img, #answer svg, #answer iframe, #answer script').length),0);
 await page.evaluate(()=>JbpMarkdown.render(testRoot.getElementById('answer'),'3. Third\n4. Fourth\n\n- [x] Ready\n- [ ] Pending\n\n~~Removed~~ and *italic* and `&amp;`'));
 assert.equal(await page.evaluate(()=>testRoot.querySelector('#answer ol').start),3);assert.equal(await page.evaluate(()=>testRoot.querySelector('#answer code').textContent),'&amp;');assert.equal(await page.evaluate(()=>testRoot.querySelectorAll('#answer input:disabled').length),2);assert.equal(await page.evaluate(()=>testRoot.querySelector('#answer del').textContent),'Removed');
 await page.evaluate(()=>testRoot.getElementById('close').click());assert.deepEqual(errors,[]);

 const board=await context.newPage();await board.route('https://jira.example/**',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><div class="ghx-issue" data-issue-key="DEMO-1">Task</div><div style="display:none" class="ghx-issue" data-issue-key="DEMO-2">Hidden</div>'}));
 await board.goto('https://jira.example/secure/RapidBoard.jspa?view=work&rapidView=1');
 await board.evaluate(()=>{const original=Element.prototype.attachShadow;globalThis.roots=[];Element.prototype.attachShadow=function(o){const r=original.call(this,o);roots.push(r);return r;};globalThis.chrome={runtime:{onMessage:{addListener(f){globalThis.changePrefs=f;}},sendMessage:async m=>{if(m.type==='aiGet')return{ok:true,data:{enabled:true,board:true,endpoint:'https://llm.example/v1',model:'demo'}};if(m.type==='boardPrefsGet')return{ok:true,data:{visuals:true}};if(m.type==='aiBoardData'){globalThis.sentKeys=m.keys;return{ok:true,data:{issues:m.keys.map(key=>({key}))}};}}}};});
 for(const f of ['vendor/marked.umd.js','ai-markdown.js','ai-ui.js','ai-board.js'])await board.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../src',f),'utf8')});
 await board.waitForFunction(()=>roots[0]?.querySelector('button'));await board.evaluate(()=>roots[0].querySelector('button').click());await board.waitForFunction(()=>globalThis.sentKeys);assert.deepEqual(await board.evaluate(()=>sentKeys),['DEMO-1']);
 await board.evaluate(()=>{roots[1].getElementById('close').click();changePrefs({type:'boardPrefsChanged',prefs:{visuals:false}});});assert.equal(await board.evaluate(()=>roots[0].host.isConnected),false);
 console.log('AI browser OK: actual extension startup, settings, masked secret, explicit send, modal response, safe text, close.');
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exit(1);});
