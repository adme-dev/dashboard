import { afterAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transformWithEsbuild } from 'vite'

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter((value): value is string => Boolean(value))

const chromePath = CHROME_CANDIDATES.find(candidate => existsSync(candidate))

interface ChromeHarness {
  browser: ChildProcessWithoutNullStreams
  userDataDir: string
  wsUrl: string
}

interface CdpResponse {
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { message?: string }
  sessionId?: string
}

const harnesses: ChromeHarness[] = []

afterAll(async () => {
  for (const harness of harnesses) {
    await stopChrome(harness)
  }
})

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function stopChrome(harness: ChromeHarness): Promise<void> {
  const exited = new Promise<void>((resolve) => {
    if (harness.browser.exitCode !== null || harness.browser.signalCode !== null) {
      resolve()
      return
    }
    harness.browser.once('exit', () => resolve())
  })
  harness.browser.kill()
  await Promise.race([exited, wait(5_000)])

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(harness.userDataDir, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) throw error
      await wait(100)
    }
  }
}

async function launchChrome(): Promise<ChromeHarness> {
  if (!chromePath) throw new Error('Chrome not found')

  const userDataDir = mkdtempSync(join(tmpdir(), 'edm-sanitizer-chrome-'))
  const browser = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ])

  const wsUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Chrome DevTools endpoint')), 15_000)
    const onData = (data: Buffer) => {
      const match = data.toString('utf8').match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (!match) return
      clearTimeout(timeout)
      resolve(match[1])
    }
    browser.stderr.on('data', onData)
    browser.stdout.on('data', onData)
    browser.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    browser.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Chrome exited before DevTools was ready: ${code ?? 'unknown'}`))
    })
  })

  const harness = { browser, userDataDir, wsUrl }
  harnesses.push(harness)
  return harness
}

class CdpClient {
  private nextId = 1
  private readonly pending = new Map<number, { resolve: (value: CdpResponse) => void, reject: (error: Error) => void }>()

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message || 'CDP command failed'))
      } else {
        pending.resolve(message)
      }
    })
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<CdpResponse> {
    const id = this.nextId++
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params }
    this.socket.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }
}

async function openCdp(wsUrl: string): Promise<CdpClient> {
  const socket = new WebSocket(wsUrl)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('Failed to connect to Chrome DevTools')), { once: true })
  })
  return new CdpClient(socket)
}

async function browserSanitize(inputs: string[]): Promise<string[]> {
  const source = readFileSync(new URL('../../app/utils/edmInlineText.ts', import.meta.url), 'utf8')
  const transformed = await transformWithEsbuild(source, 'edmInlineText.ts', {
    format: 'esm',
    loader: 'ts',
    target: 'es2022'
  })
  const harness = await launchChrome()
  const cdp = await openCdp(harness.wsUrl)
  const target = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const targetId = (target.result as { targetId: string }).targetId
  const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const sessionId = (attached.result as { sessionId: string }).sessionId
  await cdp.send('Runtime.enable', {}, sessionId)

  const expression = `
    (async () => {
      const code = ${JSON.stringify(transformed.code)}
      const inputs = ${JSON.stringify(inputs)}
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
      const mod = await import(url)
      URL.revokeObjectURL(url)
      return inputs.map((input) => mod.sanitizeInlineHtml(input))
    })()
  `
  const evaluated = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  }, sessionId)
  const result = evaluated.result as {
    result?: { value?: string[] }
    exceptionDetails?: { text?: string }
  }
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Chrome evaluation failed')
  }
  await wait(0)
  return result.result?.value || []
}

describe.skipIf(!chromePath)('sanitizeInlineHtml in a real Chromium parser', () => {
  it('drops foreign-content and raw-text payloads under Chrome', async () => {
    const [svg, math, style, template] = await browserSanitize([
      'before<svg><a href="javascript:alert(1)">x</a><script>y</script></svg>after',
      '<math><mi>x</mi></math>',
      'a<style>.x{color:red}</style>b',
      'a<template><b>hidden</b></template>b'
    ])

    expect(svg).toContain('before')
    expect(svg).toContain('after')
    expect(svg).not.toContain('javascript')
    expect(svg).not.toContain('<a')
    expect(svg).not.toContain('<svg')
    expect(svg).not.toContain('<script')
    expect(math).not.toContain('<math')
    expect(style).toBe('ab')
    expect(template).toBe('ab')
  })

  it('keeps allowed inline formatting and strips unsafe attributes under Chrome', async () => {
    const [formatted, link] = await browserSanitize([
      '<div onclick="x()">Hello <b style="color:red">bold</b> <i>it</i></div>',
      '<a href="https://x.com" onclick="evil()">link</a>'
    ])

    expect(formatted).toBe('Hello <b>bold</b> <i>it</i>')
    expect(link).toContain('href="https://x.com"')
    expect(link).toContain('target="_blank"')
    expect(link).toContain('rel="noopener noreferrer"')
    expect(link).not.toContain('onclick')
  })
})
