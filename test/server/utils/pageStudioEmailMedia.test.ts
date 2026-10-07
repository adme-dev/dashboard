import { describe, expect, it, vi } from 'vitest'
import { resolveEmailTemplateMedia } from '../../../server/utils/pageStudio/emailTemplateMedia'
import { EmailTemplateSchema, starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'
import { renderCustomerEmailPreview } from '../../../workers/email-rendering/src/customerPreview'
import type { ContentAuthorityRequest } from '../../../server/utils/pageStudio/businessContent'

const id = '10000000-0000-4000-8000-000000000001'
const template = { ...starterEmailTemplate('customer'), blocks: [{ id: 'photo', type: 'image' as const, assetId: id, alt: 'A limousine', width: 520, alignment: 'center' as const }] }
const request = { siteId: 'site', actor: { role: 'client', actorId: 'user', clientId: 'client' }, login: { tokenHash: 'hash' }, env: {} } as ContentAuthorityRequest
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const image = (bytes = png, size = bytes.length) => ({ mediaType: 'image/png', size, body: new ReadableStream<Uint8Array>({ start(c) {
  c.enqueue(bytes)
  c.close()
} }) })
describe('customer email media', () => {
  it('accepts bounded asset references, rejecting arbitrary URLs, SVG and invalid sizing', () => {
    expect(EmailTemplateSchema.safeParse(template).success).toBe(true)
    for (const changes of [{ assetId: 'https://foreign.test/a.png' }, { url: 'data:image/svg+xml,bad' }, { width: 0 }, { width: 601 }, { alignment: 'unsafe' }]) expect(EmailTemplateSchema.safeParse({ ...template, blocks: [{ ...template.blocks[0], ...changes }] }).success).toBe(false)
    expect(EmailTemplateSchema.safeParse({ ...template, blocks: Array.from({ length: 7 }, (_, i) => ({ ...template.blocks[0], id: `image_${i}` })) }).success).toBe(false)
  })
  it('uses the authenticated customer media reader and embeds only validated raster bytes', async () => {
    const read = vi.fn().mockImplementation(async () => image())
    const result = await resolveEmailTemplateMedia(request, template, { read })
    expect(read.mock.calls[0]?.slice(0, 2)).toEqual([{ siteId: 'site', clientId: 'client', userId: 'user', tokenHash: 'hash' }, id])
    expect(result.images[id]).toMatch(/^data:image\/png;base64,/)
    expect(result.warnings).toEqual([])
    const preview = renderCustomerEmailPreview(template, { siteName: 'Demo', formName: 'Booking', fields: [], images: result.images })
    expect(preview.html).toContain('data:image/png;base64,')
    expect(preview.html).toContain('width="520"')
    expect(preview.html).toContain('alt="A limousine"')
    expect(preview.html).toContain('img-src data:')
    expect(preview.html).not.toContain('src="https:')
  })
  it('shows an unavailable placeholder for missing or archived assets and never falls back to external URLs', async () => {
    const result = await resolveEmailTemplateMedia(request, template, { read: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    expect(Object.keys(result.images)).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    const preview = renderCustomerEmailPreview(template, { siteName: 'Demo', formName: 'Booking', fields: [] })
    expect(preview.html).toContain('Image unavailable')
    expect(preview.html).not.toContain('<img')
  })
  it('rejects forged MIME, oversized streams and enforces aggregate rendered-image size even for repeated assets', async () => {
    for (const bad of [image(new TextEncoder().encode('<svg></svg>')), image(new Uint8Array(600_000), 1)]) {
      const result = await resolveEmailTemplateMedia(request, template, { read: vi.fn().mockResolvedValue(bad) })
      expect(result.warnings).toHaveLength(1)
      expect(result.images[id]).toBeUndefined()
    }
    const bytes = new Uint8Array(500_000)
    bytes.set(png)
    const repeated = { ...template, blocks: Array.from({ length: 5 }, (_, i) => ({ ...template.blocks[0], id: `image_${i}` })) }
    const result = await resolveEmailTemplateMedia(request, repeated, { read: vi.fn().mockImplementation(async () => image(bytes)) })
    expect(result.warnings).toHaveLength(1)
    expect(result.images[id]).toBeUndefined()
  })
  it('does not swallow authorization or infrastructure failures as a missing image', async () => {
    for (const statusCode of [401, 403, 503]) await expect(resolveEmailTemplateMedia(request, template, { read: vi.fn().mockRejectedValue({ statusCode }) })).rejects.toMatchObject({ statusCode })
  })
})

it('escapes image alt text and refuses unsafe render-context sources', () => {
  const unsafeAlt = { ...template, blocks: [{ ...template.blocks[0], alt: '" onerror="alert(1)' }] }
  const preview = renderCustomerEmailPreview(unsafeAlt, { siteName: 'Demo', formName: 'Booking', fields: [], images: { [id]: 'data:image/png;base64,iVBORw0KGgo=' } })
  expect(preview.html).toContain('alt="&quot; onerror=&quot;alert(1)"')
  expect(preview.html).not.toContain('alt="" onerror=')
  for (const source of ['https://evil.test/photo.png', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    expect(renderCustomerEmailPreview(template, { siteName: 'Demo', formName: 'Booking', fields: [], images: { [id]: source } }).html).not.toContain('<img')
  }
})
