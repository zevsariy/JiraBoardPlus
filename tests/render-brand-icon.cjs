// Rasterize the local vector mark for Chrome's PNG icon requirement.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
    const mark = fs.readFileSync(path.join(__dirname, '../icons/board-plus.svg'), 'utf8');
    await page.setContent(`<style>body{margin:0;width:128px;height:128px}svg{width:128px;height:128px}</style>${mark}`);
    await page.screenshot({ path: path.join(__dirname, '../icons/report.png') });
  } finally { await browser.close(); }
})();
