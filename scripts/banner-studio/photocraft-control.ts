import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'

const binary = '/Applications/PhotoCraft.app/Contents/MacOS/PhotoCraft'
/** Owned local process only. Commands never retry after an uncertain mutation. */
export async function startPhotoCraft(root: string) {
  root = resolve(root)
  await mkdir(root, { recursive: true })
  await mkdir(join(root, 'config'), { recursive: true, mode: 0o700 })
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim()
  if (!version.startsWith('photocraft 0.16.0 (b1794c6e0,')) throw new Error(`Unsupported installed PhotoCraft: ${version}`)
  const port = await new Promise<number>((resolvePort, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo
      server.close(() => resolvePort(address.port))
    })
  })
  const token = randomBytes(32).toString('hex'), tokenPath = join(root, 'control.token')
  await writeFile(tokenPath, token, { mode: 0o600, flag: 'wx' })
  const child = spawn(binary, ['--safe-gpu', '--control', String(port), '--control-token-file', tokenPath, '--automation-read-root', root, '--automation-write-root', root], { env: { ...process.env, PHOTOCRAFT_CONFIG_DIR: join(root, 'config'), PHOTOCRAFT_CONTROL_TOKEN: '', PHOTOCRAFT_CONTROL_TOKEN_FILE: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (bytes) => {
    log += bytes.toString()
  })
  child.stderr.on('data', (bytes) => {
    log += bytes.toString()
  })
  let count = 0
  async function call(method: string, params: Record<string, unknown> = {}) {
    const id = ++count
    const response = await new Promise<{ ok: boolean, result: ReturnType<typeof JSON.parse> }>((resolveResponse, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      let buffered = '', authenticated = false
      socket.setTimeout(55000, () => socket.destroy(new Error('PhotoCraft reply timeout; mutation outcome unknown; no retry')))
      socket.on('error', reject)
      socket.on('connect', () => socket.write(JSON.stringify({ id: 'auth', method: 'auth', params: { token } }) + '\n'))
      socket.on('data', (bytes) => {
        buffered += bytes.toString()
        while (buffered.includes('\n')) {
          const index = buffered.indexOf('\n'), line = buffered.slice(0, index)
          buffered = buffered.slice(index + 1)
          try {
            const reply = JSON.parse(line)
            if (!authenticated) {
              if (!reply.ok) throw new Error('PhotoCraft authentication rejected')
              authenticated = true
              socket.write(JSON.stringify({ id, method, params }) + '\n')
            } else if (reply.id === id) {
              socket.end()
              resolveResponse(reply)
            }
          } catch (error) {
            socket.destroy()
            reject(error)
          }
        }
      })
      socket.on('end', () => reject(new Error('PhotoCraft connection ended; mutation may have completed')))
    })
    await writeFile(join(root, `${String(id).padStart(3, '0')}-${method.replaceAll('.', '-')}.json`), JSON.stringify({ method, params, response }, null, 2))
    if (!response.ok) throw new Error(JSON.stringify(response))
    return response.result
  }
  // Only connection establishment is polled; commands are never replayed.
  let ready = false
  for (let attempt = 0; attempt < 100 && child.exitCode === null; attempt++) {
    ready = await new Promise<boolean>((resolveReady) => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.on('connect', () => {
        socket.end()
        resolveReady(true)
      })
      socket.on('error', () => resolveReady(false))
    })
    if (ready) break
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200))
  }
  if (!ready) {
    child.kill('SIGTERM')
    await unlink(tokenPath)
    throw new Error('Owned PhotoCraft did not start')
  }
  await writeFile(join(root, 'runtime.json'), JSON.stringify({ port, pid: child.pid, version, root }, null, 2))
  return {
    call,
    execute: (command: string, params: Record<string, unknown> = {}) => call('engine.execute', { command, params }),
    async stop() {
      let cleanupVerified: boolean
      try {
        if (child.exitCode === null) await call('app.quit')
      } finally {
        for (let i = 0; i < 50 && child.exitCode === null; i++) await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
        if (child.exitCode === null) child.kill('SIGTERM')
        for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
        const portClosed = await new Promise<boolean>((resolveClosed) => {
          const socket = net.createConnection({ host: '127.0.0.1', port })
          socket.on('connect', () => {
            socket.end()
            resolveClosed(false)
          })
          socket.on('error', () => resolveClosed(true))
        })
        await writeFile(join(root, 'process.json'), JSON.stringify({ pid: child.pid, exitCode: child.exitCode, signal: child.signalCode, portClosed, version, log: log.replaceAll(token, '[redacted]') }, null, 2))
        await unlink(tokenPath).catch(() => {})
        cleanupVerified = portClosed && (child.exitCode !== null || child.signalCode !== null)
      }
      if (!cleanupVerified) throw new Error('Owned PhotoCraft cleanup unverified')
    }
  }
}

/** Inspect ZIP without extraction or following document-supplied filesystem paths. */
export function readPhotoCraftArchive(path: string) {
  const script = resolve('scripts/banner-studio/photocraft-read-archive.py')
  return JSON.parse(execFileSync('python3', [script, resolve(path)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }))
}

export async function readOwnedJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8'))
}
