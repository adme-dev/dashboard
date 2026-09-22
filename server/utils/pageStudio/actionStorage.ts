import { z } from 'zod'
import {
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import {
  BuilderArtifactPinSchema,
  CmsStorageTargetSchema,
  CmsObjectPinSchema,
  CmsPreparationSchema,
  CmsPreparationReceiptSchema,
  contentScopeKey,
  type CmsObjectPin
} from '~~/shared/pageStudio/cmsManaged'
import { BuilderActionResultPinSchema } from '~~/shared/pageStudio/actionInvocation'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import type { CmsPreparationReader } from './cmsCommits'

const encoder = new TextEncoder()
const stored = z
  .object({
    actorId: z.string(),
    body: z.unknown(),
    createdAt: z.string(),
    head: z.boolean(),
    pin: CmsObjectPinSchema,
    schema: CmsObjectPinSchema.nullable()
  })
  .strict()
/** Fixed private bindings only. Byte integrity is checked here; acceptance and
 * current actor authority remain the native coordinator's responsibility. */
export function createActionStorage(
  env: Record<string, unknown>,
  rawScope: unknown,
  rawTarget: unknown
) {
  const scope = PageStudioContentScopeSchema.parse(rawScope),
    target = CmsStorageTargetSchema.parse(rawTarget)
  const bucket = env.PAGE_STUDIO_CHECKPOINTS as
    PageStudioCheckpointBucket | undefined
  const service = env.PAGE_STUDIO_CONTENT_ROUTER as
    Record<string, (input: unknown) => Promise<unknown>> | undefined
  const call = async (method: string, input: unknown) => {
    if (typeof service?.[method] !== 'function')
      throw new Error('Action storage unavailable')
    return await service[method]!(input)
  }
  const assertTarget = async () => {
    const actual = CmsStorageTargetSchema.parse(
      await call('readManagedCmsTarget', { scope })
    )
    if (collectionCanonical(actual) !== collectionCanonical(target))
      throw new Error('Action storage target changed')
  }
  const exact = async (method: string, input: unknown) => {
    await assertTarget()
    const value = await call(method, input)
    await assertTarget()
    return value
  }
  let total = 0
  const readBytes = async (key: string, max: number) => {
    if (!bucket?.get) throw new Error('Action storage unavailable')
    const object = await bucket.get(key)
    if (!object) throw new Error('Action bytes unavailable')
    if (
      object.size !== undefined
      && (!Number.isSafeInteger(object.size)
        || object.size < 1
        || object.size > max)
    ) {
      await object.body.cancel().catch(() => {})
      throw new Error('Action bytes unavailable')
    }
    const reader = object.body.getReader(),
      chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        length += part.value.byteLength
        total += part.value.byteLength
        if (length > max || total > 2_000_000)
          throw new Error('Action byte budget exceeded')
        chunks.push(part.value)
      }
    } catch (error) {
      await reader.cancel().catch(() => {})
      throw error
    } finally {
      reader.releaseLock()
    }
    if (object.size !== undefined && object.size !== length)
      throw new Error('Action bytes truncated')
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const part of chunks) {
      bytes.set(part, offset)
      offset += part.byteLength
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  const scopeDigest = () =>
    collectionDigest(JSON.parse(contentScopeKey(scope)))
  const readStoredObject = async (raw: CmsObjectPin) => {
    const pin = CmsObjectPinSchema.parse(raw)
    const values = z
      .array(stored)
      .length(1)
      .parse(await exact('readManagedCmsObjects', { scope, pins: [pin] }))
    const value = values[0]!
    total += encoder.encode(collectionCanonical(value.body)).byteLength
    if (total > 2_000_000) throw new Error('Action byte budget exceeded')
    if (
      collectionCanonical(value.pin) !== collectionCanonical(pin)
      || (await collectionDigest(value.body)) !== pin.sha256
      || encoder.encode(collectionCanonical(value.body)).byteLength !== pin.bytes
    )
      throw new Error('Action object mismatch')
    return value
  }
  const readObject = async (pin: CmsObjectPin) =>
    (await readStoredObject(pin)).body
  const readPreparation: CmsPreparationReader = async (input) => {
    if (
      contentScopeKey(input.scope) !== contentScopeKey(scope)
      || collectionCanonical(input.target) !== collectionCanonical(target)
    )
      throw new Error('Action preparation scope mismatch')
    const operation = z
      .object({
        request: CmsPreparationSchema,
        receipt: CmsPreparationReceiptSchema
      })
      .strict()
      .parse(
        await exact('readManagedCmsOperation', {
          scope,
          operationId: input.operationId,
          requestDigest: input.requestDigest
        })
      )
    const { digest: receiptDigest, ...receiptBody } = operation.receipt
    total += encoder.encode(collectionCanonical(operation)).byteLength
    if (
      total > 2_000_000
      || receiptDigest !== input.receiptDigest
      || receiptDigest !== (await collectionDigest(receiptBody))
      || operation.receipt.requestDigest !== input.requestDigest
      || (await collectionDigest(operation.request)) !== input.requestDigest
      || operation.request.operationId !== input.operationId
      || operation.receipt.operationId !== input.operationId
      || contentScopeKey(operation.request.scope) !== contentScopeKey(scope)
      || contentScopeKey(operation.receipt.scope) !== contentScopeKey(scope)
      || operation.receipt.items.length !== operation.request.items.length
    )
      throw new Error('Action preparation mismatch')
    // A retained request/receipt is not evidence that its physical objects still
    // exist. Read every exact prepared pin before native visibility can commit.
    for (let index = 0; index < operation.receipt.items.length; index++) {
      const value = await readStoredObject(operation.receipt.items[index]!)
      const item = operation.request.items[index]!
      if (
        collectionCanonical(value.body) !== collectionCanonical(item.body)
        || collectionCanonical(value.schema)
        !== collectionCanonical(item.kind === 'record' ? item.schema : null)
        || value.actorId !== operation.request.actor.userId
        || value.createdAt !== operation.receipt.createdAt
        || value.head !== false
      )
        throw new Error('Action prepared object mismatch')
    }
    const pins = [
      ...new Map(
        operation.request.items.flatMap(item =>
          item.kind === 'record'
            ? [[collectionCanonical(item.schema), item.schema] as const]
            : []
        )
      ).values()
    ]
    const schemas = []
    for (const pin of pins)
      schemas.push({ pin, definition: await readObject(pin) })
    const freeze = await exact('readManagedCmsFreeze', { scope })
    return { ...operation, schemas, freeze }
  }
  return {
    readObject,
    readPreparation,
    readArtifact: async (raw: unknown) => {
      const pin = BuilderArtifactPinSchema.extend({ kind: z.literal('action') })
        .strict()
        .parse(raw)
      const key = `builder-artifacts/v1/${await scopeDigest()}/action/${pin.id}/${pin.version}/${pin.sha256}.json`
      const bytes = await readBytes(key, 262_144)
      const value: unknown = JSON.parse(bytes)
      if (
        collectionCanonical(value) !== bytes
        || (await collectionDigest(value)) !== pin.sha256
      )
        throw new Error('Action artifact mismatch')
      return bytes
    },
    readResult: async (key: string) => {
      BuilderActionResultPinSchema.shape.key.parse(key)
      if (!key.startsWith(`builder-action-results/v1/${await scopeDigest()}/`))
        throw new Error('Action result scope mismatch')
      return readBytes(key, 150_000)
    },
    prepare: async (raw: unknown) => {
      const request = CmsPreparationSchema.parse(raw)
      if (contentScopeKey(request.scope) !== contentScopeKey(scope))
        throw new Error('Action preparation scope mismatch')
      const receipt = CmsPreparationReceiptSchema.parse(
        await exact('prepareManagedCmsOperation', request)
      )
      const { digest, ...body } = receipt
      if (
        receipt.requestDigest !== (await collectionDigest(request))
        || digest !== (await collectionDigest(body))
        || receipt.operationId !== request.operationId
        || receipt.freezeDigest !== request.freezeDigest
        || contentScopeKey(receipt.scope) !== contentScopeKey(scope)
      )
        throw new Error('Action preparation receipt mismatch')
      return receipt
    }
  }
}
