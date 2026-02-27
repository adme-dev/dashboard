import { createRequire } from 'module';
import { mkdirSync } from 'fs';

// Use puppeteer from npx cache
const require = createRequire('/Users/paulgiurin/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer/');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = '/Users/paulgiurin/.cache/puppeteer/chrome/mac_arm-145.0.7632.77/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const AUTH_TOKEN = 'eyJ1c2VySWQiOiJhNGI5MGRmMS1jZmQxLTQyZGEtYjNkYS1hZGU2OWNkOTk0NmEifQ%3D%3D.SE0vlRTIZYSlPymEhuLimMrnLWAH7c%2FVTX%2F3kZ9HJg4%3D';
const BASE = 'http://localhost:3000';
const OUT_DIR = '/Users/paulgiurin/Documents/Projects/dashboard/public/images/platform';

const pages = [
  { name: 'time-tracking', path: '/agency/time' },
];

mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.setCookie(
  { name: 'auth_token', value: AUTH_TOKEN, domain: 'localhost', path: '/' },
  { name: 'auth_token_client', value: AUTH_TOKEN, domain: 'localhost', path: '/' },
  { name: 'auth_status', value: 'logged_in', domain: 'localhost', path: '/' },
);

for (const { name, path } of pages) {
  console.log(`Capturing ${name} from ${path}...`);
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 8000));
    await page.screenshot({ path: `${OUT_DIR}/${name}.jpg`, type: 'jpeg', quality: 85 });
    console.log(`  OK ${OUT_DIR}/${name}.jpg`);
  } catch (err) {
    console.log(`  FAIL: ${err.message}`);
  }
}

await browser.close();
console.log('Done!');
