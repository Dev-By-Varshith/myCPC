const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');

(async () => {
    console.log('\n========================================================');
    console.log('🚀 Launching browser for you to log in to Codeforces...');
    console.log('========================================================\n');
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        userDataDir: path.join(__dirname, 'cf_profile'),
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    await page.goto('https://codeforces.com/enter', { waitUntil: 'domcontentloaded' });
    
    console.log('*** ACTION REQUIRED ***');
    console.log('1. A Chrome window should have popped up. If you don\'t see it, check your taskbar!');
    console.log('2. Log in to your fake Codeforces account in that window.');
    console.log('3. Once you are successfully logged in and can see your profile on Codeforces, just CLOSE the browser window manually.');
    console.log('\nThe session and Cloudflare clearance will be saved for the Code Explorer to use!');
    
    // We don't exit the process. It will exit when the user closes the browser manually.
    await new Promise(() => {});
})();
