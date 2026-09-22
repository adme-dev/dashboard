import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  CollectionStagingUpgradeOperationSchema,
  collectionStagingUpgradeIdentity
} from '~~/shared/pageStudio/collection-staging-upgrade'
import { authorizePageStudioCollectionStagingUpgrade } from '~~/server/utils/pageStudio/collectionStagingUpgradeAuthority'

import fixture from './fixtures/collection-staging-upgrade-v1.json'

const intent = fixture.intent

describe('private collection upgrade contract and native admission', () => {
  it('matches the Studio operation identity independently of object ordering', async () => {
    const canonical = (v: unknown): string =>
      v && typeof v === 'object'
        ? Array.isArray(v)
          ? `[${v.map(canonical).join(',')}]`
          : `{${Object.keys(v)
            .sort()
            .map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
            .join(',')}}`
        : JSON.stringify(v)
    expect(CollectionStagingUpgradeOperationSchema.parse(intent)).toEqual(intent)
    expect(await collectionStagingUpgradeIdentity(intent)).toBe(fixture.identity)
    expect(await collectionStagingUpgradeIdentity(intent)).toBe(
      createHash('sha256').update(canonical(intent)).digest('hex')
    )
    expect(
      await collectionStagingUpgradeIdentity(Object.fromEntries(Object.entries(intent).reverse()))
    ).toBe(await collectionStagingUpgradeIdentity(intent))
  })
  it.each(['sourceDigest', 'targetDigest', 'policyVersion', 'accountId'])(
    'rejects unreviewed %s',
    (field) => {
      expect(
        CollectionStagingUpgradeOperationSchema.safeParse({ ...intent, [field]: 'unreviewed' })
          .success
      ).toBe(false)
    }
  )
  it('rejects supplied grants and ignores no unknown fields', () => {
    expect(
      CollectionStagingUpgradeOperationSchema.safeParse({ ...intent, approved: true }).success
    ).toBe(false)
    expect(
      CollectionStagingUpgradeOperationSchema.safeParse({
        ...intent,
        actor: { ...intent.actor, canEdit: true }
      }).success
    ).toBe(false)
  })
  it('denies wrong environment before reading native state', async () => {
    const read = vi.fn()
    await expect(
      authorizePageStudioCollectionStagingUpgrade(intent, 'production', { read })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(read).not.toHaveBeenCalled()
  })
  it('fails closed if the authority database is unavailable', async () => {
    const read = vi.fn().mockRejectedValue(new Error('private database details'))
    await expect(
      authorizePageStudioCollectionStagingUpgrade(intent, 'staging', { read })
    ).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'CMS staging upgrade authority unavailable'
    })
  })
})

it('admits only an exact retained workflow grant and current schema entitlement', async () => {
  const row = {
    plan_metadata: { builder: { collectionSchemas: true }, allowedModules: ['business-content'] },
    metadata: { intent, identity: fixture.identity },
    actor_id: intent.actor.userId,
    actor_role: 'agency'
  }
  const read = vi.fn(async () => [row])
  expect(await authorizePageStudioCollectionStagingUpgrade(intent, 'staging', { read })).toEqual(
    intent
  )
  expect(read.mock.calls[0]?.[0]).toContain('content.collection-staging-upgrade.requested')
  expect(read.mock.calls[0]?.[0]).toContain('content.collection-staging-upgrade.disabled')
  expect(read.mock.calls[0]?.[0]).toContain('clock_timestamp()')
  for (const invalid of [
    { ...row, metadata: { ...row.metadata, identity: 'forged' } },
    { ...row, actor_id: 'another' },
    { ...row, plan_metadata: { builder: { collectionSchemas: false } } },
    { ...row, metadata: { ...row.metadata, intent: { ...intent, collectionOperationId: 'other' } } }
  ]) {
    await expect(
      authorizePageStudioCollectionStagingUpgrade(intent, 'staging', {
        read: async () => [invalid]
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  }
  await expect(
    authorizePageStudioCollectionStagingUpgrade(intent, 'staging', { read: async () => [] })
  ).rejects.toMatchObject({ statusCode: 403 })
})
