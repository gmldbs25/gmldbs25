import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';

const sites = [
  {
    name: 'KotoMachi',
    url: 'https://kotomachi-yoon.vercel.app/',
    path: 'assets/kotomachi.webp',
    prepare: async (page) => {
      // Capture the real title/entry screen, not the in-game station scene.
      await page.locator('.title-screen').waitFor({ state: 'visible', timeout: 25000 });
      await page.getByRole('heading', { name: 'KotoMachi' }).waitFor({ state: 'visible', timeout: 10000 });
    },
  },
  {
    name: 'FAB FLOW',
    url: 'https://fabflow-yoon.vercel.app/',
    path: 'assets/fabflow.webp',
    prepare: async (page) => {
      const start = page.getByRole('button', { name: /새 물류 시뮬레이션 시작/ }).first();
      await start.waitFor({ state: 'visible', timeout: 30000 });
      await start.click();
      await page.locator('.sandbox-setup-card').waitFor({ state: 'visible', timeout: 18000 });
    },
  },
];

await mkdir('assets', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  for (const site of sites) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 810 },
      deviceScaleFactor: 1,
      locale: 'ko-KR',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const response = await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!response?.ok()) throw new Error(site.name + ': HTTP ' + (response?.status() ?? 'no response'));
    try {
      await site.prepare(page);
      console.log(site.name + ': navigated to app showcase');
    } catch (error) {
      // If the app changes its onboarding UI, retain a real screenshot of the
      // deployed landing page rather than generating a fabricated image.
      console.warn(site.name + ': showcase navigation unavailable; using deployed landing page:', error.message);
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(3500);
    const screenshot = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 30000 });
    if (screenshot.length < 25000) throw new Error(site.name + ': unexpectedly small screenshot');
    const info = await sharp(screenshot).resize(1280, 720, { fit: 'cover' }).webp({ quality: 84, effort: 5 }).toFile(site.path);
    if (info.size < 12000) throw new Error(site.name + ': unexpectedly small WebP');
    console.log(site.name + ': ' + site.path + ' (' + info.size + ' bytes, page: ' + await page.title() + ')');
    await context.close();
  }
} finally {
  await browser.close();
}
