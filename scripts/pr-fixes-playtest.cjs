// Production-UI regression for PR #1 F1/F2. Never records video or mutates engine state.
// Run a built preview first; override PROTOSTAR_URL when needed.
const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright-core');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const report={recordedVideo:false,url:process.env.PROTOSTAR_URL||'http://127.0.0.1:4175',checks:[],errors:[],traces:[]};
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>report.errors.push(error.message));
 const tab=async name=>page.locator(`[data-tab="${name}"]`).click();
 const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('protostar.save.v1')));
 const active=async()=>{const save=await data();return save.robots.find(r=>r.id===save.config.leftRobotId);};
 const undo=page.locator('[data-editor="undo"]');
 const selectCell=async n=>{await tab('editor');await page.locator(`[data-cell="${n}"]`).click();};
 const upload=async(value,name='regression.json')=>{await tab('library');await page.locator('#import-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});};
 const confirm=()=>page.locator('dialog[open] [data-action="import-confirm"]').click();
 const shot=name=>page.screenshot({path:`artifacts/pr-fix-${name}.png`,fullPage:true,timeout:60000});
 const direction=key=>page.locator(`[data-prop="${key}"]`);
 const language=locale=>page.locator(`.app-header [data-locale="${locale}"]`).click();
 const freshTrace=async label=>{
  // Reset after starting so the observation begins at tick 0, independent of rendering time.
  await tab('battle');await page.locator('[data-action="start"]').click();await page.locator('[data-action="reset"]').click();await page.locator('[data-action="step"]').click();await page.locator('[data-action="step"]').click();
  const trace=await page.locator('#trace').innerText();report.traces.push({label,trace});return trace;
 };
 try{
  await page.goto(report.url);
  await selectCell(82);assert.equal(await direction('param').inputValue(),'30');await direction('param').selectOption('45');assert.equal(await undo.isEnabled(),true);
  const originalId=(await active()).id;const replacement=await data();replacement.robots[0].program.cells[82].param=90;
  await upload(replacement);await page.locator('dialog[open] [data-action="close"]').click();await selectCell(82);assert.equal(await undo.isEnabled(),true);assert.equal(await direction('param').inputValue(),'45');
  await upload('{broken');await selectCell(82);assert.equal(await undo.isEnabled(),true);assert.equal(await direction('param').inputValue(),'45');
  for(const locale of ['ja','en']){await language(locale);assert.equal(await undo.isEnabled(),true);assert.equal(await direction('param').inputValue(),'45');}
  const second=(await data()).robots[1].id;await page.locator('#editor-robot').selectOption(second);await page.locator('#editor-robot').selectOption(originalId);await page.locator('[data-cell="82"]').click();assert.equal(await undo.isEnabled(),true);
  // Single-robot addition keeps the previous robot's existing history.
  const robotToAdd=await active();await upload(robotToAdd);await tab('editor');await page.locator('#editor-robot').selectOption(originalId);await page.locator('[data-cell="82"]').click();assert.equal(await undo.isEnabled(),true);
  await undo.click();assert.equal(await direction('param').inputValue(),'30');await direction('param').selectOption('45');
  // Give another robot an undo entry so replacement must reset every ID.
  await page.locator('#editor-robot').selectOption(second);await page.locator('[data-cell="0"]').click();await page.locator('#inspector-kind').selectOption('Wait');assert.equal(await undo.isEnabled(),true);
  await upload(replacement);await confirm();await selectCell(82);assert.equal(await direction('param').inputValue(),'90');assert.equal(await undo.isDisabled(),true);await shot('undo-import-reset');
  await page.locator('#editor-robot').selectOption(second);assert.equal(await undo.isDisabled(),true);await page.locator('#editor-robot').selectOption(originalId);await page.locator('[data-cell="82"]').click();
  await direction('param').selectOption('45');await undo.click();assert.equal(await direction('param').inputValue(),'90');assert.equal((await active()).program.cells[82].param,90);
  await page.reload();await selectCell(82);assert.equal(await direction('param').inputValue(),'90');
  console.log('Checkpoint',report.checks.length+1);report.checks.push('F1: confirmed full-save replacement clears all robot histories; 90→45→Undo→90 persists on reload. Cancel, invalid JSON, JA↔EN, robot switching and single-robot import preserve previous Undo.');
  // Exact original missing-next reproduction, using only import and inspector actions.
  const robot=await active();robot.name='Unset links regression';robot.program.cells=Array(256).fill(null);robot.program.cells[0]={kind:'Start'};robot.program.cells[1]={kind:'FireLeft',next:'E'};robot.program.cells[2]={kind:'Wait',param:.2,next:'W'};
  await upload(robot);await selectCell(0);assert.equal(await direction('next').inputValue(),'');assert.equal(await direction('next').locator('option:checked').textContent(),'Unset → return to START');assert.equal(await page.locator('[data-cell="0"] .cell-arrows').textContent(),'↺');assert.match(await page.locator('[data-cell="0"] .cell-arrows span').getAttribute('aria-label'),/Unset → return to START/);await shot('unset-next-en');
  for(const locale of ['ja','en']){await language(locale);assert.equal(await direction('next').inputValue(),'');assert.match(await page.locator('[data-cell="0"]').getAttribute('aria-label'),locale==='ja'?/未設定 → STARTへ戻る/:/Unset → return to START/);}
  for(const value of ['N','E','S','W']){await direction('next').selectOption(value);assert.equal((await active()).program.cells[0].next,value);assert.equal(await direction('next').inputValue(),value);}
  await direction('next').selectOption('');
  let trace=await freshTrace('unset next');assert.match(trace,/RESTART/);assert.doesNotMatch(trace,/FIRE L/);
  await selectCell(0);await direction('next').selectOption('E');assert.equal((await active()).program.cells[0].next,'E');trace=await freshTrace('explicit next E');assert.match(trace,/FIRE L/);
  await selectCell(0);await direction('next').selectOption('');assert.equal(Object.hasOwn((await active()).program.cells[0],'next'),false);trace=await freshTrace('next unset again');assert.match(trace,/RESTART/);assert.doesNotMatch(trace,/FIRE L/);await shot('unset-next-trace');
  console.log('Checkpoint',report.checks.length+1);report.checks.push('F2 next: omitted next displays ↺/Unset, E executes the adjacent FIRE L, selecting Unset removes the JSON key and restarts at START.');
  // Both outcomes run through the real interpreter. HpLow(1) is YES; HpLow(.35) is NO at full HP.
  for(const branch of ['yes','no']){
   const conditional=await active();conditional.name=`Unset ${branch} regression`;conditional.program.cells=Array(256).fill(null);conditional.program.cells[0]={kind:'Start',next:'E'};conditional.program.cells[1]={kind:'HpLow',param:branch==='yes'?1:.35};conditional.program.cells[2]={kind:'FireLeft',next:'E'};conditional.program.cells[3]={kind:'Wait',param:.2,next:'W'};conditional.program.cells[5]={kind:'End'};conditional.program.cells[6]={kind:'Jump',param:'A'};conditional.program.cells[7]={kind:'Label',param:'A',next:'W'};
   await upload(conditional);await selectCell(1);for(const key of ['yes','no'])assert.equal(await direction(key).inputValue(),'');assert.equal(await page.locator('[data-cell="1"] .cell-arrows').textContent(),'↺↺');
   trace=await freshTrace(`unset ${branch}`);assert.match(trace,/RESTART/);assert.doesNotMatch(trace,/FIRE L/);
   await selectCell(1);await direction(branch).selectOption('E');assert.equal(await direction(branch==='yes'?'no':'yes').inputValue(),'');let chip=(await active()).program.cells[1];assert.equal(chip[branch],'E');assert.equal(Object.hasOwn(chip,branch==='yes'?'no':'yes'),false);
   assert.equal(await page.locator('[data-cell="1"] .cell-arrows').textContent(),branch==='yes'?'→↺':'↺→');trace=await freshTrace(`explicit ${branch} E`);assert.match(trace,/FIRE L/);assert.match(trace,new RegExp(branch.toUpperCase()));
   await selectCell(1);await direction(branch).selectOption('');chip=(await active()).program.cells[1];assert.equal(Object.hasOwn(chip,branch),false);trace=await freshTrace(`${branch} unset again`);assert.match(trace,/RESTART/);assert.doesNotMatch(trace,/FIRE L/);
   await selectCell(1);await direction(branch).selectOption('E');
   for(const locale of ['ja','en']){
    await language(locale);assert.equal(await direction(branch).inputValue(),'E');assert.equal(await direction(branch==='yes'?'no':'yes').inputValue(),'');assert.equal(await direction(branch==='yes'?'no':'yes').locator('option:checked').textContent(),locale==='ja'?'未設定 → STARTへ戻る':'Unset → return to START');
   }
   await shot(`partial-${branch}-en`);
   for(const value of ['N','E','S','W']){await direction(branch).selectOption(value);assert.equal((await active()).program.cells[1][branch],value);assert.equal(await direction(branch==='yes'?'no':'yes').inputValue(),'');}
   await direction(branch).selectOption('E');
   for(const cell of [5,6]){await selectCell(cell);assert.equal(await page.locator('#inspector [data-prop="next"]').count(),0);assert.equal(await page.locator(`[data-cell="${cell}"] .cell-arrows`).count(),0);}
   await selectCell(1);
   console.log('Checkpoint',report.checks.length+1);report.checks.push(`F2 ${branch}: absent branch restarts, explicit E executes FIRE L, Unset deletes its key and restarts; opposite branch remains independently unset in JA/EN; End/Jump show no directions.`);
  }
  // Full-save UI download/import and persisted absence, with one conditional branch set.
  await tab('library');const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export-all"]').click();const download=await downloadPromise;const exportPath='artifacts/pr-fix-roundtrip.json';await download.saveAs(exportPath);const exported=JSON.parse(fs.readFileSync(exportPath,'utf8'));const exportedRobot=exported.robots.find(r=>r.id===exported.config.leftRobotId);assert.equal(Object.hasOwn(exportedRobot.program.cells[1],'yes'),false);assert.equal(exportedRobot.program.cells[1].no,'E');
  await upload(exported);await confirm();await page.reload();await selectCell(1);assert.equal(await direction('yes').inputValue(),'');assert.equal(await direction('no').inputValue(),'E');const persisted=(await active()).program.cells[1];assert.equal(Object.hasOwn(persisted,'yes'),false);assert.equal(persisted.no,'E');
  await page.setViewportSize({width:390,height:844});
  for(const locale of ['ja','en']){await language(locale);await page.locator('[data-editor="fit"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert.equal(await direction('yes').inputValue(),'');assert.equal(await direction('no').inputValue(),'E');await direction('yes').selectOption('N');assert.equal((await active()).program.cells[1].yes,'N');await direction('yes').selectOption('');assert.equal(Object.hasOwn((await active()).program.cells[1],'yes'),false);await shot(`mobile-${locale}`);}
  console.log('Checkpoint',report.checks.length+1);report.checks.push('F2 UI save/export/import/reload retains omitted keys and the explicit opposite branch; JA/EN inspector and Fit work at 390px without page overflow.');
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.passed=false;report.failure=error.stack;throw error;}
 finally{report.checkedAt=new Date().toISOString();fs.writeFileSync('artifacts/pr-fix-report.json',JSON.stringify(report,null,2));await context.close();await browser.close();console.log(JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
