#!/usr/bin/env node
// No operating-system app is installed. Native install events are mocked deliberately.
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { spawnSync } = require('node:child_process')

;(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xf-pwa-check-'))
  const setup = spawnSync('python3', ['-c', `
import json,sys,shutil
from pathlib import Path
scripts,root=map(Path,sys.argv[1:]);sys.path.insert(0,str(scripts))
from pwa_package import install_support,APPS
for name in ['xeroflow-icon-192.png','xeroflow-icon-512.png','xeroflow-maskable-512.png','apple-touch-icon.png']:
 shutil.copyfile(scripts/'static'/name,root/name)
for name in ['install-app.js','install-app.css']:shutil.copyfile(scripts/'static'/name,root/name)
(root/'index.html').write_text('<html><head></head><body><button data-xf-install id="install">Install app</button></body></html>')
for engine,brand,*_ in APPS:
 for version in ['0.1.0','0.1.0-flow1']:
  p=root/brand/version/'index.html';p.parent.mkdir(parents=True)
  p.write_text('<html><head><link rel="manifest" href="old"><script integrity="sha256-keep" type="application/json">{}</script></head><body></body></html>')
pins={app[0]:{} for app in APPS};install_support(root,pins)
first={str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()};install_support(root,pins)
second={str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()};assert first==second
for name,b in second.items():
 if name.endswith('.html'):
  text=b.decode();assert text.count('rel="manifest"')==1
  assert ('editor-dock.js' in text)==(name!='index.html')
  if name!='index.html':assert 'sha256-keep' in text
for engine,brand,name,*_ in APPS:
 m=json.loads((root/brand/'manifest.webmanifest').read_text());assert m['id']==m['start_url']==m['scope']=='/'+brand+'/'
 assert m['name']==name and m['display']=='standalone' and len(m['icons'])==3
assert len(json.loads((root/'editor-apps.json').read_text())['apps'])==6
`, __dirname, directory], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
  if (setup.status !== 0) {
    await fs.rm(directory, { recursive: true, force: true })
    throw new Error(setup.stderr || setup.stdout || 'Fixture setup failed')
  }
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(directory + path.sep)) return response.writeHead(403).end()
    try {
      const bytes = await fs.readFile(file)
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.webmanifest') ? 'application/manifest+json' : file.endsWith('.png') ? 'image/png' : 'text/html'
      response.writeHead(200, { 'Content-Type': type }).end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const origin = `http://127.0.0.1:${server.address().port}`
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.locator('#install').click()
    await page.locator('.xf-install-help').waitFor({ state: 'visible' })
    if (!(await page.locator('.xf-install-instructions').innerText()).includes('Install page as app')) throw new Error('Chrome help missing')
    await page.keyboard.press('Escape')
    if (!(await page.locator('.xf-install-help').isHidden())) throw new Error('Escape failed')
    if (!(await page.locator('#install').evaluate(button => button === document.activeElement))) throw new Error('Focus not restored')
    await page.evaluate(() => {
      window.installCalls = 0
      const event = new Event('beforeinstallprompt', { cancelable: true })
      event.prompt = async () => { window.installCalls++ }
      event.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })
    if (await page.evaluate(() => window.installCalls) !== 0) throw new Error('Prompt opened without user click')
    await page.locator('#install').click()
    if (await page.evaluate(() => window.installCalls) !== 1) throw new Error('User click did not prompt once')
    await page.evaluate(() => {
      const button = document.createElement('button')
      button.id = 'dock-install'
      button.setAttribute('data-xf-install', '')
      button.textContent = 'Install'
      document.body.append(button)
      document.dispatchEvent(new CustomEvent('xf-dock-ready'))
    })
    await page.locator('#dock-install').click()
    if (!(await page.locator('.xf-install-help').isVisible())) throw new Error('Late dock button not wired')
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    if (!(await page.locator('#install').isDisabled()) || !(await page.locator('#dock-install').isDisabled())) throw new Error('Installed status missing')
    const standalone = await browser.newPage()
    await standalone.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = query => {
        const result = original(query)
        if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true })
        return result
      }
    })
    await standalone.goto(origin, { waitUntil: 'networkidle' })
    if (!(await standalone.locator('#install').isHidden())) throw new Error('Standalone install control visible')
    const safari = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15' })
    const sp = await safari.newPage()
    await sp.goto(origin, { waitUntil: 'networkidle' })
    await sp.locator('#install').click()
    if (!(await sp.locator('.xf-install-instructions').innerText()).includes('File → Add to Dock')) throw new Error('Safari guidance missing')
    if (errors.length) throw new Error(JSON.stringify(errors))
    const report = { helper: { stable_manifests: 7, editor_versions: 12, idempotent: true, integrity_preserved: true }, chrome: { prompt_only_on_click: true, one_use_event: true, help: true, escape_and_focus: true, late_dock_button: true, installed_status: true }, standalone: { mocked: true, install_button_hidden: true }, safari: { user_agent_mocked: true, instructions: true }, os_app_install_attempted: false, page_errors: errors }
    if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report))
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
    await fs.rm(directory, { recursive: true, force: true })
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
