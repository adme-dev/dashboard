import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { CollectionUpgradeOperationSchema, collectionUpgradeIdentity } from '~~/shared/pageStudio/collection-upgrade'
import { authorizePageStudioCollectionUpgrade } from '~~/server/utils/pageStudio/collectionUpgradeAuthority'

import fixture from './fixtures/collection-upgrade-v1.json'

const intent = fixture.intent

describe('private collection upgrade contract and native admission', () => {
  it('matches the Studio operation identity independently of object ordering', async () => {
    const canonical = (v: unknown): string => v && typeof v === 'object'
      ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
      : JSON.stringify(v)
    expect(CollectionUpgradeOperationSchema.parse(intent)).toEqual(intent)
    expect(await collectionUpgradeIdentity(intent)).toBe(fixture.identity)
    expect(await collectionUpgradeIdentity(intent)).toBe(createHash('sha256').update(canonical(intent)).digest('hex'))
    expect(await collectionUpgradeIdentity(Object.fromEntries(Object.entries(intent).reverse()))).toBe(await collectionUpgradeIdentity(intent))
  })
  it.each(['sourceDigest', 'targetDigest', 'policyVersion', 'accountId'])('rejects unreviewed %s', (field) => {
    expect(CollectionUpgradeOperationSchema.safeParse({ ...intent, [field]: 'unreviewed' }).success).toBe(false)
  })
  it('rejects supplied grants and ignores no unknown fields', () => {
    expect(CollectionUpgradeOperationSchema.safeParse({ ...intent, approved: true }).success).toBe(false)
    expect(CollectionUpgradeOperationSchema.safeParse({ ...intent, actor: { ...intent.actor, canEdit: true } }).success).toBe(false)
  })
  it('denies wrong environment before reading native state', async () => {
    const read = vi.fn()
    await expect(authorizePageStudioCollectionUpgrade(intent, 'production', { read })).rejects.toMatchObject({ statusCode: 403 })
    expect(read).not.toHaveBeenCalled()
  })
  it('fails closed if the authority database is unavailable', async () => {
    const read = vi.fn().mockRejectedValue(new Error('private database details'))
    await expect(authorizePageStudioCollectionUpgrade(intent, 'staging', { read })).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Collection upgrade authority unavailable' })
  })
})
