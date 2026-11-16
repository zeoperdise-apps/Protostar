// Environment: npm ci; Playwright core installed at the path below; Chromium /usr/bin/chromium.
// Serve final dist at /lab/protostar/ on :4175 and npm run preview on :4174.
const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright-core');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({locale:'ja-JP',viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await context.addInitScript(()=>{
   window.qaGL=null;window.qaTones=0;
   const get=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(...args){const c=get.apply(this,args);if(c&&String(args[0]).startsWith('webgl'))window.qaGL=c;return c;};
   const tone=AudioContext.prototype.createOscillator;
   AudioContext.prototype.createOscillator=function(...args){window.qaTones++;return tone.apply(this,args)};
 });
 const page=await context.newPage();const checks=[],errors=[],expectedContextLogs=[];
 const check=name=>{checks.push(name);console.log('PASS',name)};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){if(/CONTEXT_LOST_WEBGL|context.*lost/i.test(m.text()))expectedContextLogs.push(m.text());else errors.push(m.text());}});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 const click=action=>page.locator(`[data-action="${action}"]:visible`).last().click();
 const tab=name=>page.locator(`[data-tab="${name}"]`).click();
 await page.goto('http://localhost:4174/');await page.waitForSelector('#arena canvas');assert.equal(await page.locator('#match-state').textContent(),'READY');check('npm preview serves final build');
 await page.goto('http://localhost:4175/lab/protostar/');await page.waitForSelector('#arena canvas');await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>window.qaGL instanceof WebGL2RenderingContext),true);assert.equal(await page.locator('#preset-cards button').count(),6);assert.ok(!(await page.locator('body').innerText()).includes('ORTHOGRAPHIC / 2D'));check('production subpath assets, initial WebGL2 arena, six presets and player-facing labels');
 await page.screenshot({path:'artifacts/final-desktop-initial.png',fullPage:true});
 await page.locator('#sensors').check();await page.waitForFunction(()=>document.querySelector('#sensor-status').textContent.length>0);assert.match(await page.locator('#sensor-status').textContent(),/センサー実行時/);
 await tab('library');const sensorRobot=await page.evaluate(()=>JSON.parse(localStorage.getItem('protostar.save.v1')).robots[0]);
 sensorRobot.name='QA / sensor';sensorRobot.program.cells=Array(256).fill(null);
 sensorRobot.program.cells[0]={kind:'Start',next:'E'};sensorRobot.program.cells[1]={kind:'EnemyAhead',param:18,yes:'E',no:'S'};
 sensorRobot.program.cells[2]={kind:'Wait',param:1,next:'S'};sensorRobot.program.cells[17]={kind:'Wait',param:1,next:'E'};sensorRobot.program.cells[18]={kind:'End'};
 await page.locator('#import-file').setInputFiles({name:'sensor.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sensorRobot))});await page.waitForTimeout(150);
 await tab('editor');await page.locator('[data-cell="1"]').click();await page.locator('[data-prop="param"]').selectOption('60');
 await page.reload();await tab('editor');await page.locator('[data-cell="1"]').click();assert.equal(await page.locator('[data-prop="param"]').inputValue(),'60');check('AI cell parameter auto-save survives production reload');
 await tab('battle');await click('step');assert.match(await page.locator('#sensor-status').textContent(),/左右60° \/ 600 → YES/);
 await page.screenshot({path:'artifacts/final-sensor-60.png',fullPage:true});check('parameter-adjusted real sensor range and YES appear on paused instruction');
 // Editing the design during this match must not alter the active program overlay.
 await tab('editor');await page.locator('[data-cell="1"]').click();await page.locator('[data-prop="param"]').selectOption('12');await tab('battle');assert.match(await page.locator('#sensor-status').textContent(),/左右60°/);check('active battle sensor uses starting program until the next match');
 await click('reset');await click('step');assert.match(await page.locator('#sensor-status').textContent(),/左右12°/);await page.screenshot({path:'artifacts/final-sensor-12.png',fullPage:true});check('new battle sensor follows edited half-angle');
 // Exercise actual browser context loss and recovery, including a forced redraw while paused.
 assert.equal(await page.evaluate(()=>!!window.qaGL.getExtension('WEBGL_lose_context')),true);
 await page.evaluate(()=>{window.qaLose=window.qaGL.getExtension('WEBGL_lose_context');window.qaLose.loseContext()});await page.waitForSelector('.webgl-fallback:visible');assert.match(await page.locator('.webgl-fallback').textContent(),/復旧/);
 await page.screenshot({path:'artifacts/final-context-lost.png',fullPage:true});await page.waitForTimeout(200);await page.evaluate(()=>window.qaLose.restoreContext());await page.locator('.webgl-fallback').waitFor({state:'hidden'});await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.qaGL.isContextLost()),false);await page.screenshot({path:'artifacts/final-context-restored.png',fullPage:true});check('WEBGL_lose_context shows recovery notice and restores paused scene');
 await tab('library');await click('delete-robot');await page.locator('dialog [data-action="delete-confirm"]').click();await tab('battle');
 await page.locator('[data-speed="4"]').click();await click('start');await page.waitForSelector('.result-title',{timeout:45000});await page.screenshot({path:'artifacts/final-result.png',fullPage:false});assert.ok(await page.evaluate(()=>window.qaTones>0));check('production preset match reaches result; WebAudio shot/hit/end initialization has no exceptions');
 const recorded=await page.evaluate(()=>JSON.parse(localStorage.getItem('protostar.save.v1')).clearedPresets);await click('close');await click('show-result');await click('close');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('protostar.save.v1')).clearedPresets),recorded);check('reopening result does not duplicate victory records');
 await page.locator('[data-opponent-type="custom"]').click();await page.locator('#opponent-robot').selectOption('custom-twin');await click('start');await page.waitForTimeout(250);await click('pause');assert.equal(await page.locator('#match-state').textContent(),'PAUSED');assert.match(await page.locator('#robot-name-1').textContent(),/双砲/);check('production custom-versus-custom executes independent robots');
 // Import a malicious display name and verify literal text, including option and result surfaces.
 await tab('library');const robot=await page.evaluate(()=>JSON.parse(localStorage.getItem('protostar.save.v1')).robots[0]);robot.name='<img src=x onerror=window.qaXSS=1>';
 await page.locator('#import-file').setInputFiles({name:'xss.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(robot))});await page.waitForTimeout(150);assert.equal(await page.locator('#robot-name').inputValue(),robot.name);assert.equal(await page.evaluate(()=>window.qaXSS),undefined);assert.equal(await page.locator('img[src="x"]').count(),0);
 await click('delete-robot');await page.locator('dialog [data-action="delete-confirm"]').click();await page.reload();await tab('library');assert.equal(await page.locator('.robot-card').count(),3);check('JSON name escaped; selected imported robot deletion persists valid selections');
 await tab('battle');await click('reset');await page.locator('h1').first().click();await page.keyboard.press('Space');await page.waitForTimeout(100);await page.keyboard.press('Space');assert.equal(await page.locator('#match-state').textContent(),'PAUSED');await page.locator('#seed').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#match-state').textContent(),'PAUSED');check('battle keyboard shortcuts preserve form focus');
 await page.setViewportSize({width:390,height:844});await tab('editor');assert.equal(await page.locator('[data-chip]').count(),19);
 await page.locator('[data-chip="FireRight"]').scrollIntoViewIfNeeded();const fireBox=await page.locator('[data-chip="FireRight"]').boundingBox();assert.ok(fireBox.x>=0&&fireBox.x+fireBox.width<=390);
 await page.locator('[data-category="sensor"]').click();assert.equal(await page.locator('[data-chip]').count(),4);await page.locator('[data-category="all"]').click();await page.locator('#chip-search').fill('後退');assert.equal(await page.locator('[data-chip]').count(),1);await page.locator('#chip-search').fill('');check('390px palette exposes all 19 chips through scrolling, categories and search');
 await page.locator('[data-editor="zoom-in"]').click();await page.locator('[data-cell="18"]').click();await page.locator('#inspector').scrollIntoViewIfNeeded();await page.locator('[data-prop="param"]').selectOption('30');assert.equal(await page.locator('[data-prop="param"]').inputValue(),'30');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:'artifacts/final-mobile-inspector.png',fullPage:true});
 await page.locator('[data-editor="fit"]').click();await page.locator('#chip-search').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/final-mobile-editor.png',fullPage:true});check('390px zoomed chip edit and inspector work with no page horizontal overflow');
 const memory=await browser.newContext({locale:'ja-JP',viewport:{width:390,height:844}});await memory.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}}));const mp=await memory.newPage();mp.on('pageerror',e=>errors.push(e.message));await mp.goto('http://localhost:4175/lab/protostar/');await mp.waitForSelector('#arena canvas');assert.match(await mp.locator('#save-status').textContent(),/メモリ/);await mp.locator('[data-action="step"]').click();assert.equal(await mp.locator('#match-state').textContent(),'PAUSED');await mp.screenshot({path:'artifacts/final-mobile-memory.png',fullPage:true});check('localStorage denial shows memory mode and still runs the game');await memory.close();
 assert.deepEqual(errors,[]);check('zero unexpected browser console/page/HTTP errors');
 fs.writeFileSync('artifacts/final-qa-report.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,expectedContextLogs,limits:['Headless Chromium using SwiftShader, no physical GPU or iOS/Safari test','Audio initialization verified; listening quality not evaluated']},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
