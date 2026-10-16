import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compactSqlSource, compactRouteSqlDirectory } from '../../scripts/compact-worker-static-data.mjs'
import { compactDeployedWorkerModules } from '../../scripts/compact-worker-module.mjs'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const sql = `SELECT wallet.balance, wallet.reserved, 'Text 🚘\\n' AS note\nFROM page_studio_image_wallets wallet\nWHERE wallet.client_id=$1 AND wallet.environment=$2\n${'AND wallet.balance >= 0\n'.repeat(100)}FOR UPDATE`
it('losslessly compacts nested server route SQL before minification without scanning client chunks or maps', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-route-sql-'))
  directories.push(directory)
  const route = path.join(directory, 'chunks/routes/api/social/report.get.mjs')
  const client = path.join(directory, 'chunks/build/client.mjs')
  await mkdir(path.dirname(route), { recursive: true })
  await mkdir(path.dirname(client), { recursive: true })
  const source = `export function run(db, args) { return db.query(${JSON.stringify(sql)}, args); }`
  await Promise.all([writeFile(route, source), writeFile(client, source), writeFile(`${route}.map`, source)])

  const result = await compactRouteSqlDirectory(directory)
  expect(result.changedFiles).toBe(1)
  expect(result.literals).toBe(1)
  expect(result.savedBytes).toBeGreaterThan(1000)
  expect(await readFile(client, 'utf8')).toBe(source)
  expect(await readFile(`${route}.map`, 'utf8')).toBe(source)
  expect(await compactRouteSqlDirectory(directory)).toEqual({ changedFiles: 0, literals: 0, savedBytes: 0 })

  await compactDeployedWorkerModules(path.join(directory, 'chunks/routes'))
  const module = await import(pathToFileURL(route).href)
  const args = ['client-a', 'production']
  expect(module.run.name).toBe('run')
  expect(module.run({ query(text: string, values: unknown[]) {
    expect(text).toBe(sql)
    expect(values).toBe(args)
    return 'ok'
  } }, args)).toBe('ok')
})

it('leaves a Worker without split server routes unchanged', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-no-route-sql-'))
  directories.push(directory)
  expect(await compactRouteSqlDirectory(directory)).toEqual({ changedFiles: 0, literals: 0, savedBytes: 0 })
})
it('preserves exact SQL, parameter identity and order, and caches only static query text', async () => {
  const source = `export async function run(db, args) { return db.query(${JSON.stringify(sql)}, args); }`
  const result = compactSqlSource(source)
  expect(result.literals).toBe(1)
  expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source))
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`)
  const args = ['customer-a', 'staging']
  let calls = 0
  const db = { query(text: string, values: unknown[]) {
    calls++
    expect(text).toBe(sql)
    expect(values).toBe(args)
    return calls
  } }
  expect(await module.run(db, args)).toBe(1)
  expect(await module.run(db, args)).toBe(2)
  expect(compactSqlSource(result.code).code).toBe(result.code)
})
it('losslessly compacts static SQL constants without moving their initialization or changing exports', async () => {
  const source = `export const query = ${JSON.stringify(sql)};
export function run(db, args) {
  const nested = ${JSON.stringify(sql + '\nAND note = $$Text \' \\n 🚘$$')};
  return [db.query(query, args), db.query(nested, args)];
}`
  const result = compactSqlSource(source)
  expect(result.literals).toBe(2)
  expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source))
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`)
  expect(module.query).toBe(sql)
  const args = ['customer-a']
  const seen: string[] = []
  module.run({ query(text: string, values: unknown[]) {
    expect(values).toBe(args)
    seen.push(text)
  } }, args)
  expect(seen).toEqual([sql, sql + '\nAND note = $$Text \' \\n 🚘$$'])
  expect(compactSqlSource(result.code).code).toBe(result.code)
})
it('leaves mutable SQL declarations and dynamic or tagged constant initializers alone', () => {
  const cases = [
    `export let query = ${JSON.stringify(sql)}`,
    `export var query = ${JSON.stringify(sql)}`,
    'export const query = `SELECT ' + 'x'.repeat(1200) + ' FROM ${table}`',
    'export const query = sql`' + sql.replaceAll('`', '\\`') + '`',
    `export const query = ${JSON.stringify(sql + '\uD800')}`
  ]
  for (const source of cases) expect(compactSqlSource(source)).toEqual({ code: source, literals: 0 })
})
it('does not rewrite executable code, templates with interpolation, tags, keys or non-SQL', () => {
  const cases = [
    `export const key = { ${JSON.stringify(sql)}: 1 }`,
    'export const run = (db, name) => db.query(`SELECT ' + 'x'.repeat(1200) + ' FROM ${name}`)',
    'export const run = db => db.query(sql`' + sql.replaceAll('`', '\\`') + '`)',
    `export const run = db => db.query(${JSON.stringify('not SQL '.repeat(1000))})`,
    `export const run = db => db.query(${JSON.stringify(sql + '\uD800')})`
  ]
  for (const source of cases) expect(compactSqlSource(source)).toEqual({ code: source, literals: 0 })
})
it('losslessly compacts multiple medium SQL statements with parameters and Unicode', async () => {
  const queries = Array.from({ length: 4 }, (_, index) => `SELECT ${index}, 'Text 🚘\\n' AS note\r\nFROM owned_site WHERE id=$1\n${'AND active = TRUE\n'.repeat(35)}FOR UPDATE`)
  for (const query of queries) {
    expect(query.length).toBeGreaterThanOrEqual(512)
    expect(query.length).toBeLessThan(1024)
  }
  const source = `export function run(db, args) { return [${queries.map(query => `db.query(${JSON.stringify(query)}, args)`).join(',')}]; }`
  const result = compactSqlSource(source)
  expect(result.literals).toBe(4)
  expect(Buffer.byteLength(source) - Buffer.byteLength(result.code)).toBeGreaterThan(557)
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`)
  const args = ['customer-a']
  const seen: string[] = []
  module.run({ query(text: string, values: unknown[]) {
    expect(values).toBe(args)
    seen.push(text)
  } }, args)
  expect(seen).toEqual(queries)
  expect(compactSqlSource(result.code).code).toBe(result.code)
})

it('compacts repeated short static SQL without changing executable behavior', async () => {
  const queries = Array.from({ length: 8 }, (_, index) => `SELECT ${index}, 'Owned site' AS label FROM owned_site WHERE id=$1\n${'AND active = TRUE\n'.repeat(15)}FOR UPDATE`)
  for (const query of queries) {
    expect(query.length).toBeGreaterThanOrEqual(256)
    expect(query.length).toBeLessThan(512)
  }
  const source = `export function run(db, args) { return [${queries.map(query => `db.query(${JSON.stringify(query)}, args)`).join(',')}]; }`
  const result = compactSqlSource(source)
  expect(result.literals).toBe(8)
  expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source))
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`)
  const seen: string[] = []
  const args = ['site-a']
  module.run({ query(text: string, values: unknown[]) {
    expect(values).toBe(args)
    seen.push(text)
  } }, args)
  expect(seen).toEqual(queries)
})
