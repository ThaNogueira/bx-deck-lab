import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import { chromium } from 'playwright';

const modes = [
  { id: 'upper', label: 'Upper · Vermelho', imageUrl: '/assets/parts/eclipse.webp' },
  { id: 'smash', label: 'Smash · Azul', imageUrl: '/assets/parts/eclipse-smash.png' },
];
const app = express();
app.get('/api/me', (_req, res) => res.json({ user: null }));
app.get('/api/site', (_req, res) => res.json({}));
app.get('/api/parts-index', (_req, res) => res.json({ parts: [] }));
app.get('/api/parts/eclipse', (_req, res) => res.json({ part: { slug: 'eclipse', name: 'Eclipse', displayName: 'Eclipse', kind: 'MAIN_BLADE', type: 'Balance', imageUrl: modes[0].imageUrl, imageModes: modes, variants: [] }, products: [{ slug: 'cx-09-sol-eclipse-d5-70tk', code: 'CX-09', name: 'Sol Eclipse D5-70TK', brand: 'TAKARA_TOMY', category: 'STARTER', googleUrl: 'https://example.invalid' }] }));
app.get('/peca/eclipse', (_req, res) => res.sendFile(path.resolve('public/peca.html')));
app.use(express.static('public'));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  await fs.mkdir('artifacts/eclipse', { recursive: true });
  for (const [width, motion] of [[1440, 'no-preference'], [390, 'no-preference'], [390, 'reduce']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: motion, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/peca/eclipse`);
    const button = page.locator('#mainImg');
    await page.waitForFunction(() => document.querySelector('#mainImg')?.getAttribute('aria-label')?.includes('Virar para'));
    await button.locator('img').evaluateAll(imgs => Promise.all(imgs.map(i => i.decode())));
    assert.equal(await page.locator('#partModeStatus').textContent(), modes[0].label);
    assert.equal(await page.locator('a[href="/produto/cx-09-sol-eclipse-d5-70tk"]').count(), 2);
    await page.screenshot({ path: `artifacts/eclipse/flip-upper-${width}-${motion}.png` });
    const before = await button.boundingBox();
    await button.click();
    await page.waitForFunction(() => document.querySelector('#mainImg').getAttribute('aria-pressed') === 'true');
    await button.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)));
    assert.equal(await page.locator('#partModeStatus').textContent(), modes[1].label);
    assert.deepEqual(await button.boundingBox(), before, 'flipping must not change the layout');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (motion === 'reduce') assert.equal(await page.locator('.part-mode-rotor').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.screenshot({ path: `artifacts/eclipse/flip-smash-${width}-${motion}.png` });
    await button.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#mainImg').getAttribute('aria-pressed') === 'false');
    assert.equal(await page.locator('#partModeStatus').textContent(), modes[0].label);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Eclipse modes: desktop/mobile, both renders, click/keyboard, stable layout and reduced motion passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
