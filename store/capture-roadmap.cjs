// Capture current roadmap UI with the offline regression fixtures, never a real Jira.
const {chromium}=require('playwright'),path=require('node:path');
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args),newPage=browser.newPage.bind(browser);
 browser.newPage=async(...options)=>{
  const page=await newPage(...options),shot=page.screenshot.bind(page);
  page.screenshot=async options=>{
   const result=await shot(options),name=path.basename(options.path||'');
   const target=name==='roadmap-light.png'?'02-roadmap.png':name==='graph-light.png'?'03-dependencies.png':null;
   if(target){
    const size=page.viewportSize(),scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
    await page.setViewportSize({width:1280,height:800});
    const oldZoom=await page.evaluate(()=>document.body.style.zoom);
    await page.evaluate(()=>document.body.style.zoom='0.7');
    const group=await page.locator('#rm-group').inputValue(),scale=await page.locator('#rm-zoom').inputValue();
    if(target==='02-roadmap.png'){await page.locator('#rm-group').selectOption('tree');await page.locator('#rm-zoom').selectOption('month');}
    if(target==='03-dependencies.png')await page.getByRole('button',{name:'Уместить',exact:true}).click();
    await page.locator(target==='02-roadmap.png'?'#rm-gantt-stage':'#rm-graph').evaluate(e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-70));
    await shot({path:path.join(__dirname,'screenshots',target),fullPage:false,animations:'disabled'});
    if(target==='02-roadmap.png'){await page.locator('#rm-group').selectOption(group);await page.locator('#rm-zoom').selectOption(scale);}
    await page.evaluate(z=>document.body.style.zoom=z,oldZoom);
    await page.setViewportSize(size);await page.evaluate(({x,y})=>scrollTo(x,y),scroll);
   }return result;
  };return page;
 };return browser;
};
require('../tests/roadmap-browser.cjs');
