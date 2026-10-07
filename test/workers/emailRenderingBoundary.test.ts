import { describe, expect, it } from 'vitest'
import { handleEmailRender } from '../../workers/email-rendering/src/handleRender'
import { snapshotRenderInput, createRenderBudget, validateDocumentGraph } from '../../shared/emailRendering/bounds'
import { customerFixture } from '../fixtures/emailRendering'

const document = { root: { type: 'EmailLayout', data: { childrenIds: ['text'] } }, text: { type: 'Text', data: { props: { text: 'Hello & goodbye' } } } }
const request = { version: 1, expectedEnvironment: 'staging', operation: 'document', document, options: {} }
const render = (input: unknown = request, env: unknown = 'staging') => handleEmailRender(input, env)

describe('private email rendering admission', () => {
  it('returns rendered HTML in the admitted version and environment', () => {
    expect(render()).toMatchObject({ version: 1, environment: 'staging', operation: 'document', ok: true, value: { html: expect.stringContaining('Hello & goodbye') } })
  })
  it.each(['production', undefined, 'preview'])('denies missing or mismatched environment %s', (env) => {
    expect(handleEmailRender(request, env)).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } })
  })
  it.each([null, [], {}, { ...request, version: 2 }, { ...request, extra: true }, { ...request, operation: 'send' }, { ...request, options: { secret: 'hidden' } }, { ...request, document: { root: { type: 'Text', data: {} } } }])('rejects malformed request without reflecting its contents', (input) => {
    expect(render(input)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(JSON.stringify(render(input))).not.toContain('hidden')
  })
  it('denies root and columns cycles while allowing missing children', () => {
    const rootCycle = { root: { type: 'EmailLayout', data: { childrenIds: ['root'] } } }
    const columnsCycle = { root: { type: 'EmailLayout', data: { childrenIds: ['cols'] } }, cols: { type: 'ColumnsContainer', data: { props: { columns: [{ childrenIds: ['cols'] }] } } } }
    for (const cycle of [rootCycle, columnsCycle]) expect(render({ ...request, document: cycle })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(render({ ...request, document: { root: { type: 'EmailLayout', data: { childrenIds: ['missing'] } } } })).toMatchObject({ ok: true })
  })
  it('bounds expanded visits even when many placements reuse one block', () => {
    const doc = structuredClone(document)
    doc.root.data.childrenIds = Array(4095).fill('text')
    expect(() => validateDocumentGraph(doc)).not.toThrow()
    doc.root.data.childrenIds.push('text')
    expect(() => validateDocumentGraph(doc)).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
  })
  it('accepts 2048 stored blocks and rejects an additional unused block', () => {
    const doc: Record<string, unknown> = { root: { type: 'EmailLayout', data: {} } }
    for (let i = 1; i < 2048; i++) doc[`b${i}`] = { type: 'Text', data: {} }
    expect(() => validateDocumentGraph(doc)).not.toThrow()
    doc.extra = { type: 'Text', data: {} }
    expect(() => validateDocumentGraph(doc)).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
  })
  it('bounds nested containers by expanded path depth', () => {
    const doc: Record<string, unknown> = { root: { type: 'EmailLayout', data: { childrenIds: ['c1'] } } }
    for (let i = 1; i < 32; i++) doc[`c${i}`] = { type: 'Container', data: { childrenIds: i === 31 ? [] : [`c${i + 1}`] } }
    expect(() => validateDocumentGraph(doc)).not.toThrow()
    doc.c31 = { type: 'Container', data: { childrenIds: ['c32'] } }
    doc.c32 = { type: 'Container', data: {} }
    expect(() => validateDocumentGraph(doc)).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
  })
  it('returns only a safe sample for the restricted customer operation', () => {
    const result = render({ version: 1, expectedEnvironment: 'staging', operation: 'customer-preview', ...customerFixture })
    expect(result).toMatchObject({ ok: true, value: { sample: true, html: expect.stringContaining('Content-Security-Policy') } })
    expect(JSON.stringify(result)).not.toContain('Private tracking')
    expect(render({ version: 1, expectedEnvironment: 'staging', operation: 'customer-preview', ...customerFixture, template: { ...customerFixture.template, blocks: [{ id: 'bad', type: 'html', text: '<script>bad()</script>' }] } })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
})

describe('rendering resource limits', () => {
  it('counts serialized UTF-8 including escaping and accepts the exact byte limit', () => {
    expect(snapshotRenderInput('é', 4)).toBe('é')
    expect(() => snapshotRenderInput('é', 3)).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
    expect(snapshotRenderInput('\n', 4)).toBe('\n')
    expect(snapshotRenderInput({ a: [true, null, 12] }, 20)).toEqual({ a: [true, null, 12] })
    expect(() => snapshotRenderInput({ a: [true, null, 12] }, 19)).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
  })
  it('snapshots shared references independently and rejects ancestor cycles', () => {
    const shared = { text: 'before' }, input = { a: shared, b: shared }
    const output = snapshotRenderInput(input)
    shared.text = 'after'
    expect(output).toEqual({ a: { text: 'before' }, b: { text: 'before' } })
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => snapshotRenderInput(cyclic)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })
  it.each([NaN, Infinity, () => 'bad', 1n, new Date(), new Map()])('rejects non-JSON values', (value) => {
    expect(() => snapshotRenderInput({ value })).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })
  it('rejects deep input and oversized request before renderer schema recursion', () => {
    let value: unknown = null
    for (let i = 0; i < 65; i++) value = [value]
    expect(() => snapshotRenderInput(value)).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
    expect(render({ ...request, options: { subjectLine: 'x'.repeat(8 * 1024 * 1024) } })).toMatchObject({ ok: false, error: { code: 'LIMIT_EXCEEDED' } })
  })
  it('charges cumulative output per request in UTF-8 without shared state', () => {
    const budget = createRenderBudget(5)
    budget.charge('é')
    budget.charge('abc')
    expect(() => budget.charge('!')).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
    expect(() => createRenderBudget(5).charge('fresh')).not.toThrow()
  })
})

describe('JSON admission avoids input expansion and execution', () => {
  it('rejects an excessive number of small JSON nodes before building a large work stack', () => {
    expect(() => snapshotRenderInput(Array(100_001).fill(null))).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
  })
  it('never invokes getters or custom serialization', () => {
    let reads = 0
    const getter = Object.defineProperty({}, 'secret', { enumerable: true, get() {
      reads++
      return 'secret'
    } })
    const serializer = Object.defineProperty({}, 'toJSON', { value() {
      reads++
      return 'secret'
    } })
    for (const input of [getter, serializer]) expect(() => snapshotRenderInput(input)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }))
    expect(reads).toBe(0)
  })
})

describe('numeric output multipliers', () => {
  it('rejects unbounded star repetition before rendering', () => {
    const doc = { root: { type: 'EmailLayout', data: { childrenIds: ['stars'] } }, stars: { type: 'review-stars', data: { props: { rating: 5, maxStars: 1_000_000_000 } } } }
    expect(() => validateDocumentGraph(doc)).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
  })
})
