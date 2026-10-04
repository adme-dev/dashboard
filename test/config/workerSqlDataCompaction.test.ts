import { expect, it } from 'vitest'
import { compactSqlSource, compactPromptSource } from '../../scripts/compact-worker-static-data.mjs'

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
it('preserves static SQL bindings and later reassignment without touching dynamic queries', async () => {
  const source = `export const fixed = ${JSON.stringify(sql)}; export function queryText(next) { let query = ${JSON.stringify(sql)}; const initial = query; query = next; return { initial, query }; }`
  const result = compactSqlSource(source)
  expect(result.literals).toBe(2)
  expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source))
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`)
  expect(module.fixed).toBe(sql)
  expect(module.queryText('SELECT runtime_value')).toEqual({ initial: sql, query: 'SELECT runtime_value' })
  expect(compactSqlSource(result.code).code).toBe(result.code)
})

it('preserves complete static prompts and excludes runtime interpolation and tagged templates', async () => {
  const prompt = `You are a creative assistant.\n${'Keep all client artwork and copy exactly as specified.\n'.repeat(80)}🚘`
  const source = `export const system = ${JSON.stringify(prompt)}; export const options = { system: ${JSON.stringify(prompt)} };`
  const result = compactPromptSource(source)
  expect(result.literals).toBe(2)
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`)
  expect(module.system).toBe(prompt)
  expect(module.options.system).toBe(prompt)
  expect(compactPromptSource(result.code).code).toBe(result.code)
  const tagged = 'export const prompt = String.raw`You are ' + 'x'.repeat(2000) + '`'
  const dynamic = 'export const prompt = `You are ' + 'x'.repeat(2000) + '${context}`'
  expect(compactPromptSource(tagged).code).toBe(tagged)
  expect(compactPromptSource(dynamic).code).toBe(dynamic)
})

it('compacts split server routes while leaving public assets and maps untouched', async () => {
  const { mkdtemp, mkdir, readFile, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { compactServerTextDirectory } = await import('../../scripts/compact-worker-static-data.mjs')
  const directory = await mkdtemp(join(tmpdir(), 'server-text-compaction-'))
  try {
    await mkdir(join(directory, 'chunks/routes'), { recursive: true })
    await mkdir(join(directory, 'public'))
    const source = `export const query = ${JSON.stringify(sql)};`
    await writeFile(join(directory, 'chunks/routes/route.mjs'), source)
    await writeFile(join(directory, 'chunks/routes/route.mjs.map'), source)
    await writeFile(join(directory, 'public/client.js'), source)
    const result = await compactServerTextDirectory(directory)
    expect(result.literals).toBe(1)
    expect(result.savedBytes).toBeGreaterThan(0)
    const compacted = await readFile(join(directory, 'chunks/routes/route.mjs'), 'utf8')
    const module = await import(`data:text/javascript;base64,${Buffer.from(compacted).toString('base64')}`)
    expect(module.query).toBe(sql)
    expect(await readFile(join(directory, 'chunks/routes/route.mjs.map'), 'utf8')).toBe(source)
    expect(await readFile(join(directory, 'public/client.js'), 'utf8')).toBe(source)
    expect((await compactServerTextDirectory(directory)).savedBytes).toBe(0)
  } finally {
    await rm(directory, { recursive: true })
  }
})
