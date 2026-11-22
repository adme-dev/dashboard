import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, request } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const plan = (mode: string) => ({
  plan: { inputs: [], overlayInputs: [], filterComplex: 'unused', vLabel: '[vout]', aLabel: null,
    durationSec: 2, profile: { fps: 30, videoBitrate: mode } }, files: []
})
let dir: string, scratch: string, origin: string, service: ReturnType<typeof spawn>
const post = (mode: string, id?: string, ms?: string) => fetch(origin + '/render-composite', {
  method: 'POST', body: JSON.stringify(plan(mode)), headers: {
    ...(id === undefined ? {} : { 'x-render-execution-id': id }),
    ...(ms === undefined ? {} : { 'x-render-timeout-ms': ms })
  }
})
const status = (id: string) => fetch(origin + '/render-progress/' + id)
const work = async () => (await readdir(scratch)).filter(p => p.startsWith('composite-'))
async function until(check: () => Promise<boolean>) {
  const start = Date.now()
  while (!await check()) {
    if (Date.now() - start > 8500) throw Error('Expected service state was not reached')
    await delay(20)
  }
}
async function pidFor(mode: string) { return Number(await readFile(join(dir, mode + '.pid'), 'utf8')) }
function stopped(pid: number) {
  try { process.kill(pid, 0); return false } catch (e: any) { return e.code === 'ESRCH' }
}

async function startService() {
  const reserve = createServer().listen(0, '127.0.0.1')
  await once(reserve, 'listening')
  const port = (reserve.address() as { port: number }).port
  await new Promise<void>(resolveClose => reserve.close(() => resolveClose()))
  const endpoint = 'http://127.0.0.1:' + port
  const child = spawn(process.execPath, [resolve('workers/audio-jobs/container/server.mjs')], {
    env: { ...process.env, PATH: dir + ':' + process.env.PATH, TMPDIR: scratch, PORT: String(port), FIXTURE_ROOT: dir },
    stdio: 'ignore'
  })
  await until(() => fetch(endpoint + '/health').then(r => r.ok).catch(() => false))
  return { child, endpoint }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'render-service-test-'))
  scratch = join(dir, 'scratch')
  await mkdir(scratch)
  // A real subprocess writes a delivery-sized file, emits fragmented FFmpeg
  // progress and can ignore SIGTERM. Neither Docker nor a codec is required.
  await writeFile(join(dir, 'ffmpeg'), `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2), mode = args[args.indexOf('-b:v') + 1]
const root = process.env.FIXTURE_ROOT
process.on('SIGTERM', () => { fs.writeFileSync(root + '/' + mode + '.term', 'received'); if (mode !== 'hang') process.exit(0) })
fs.writeFileSync(root + '/' + mode + '.pid', String(process.pid))
process.stderr.write('x'.repeat(1024*1024))
if (args.includes('pipe:3')) { fs.writeSync(3,'out_time_'); fs.writeSync(3,'us=400000\\nprogress=continue\\n') }
if (mode === 'hang' || mode === 'disconnect') setTimeout(() => process.exit(1), 15000)
else if (mode.startsWith('drain')) setTimeout(() => fs.writeFileSync(args.at(-1), Buffer.alloc(48, 17)), 350)
else fs.writeFileSync(args.at(-1), Buffer.alloc(mode === 'large' ? 16 * 1024 * 1024 : mode === 'empty' ? 0 : 48, 17))
`, { mode: 0o700 })
  const started = await startService()
  origin = started.endpoint
  service = started.child
}, 15000)
afterAll(async () => {
  service?.kill('SIGKILL')
  if (dir) await rm(dir, { recursive: true, force: true })
})
describe('private composite render execution', () => {
  it('generates an execution for legacy requests and streams exactly the completed file', async () => {
    const response = await post('small')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('48')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(48).fill(17))
    const id = response.headers.get('x-render-execution-id')
    expect(id).toMatch(/^[a-f0-9-]{36}$/)
    expect(await (await status(id!)).json()).toMatchObject({ stage: 'streaming' })
    await until(async () => (await work()).length === 0)
  })
  it.each([['bad', '30'], [randomUUID(), '0'], [randomUUID(), '600001'], [randomUUID(), '1.5']])(
    'rejects invalid execution headers before starting work', async (id, ms) => {
      expect((await post('invalid', id, ms)).status).toBe(400)
    })
  it('distinguishes malformed progress IDs from unknown valid executions', async () => {
    expect((await status('invalid-id')).status).toBe(400)
    expect((await status(randomUUID())).status).toBe(404)
  })
  it('rejects an oversized composite before reading its declared body', async () => {
    const req = request(origin + '/render-composite', { method: 'POST', headers: { 'content-length': String(128 * 1024 * 1024 + 1) } })
    const response = once(req, 'response')
    req.flushHeaders()
    try { expect((await response)[0].statusCode).toBe(413) } finally { req.destroy() }
  })
  it('applies the execution deadline while the request body is still arriving', async () => {
    const req = request(origin + '/render-composite', { method: 'POST', headers: { 'x-render-timeout-ms': '100', 'content-length': '1000' } })
    const response = once(req, 'response')
    req.write('{')
    try { expect((await response)[0].statusCode).toBe(504) } finally { req.destroy() }
  })
  it('kills a hung encoder after its grace period and cleans only its execution', async () => {
    const id = randomUUID()
    const pending = post('hang', id, '500')
    await until(async () => (await status(id)).json().then(s => s.encodedTimeMs === 400).catch(() => false))
    expect(await (await status(id)).json()).toMatchObject({ stage: 'encoding', durationMs: 2000 })
    expect((await post('duplicate', id)).status).toBe(409)
    const pid = await pidFor('hang')
    await until(() => readFile(join(dir, 'hang.term')).then(() => true).catch(() => false))
    expect(stopped(pid)).toBe(false)
    expect((await pending).status).toBe(504)
    await until(async () => stopped(pid) && (await work()).length === 0)
  }, 12000)
  it('cancels a real child when the HTTP caller disconnects', async () => {
    const id = randomUUID()
    const req = request(origin + '/render-composite', { method: 'POST', headers: { 'x-render-execution-id': id } })
    req.on('error', () => {})
    req.end(JSON.stringify(plan('disconnect')))
    await until(async () => (await status(id)).json().then(s => s.encodedTimeMs === 400).catch(() => false))
    const pid = await pidFor('disconnect')
    req.destroy()
    await until(async () => stopped(pid) && (await work()).length === 0)
  }, 12000)
  it('rejects an empty encoder output and removes scratch before a later render', async () => {
    expect((await post('empty')).status).toBe(500)
    // The server ends the HTTP response before its finally block removes scratch.
    await until(async () => (await work()).length === 0)
    const next = await post('small')
    expect(next.status).toBe(200)
    expect((await next.arrayBuffer()).byteLength).toBe(48)
    await until(async () => (await work()).length === 0)
  })
  it.each(['SIGTERM', 'SIGINT'] as const)('drains an accepted composite on %s', async signal => {
    const { child, endpoint } = await startService()
    const id = randomUUID()
    const exited = once(child, 'exit')
    try {
      const result = fetch(endpoint + '/render-composite', { method: 'POST',
        headers: { 'x-render-execution-id': id }, body: JSON.stringify(plan('drain' + signal)) })
      await until(() => fetch(endpoint + '/render-progress/' + id).then(r => r.json()).then(s => s?.encodedTimeMs === 400))
      child.kill(signal)
      const response = await result
      expect(response.status).toBe(200)
      expect((await response.arrayBuffer()).byteLength).toBe(48)
      expect(await exited).toEqual([0, null])
      expect(await work()).toEqual([])
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') }
  })
  it.each(['resume', 'disconnect'])('keeps a paused output file and cleans up on %s', async action => {
    const id = randomUUID()
    const req = request(origin + '/render-composite', { method: 'POST', headers: { 'x-render-execution-id': id } })
    const response = once(req, 'response')
    req.end(JSON.stringify(plan('large')))
    const [res] = await response
    res.pause()
    try {
      expect(res.headers['content-length']).toBe(String(16 * 1024 * 1024))
      expect(await (await status(id)).json()).toMatchObject({ stage: 'streaming' })
      expect(await work()).toHaveLength(1)
      if (action === 'resume') {
        let received = 0
        for await (const chunk of res) received += chunk.length
        expect(received).toBe(16 * 1024 * 1024)
      }
    } finally { res.destroy() }
    await until(async () => !(await work()).length)
  })
})
