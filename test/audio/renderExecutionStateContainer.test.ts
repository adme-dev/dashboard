import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { captureWithBrowser, createProgressStore, runEncoder } from '../../workers/audio-jobs/container/renderExecution.mjs'

describe('container execution telemetry', () => {
  it('limits stored progress to 32 attempts, expires finished entries after a minute and fences old writers', () => {
    vi.useFakeTimers()
    try {
      const store = createProgressStore(), first = randomUUID()
      const old = store.begin(first)
      old.update({ stage: 'capturing', framesDone: 2 })
      old.finish()
      const ids = Array.from({ length: 32 }, () => randomUUID())
      for (const id of ids) store.begin(id).finish()
      expect(store.get(first)).toBeUndefined()
      const fresh = store.begin(first)
      old.update({ stage: 'streaming' })
      expect(store.get(first)?.stage).toBe('preparing')
      vi.advanceTimersByTime(60001)
      expect(store.get(ids.at(-1)!)).toBeUndefined()
      expect(store.get(first)?.stage).toBe('preparing')
      fresh.finish()
    } finally { vi.useRealTimers() }
  })
  it('keeps all 32 active records until a slot becomes available', () => {
    const store = createProgressStore()
    const ids = Array.from({ length: 32 }, () => randomUUID())
    const active = ids.map(id => store.begin(id))
    const next = randomUUID()
    expect(() => store.begin(next)).toThrow(expect.objectContaining({ statusCode: 503 }))
    for (const id of ids) expect(store.get(id)?.stage).toBe('preparing')
    expect(() => store.begin(ids[0])).toThrow(expect.objectContaining({ statusCode: 409 }))
    active[0].finish()
    const accepted = store.begin(next)
    expect(store.get(next)?.stage).toBe('preparing')
    accepted.finish()
    active.forEach(item => item.finish())
  })

  it('settles an unresponsive launcher at the kill deadline and aborts its launch signal', async () => {
    vi.useFakeTimers()
    const abort = new AbortController()
    let launchSignal: AbortSignal
    const capture = vi.fn()
    let failure: unknown
    try {
      const launcher = { launch: ({ signal }) => {
        launchSignal = signal
        return new Promise(() => {})
      } }
      captureWithBrowser(launcher, abort.signal, capture).catch(error => { failure = error })
      const reason = new Error('deadline')
      abort.abort(reason)
      await vi.advanceTimersByTimeAsync(5000)
      expect(launchSignal!.aborted).toBe(true)
      expect(failure).toBe(reason)
      expect(capture).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('settles a hung browser close even when Puppeteer never reports the dead process', async () => {
    const proc = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});console.log('ready');setTimeout(()=>{},15000)"], { detached: true })
    await once(proc.stdout!, 'data')
    const exit = once(proc, 'exit')
    const abort = new AbortController()
    const closing = vi.fn(() => new Promise(() => {}))
    const browser = { process: () => proc, close: closing }
    let failure: unknown
    try {
      const render = captureWithBrowser({ launch: async () => browser }, abort.signal, async () => {})
      render.catch(error => { failure = error })
      await vi.waitFor(() => expect(closing).toHaveBeenCalledOnce())
      vi.useFakeTimers()
      const reason = new Error('caller disconnected')
      abort.abort(reason)
      await vi.advanceTimersByTimeAsync(5000)
      expect(failure).toBe(reason)
      vi.useRealTimers()
      expect(await exit).toEqual([null, 'SIGKILL'])
    } finally {
      vi.useRealTimers()
      if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
    }
  })

  it('terminates an owned descendant even when its leader exits on SIGTERM', async () => {
    const root = await mkdtemp(join(tmpdir(), 'render-process-group-'))
    const marker = join(root, 'ready')
    const grandchild = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(process.argv[1],String(process.pid));setTimeout(()=>{},15000)`
    const script = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)},process.argv[1]],{stdio:'ignore'});setTimeout(()=>{},15000)`
    const abort = new AbortController()
    const render = runEncoder(process.execPath, ['-e', script, marker], abort.signal, () => {})
    try {
      await vi.waitFor(async () => expect(Number(await readFile(marker, 'utf8'))).toBeGreaterThan(0))
      const pid = Number(await readFile(marker, 'utf8'))
      abort.abort(new Error('stop group'))
      await expect(render).rejects.toThrow('stop group')
      // On Linux a killed orphan may briefly remain as a zombie before PID 1 reaps it.
      await vi.waitFor(async () => {
        try { process.kill(pid, 0) } catch (error: any) { if (error.code === 'ESRCH') return; throw error }
        const state = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '')
        expect(state).toMatch(/\) Z /)
      })
    } finally { abort.abort(); await rm(root, { recursive: true, force: true }) }
  }, 12000)
  it('retains bounded FFmpeg diagnostics and parses complete progress records from a real child', async () => {
    const report = vi.fn()
    const script = `const fs=require('node:fs');process.stderr.write('X'.repeat(100000)+'TAIL');
    fs.writeSync(3,'out_time_');setTimeout(()=>fs.writeSync(3,'us=1234000\\nprogress=continue\\n'),10)`
    const result = await runEncoder(process.execPath, ['-e', script], new AbortController().signal, report)
    expect(result.code).toBe(0)
    expect(result.stderr.length).toBeLessThanOrEqual(16384)
    expect(result.stderr.endsWith('TAIL')).toBe(true)
    expect(report).toHaveBeenCalledWith(1234)
  })
})
