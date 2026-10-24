import { expect, it } from 'vitest'
import * as compactor from '../../scripts/compact-worker-static-data.mjs'

const fragment = 'SELECT \'🚘 \\n\' AS label, id FROM owned_site WHERE client_id=$1\n' + 'AND enabled = TRUE\n'.repeat(80)
const raw = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${').replaceAll('\r', '\\r')
const evaluate = (source: string) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const compact = (source: string, options?: object) => compactor.compactSqlTemplateSource(source, options)

it('compresses only immutable SQL segments and preserves exact interpolation order and request identity', async () => {
  const source = 'export function query(db, args, next) { return db.query(`' + raw(fragment) + '${next(1)}' + raw(fragment) + '${next(2)}' + raw(fragment) + '`, args); }'
  const result = compact(source)
  expect(result.literals).toBe(3)
  expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source) / 2)
  const before = await evaluate(source), after = await evaluate(result.code)
  for (const module of [before, after]) {
    const seen: unknown[] = [], args = ['customer-a']
    const next = (n: number) => {
      seen.push(n)
      return { [Symbol.toPrimitive](hint: string) {
        seen.push(hint)
        return `value-${n}`
      } }
    }
    const db = { query(sql: string, params: unknown[]) {
      expect(params).toBe(args)
      return sql
    } }
    expect(module.query(db, args, next)).toBe(fragment + 'value-1' + fragment + 'value-2' + fragment)
    expect(seen).toEqual([1, 'string', 2, 'string'])
    expect(module.query.name).toBe('query')
  }
  expect(compact(result.code)).toEqual({ code: result.code, literals: 0 })
})

it('preserves Symbol coercion errors and never evaluates later expressions after a throw', async () => {
  const source = 'export function query(first, next) { return `' + raw(fragment) + '${first}' + raw(fragment) + '${next()}`; }'
  for (const code of [source, compact(source).code]) {
    const module = await evaluate(code)
    let calls = 0
    expect(() => module.query(Symbol('invalid'), () => calls++)).toThrow(TypeError)
    expect(calls).toBe(0)
    const error = new Error('coercion failed')
    expect(() => module.query({ [Symbol.toPrimitive]() {
      throw error
    } }, () => calls++)).toThrow(error)
    expect(calls).toBe(0)
  }
})

it('preserves nested templates, escaped interpolation, NUL, line separators and CRLF', async () => {
  const special = fragment + '\r\n\u0000\u2028\u2029 `${literal} \\n'
  const source = 'export function query(value) { const __xfStatic0 = 3; return [`' + raw(special) + '${`' + raw(fragment) + '${value}`}' + raw(special) + '`, __xfStatic0]; }'
  const result = compact(source)
  expect(result.literals).toBe(3)
  const before = await evaluate(source), after = await evaluate(result.code)
  expect(after.query('owned')).toEqual(before.query('owned'))
})

it('never changes tagged templates, non-SQL, short segments or malformed Unicode segments', () => {
  const cases = [
    'export const query = String.raw`' + raw(fragment) + '${value}`;',
    'export const query = tag`' + raw(fragment) + '\\unicode${value}`;',
    'export const query = `not SQL ' + raw(fragment) + '${value}`;',
    'export const query = `SELECT short ${value}`;',
    'export const query = `' + raw(fragment + '\uD800') + '${value}`;'
  ]
  for (const source of cases) expect(compact(source)).toEqual({ code: source, literals: 0 })
})

it('does not touch SQL expression bodies or parameters and includes the complete decoder cost', async () => {
  const valid = 'export const query = (args) => [`' + raw(fragment) + '${args.map(x => x).join(",")}`, args];'
  const result = compact(valid)
  expect(result.code).toContain('args.map(x => x).join(",")')
  const args = ['one', 'two']
  const output = (await evaluate(result.code)).query(args)
  expect(output[0]).toBe(fragment + 'one,two')
  expect(output[1]).toBe(args)
  expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(valid))
})

it('lazily decodes each immutable fragment once while evaluating every request expression anew', async () => {
  const source = 'export function query(value) { return `' + raw(fragment) + '${value}' + raw(fragment) + '`; }'
  const result = compact(source)
  const alias = result.code.match(/import \{ brotliDecompressSync as (\w+) \}/)?.[1]
  expect(alias).toBeTruthy()
  // Observe the real generated decoder's native call without changing its cache.
  const observed = result.code.replaceAll(`${alias}(`, 'observeInflate(')
    + `\nexport let inflations = 0; function observeInflate(...args) { inflations++; return ${alias}(...args); }`
  const module = await evaluate(observed)
  expect(module.inflations).toBe(0)
  for (const identity of ['customer-one', 'customer-two', 'customer-one']) {
    expect(module.query(identity)).toBe(fragment + identity + fragment)
    expect(module.inflations).toBe(1)
  }
})

it('preserves actual CRLF source normalization and await/yield expression boundaries', async () => {
  const source = 'export async function* query(next) { return `' + raw(fragment).replaceAll('\n', '\r\n') + '${await next(1)}' + raw(fragment) + '${yield next(2)}`; }'
  const result = compact(source)
  expect(result.literals).toBe(2)
  const run = async (code: string) => {
    const module = await evaluate(code)
    const calls: number[] = []
    const generator = module.query((n: number) => {
      calls.push(n)
      return `value-${n}`
    })
    const first = await generator.next()
    const last = await generator.next('resumed')
    return { first, last, calls }
  }
  expect(await run(result.code)).toEqual(await run(source))
})

it('fails closed on malformed untagged escape syntax', () => {
  const source = 'export const query = `' + raw(fragment) + '\\unicode${value}`;'
  expect(() => compact(source)).toThrow('Invalid generated SSR module')
})
