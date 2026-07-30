import { describe, expect, it, vi } from 'vitest'
import { deliverCrmInboundEmail } from '../../workers/email-worker/src/crmAdapter'
import type { CrmInboundArtifactManifest } from '../../workers/email-worker/src/r2Artifacts'

const SIGNED_TOKEN = `v2.${'A'.repeat(32)}.${'B'.repeat(43)}`
const manifest: CrmInboundArtifactManifest = {
  rawMimeR2Key:
    'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111/message.eml',
  rawMimeSha256: 'c'.repeat(64),
  rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
  attachments: [{
    r2ObjectKey:
      'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111/attachments/01.bin',
    filename: 'Customer Contract.pdf',
    contentType: 'application/pdf',
    byteSize: 1024,
    sha256: 'd'.repeat(64),
    contentId: null
  }]
}

describe('CRM inbound email Nitro adapter', () => {
  it.each([
    ['lead', 'lead_inbox', `lead+${SIGNED_TOKEN}@mail.xeroflow.io`],
    [
      'crm_reply',
      'conversation_reply',
      `reply+${SIGNED_TOKEN}@reply.xeroflow.io`
    ]
  ] as const)(
    'maps %s routes to the authenticated B4 boundary',
    async (workerKind, routeKind, recipient) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 202 })
      )

      await expect(deliverCrmInboundEmail({
        route: { kind: workerKind, token: SIGNED_TOKEN },
        recipient,
        messageId: '<provider-message@example.net>',
        manifest,
        receivedAt: '2026-07-30T05:30:00.000Z',
        apiUrl: 'https://app.xeroflow.io/',
        workerSecret: 'worker-secret'
      }, { fetch })).resolves.toEqual({
        accepted: true,
        status: 202
      })

      expect(fetch).toHaveBeenCalledOnce()
      const [url, init] = fetch.mock.calls[0]!
      expect(url).toBe(
        'https://app.xeroflow.io/api/internal/crm-email/inbound'
      )
      expect(init).toMatchObject({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-crm-email-secret': 'worker-secret'
        }
      })
      expect(JSON.parse(init.body)).toEqual({
        routeKind,
        routeToken: SIGNED_TOKEN,
        recipientDomain: recipient.split('@')[1],
        providerMessageId: '<provider-message@example.net>',
        ...manifest,
        receivedAt: '2026-07-30T05:30:00.000Z'
      })
    }
  )

  it('uses the raw MIME checksum when Message-ID is absent', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 202 })
    )

    await deliverCrmInboundEmail({
      route: { kind: 'lead', token: SIGNED_TOKEN },
      recipient: `lead+${SIGNED_TOKEN}@mail.xeroflow.io`,
      messageId: null,
      manifest,
      receivedAt: '2026-07-30T05:30:00.000Z',
      apiUrl: 'https://app.xeroflow.io',
      workerSecret: 'worker-secret'
    }, { fetch })

    const body = JSON.parse(fetch.mock.calls[0]![1].body)
    expect(body.providerMessageId).toBe(
      `sha256:${manifest.rawMimeSha256}`
    )
  })

  it('returns downstream status without reading its response body', async () => {
    const response = new Response('sensitive downstream detail', {
      status: 404
    })
    const text = vi.spyOn(response, 'text')
    const fetch = vi.fn().mockResolvedValue(response)

    await expect(deliverCrmInboundEmail({
      route: { kind: 'crm_reply', token: SIGNED_TOKEN },
      recipient: `reply+${SIGNED_TOKEN}@reply.xeroflow.io`,
      messageId: '<provider-message@example.net>',
      manifest,
      receivedAt: '2026-07-30T05:30:00.000Z',
      apiUrl: 'https://app.xeroflow.io',
      workerSecret: 'worker-secret'
    }, { fetch })).resolves.toEqual({
      accepted: false,
      status: 404
    })

    expect(text).not.toHaveBeenCalled()
  })
})
