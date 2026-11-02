/* eslint @typescript-eslint/no-explicit-any: off -- In-memory SQL adapter exercises transaction receipts without remote storage. */
import { describe, expect, it, vi } from 'vitest'
import { describeEmailAsset, publishEmailAsset, readPublishedEmailAsset, verifyDesignModuleAssets, type DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import { extractDesignModule } from '../../shared/emailRendering/designModules'
import type { DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { structuredDesign } from '../fixtures/email-design/structured'

const actorId = '10000000-0000-4000-8000-000000000002'
const assetId = '20000000-0000-4000-8000-000000000001'
const otherAsset = '20000000-0000-4000-8000-000000000002'
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
function harness() {
  let state = { rows: {
    [assetId]: { id: assetId, client_id: structuredDesign().scope.clientId, uploaded_by: actorId, r2_key: `banner-assets/${actorId}/30000000-0000-4000-8000-000000000001/image.png`, mime_type: 'image/png', file_size: png.length, email_publication: null },
    [otherAsset]: { id: otherAsset, client_id: null, uploaded_by: actorId, r2_key: `banner-assets/${actorId}/30000000-0000-4000-8000-000000000002/image.png`, mime_type: 'image/png', file_size: png.length, email_publication: null }
  } as Record<string, any>, receipts: {} as Record<string, any> }
  let bytes = png
  const db = { query: async (sql: string, p: unknown[] = []) => {
    const rows = (...items: unknown[]) => ({ rows: items })
    if (sql.includes('pg_advisory_xact_lock')) return rows()
    if (sql.startsWith('SELECT * FROM banner_assets')) return state.rows[String(p[0])] ? rows(state.rows[String(p[0])]) : rows()
    if (sql.startsWith('SELECT asset_id')) return state.receipts[String(p[1])] ? rows(state.receipts[String(p[1])]) : rows()
    if (sql.startsWith('UPDATE banner_assets')) {
      state.rows[String(p[0])].email_publication = JSON.parse(String(p[1]))

      return rows()
    }
    if (sql.startsWith('INSERT INTO email_asset_publication_receipts')) {
      state.receipts[String(p[1])] = { asset_id: p[2], payload_sha256: p[3], descriptor: JSON.parse(String(p[4])) }

      return rows()
    }
    throw new Error(`Unhandled SQL ${sql}`)
  } }
  const transaction: DesignTransaction = async (callback) => {
    const before = JSON.parse(JSON.stringify(state))
    try {
      return await callback(db)
    } catch (e) {
      state = before

      throw e
    }
  }
  const storage: DesignAssetStorage = {
    read: vi.fn(async () => bytes), url: async id => `https://app.test/registered/${id}`,
    identifyUrl: async url => url.startsWith('https://app.test/registered/') ? url.split('/').at(-1)! : null
  }
  const publisher = vi.fn(async (_scope: string | null) => {})
  const request = { version: 1 as const, operationId: crypto.randomUUID(), assetId }
  return { db, transaction, storage, publisher, request, get state() {
    return state
  }, changeBytes: (b: Uint8Array) => {
    bytes = b
  } }
}
describe('registered scoped media publication', () => {
  it('derives byte digest, sniffed MIME and dimensions; never accepts a client manifest', async () => {
    const result = await describeEmailAsset(assetId, png)
    expect(result).toMatchObject({ id: assetId, mimeType: 'image/png', bytes: png.length, width: 1, height: 1 })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    for (const bytes of [new Uint8Array(), new TextEncoder().encode('http://external/image.png'), new TextEncoder().encode('<svg/>')]) await expect(describeEmailAsset(assetId, bytes)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    const h = harness()
    await expect(publishEmailAsset({ ...h.request, manifest: result }, actorId, h.publisher, h.storage, h.transaction)).rejects.toThrow()
  })
  it('atomically publishes in existing media row with deterministic receipt and independently rechecked publisher scope', async () => {
    const h = harness()
    const result = await publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)
    expect(h.state.rows[assetId].email_publication).toEqual(result.asset)
    expect(h.publisher).toHaveBeenCalledTimes(2)
    expect(h.publisher).toHaveBeenCalledWith(structuredDesign().scope.clientId)
    expect(await publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)).toEqual(result)
    expect(h.storage.read).toHaveBeenCalledTimes(1)
    await expect(publishEmailAsset({ ...h.request, assetId: otherAsset }, actorId, h.publisher, h.storage, h.transaction)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  it('reconciles unknown committed outcome using the same receipt and prevents post-verification revocation', async () => {
    const h = harness()
    const loseReply: DesignTransaction = async (callback) => {
      await h.transaction(callback)
      throw new Error('unknown ack')
    }
    await expect(publishEmailAsset(h.request, actorId, h.publisher, h.storage, loseReply)).rejects.toThrow('unknown ack')
    expect((await publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)).asset).toEqual(h.state.rows[assetId].email_publication)
    h.publisher.mockRejectedValueOnce(new Error('access revoked'))
    await expect(publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)).rejects.toThrow('access revoked')
    const fresh = harness()
    fresh.publisher.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('revoked after storage read'))
    await expect(publishEmailAsset(fresh.request, actorId, fresh.publisher, fresh.storage, fresh.transaction)).rejects.toThrow('revoked after storage read')
    expect(fresh.state.rows[assetId].email_publication).toBeNull()
    expect(Object.keys(fresh.state.receipts)).toHaveLength(0)
  })
  it('fails closed on unknown ownership, foreign scope, missing publication, MIME metadata, bytes or storage', async () => {
    const h = harness()
    await expect(readPublishedEmailAsset(assetId, structuredDesign().scope.clientId, h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    h.state.rows[assetId].r2_key = 'arbitrary/public/image.png'
    await expect(publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    h.state.rows[assetId].r2_key = `banner-assets/${actorId}/30000000-0000-4000-8000-000000000001/image.png`
    h.state.rows[assetId].mime_type = 'image/jpeg'
    await expect(publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    h.state.rows[assetId].mime_type = 'image/png'
    await publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)
    await expect(readPublishedEmailAsset(assetId, crypto.randomUUID(), h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
    const changed = Uint8Array.from(png)

    changed[changed.length - 1] ^= 1

    h.changeBytes(changed)
    await expect(readPublishedEmailAsset(assetId, structuredDesign().scope.clientId, h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
  })
  it('authorises image references through registered verified scoped rows and rejects arbitrary URL/artifact authority', async () => {
    const h = harness(), module = extractDesignModule(structuredDesign(), ['heading'], [], [])
    const published = await publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)
    module.blocks.heading = { type: 'Image', data: { props: { url: await h.storage.url(assetId) } } }

    module.policy.editableFields = []
    expect(await verifyDesignModuleAssets(module, h.db, h.publisher, h.storage)).toEqual([published.asset])
    for (const url of ['https://arbitrary.test/image.png', 'blob:untrusted', 'asset://native-image']) {
      module.blocks.heading.data.props!.url = url
      await expect(verifyDesignModuleAssets(module, h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    }
    module.blocks.heading = { type: 'Html', data: { props: { html: '<img src="https://external/image.png">' } } }
    await expect(verifyDesignModuleAssets(module, h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
  })
  it('verifies dark variants independently with exact scoped immutable descriptors', async () => {
    const h = harness(), module = extractDesignModule(structuredDesign(), ['heading'], [], [])
    const light = await publishEmailAsset(h.request, actorId, h.publisher, h.storage, h.transaction)
    const dark = await publishEmailAsset({ ...h.request, operationId: crypto.randomUUID(), assetId: otherAsset }, actorId, h.publisher, h.storage, h.transaction)
    module.blocks.heading = { type: 'Image', data: { props: { url: await h.storage.url(assetId), darkSrc: await h.storage.url(otherAsset) } } }
    module.policy.editableFields = []
    const before = JSON.stringify(module)
    expect(await verifyDesignModuleAssets(module, h.db, h.publisher, h.storage)).toEqual([light.asset, dark.asset])
    expect(JSON.stringify(module)).toBe(before)
    module.blocks.heading.data.props!.darkSrc = 'https://unknown.test/dark.png'
    await expect(verifyDesignModuleAssets(module, h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    module.blocks.heading.data.props!.darkSrc = await h.storage.url(otherAsset)
    h.state.rows[otherAsset].client_id = crypto.randomUUID()
    await expect(verifyDesignModuleAssets(module, h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
    h.state.rows[otherAsset].client_id = null
    const originalDigest = h.state.rows[otherAsset].email_publication.sha256
    h.state.rows[otherAsset].email_publication.sha256 = '0'.repeat(64)
    await expect(verifyDesignModuleAssets(module, h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    h.state.rows[otherAsset].email_publication.sha256 = originalDigest
    const changed = Uint8Array.from(png)
    changed[changed.length - 1] ^= 1
    h.storage.read = vi.fn(async key => key === h.state.rows[otherAsset].r2_key ? changed : png)
    await expect(verifyDesignModuleAssets(module, h.db, h.publisher, h.storage)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
  })
})
