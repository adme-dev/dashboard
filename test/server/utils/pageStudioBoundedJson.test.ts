import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readPageStudioJson } from '~~/server/utils/pageStudio/boundedJson'

const mocks = vi.hoisted(() => ({ header: vi.fn(), stream: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<object>(), getHeader: mocks.header, getRequestWebStream: mocks.stream }))
const event = {} as never
const messages = ['must be JSON', 'too large', 'required', 'invalid body', 'invalid JSON'] as const
function body(parts: unknown[], close = true) {
  const cancel = vi.fn()
  const stream = new ReadableStream({ start(controller) {
    for (const part of parts) controller.enqueue(part)
    if (close) controller.close()
  }, cancel })
  mocks.stream.mockReturnValue(stream)
  return { stream, cancel }
}
describe('shared Page Studio bounded JSON reader', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.header.mockImplementation((_event, key) => key === 'content-type' ? 'application/json; charset=utf-8' : undefined)
  })
  it.each([4096, 8192, 512_000])('preserves the exact %i-byte route boundary', async (limit) => {
    const text = JSON.stringify('x'.repeat(limit - 2))
    body([text.slice(0, 1), new TextEncoder().encode(text.slice(1))])
    expect(await readPageStudioJson(event, limit, messages)).toBe('x'.repeat(limit - 2))
    const rejected = body([new TextEncoder().encode(`${text} `)], false)
    await expect(readPageStudioJson(event, limit, messages)).rejects.toMatchObject({ statusCode: 413, statusMessage: messages[1] })
    expect(rejected.cancel).toHaveBeenCalledWith('Content body limit exceeded')
    expect(rejected.stream.locked).toBe(false)
  })
  it('counts UTF-8 bytes rather than string length', async () => {
    body([JSON.stringify('😀')])
    await expect(readPageStudioJson(event, 5, messages)).rejects.toMatchObject({ statusCode: 413 })
  })
  it.each([new Uint8Array([0x22, 0xff, 0x22]), new TextEncoder().encode('{')])('rejects malformed UTF-8 or JSON %#', async (bytes) => {
    const fixture = body([bytes])
    await expect(readPageStudioJson(event, 20, messages)).rejects.toMatchObject({ statusCode: 400, statusMessage: messages[4] })
    expect(fixture.stream.locked).toBe(false)
  })
  it('preserves distinct content-type, absent-body and invalid-chunk errors', async () => {
    mocks.header.mockReturnValue('text/plain')
    await expect(readPageStudioJson(event, 20, messages)).rejects.toMatchObject({ statusCode: 415, statusMessage: messages[0] })
    mocks.header.mockImplementation((_event, key) => key === 'content-type' ? 'application/json' : undefined)
    mocks.stream.mockReturnValue(null)
    await expect(readPageStudioJson(event, 20, messages)).rejects.toMatchObject({ statusCode: 400, statusMessage: messages[2] })
    body([{}])
    await expect(readPageStudioJson(event, 20, messages)).rejects.toMatchObject({ statusCode: 400, statusMessage: messages[3] })
  })
})
