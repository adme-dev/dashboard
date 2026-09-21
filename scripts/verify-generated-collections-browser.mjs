import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Real production Vue/Nuxt UI components, synthetic in-browser transport only.
// Native auth/RPC/storage are independently covered by PostgreSQL and workerd tests.
// No customer credentials, remote mutation, installs, persistent profiles or traces.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const directory = await mkdtemp(join(tmpdir(), 'generated-collections-browser-'))
let server
try {
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'))
  await writeFile(join(directory, 'package.json'), '{"type":"module","private":true}')
  const files = ['main.js', 'App.vue', 'style.css', 'index.html', 'vite.config.mjs', 'records.mjs', 'drafts.mjs', 'schemas.mjs']
  const templates = new Map()
  for (const file of files) {
    const source = await readFile(join(root, 'test/fixtures/generatedCollectionsBrowser', `${file}.txt`), 'utf8')
    templates.set(file, source.replaceAll('__DASHBOARD_ROOT__', root).replaceAll('__FIXTURE_ROOT__', directory))
    await writeFile(join(directory, file), templates.get(file))
  }
  server = await createServer({ configFile: join(directory, 'vite.config.mjs') })
  await server.listen()
  const address = server.httpServer.address()
  assert(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  for (const file of ['records.mjs', 'drafts.mjs', 'schemas.mjs']) {
    await writeFile(join(directory, file), templates.get(file).replaceAll('__FIXTURE_ORIGIN__', origin))
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(directory, file)], { cwd: root, stdio: 'inherit' })
      const deadline = setTimeout(() => child.kill('SIGTERM'), 120_000)
      child.once('error', reject)
      child.once('exit', (code) => {
        clearTimeout(deadline)
        if (code === 0) resolve()
        else reject(new Error(`Generated collections browser scenario failed: ${file} (${code})`))
      })
    })
  }
  console.log('Generated collections: all three real-browser scenarios passed.')
} finally {
  await server?.close()
  await rm(directory, { recursive: true, force: true })
}
