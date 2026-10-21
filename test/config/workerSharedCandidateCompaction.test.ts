import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Miniflare } from 'miniflare'
import { compactRouteSqlDirectory, compactSqlSource, compactSsrMarkupDirectory } from '../../scripts/compact-worker-static-data.mjs'
import { compactDeployedWorkerModules, compactWorkerModuleFilenames } from '../../scripts/compact-worker-module.mjs'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const shortSql = `SELECT balance, 'Exact 🚘\\n' AS note\r\nFROM wallet WHERE client_id=$1 AND environment=$2\n${'AND active = TRUE\n'.repeat(18)}FOR UPDATE`
const routeSource = (sql: string) => `export const run = (db, args) => db.query(${JSON.stringify(sql)}, args)`
const unchanged = { changedFiles: 0, literals: 0, savedBytes: 0 }

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-shared-candidates-'))
  directories.push(directory)
  return directory
}

async function writeRoute(directory: string, name: string, sql = shortSql) {
  const file = path.join(directory, 'chunks/routes', name)
  await mkdir(path.dirname(file), { recursive: true })
  const source = routeSource(sql)
  // The regression concerns candidates rejected only by the inline decoder cost.
  expect(compactSqlSource(source)).toEqual({ code: source, literals: 0 })
  await writeFile(file, source)
  return { file, source, sql }
}

async function bytes(directory: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    total += entry.isDirectory() ? await bytes(file) : (await readFile(file)).length
  }
  return total
}

it('leaves a lone short SQL candidate unchanged when a new helper would grow the Worker', async () => {
  const directory = await fixture()
  const { file, source } = await writeRoute(directory, 'api/single.mjs')
  const shared = compactSqlSource(source, { decoderSpecifier: '../../static-data-decoder.mjs' })
  expect(shared.literals).toBe(1)
  expect(Buffer.byteLength(shared.code)).toBeLessThan(Buffer.byteLength(source))
  const before = await bytes(directory)

  expect(await compactRouteSqlDirectory(directory)).toEqual(unchanged)
  expect(await readFile(file, 'utf8')).toBe(source)
  expect(await bytes(directory)).toBe(before)
  await expect(readFile(path.join(directory, 'chunks/static-data-decoder.mjs'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await compactRouteSqlDirectory(directory)).toEqual(unchanged)
})

it('amortizes one helper across short route candidates and preserves SQL and parameter identity', async () => {
  const directory = await fixture()
  const routes = await Promise.all(Array.from({ length: 6 }, (_, index) =>
    writeRoute(directory, `api/${index % 2 ? 'nested/' : ''}${index}.mjs`, shortSql + `\n-- route ${index}`)))
  const untouched = path.join(directory, 'chunks/routes/api/tiny.mjs')
  const tinySource = routeSource('SELECT 1')
  await writeFile(untouched, tinySource)
  const before = await bytes(directory)

  const result = await compactRouteSqlDirectory(directory)
  expect(result).toMatchObject({ changedFiles: routes.length, literals: routes.length })
  expect(result.savedBytes).toBeGreaterThan(0)
  expect(result.savedBytes).toBe(before - await bytes(directory))
  expect(await readFile(untouched, 'utf8')).toBe(tinySource)
  expect(await readFile(path.join(directory, 'chunks/static-data-decoder.mjs'), 'utf8')).toContain('createStaticDecoder')
  for (const { file, sql } of routes) {
    const module = await import(pathToFileURL(file).href)
    for (const args of [['customer-a', 'staging'], ['customer-b', 'production']]) {
      expect(module.run({ query(text: string, values: unknown[]) {
        expect(text).toBe(sql)
        expect(values).toBe(args)
        return 'ok'
      } }, args)).toBe('ok')
    }
  }
  const after = await bytes(directory)
  expect(await compactRouteSqlDirectory(directory)).toEqual(unchanged)
  expect(await bytes(directory)).toBe(after)
})

it('uses an existing SSR helper for a short SQL route without charging its bytes twice', async () => {
  const directory = await fixture()
  const build = path.join(directory, 'chunks/build')
  await mkdir(build, { recursive: true })
  for (let index = 0; index < 3; index++) {
    await writeFile(path.join(build, `${index}.mjs`), `export const render = push => push(${JSON.stringify('<section>Exact 🚘 &amp; markup\r\n</section>'.repeat(80) + index)})`)
  }
  const { file, source } = await writeRoute(directory, 'api/single.mjs')
  const originalBytes = await bytes(directory)
  const ssr = await compactSsrMarkupDirectory(directory)
  const helper = path.join(directory, 'chunks/static-data-decoder.mjs')
  const helperSource = await readFile(helper, 'utf8')
  const beforeSql = await bytes(directory)

  const result = await compactRouteSqlDirectory(directory)
  expect(result).toMatchObject({ changedFiles: 1, literals: 1 })
  expect(result.savedBytes).toBeGreaterThan(0)
  expect(result.savedBytes).toBe(beforeSql - await bytes(directory))
  expect(result.savedBytes).toBe(Buffer.byteLength(source) - (await readFile(file)).length)
  expect(ssr.savedBytes + result.savedBytes).toBe(originalBytes - await bytes(directory))
  expect(await readFile(helper, 'utf8')).toBe(helperSource)
  const module = await import(pathToFileURL(file).href)
  const args = ['customer-a', 'production']
  module.run({ query(text: string, values: unknown[]) {
    expect(text).toBe(shortSql)
    expect(values).toBe(args)
  } }, args)
  expect(await compactSsrMarkupDirectory(directory)).toEqual(unchanged)
  expect(await compactRouteSqlDirectory(directory)).toEqual(unchanged)
})

it('runs short shared SQL routes in workerd after minification and filename compaction', async () => {
  const directory = await fixture()
  let worker: Miniflare | undefined
  try {
    const routes = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      writeRoute(directory, `api/${index}.mjs`, shortSql + `\n-- runtime ${index}`)))
    const entry = path.join(directory, 'index.js')
    await writeFile(entry, `${routes.map((_, index) => `import { run as run${index} } from './chunks/routes/api/${index}.mjs';`).join('\n')}
export default { fetch(request) {
  const args = [new URL(request.url).searchParams.get('customer'), 'production'];
  const db = { query(sql, values) { if (values !== args) throw new Error('Parameter identity changed'); return { sql, values }; } };
  return Response.json([${routes.map((_, index) => `run${index}(db, args)`).join(',')}]);
} };`)
    const before = await bytes(directory)
    const result = await compactRouteSqlDirectory(directory)
    expect(result).toMatchObject({ changedFiles: routes.length, literals: routes.length })
    expect(result.savedBytes).toBe(before - await bytes(directory))
    expect(result.savedBytes).toBeGreaterThan(0)
    await compactDeployedWorkerModules(directory)
    await compactWorkerModuleFilenames(directory)
    expect(await readFile(entry, 'utf8')).toContain('./chunks/m/')
    worker = new Miniflare({
      scriptPath: entry, modulesRoot: directory, modules: true,
      modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }],
      compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat']
    })
    for (const customer of ['customer-a', 'customer-b']) {
      const response = await worker.dispatchFetch(`https://worker.test/?customer=${customer}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(routes.map(({ sql }) => ({ sql, values: [customer, 'production'] })))
    }
  } finally {
    await worker?.dispose()
  }
}, 30_000)
