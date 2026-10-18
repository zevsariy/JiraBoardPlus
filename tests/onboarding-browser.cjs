const {chromium}=require('playwright'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jbp-onboarding-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,args:[`--disable-extensions-except=${path.resolve(__dirname,'..')}`,`--load-extension=${path.resolve(__dirname,'..')}`],ignoreDefaultArgs:['--disable-extensions']});
 try{
 const network=[];await context.route('https://**/*',r=>{network.push(r.request().url());return r.abort();});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const base=worker.url().replace('src/background.js','');
 let page;for(let i=0;i<50;i++){page=context.pages().find(p=>p.url()===base+'onboarding.html');if(page)break;await new Promise(r=>setTimeout(r,100));}assert.ok(page,'fresh install opens wizard');
 await page.evaluate(()=>{chrome.permissions.request=async()=>true;});await worker.evaluate(()=>{chrome.permissions.contains=async()=>true;});
 assert.deepEqual(await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts()),[]);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#wizard').waitFor();
 await page.locator('#next').click();assert.match(await page.locator('#error').textContent(),/базовый URL/);
 await page.locator('#baseUrl').fill('https://jira.example.com');await page.locator('#project').fill('demo');await page.locator('#next').click();await page.getByText('Шаг 2 из 4',{exact:true}).waitFor();
 await page.reload();await page.evaluate(()=>{chrome.permissions.request=async()=>true;});await page.getByText('Шаг 2 из 4',{exact:true}).waitFor();assert.equal(await page.locator('#project').inputValue(),'DEMO');
 await page.locator('#workStatusNames').fill('Done');await page.locator('#next').click();assert.match(await page.locator('#error').textContent(),/одновременно/);
 await page.locator('#workStatusNames').fill('Doing');await page.locator('#next').click();await page.locator('#daily').check();await page.locator('#next').click();
 assert.match(await page.locator('#review').textContent(),/DEMO/);assert.equal((await worker.evaluate(()=>chrome.storage.local.get('jbpOnboarding'))).jbpOnboarding,undefined);
 // An unrelated setting changed while wizard is open must survive.
 await worker.evaluate(()=>chrome.storage.local.set({jbpBoardPrefs:{borderWidth:7,blockedStatusNames:'Waiting'}}));
 await page.screenshot({path:path.join(__dirname,'../test-output/onboarding-review.png'),fullPage:true});
 const rejected=await page.evaluate(()=>chrome.runtime.sendMessage({type:'onboardingSave',baseUrl:'https://jira.example.com',project:'BAD PROJECT',prefs:{daily:false}}));assert.equal(rejected.ok,false);assert.equal((await worker.evaluate(()=>chrome.storage.local.get('jbpOnboarding'))).jbpOnboarding,undefined);assert.equal((await worker.evaluate(()=>chrome.storage.local.get('jbpBoardPrefs'))).jbpBoardPrefs.borderWidth,7);
 page.once('dialog',d=>d.accept());await page.locator('#next').click();await page.locator('#complete').waitFor();
 let stored=await worker.evaluate(()=>chrome.storage.local.get(null));assert.equal(stored.jbpReportsV1.project,'DEMO');assert.equal(stored.jbpReportsV1.queries.length,0);assert.equal(stored.jbpBoardPrefs.daily,true);assert.equal(stored.jbpBoardPrefs.borderWidth,7);assert.equal(stored.jbpBoardPrefs.blockedStatusNames,'Waiting');assert.ok(stored.jbpOnboarding.completedAt);assert.equal(stored.jbpOnboardingDraft,null);
 const scripts=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());assert.deepEqual(scripts[0].matches,['https://jira.example.com/*']);
 await page.goto(base+'onboarding.html');await page.locator('#wizard').waitFor();assert.equal(await page.locator('#project').inputValue(),'DEMO');assert.equal(await page.locator('#workStatusNames').inputValue(),'Doing');
 await page.locator('#project').fill('LATER');await page.locator('#later').click();await page.waitForURL('**/settings.html');assert.equal((await worker.evaluate(()=>chrome.storage.local.get('jbpReportsV1'))).jbpReportsV1.project,'DEMO');
 await page.goto(base+'help.html');assert.equal(await page.locator('section[id]').count(),13);for(const href of await page.locator('a').evaluateAll(a=>a.map(x=>x.getAttribute('href')))){if(href.startsWith('#'))assert.equal(await page.locator(href).count(),1);else assert.ok(fs.existsSync(path.resolve(__dirname,'..',href)));}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'../test-output/help-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(network,[]);assert.deepEqual(errors,[]);console.log('Onboarding OK: install, validation, resume, review, atomic save, preserve settings, postpone, offline help and mobile layout.');
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
