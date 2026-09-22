import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { z } from 'zod'
import {
  CmsStorageTargetSchema,
  BuilderArtifactPinSchema,
  contentScopeKey,
  type CmsAdoptionIntent
} from '~~/shared/pageStudio/cmsManaged'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  loadPageStudioCheckpoint,
  type PageStudioCheckpointBucket
} from '~~/shared/pageStudio/checkpointReader'
import type { CmsAdoptionGraphReaders, CmsInventoryReaders } from './cmsAdoption'

/** Actual private binding/R2 adapters. These return bytes, never approval. */
export function createCmsAdoptionStorage(
  env: Record<string, unknown>,
  intent: CmsAdoptionIntent,
  checkpoint: { id: string, digest: string, object_key: string } | null
) {
  const service = env.PAGE_STUDIO_CONTENT_ROUTER as Record<
    string,
    (input: unknown) => Promise<unknown>
  >
  const call = async (name: string, input: unknown) => {
    if (typeof service?.[name] !== 'function')
      throw new Error('CMS adoption private transport unavailable')
    return await service[name]!(input)
  }
  const assertTarget = async () => {
    const actual = CmsStorageTargetSchema.parse(
      await call('readManagedCmsTarget', { scope: intent.scope })
    )
    if (collectionCanonical(actual) !== collectionCanonical(intent.target))
      throw new Error('CMS adoption target changed; explicit reconciliation required')
  }
  const exact = async (name: string, input: unknown) => {
    await assertTarget()
    const result = await call(name, input)
    await assertTarget()
    return result
  }
  const inventory: CmsInventoryReaders = {
    readPage: ({ target: _target, ...input }) => exact('readFrozenCmsPage', input),
    readSchemas: ({ target: _target, ...input }) => exact('readManagedCmsObjects', input)
  }
  const bucket = env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
  const cache = new Map<string, unknown>()
  let total = 0
  const graph: CmsAdoptionGraphReaders = {
    readCheckpoint: async () => {
      await assertTarget()
      if (
        !bucket?.get
        || !checkpoint
        || checkpoint.id !== intent.expectedCheckpoint.id
        || checkpoint.digest !== intent.expectedCheckpoint.digest
      )
        throw new Error('CMS adoption checkpoint unavailable')
      const result = await loadPageStudioCheckpoint({
        scope: { ...intent.scope, siteId: intent.scope.siteId },
        bucket,
        checkpointId: checkpoint.id,
        objectKey: checkpoint.object_key,
        digests: [checkpoint.digest, intent.expectedCheckpoint.digest]
      })
      await assertTarget()
      return result
    },
    readComponent: async (scope, rawPin) => {
      const pin = BuilderArtifactPinSchema.extend({ kind: z.literal('component') }).parse(rawPin)
      if (contentScopeKey(scope) !== contentScopeKey(intent.scope) || !bucket?.get)
        throw new Error('CMS adoption component scope denied')
      const key = `builder-artifacts/v1/${await cryptoDigest(contentScopeKey(scope))}/component/${pin.id}/${pin.version}/${pin.sha256}.json`
      if (cache.has(key)) return cache.get(key)
      const object = await bucket.get(key)
      if (!object || (object.size !== undefined && (object.size < 1 || object.size > 262_144)))
        throw new Error('CMS adoption component unavailable')
      const reader = object.body.getReader(),
        chunks: Uint8Array[] = []
      let bytes = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          bytes += part.value.byteLength
          total += part.value.byteLength
          if (bytes > 262_144 || total > 2_000_000)
            throw new Error('CMS adoption component byte budget exceeded')
          chunks.push(part.value)
        }
      } catch (error) {
        await reader.cancel().catch(() => {})
        throw error
      } finally {
        reader.releaseLock()
      }
      if (object.size !== undefined && object.size !== bytes)
        throw new Error('CMS adoption component truncated')
      const joined = new Uint8Array(bytes)
      let offset = 0
      for (const chunk of chunks) {
        joined.set(chunk, offset)
        offset += chunk.byteLength
      }
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(joined)
      if ((await cryptoDigest(raw)) !== pin.sha256)
        throw new Error('CMS adoption component digest mismatch')
      const value: unknown = JSON.parse(raw)
      assertBoundedStructure(value)
      if (collectionCanonical(value) !== raw || (await collectionDigest(value)) !== pin.sha256)
        throw new Error('CMS adoption component canonical mismatch')
      await assertTarget()
      const identity = z
        .object({
          kind: z.literal('component'),
          id: z.string(),
          version: z.number(),
          scope: PageStudioContentScopeSchema
        })
        .passthrough()
        .parse(value)
      if (
        identity.id !== pin.id
        || identity.version !== pin.version
        || contentScopeKey(identity.scope) !== contentScopeKey(scope)
      )
        throw new Error('CMS adoption component identity mismatch')
      cache.set(key, value)
      return value
    }
  }
  return {
    assertTarget,
    inventory,
    graph,
    freeze: () =>
      call('freezeManagedCms', {
        formatVersion: 1,
        scope: intent.scope,
        actor: intent.actor,
        target: intent.target,
        adoptionId: intent.adoptionId
      }),
    readFreeze: () => exact('readManagedCmsFreeze', { scope: intent.scope })
  }
}
async function cryptoDigest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Same JSON safety envelope as Studio builder-json, before recursive hashing.
function assertBoundedStructure(value: unknown) {
  const pending = [{ depth: 0, value }]
  let count = 0
  while (pending.length) {
    const current = pending.pop()!
    if (++count > 16_384 || current.depth > 32)
      throw new Error('CMS adoption component structural limit exceeded')
    if (current.value && typeof current.value === 'object') {
      for (const [key, child] of Object.entries(current.value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
          throw new Error('CMS adoption component reserved JSON key')
        pending.push({ depth: current.depth + 1, value: child })
      }
    }
  }
}
