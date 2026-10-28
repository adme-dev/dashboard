#!/usr/bin/env node
// Render the share card from existing artwork and brand assets. No external requests.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const output = path.join(root, 'static/social-preview.png');
const assets = ['photoflow', 'vectorflow', 'effectflow', 'filmflow', 'soundflow', 'figflow'];
const allowed = new Set([
  '/social-preview.html', '/static/xeroflow-logo.svg', '/static/fonts/geist-latin-variable.woff2',
  ...assets.map(name => `/assets/${name}.png`),
]);
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

(async () => {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method !== 'GET' || !allowed.has(pathname)) { res.writeHead(404).end(); return; }
    try {
      const bytes = await fs.readFile(path.join(root, pathname));
      res.writeHead(200, { 'Content-Type': types[path.extname(pathname)], 'Cache-Control': 'no-store' });
      res.end(bytes);
    } catch { res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await page.goto(origin + '/social-preview.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const verified = await page.evaluate(() => {
      const images = [...document.images].map(image => ({ src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight }));
      const fonts = [...document.fonts].map(font => ({ family: font.family, status: font.status }));
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight, images, fonts,
        names: [...document.querySelectorAll('figcaption')].map(node => node.textContent) };
    });
    if (errors.length || verified.images.length !== 7 || verified.images.some(image => !image.width || !image.height)
      || !verified.fonts.some(font => font.family === 'Geist' && font.status === 'loaded')
      || verified.names.length !== 6 || verified.scrollWidth !== 1200 || verified.scrollHeight !== 630) {
      throw new Error(JSON.stringify({ errors, verified }));
    }
    const bytes = await page.screenshot({ path: output, type: 'png', animations: 'disabled', timeout: 15000 });
    if (bytes.readUInt32BE(16) !== 1200 || bytes.readUInt32BE(20) !== 630) throw new Error('Incorrect PNG dimensions');
    console.log(JSON.stringify({ output, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), verified }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
