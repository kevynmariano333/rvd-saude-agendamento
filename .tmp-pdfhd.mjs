import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await navegador.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 4 });
await p.goto("file://" + process.argv[2] + "#zoom=150");
await p.waitForTimeout(4500);
await p.screenshot({ path: process.argv[3] });
await navegador.close();
