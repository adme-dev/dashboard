import { createError, getHeader, getRequestWebStream, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import type { PageStudioControlQueryClient } from './controlStore'
import { ImageCreditError } from './imageCredits'
import { readImagePaymentConfig, ImageCreditPackSchema } from './imagePaymentConfig'
import { verifyImagePaymentEvent } from './imagePaymentProvider'
import { retrieveImagePaymentSnapshot } from './imagePaymentSnapshot'
import { observeImagePayment, type ImagePurchase } from './imagePayments'

async function readRawPayment(event: H3Event) {
  if (!/^application\/json(?:\s*;|$)/i.test(getHeader(event, 'content-type') ?? '')) throw createError({ statusCode: 415, statusMessage: 'Payment webhook must be JSON' })
  const limit = 262_144
  const tooLarge = () => createError({ statusCode: 413, statusMessage: 'Payment payload exceeds the size limit' })
  if (Number(getHeader(event, 'content-length')) > limit) throw tooLarge()
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: 'Payment body is required' })
  const reader = stream.getReader(), bytes = new Uint8Array(limit)
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      const value = typeof part.value === 'string' ? new TextEncoder().encode(part.value) : part.value
      if (!(value instanceof Uint8Array)) throw createError({ statusCode: 400, statusMessage: 'Invalid payment body' })
      if (size + value.byteLength > limit) {
        await reader.cancel()
        throw tooLarge()
      }
      bytes.set(value, size)
      size += value.byteLength
    }
  } finally { reader.releaseLock() }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payment body encoding' })
  }
}

export async function handleImagePaymentWebhook(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  // Parse neither JSON nor authority from the body until SDK verification.
  const raw = await readRawPayment(event)
  try {
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
    const config = readImagePaymentConfig(env)
    const verified = await verifyImagePaymentEvent(config, raw, getHeader(event, 'stripe-signature') ?? '')
    const existing = await queryOneFresh<{ fingerprint: string }>('SELECT fingerprint FROM page_studio_image_payment_events WHERE account_id=$1 AND event_id=$2', [config.accountId, verified.event.id])
    if (existing) {
      if (existing.fingerprint !== verified.fingerprint) throw new ImageCreditError('IMAGE_PAYMENT_EVENT_CONFLICT', 409, 'Payment event identity conflicts with its saved receipt')
      return { received: true }
    }
    const snapshot = await retrieveImagePaymentSnapshot(config, verified, async (id) => {
      const intentId = z.string().uuid().parse(id)
      const row = await queryOneFresh<ImagePurchase>('SELECT * FROM page_studio_image_purchases WHERE intent_id=$1 AND account_id=$2 AND environment=\'staging\'', [intentId, config.accountId])
      if (!row) throw new ImageCreditError('IMAGE_PAYMENT_PURCHASE_PENDING', 503, 'Payment purchase identity is not available yet')
      row.pack = ImageCreditPackSchema.parse(row.pack)
      return row
    })
    if (snapshot) {
      await transactionWithoutRetry(db => observeImagePayment(db as unknown as PageStudioControlQueryClient, snapshot.scope, snapshot.intentId, snapshot.observation))
    }
    return { received: true }
  } catch (error) {
    if (error instanceof ImageCreditError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    // No provider body, card/customer fields, credentials or raw payload in errors.
    throw createError({ statusCode: 502, statusMessage: 'Payment verification could not be completed. Retry this event.' })
  }
}
