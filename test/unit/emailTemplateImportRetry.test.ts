/* eslint-disable @typescript-eslint/no-explicit-any -- JSONB ordering fixture. */
/* eslint-disable @stylistic/max-statements-per-line -- Compact interaction fixtures. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveImportedTemplate } from '~~/server/utils/email-marketing/templateImportSave'

const mocks = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn() }))
vi.mock('~~/server/utils/email-marketing/templates', () => ({ createTemplate: mocks.create, getTemplate: mocks.get }))
const input = { name: 'Import', created_by: 'writer', client_id: 'client-a', body_source: { root: { type: 'EmailLayout', data: { childrenIds: [] } } } }
const renderer = {} as never
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('createError', (data: object) => Object.assign(new Error('conflict'), data)); mocks.get.mockResolvedValue(null); mocks.create.mockImplementation(async data => ({ ...data, created_by: data.created_by })) })
describe('idempotent import save', () => {
  it('returns the same confirmed row on a lost-ack retry without another insert', async () => {
    const first = await saveImportedTemplate(input, 'same-request', renderer)
    mocks.get.mockResolvedValue(first)
    expect(await saveImportedTemplate(input, 'same-request', renderer)).toEqual(first)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(first.id).toMatch(/^[a-f0-9-]{36}$/)
  })
  it('rejects a reused request key for changed content or client ownership', async () => {
    const first = await saveImportedTemplate(input, 'same-request', renderer)
    mocks.get.mockResolvedValue(first)
    await expect(saveImportedTemplate({ ...input, name: 'Changed' }, 'same-request', renderer)).rejects.toMatchObject({ statusCode: 409 })
    await expect(saveImportedTemplate({ ...input, client_id: 'client-b' }, 'same-request', renderer)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('uses distinct identities for different writers and new requests', async () => {
    const first = await saveImportedTemplate(input, 'same-request', renderer)
    const second = await saveImportedTemplate({ ...input, created_by: 'other' }, 'same-request', renderer)
    const third = await saveImportedTemplate(input, 'next-request', renderer)
    expect(new Set([first.id, second.id, third.id]).size).toBe(3)
  })
  it('rejects replay after a later edit even if the original receipt remains', async () => {
    const first = await saveImportedTemplate(input, 'same-request', renderer)
    mocks.get.mockResolvedValue({ ...first, name: 'Edited after import' })
    await expect(saveImportedTemplate(input, 'same-request', renderer)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('reconciles unchanged JSONB documents regardless of database key ordering', async () => {
    const first = await saveImportedTemplate(input, 'same-request', renderer)
    const document = first.body_source as any
    mocks.get.mockResolvedValue({ ...first, body_source: { root: { data: { props: document.root.data.props, childrenIds: [] }, type: 'EmailLayout' } } })
    expect((await saveImportedTemplate(input, 'same-request', renderer)).id).toBe(first.id)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
})
