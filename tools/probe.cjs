// headless verification harness (dev only, not shipped)
const puppeteer = require('/home/user/.tools/node_modules/puppeteer');

const URL = process.argv[2] || 'http://127.0.0.1:8080/index.html?ssaa=0.4&steps=48&sim=256';
const OUT = process.argv[3] || '/tmp/shot.png';
const WAIT = parseInt(process.argv[4] || '9000', 10);

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--ignore-gpu-blocklist',
      '--window-size=520,300',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 288, deviceScaleFactor: 1 });

  const logs = [];
  page.on('console', (m) => logs.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', (e) => logs.push('[PAGEERROR] ' + e.message));
  page.on('requestfailed', (r) => logs.push('[REQFAIL] ' + r.url()));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, WAIT));

  const info = await page.evaluate(() => {
    const g = window.__GARGANTUA__;
    if (!g) return { ok: false };
    return {
      ok: true,
      caps: g.caps,
      frames: g.frames,
      cfg: { ssaa: g.CFG.ssaa, steps: g.CFG.steps, sim: g.CFG.simSize },
      bootLabel: document.querySelector('#bootLabel')?.textContent || null,
      bootGone: !document.querySelector('#boot'),
      fps: document.querySelector('#hFps')?.textContent,
      size: [g.renderer.domElement.width, g.renderer.domElement.height],
    };
  });

  await page.screenshot({ path: OUT });
  console.log(JSON.stringify(info, null, 2));
  console.log('--- console ---');
  console.log(logs.slice(0, 60).join('\n') || '(none)');
  await browser.close();
})();
