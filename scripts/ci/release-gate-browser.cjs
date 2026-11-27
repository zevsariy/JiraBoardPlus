const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

async function main() {
  const fail = process.env.EXPECT_FAILURE;
  assert.ok(['true', 'false'].includes(fail), 'EXPECT_FAILURE must be true or false');
  const browser = await chromium.launch({ headless: true });
  let classification = 'success';
  try {
    const page = await browser.newPage();
    await page.setContent('<button>Browser ready</button>');
    const actual = await page.locator('button').textContent();
    assert.equal(actual, 'Browser ready', 'Browser fixture must work before fault injection');
    try {
      assert.equal(actual, fail === 'true' ? 'Intentional mismatch' : 'Browser ready',
        'RELEASE_GATE_PROBE: browser assertion');
    } catch (error) {
      if (fail !== 'true' || error.code !== 'ERR_ASSERTION') throw error;
      classification = 'intentional_failure';
      console.error(error.message);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
  // Only report the expected failure after browser setup and cleanup both succeed.
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `classification=${classification}\n`);
  }
  console.log(`Browser probe: ${classification}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
