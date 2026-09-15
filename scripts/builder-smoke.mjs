import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin='http://127.0.0.1:4174';
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
await mkdir('artifacts/builder-react',{recursive:true});
try {
  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:960}});
    await context.addInitScript(()=>localStorage.setItem('bx_sfx','0'));
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&m.text().includes('[render]'))errors.push(m.text());});
    await page.goto(origin+'/#builder');
    await page.locator('#deckGrid .bey-card').first().waitFor();
    await page.waitForFunction(()=>window.BXApp?.listParts().some(p=>p.serverId));
    const parts=await page.evaluate(()=>window.BXApp.listParts().filter(p=>!p.parentId).map(({id,display,kind,requiresOver})=>({id,display,kind,requiresOver})));
    const find=(kind,name)=>{const p=parts.find(p=>p.kind===kind&&(!name||p.display.toLowerCase().includes(name.toLowerCase())));assert(p,`${kind} ${name}`);return p;};
    const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bx_current_deck')||'[]'));
    const card=i=>page.locator(`#deckGrid [data-deck-slot="${i}"]`);
    async function select(i,field,part) {
      await card(i).locator(`.slot[data-field="${field}"]`).click();
      if(width<821){
        await page.locator('#sheetSearch').fill(part.display);
        await page.locator(`#sheetList button[data-part="${part.id}"]`).click();
        await page.locator('#slotSheet').waitFor({state:'hidden'});
      } else {
        await page.locator('#pickerSearch').fill(part.display);
        await page.locator(`#pickerGrid button[data-part="${part.id}"]`).click();
      }
      assert.equal((await state())[i][field],part.id);
    }
    const blade=find('blade','Sword Dran'),ratchet=find('ratchet','3-60'),bit=find('bit','Flat');
    await select(0,'blade',blade);
    await select(0,'ratchet',ratchet);
    await select(0,'bit',bit);
    assert.equal(await page.evaluate(()=>window.BXApp.getDeck()[0].complete),true);
    await page.locator('#undoDeckBtn').click();
    assert.equal((await state())[0].bit,'');
    await select(0,'bit',bit);
    if(width===1440){
      await page.locator('#pickerFilters [data-kind="blade"]').click();
      await page.locator('#pickerSearch').fill(blade.display);
      await page.locator(`#pickerGrid button[data-part="${blade.id}"]`).click();
      assert.equal((await state())[1].blade,'','duplicate must remain blocked');
      await page.locator('#pickerSearch').fill('Wizard');
      assert(await page.locator('#pickerSearch').evaluate(e=>e===document.activeElement));
      const dragBlade=find('blade','Arrow Wizard');
      await page.locator('#pickerSearch').fill(dragBlade.display);
      await page.locator(`#pickerGrid button[data-part="${dragBlade.id}"]`).dragTo(card(1).locator('.slot[data-field="blade"]'));
      assert.equal((await state())[1].blade,dragBlade.id);
    } else {
      await page.locator('#beyPager [data-pg="1"]').click();
      assert.equal(await page.locator('#pagerTitle').innerText(),'Bey 2');
    }
    await card(1).locator('select[data-field="mode"]').selectOption('integrated');
    assert.equal(await card(1).locator('.slot').count(),2);
    await select(1,'blade',find('integrated','Valor Bison'));
    await select(1,'bit',find('bit','Ball'));
    assert.equal(await page.evaluate(()=>window.BXApp.getDeck()[1].complete),true);
    if(width<821)await page.locator('#beyPager [data-pg="1"]').click();
    await card(2).locator('select[data-field="mode"]').selectOption('cx');
    await select(2,'main',find('main','Blitz'));
    assert.equal(await card(2).locator('.slot[data-field="over"]').count(),1);
    await select(2,'over',find('over','Break'));
    await select(2,'lock',find('lock','Dran'));
    await select(2,'assist',find('assist','Slash'));
    await select(2,'ratchet',find('ratchet','5-60'));
    await select(2,'bit',find('bit','Point'));
    assert.equal(await page.evaluate(()=>window.BXApp.getDeck()[2].complete),true);
    await select(2,'main',find('main','Blast'));
    assert.equal((await state())[2].over,'');
    assert.equal(await card(2).locator('.slot[data-field="over"]').count(),0);
    const saved=await state();
    await page.reload();
    await page.locator('#deckGrid .bey-card').first().waitFor();
    assert.deepEqual(await state(),saved,'draft survives reload');
    await page.locator('#genDeckBtn').click();
    await page.locator('#randomDeckBtn').click();
    assert.equal(await page.evaluate(()=>window.BXApp.getDeck().filter(x=>x.complete).length),3);
    await page.locator('#genDeckBtn').click();
    await page.locator('#viableDeckBtn').click();
    assert.equal(await page.evaluate(()=>window.BXApp.getDeck().filter(x=>x.complete).length),3);
    await page.locator('#clearDeckBtn').click();
    assert.equal(await page.evaluate(()=>window.BXApp.getDeck().filter(x=>x.parts.length).length),0);
    await page.locator('#undoDeckBtn').click();
    assert.equal(await page.evaluate(()=>window.BXApp.getDeck().filter(x=>x.complete).length),3);
    await page.locator('#modeSwitch [data-mode="mine"]').click();
    assert.equal(await page.locator('#modeSwitch [data-mode="mine"]').getAttribute('aria-checked'),'true');
    await page.locator('#modeSwitch [data-mode="all"]').click();
    await page.screenshot({path:`artifacts/builder-react/${width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    assert.deepEqual(errors,[]);
    results.push({width,standard:true,integrated:true,cxExpand:true,undo:true,draft:true,generation:true,errors});
    await context.close();
  }
} finally {
  await writeFile('artifacts/builder-react/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  await browser.close();
}
