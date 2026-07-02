#!/usr/bin/env node
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_OUT_DIR = 'public/images/platform'
const DEFAULT_PAGES = [
  { name: 'time-tracking', path: '/agency/time' }
]

function usage() {
  return [
    'Authenticated screenshot capture.',
    '',
    'Required:',
    '  SCREENSHOT_AUTH_TOKEN=<jwt cookie value>',
    '',
    'Optional:',
    `  SCREENSHOT_BASE_URL=${DEFAULT_BASE_URL}`,
    `  SCREENSHOT_OUT_DIR=${DEFAULT_OUT_DIR}`,
    '  SCREENSHOT_PAGES=time-tracking:/agency/time,compose:/agency/social/publishing/compose',
    ''
  ].join('\n')
}

function option(name, fallback = '') {
  return process.env[name]?.trim() || fallback
}

function pagesFromEnv() {
  const raw = option('SCREENSHOT_PAGES')
  if (!raw) return DEFAULT_PAGES
  return raw.split(',')
    .map((entry) => {
      const [name, ...pathParts] = entry.split(':')
      const path = pathParts.join(':')
      if (!name || !path?.startsWith('/')) {
        throw new Error(`Invalid SCREENSHOT_PAGES entry: ${entry}`)
      }
      return { name, path }
    })
}

async function installAuth(context, baseUrl, authToken) {
  const host = new URL(baseUrl).hostname
  const secure = baseUrl.startsWith('https://')
  await context.addCookies([
    { name: 'auth_token', value: authToken, domain: host, path: '/', httpOnly: true, secure },
    { name: 'auth_token_client', value: authToken, domain: host, path: '/', secure },
    { name: 'auth_status', value: 'logged_in', domain: host, path: '/', secure }
  ])
}

async function run() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage())
    return
  }

  const authToken = option('SCREENSHOT_AUTH_TOKEN')
  if (!authToken) {
    throw new Error('Missing SCREENSHOT_AUTH_TOKEN.\n\n' + usage())
  }

  const baseUrl = option('SCREENSHOT_BASE_URL', DEFAULT_BASE_URL)
  const outDir = resolve(option('SCREENSHOT_OUT_DIR', DEFAULT_OUT_DIR))
  const pages = pagesFromEnv()
  mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await installAuth(context, baseUrl, authToken)
    const page = await context.newPage()

    for (const { name, path } of pages) {
      const url = new URL(path, baseUrl).toString()
      const output = resolve(outDir, `${name}.jpg`)
      console.log(`Capturing ${name} from ${url}`)
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
      if (page.url().includes('/auth/login')) {
        throw new Error(`${name} redirected to login. SCREENSHOT_AUTH_TOKEN is invalid or expired.`)
      }
      await page.screenshot({ path: output, type: 'jpeg', quality: 85, fullPage: true })
      console.log(`OK ${output}`)
    }

    await context.close()
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
