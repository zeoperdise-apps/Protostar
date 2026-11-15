const { chromium } = require('/opt/codex/cua_node/lib/node_modules/playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text())});page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.goto('http://localhost:5173');await page.waitForTimeout(1000);
 await page.screenshot({path:'artifacts/desktop-initial.png',fullPage:false});await page.screenshot({path:'artifacts/desktop-full.png',fullPage:true});
 console.log('body overflow',await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth})));
 await page.getByRole('button',{name:'AIワークベンチ',exact:true}).click();await page.screenshot({path:'artifacts/desktop-editor.png',fullPage:true});
 await page.getByRole('button',{name:'機体庫',exact:true}).click();await page.screenshot({path:'artifacts/desktop-library.png',fullPage:true});
 await page.getByRole('button',{name:'バトル',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/mobile-initial.png',fullPage:false});await page.screenshot({path:'artifacts/mobile-full.png',fullPage:true});
 console.log('mobile overflow',await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth})));
 await page.getByRole('button',{name:'AIワークベンチ',exact:true}).click();await page.locator('[data-editor=fit]').click();await page.screenshot({path:'artifacts/mobile-editor.png',fullPage:true});await page.getByRole('button',{name:'機体庫',exact:true}).click();await page.screenshot({path:'artifacts/mobile-library.png',fullPage:true});await browser.close();
})();
