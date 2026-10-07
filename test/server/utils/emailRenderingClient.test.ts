import { describe, expect, it, vi } from 'vitest'
import { createEmailRenderer } from '../../../server/utils/email-marketing/render/client'
import { handleEmailRender } from '../../../workers/email-rendering/src/handleRender'
import { customerFixture, documentFixtures } from '../../fixtures/emailRendering'

const document = documentFixtures[1]!.document
const reply = { version: 1, environment: 'staging', operation: 'document', ok: true, value: { html: '<p>Valid</p>' } }
const clientFor = (render: (input: unknown) => unknown) => createEmailRenderer({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', EMAIL_RENDERER: { render } })
describe('Pages email renderer client', () => {
  it('round trips both operations through the bounded renderer', async () => {
    const client = clientFor(input => handleEmailRender(input, 'staging'))
    expect(await client.renderDocument(document)).toContain('Hello & goodbye')
    expect(await client.renderCustomerPreview(customerFixture.template, customerFixture.context)).toMatchObject({ sample: true, html: expect.stringContaining('Content-Security-Policy') })
  })
  it.each([{}, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'preview', EMAIL_RENDERER: { render: () => reply } }])('fails closed without the explicit configured environment and binding', async (env) => {
    await expect(createEmailRenderer(env).renderDocument(document)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('retains the binding receiver and snapshots before yielding', async () => {
    const input = structuredClone(document)
    let captured: unknown
    const service = { async render(request: unknown) {
      expect(this).toBe(service)
      captured = request
      await Promise.resolve()
      return reply
    } }
    const pending = createEmailRenderer({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', EMAIL_RENDERER: service }).renderDocument(input)
    input.root.data.childrenIds = []
    await expect(pending).resolves.toBe('<p>Valid</p>')
    expect(captured).toMatchObject({ document: { root: { data: { childrenIds: ['heading', 'text', 'button'] } } } })
  })
  it('redacts transport errors and never retries', async () => {
    const render = vi.fn(async () => {
      throw new Error('private document contents')
    })
    await expect(clientFor(render).renderDocument(document)).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Email rendering is temporarily unavailable.' })
    expect(render).toHaveBeenCalledTimes(1)
  })
  it.each([null, {}, { ...reply, version: 2 }, { ...reply, environment: 'production' }, { ...reply, operation: 'customer-preview' }, { ...reply, private: 'secret' }, { ...reply, value: { html: '<p>Valid</p>', secret: 'private' } }, { ...reply, value: { html: 'x'.repeat(16 * 1024 * 1024) } }])('denies malformed or mismatched replies', async (response) => {
    await expect(clientFor(() => response).renderDocument(document)).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Email rendering is temporarily unavailable.' })
  })
  it.each([['INVALID_INPUT', 400], ['LIMIT_EXCEEDED', 413], ['UNAVAILABLE', 503]] as const)('maps only admitted %s errors', async (code, statusCode) => {
    const error = { version: 1, environment: 'staging', operation: 'document', ok: false, error: { code } }
    await expect(clientFor(() => error).renderDocument(document)).rejects.toMatchObject({ statusCode })
  })
  it('rejects oversized input before dispatch', async () => {
    const render = vi.fn(() => reply)
    await expect(clientFor(render).renderDocument(document, { subjectLine: 'x'.repeat(8 * 1024 * 1024) })).rejects.toMatchObject({ statusCode: 413 })
    expect(render).not.toHaveBeenCalled()
  })
  it('rejects invalid input before dispatch', async () => {
    const render = vi.fn(() => reply)
    await expect(clientFor(render).renderDocument(document, { variables: { bad: undefined } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(render).not.toHaveBeenCalled()
  })
})
