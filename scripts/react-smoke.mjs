import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin='http://127.0.0.1:4174';
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
await mkdir('artifacts/react',{recursive:true});
try {
  for (const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:960},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/icones');
    await page.locator('[data-name="trophy"]').waitFor();
    const expected=await page.evaluate(()=>Object.values(window.BX.ICON_GROUPS).flat().length);
    assert.equal(await page.locator('[data-name]').count(),expected);
    await page.locator('[data-name="trophy"]').click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),"BX.icon('trophy', 16)");
    const emoji=page.locator('[data-emo]').first();
    const code=await emoji.getAttribute('data-emo');
    await emoji.click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),code);
    assert.equal(await page.locator('[data-name="trophy"] svg').getAttribute('stroke'),'currentColor');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`artifacts/react/${width}-icons.png`,fullPage:true});
    await page.route('**/api/auth/login',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Senha incorreta (teste controlado)'})}));
    await page.goto(origin+'/entrar?erro='+encodeURIComponent('<script>não executar</script>'));
    await page.locator('#fEmail').waitFor();
    assert.equal(await page.locator('#loginError').innerText(),'<script>não executar</script>');
    await page.locator('#modeRegister').click();
    assert(await page.locator('#nameField').isVisible());
    await page.locator('#fName').fill('Blader de teste');
    await page.locator('#fEmail').fill('test@react.invalid');
    await page.locator('#fPassword').fill('Invalid-test-password');
    await page.locator('#modeLogin').click();
    assert.equal(await page.locator('#fName').inputValue(),'Blader de teste');
    await page.locator('#pwSubmit').click();
    await page.getByRole('alert').filter({hasText:'Senha incorreta'}).waitFor();
    assert(await page.locator('#pwSubmit').isEnabled());
    assert.equal(await page.locator('#fEmail').inputValue(),'test@react.invalid');
    assert.equal(await page.locator('#googleBtn').getAttribute('href'),'/api/oauth/google');
    await page.screenshot({path:`artifacts/react/${width}-login.png`,fullPage:true});
    const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.equal(scroll,width);
    assert.deepEqual(errors,[]);
    results.push({width,icons:expected,clipboard:true,loginTabs:true,errorRecovery:true,errors});
    await context.close();
  }
} finally {
  await writeFile('artifacts/react/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  await browser.close();
}
