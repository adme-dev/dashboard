import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  isDealerFeedCreatePath,
  isDealerFeedPreviewPath,
  registerGodModeDealerFeedMutationFamilies
} from '../../server/utils/feeds/godModeMutations'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../server/utils/godMode/featureGate'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'

function event(path: string) {
  const request = {
    method: 'POST',
    req: new Request(`https://app.xeroflow.test${path}`, { method: 'POST' }),
    body: { platform: 'google' },
    context: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    node: {
      req: { url: path, originalUrl: path, headers: { host: 'app.xeroflow.test' }, connection: {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(request, {
    actorUserId: '11111111-1111-4111-8111-111111111111',
    correlationId: '22222222-2222-4222-8222-222222222222',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `POST ${path}`,
    emergencyDisabled: false
  })
  return request
}

describe('Dealer Feed God mode mutation boundaries', () => {
  it('matches only the feed creation endpoint', () => {
    expect(isDealerFeedCreatePath(`/api/admin/dealer-feeds/${CLIENT_ID}`)).toBe(true)
    expect(isDealerFeedCreatePath(`/api/admin/dealer-feeds/${CLIENT_ID}/preview`)).toBe(false)
    expect(isDealerFeedCreatePath('/api/admin/dealer-feed-links')).toBe(false)
  })

  it('matches only the unpersisted inventory preview endpoint', () => {
    expect(isDealerFeedPreviewPath(`/api/admin/dealer-feeds/${CLIENT_ID}/preview`)).toBe(true)
    expect(isDealerFeedPreviewPath(`/api/admin/dealer-feeds/${CLIENT_ID}`)).toBe(false)
    expect(isDealerFeedPreviewPath('/api/admin/dealer-feeds/not/a/client/preview')).toBe(false)
  })

  it('admits read-only preview while requiring idempotency for provider creation', async () => {
    const unregister = registerGodModeDealerFeedMutationFamilies()
    try {
      await expect(prepareRegisteredGodModeMutation(
        event(`/api/admin/dealer-feeds/${CLIENT_ID}/preview`)
      )).resolves.toBeUndefined()

      await expect(prepareRegisteredGodModeMutation(
        event(`/api/admin/dealer-feeds/${CLIENT_ID}`)
      )).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: 'A stable Idempotency-Key header is required for God mode dealer feed creation'
      })
    } finally {
      unregister.forEach(dispose => dispose())
    }
  })
})
