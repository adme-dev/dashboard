// Private, per-request execution state for the composite renderer.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

const DEADLINE_MS = 600_000
const KILL_GRACE_MS = 5000
const BODY_LIMIT = 128 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isExecutionId(value) {
  return typeof value === 'string' && UUID.test(value)
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode })
}

export function executionHeaders(headers) {
  const id = headers['x-render-execution-id'] ?? randomUUID()
  const value = headers['x-render-timeout-ms'] ?? String(DEADLINE_MS)
  if (!isExecutionId(id) || typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
    || Number(value) > DEADLINE_MS) throw httpError(400, 'Invalid render execution headers')
  return { id: id.toLowerCase(), timeoutMs: Number(value) }
}

export function createProgressStore() {
  const records = new Map()
  return {
    get(id) { return records.get(id)?.progress },
    begin(id) {
      if (records.has(id)) throw httpError(409, 'Render execution ID is already in use')
      if (records.size === 32) {
        const settled = [...records.entries()].find(([, record]) => record.finished)
        if (!settled) throw httpError(503, 'All composite execution slots are busy')
        const [oldestId, oldest] = settled
        clearTimeout(oldest.expiry)
        records.delete(oldestId)
      }
      const record = { progress: { stage: 'preparing', updatedAtMs: Date.now() }, finished: false, expiry: undefined }
      records.set(id, record)
      return {
        update(progress) {
          if (!record.finished) record.progress = { ...progress, updatedAtMs: Date.now() }
        },
        finish() {
          if (record.finished) return
          record.finished = true
          record.expiry = setTimeout(() => records.delete(id), 60_000)
          record.expiry.unref()
        }
      }
    }
  }
}

export function requestLifetime(req, res, timeoutMs) {
  const controller = new AbortController()
  const expires = performance.now() + timeoutMs
  const expire = () => controller.abort(httpError(504, 'Composite render timed out'))
  const deadline = setTimeout(expire, timeoutMs)
  const disconnected = () => {
    if (!res.writableFinished) controller.abort(httpError(499, 'Render caller disconnected'))
  }
  req.once('aborted', disconnected)
  res.once('close', disconnected)
  return {
    signal: controller.signal,
    check() {
      if (performance.now() >= expires) expire()
      controller.signal.throwIfAborted()
    },
    finish() {
      clearTimeout(deadline)
      req.off('aborted', disconnected)
      res.off('close', disconnected)
    }
  }
}

export function readCompositeBody(req, signal) {
  signal.throwIfAborted()
  if (Number(req.headers['content-length']) > BODY_LIMIT) {
    req.resume()
    throw httpError(413, 'Composite request exceeds the input limit')
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    function cleanup() {
      req.off('data', data)
      req.off('error', fail)
      req.off('end', end)
      signal.removeEventListener('abort', abort)
    }
    function fail(error) {
      cleanup()
      req.resume()
      reject(error)
    }
    function data(chunk) {
      size += chunk.length
      if (size > BODY_LIMIT) return fail(httpError(413, 'Composite request exceeds the input limit'))
      chunks.push(chunk)
    }
    function end() { cleanup(); resolve(Buffer.concat(chunks, size)) }
    function abort() { fail(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    req.on('error', fail).on('end', end).on('data', data)
  })
}

// FFmpeg is spawned detached below. Puppeteer's Linux launcher likewise gives
// Chromium a new process group. Only signal the group owned by this request.
function signalGroup(child, signal) {
  if (!child?.pid) return false
  try {
    process.kill(-child.pid, signal)
    return true
  } catch (error) {
    if (signal === 0 && error.code === 'EPERM') return true
    if (error.code !== 'ESRCH') throw error
    return false
  }
}

function terminateGroup(getChild, abortLaunch) {
  signalGroup(getChild(), 'SIGTERM')
  let timer, escalated = false
  const escalation = new Promise(resolve => {
    timer = setTimeout(() => {
      escalated = true
      signalGroup(getChild(), 'SIGKILL')
      abortLaunch?.()
      resolve()
    }, KILL_GRACE_MS)
  })
  return async () => {
    // A group leader can exit while its descendants still own resources.
    if (!escalated && signalGroup(getChild(), 0)) await escalation
    clearTimeout(timer)
  }
}

export function runEncoder(command, args, signal, onTimeMs) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe'] })
    let tail = Buffer.alloc(0)
    let partial = ''
    let settleTermination
    function cancel() { settleTermination = terminateGroup(() => child) }
    child.stderr.on('data', chunk => {
      tail = Buffer.concat([tail, chunk]).subarray(-16384)
    })
    child.stdio[3].setEncoding('ascii').on('data', chunk => {
      const lines = (partial + chunk).split('\n')
      partial = lines.pop().slice(-128)
      for (const line of lines) {
        const match = /^out_time_us=(\d+)$/.exec(line.trimEnd())
        if (match) {
          try { onTimeMs(Math.floor(Number(match[1]) / 1000)) } catch { /* Progress is advisory. */ }
        }
      }
    })
    signal.addEventListener('abort', cancel, { once: true })
    child.once('error', error => { signal.removeEventListener('abort', cancel); reject(error) })
    child.once('close', async code => {
      signal.removeEventListener('abort', cancel)
      await settleTermination?.()
      if (signal.aborted) reject(signal.reason)
      else resolve({ code, stderr: tail.toString() })
    })
  })
}

export async function captureWithBrowser(puppeteer, signal, capture) {
  signal.throwIfAborted()
  // launch() owns the child until Browser.process() becomes available. The
  // launcher's signal can kill Chromium before DevTools ever returns a handle.
  const launcher = new AbortController()
  let browser, settleTermination, rejectOnForce
  const forced = new Promise((_resolve, reject) => { rejectOnForce = reject })
  function cancel() {
    settleTermination = terminateGroup(() => browser?.process(), () => {
      launcher.abort(signal.reason)
      // A stalled protocol call (including close) need not reject after the
      // OS process dies. Release the execution independently of that promise.
      rejectOnForce(signal.reason)
    })
  }
  async function run() {
    browser = await puppeteer.launch({
      handleSIGTERM: false, handleSIGINT: false,
      executablePath: '/usr/bin/chromium', signal: launcher.signal,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })
    try {
      if (signal.aborted) {
        // A late handle belongs to the already-aborted launch as well.
        signalGroup(browser.process(), launcher.signal.aborted ? 'SIGKILL' : 'SIGTERM')
        signal.throwIfAborted()
      }
      return await capture(browser)
    } finally { await browser.close() }
  }
  signal.addEventListener('abort', cancel, { once: true })
  try { return await Promise.race([run(), forced]) } finally {
    signal.removeEventListener('abort', cancel)
    await settleTermination?.()
  }
}

export async function streamCompositeFile(path, res, signal) {
  const { size } = await stat(path)
  if (!size) throw new Error('Composite encoder produced an empty file')
  signal.throwIfAborted()
  res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(size) })
  await pipeline(createReadStream(path), res, { signal })
}
