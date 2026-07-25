const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log("Navigating to frontend...");
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'screenshot_login.png' });
  console.log("Login screenshot saved.");

  // Type in username and password
  await page.type('input[placeholder="e.g. tourist"]', 'testuser');
  await page.type('input[type="password"]', 'password');
  
  // Click login/register button
  await page.click('.btn-primary');
  
  // Wait for navigation / network idle
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshot_dashboard.png' });
  console.log("Dashboard screenshot saved.");

  await browser.close();
})();
