const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright-core');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({locale:'en-US',viewport:{width:390,height:844}});const page=await context.newPage(),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(process.env.PROTOSTAR_URL||'http://127.0.0.1:5173');await page.locator('[data-tab="editor"]').click();
 assert.equal(await page.locator('.palette-panel .micro').textContent(),'19 CHIPS');
 for(const lang of ['en','ja']){await page.locator(`.app-header [data-locale="${lang}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:`artifacts/i18n-${lang}-mobile-editor.png`,fullPage:true});}
 checks.push('corrected chip counts and readable palette instructions verified at 390px in both languages');
 await page.locator('.app-header [data-locale="en"]').click();await page.locator('[data-tab="battle"]').click();await page.locator('[data-speed="4"]').click();await page.locator('[data-action="start"]').click();await page.waitForSelector('dialog[open] .result-title',{timeout:40000});
 for(const lang of ['en','ja']){await page.locator(`dialog[open] [data-locale="${lang}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:`artifacts/i18n-${lang}-mobile-result.png`,fullPage:true});}
 checks.push('Japanese and English result dialogs fit 390px without page overflow');await context.close();
 const memory=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});await memory.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('storage unavailable for QA');};});const denied=await memory.newPage();denied.on('pageerror',e=>errors.push(e.message));denied.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await denied.goto(process.env.PROTOSTAR_URL||'http://127.0.0.1:5173');await denied.locator('[data-locale="ja"]').click();assert.match(await denied.locator('#save-status').textContent(),/メモリ/);assert.match(await denied.locator('#save-status').getAttribute('title'),/保存領域/);await denied.locator('[data-locale="en"]').click();assert.match(await denied.locator('#save-status').textContent(),/Memory only/);assert.match(await denied.locator('#save-status').getAttribute('title'),/Browser storage is unavailable/);checks.push('language-switch storage failures remain playable and display localized memory-only status');await memory.close();
 assert.deepEqual(errors,[]);const path='artifacts/i18n-report.json',report=JSON.parse(fs.readFileSync(path,'utf8'));report.edgeChecks=checks;report.edgeErrors=errors;report.checkedAt=new Date().toISOString();fs.writeFileSync(path,JSON.stringify(report,null,2));console.log(JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
