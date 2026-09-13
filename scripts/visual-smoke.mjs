import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless:true, channel:process.env.BROWSER_CHANNEL || 'msedge' });
const routes = ['/', '/entrar', '/decks', '/pecas', '/produtos', '/torneios', '/comunidade', '/icones', '/vendas', '/#builder', '/#meta', '/torneio/liguinha-tamer-beyblade-x'];
await mkdir('artifacts/revamp', { recursive:true });
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport:{width,height:960}, reducedMotion:'reduce' });
    const page = await context.newPage();
    for (const [index, route] of routes.entries()) {
      const errors = [];
      const onError = error => errors.push(error.message);
      page.on('pageerror', onError);
      await page.goto('http://127.0.0.1:4173' + route);
      await page.waitForTimeout(1800);
      const layout = await page.evaluate(() => ({
        width:innerWidth, scroll:document.documentElement.scrollWidth,
        accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        title:document.title,
        visibleHidden:[...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none').length,
      }));
      assert.equal(layout.accent, '#c2f970');
      assert.equal(layout.visibleHidden, 0);
      assert.equal(layout.scroll, width, `Page overflow: ${route} at ${width}px`);
      assert.deepEqual(errors, [], `Runtime error: ${route}`);
      await page.screenshot({ path:`artifacts/revamp/${width}-${index}.png`, fullPage:true });
      results.push({ width, route, ...layout, errors });
      page.off('pageerror', onError);
    }
    await page.goto('http://127.0.0.1:4173/entrar');
    await page.waitForLoadState('networkidle');
    await page.locator('#modeRegister').click();
    assert(await page.locator('#nameField').isVisible());
    await page.locator('#fName').fill('Teste local');
    await page.locator('#fEmail').fill('teste@example.invalid');
    await page.locator('#modeLogin').click();
    assert(!(await page.locator('#nameField').isVisible()));
    await page.goto('http://127.0.0.1:4173/#builder');
    await page.waitForLoadState('networkidle');
    await page.locator('#genDeckBtn').click();
    assert(await page.locator('#genMenu').isVisible());
    await page.locator('#genDeckBtn').click();
    assert(!(await page.locator('#genMenu').isVisible()));
    await context.close();
  }
} finally {
  await writeFile('artifacts/revamp/results.json', JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  await browser.close();
}
