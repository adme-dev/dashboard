import { expect, it } from 'vitest'
import { compactSqlSource } from '../../scripts/compact-worker-static-data.mjs'

const sql = `SELECT wallet.balance, wallet.reserved, 'Text 🚘\\n' AS note\nFROM page_studio_image_wallets wallet\nWHERE wallet.client_id=$1 AND wallet.environment=$2\n${'AND wallet.balance >= 0\n'.repeat(100)}FOR UPDATE`
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
