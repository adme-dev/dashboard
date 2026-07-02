#!/usr/bin/env node
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_OUT_DIR = 'test-results/social-publishing-theme-smoke'
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
]
const ROUTES = [
  { name: 'compose', path: '/agency/social/publishing/compose' },
  { name: 'accounts', path: '/agency/social/publishing/accounts' },
  { name: 'calendar', path: '/agency/social/publishing/calendar' },
  { name: 'queue', path: '/agency/social/publishing/queue' },
  { name: 'wall', path: '/agency/social/publishing/wall' },
  { name: 'engagement-wall', path: '/agency/social/inbox/wall' }
]

function usage() {
  return [
    'Social publishing light/dark browser smoke.',
    '',
    'Required:',
    '  A running Nuxt app and one auth input:',
    '    SOCIAL_SMOKE_AUTH_TOKEN=<jwt cookie value>',
    '    SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN=<jwt cookie value>',
    '    or SOCIAL_SMOKE_STORAGE_STATE=<Playwright storageState.json>',
    '    or SOCIAL_PUBLISHING_SMOKE_STORAGE_STATE=<Playwright storageState.json>',
    '',
    'Optional:',
    `  SOCIAL_SMOKE_BASE_URL=${DEFAULT_BASE_URL}`,
    '  SOCIAL_SMOKE_CLIENT_ID=<client uuid>        Adds ?client=... to each route.',
    `  SOCIAL_SMOKE_OUT_DIR=${DEFAULT_OUT_DIR}`,
    '  SOCIAL_SMOKE_ROUTES=compose,accounts       Comma-separated route names.',
    ''
  ].join('\n')
}

function option(name, fallback = '') {
  return process.env[name]?.trim() || fallback
}

function optionAny(names, fallback = '') {
  for (const name of names) {
    const value = option(name)
    if (value) return value
  }
  return fallback
}

function routeUrl(baseUrl, route, clientId) {
  const url = new URL(route.path, baseUrl)
  if (clientId) url.searchParams.set('client', clientId)
  return url.toString()
}

function selectedRoutes() {
  const raw = option('SOCIAL_SMOKE_ROUTES')
  if (!raw) return ROUTES
  const requested = new Set(raw.split(',').map(item => item.trim()).filter(Boolean))
  const routes = ROUTES.filter(route => requested.has(route.name))
  const unknown = [...requested].filter(name => !ROUTES.some(route => route.name === name))
  if (unknown.length) throw new Error(`Unknown SOCIAL_SMOKE_ROUTES: ${unknown.join(', ')}`)
  if (!routes.length) throw new Error('SOCIAL_SMOKE_ROUTES did not match any routes')
  return routes
}

function assertAuthInput() {
  if (optionAny(['SOCIAL_SMOKE_STORAGE_STATE', 'SOCIAL_PUBLISHING_SMOKE_STORAGE_STATE'])
    || optionAny(['SOCIAL_SMOKE_AUTH_TOKEN', 'SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN'])) return
  throw new Error('Missing auth input.\n\n' + usage())
}

async function installAuth(context, baseUrl) {
  const storageState = optionAny(['SOCIAL_SMOKE_STORAGE_STATE', 'SOCIAL_PUBLISHING_SMOKE_STORAGE_STATE'])
  const authToken = optionAny(['SOCIAL_SMOKE_AUTH_TOKEN', 'SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN'])
  if (storageState) return
  const host = new URL(baseUrl).hostname
  await context.addCookies([
    { name: 'auth_token', value: authToken, domain: host, path: '/', httpOnly: true, secure: baseUrl.startsWith('https://') },
    { name: 'auth_token_client', value: authToken, domain: host, path: '/', secure: baseUrl.startsWith('https://') },
    { name: 'auth_status', value: 'logged_in', domain: host, path: '/', secure: baseUrl.startsWith('https://') }
  ])
}

async function setColorMode(page, mode) {
  await page.addInitScript((nextMode) => {
    localStorage.setItem('nuxt-color-mode', nextMode)
    document.documentElement.classList.toggle('dark', nextMode === 'dark')
    document.documentElement.classList.toggle('light', nextMode === 'light')
  }, mode)
  await page.emulateMedia({ colorScheme: mode })
}

async function assertPageUsable(page, routeName, mode) {
  const current = page.url()
  if (current.includes('/auth/login')) {
    throw new Error(`${routeName} ${mode} redirected to login. Provide a valid SOCIAL_SMOKE_AUTH_TOKEN, SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN, or storage state.`)
  }

  const title = await page.locator('h1, [data-testid="page-title"]').first().textContent({ timeout: 10_000 })
    .catch(() => null)
  if (!title?.trim()) {
    throw new Error(`${routeName} ${mode} did not render a page heading`)
  }

  const visibleMainText = await page.locator('main, body').first().innerText({ timeout: 10_000 })
  if (!visibleMainText || visibleMainText.length < 20) {
    throw new Error(`${routeName} ${mode} rendered too little visible text`)
  }
}

async function run() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage())
    return
  }

  const baseUrl = option('SOCIAL_SMOKE_BASE_URL', DEFAULT_BASE_URL)
  const clientId = option('SOCIAL_SMOKE_CLIENT_ID')
  const outDir = resolve(option('SOCIAL_SMOKE_OUT_DIR', DEFAULT_OUT_DIR))
  const routes = selectedRoutes()
  assertAuthInput()
  mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const failures = []
  const consoleErrors = []

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        storageState: optionAny(['SOCIAL_SMOKE_STORAGE_STATE', 'SOCIAL_PUBLISHING_SMOKE_STORAGE_STATE']) || undefined
      })
      await installAuth(context, baseUrl)

      const page = await context.newPage()
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(`${viewport.name}: ${message.text()}`)
        }
      })

      for (const mode of ['light', 'dark']) {
        for (const route of routes) {
          const label = `${route.name}-${mode}-${viewport.name}`
          try {
            await setColorMode(page, mode)
            await page.goto(routeUrl(baseUrl, route, clientId), { waitUntil: 'networkidle', timeout: 30_000 })
            await assertPageUsable(page, route.name, mode)
            await page.screenshot({ path: resolve(outDir, `${label}.png`), fullPage: true })
            console.log(`OK ${label}`)
          } catch (error) {
            failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
            console.error(`FAIL ${label}`)
          }
        }
      }

      await context.close()
    }
  } finally {
    await browser.close()
  }

  if (consoleErrors.length) {
    failures.push(`Console errors:\n${consoleErrors.join('\n')}`)
  }
  if (failures.length) {
    throw new Error(failures.join('\n'))
  }

  console.log(`Screenshots written to ${outDir}`)
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
