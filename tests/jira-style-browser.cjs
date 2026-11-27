const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:process.env.JBP_TEST_CHANNEL||'chromium',headless:true});try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 await page.setContent(`<style>body{background:rgb(244,245,247);color:rgb(23,43,77)}.ghx-issue{background:white}.aui-lozenge-success{background:rgb(0,100,0);color:white}</style><header class="aui-header"><a href="#">Проекты Jira</a></header><main><h1>Тестовая Jira</h1><div class="ghx-issue"><span class="ghx-summary">DEMO-42 · Задача</span><span class="aui-lozenge aui-lozenge-success">Готово</span></div><input aria-label="Название" value="Задача"><button class="aui-button aui-button-primary">Создать</button><div id="host"></div></main>`);
 await page.evaluate(()=>{globalThis.listeners=[];globalThis.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f)},sendMessage:()=>new Promise(resolve=>globalThis.resolvePrefs=resolve)}};document.documentElement.setAttribute('data-color-mode','light');document.documentElement.style.setProperty('--original-token','preserve');});
 for(const name of ['board-core','jira-style'])await page.addScriptTag({content:fs.readFileSync('src/'+name+'.js','utf8')});
 const presets=await page.evaluate(()=>JbpBoard.jiraStyles);assert.ok(presets.length>=11);
 const original=await page.evaluate(()=>({style:document.documentElement.getAttribute('style'),mode:document.documentElement.getAttribute('data-color-mode'),bg:getComputedStyle(document.body).backgroundColor}));
 const change=async id=>page.evaluate(id=>listeners.forEach(f=>f({type:'boardPrefsChanged',prefs:{jiraStyle:id,visuals:false}})),id);
 const rgb=hex=>'rgb('+hex.slice(1).match(/../g).map(n=>parseInt(n,16)).join(', ')+')';
 for(const p of presets.filter(p=>p.bg)){
  await change(p.id);
  assert.equal(await page.locator('#jbp-jira-style').count(),1);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),rgb(p.bg));
  assert.equal(await page.locator('.ghx-issue').evaluate(el=>getComputedStyle(el).backgroundColor),rgb(p.surface));
  assert.equal(await page.locator('input').evaluate(el=>getComputedStyle(el).color),rgb(p.text));
  assert.equal(await page.locator('.aui-button-primary').evaluate(el=>getComputedStyle(el).backgroundColor),rgb(p.accent));
  assert.equal(await page.locator('.aui-lozenge-success').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 100, 0)');
 }
 await page.evaluate(()=>resolvePrefs({ok:true,data:{jiraStyle:'ocean'}}));assert.equal(await page.locator('html').getAttribute('data-jbp-jira-style'),'contrast','Stale startup response must not override later save');
 await page.evaluate(()=>{const el=document.createElement('div');el.className='aui-dialog2';el.textContent='Новый диалог';document.body.append(el);});
 assert.equal(await page.locator('.aui-dialog2').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(17, 17, 17)');
 await change('midnight');await page.screenshot({path:'test-output/jira-style-midnight.png'});
 await change('standard');assert.equal(await page.locator('#jbp-jira-style').count(),0);assert.equal(await page.locator('html').getAttribute('data-jbp-jira-style'),null);
 assert.deepEqual(await page.evaluate(()=>({style:document.documentElement.getAttribute('style'),mode:document.documentElement.getAttribute('data-color-mode'),bg:getComputedStyle(document.body).backgroundColor})),original);
 await change('invalid');assert.equal(await page.locator('#jbp-jira-style').count(),0);
 console.log('Jira styles: 12 palettes, dynamic dialogs, semantic status colors, disabled board visuals, startup race and exact standard restoration passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
