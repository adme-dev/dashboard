import { createMeasurementWorkerDatabase } from './db'
import { createMeasurementDeliveryProcessor } from './delivery'
import type { MeasurementDeliveryMessage } from './delivery'
import { retrieveGoogleDataManagerRequestStatus } from './diagnostics'
import { createMeasurementDiagnosticReconciler } from './diagnosticReconciler'
import { createMeasurementDiagnosticRepository } from './diagnosticRepository'
import {
  deliverGoogleDataManagerEvent,
  deliverMetaConversionEvent,
  deliverTikTokEvent,
  refreshGoogleDataManagerAccessToken
} from './providers'
import { createMeasurementDeliveryRepository } from './repository'
import { resolveMeasurementProviderCredential } from './credential'

interface Env {
  HYPERDRIVE: { connectionString: string }
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  META_GRAPH_API_VERSION: string
  WORKER_ID_PREFIX: string
  [key: string]: unknown
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseMessage(value: unknown): MeasurementDeliveryMessage {
  if (!value || typeof value !== 'object') throw new Error('Invalid measurement queue message')
  const message = value as Record<string, unknown>
  if (
    message.schemaVersion !== 1
    || typeof message.clientId !== 'string'
    || !UUID.test(message.clientId)
    || typeof message.eventId !== 'string'
    || !UUID.test(message.eventId)
    || typeof message.enqueuedAt !== 'string'
    || !Number.isFinite(new Date(message.enqueuedAt).getTime())
  ) {
    throw new Error('Invalid measurement queue message')
  }
  return {
    schemaVersion: 1,
    clientId: message.clientId,
    eventId: message.eventId,
    enqueuedAt: message.enqueuedAt
  }
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 255) : 'unknown'
}

export default {
  async queue(
    batch: MessageBatch<unknown>,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const database = createMeasurementWorkerDatabase(env.HYPERDRIVE.connectionString)
    const repository = createMeasurementDeliveryRepository(database)
    const processor = createMeasurementDeliveryProcessor({
      repository,
      deliverMeta: deliverMetaConversionEvent,
      deliverGoogle: deliverGoogleDataManagerEvent,
      deliverTikTok: deliverTikTokEvent,
      refreshGoogleAccessToken: refreshGoogleDataManagerAccessToken,
      resolveProviderCredential: credentialRef => resolveMeasurementProviderCredential(
        env,
        credentialRef
      ),
      workerId: () => `${env.WORKER_ID_PREFIX}:${crypto.randomUUID()}`,
      now: () => new Date(),
      metaGraphApiVersion: env.META_GRAPH_API_VERSION,
      googleClientId: env.GOOGLE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_CLIENT_SECRET,
      fetch: globalThis.fetch.bind(globalThis)
    })

    try {
      for (const message of batch.messages) {
        let parsed: MeasurementDeliveryMessage | null = null
        try {
          parsed = parseMessage(message.body)
          const result = await processor.process(parsed)
          console.log({
            event: 'measurement_delivery_processed',
            eventId: parsed.eventId,
            ...result
          })
          message.ack()
        } catch (error) {
          console.warn({
            event: 'measurement_delivery_worker_failed',
            eventId: parsed?.eventId ?? null,
            errorClass: errorClass(error)
          })
          message.retry({ delaySeconds: 30 })
        }
      }
    } finally {
      await database.close()
    }
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const database = createMeasurementWorkerDatabase(env.HYPERDRIVE.connectionString)
    const repository = createMeasurementDiagnosticRepository(database)
    const reconciler = createMeasurementDiagnosticReconciler({
      repository,
      retrieve: retrieveGoogleDataManagerRequestStatus,
      refreshGoogleAccessToken: refreshGoogleDataManagerAccessToken,
      workerId: () => `${env.WORKER_ID_PREFIX}:diagnostics:${crypto.randomUUID()}`,
      now: () => new Date(),
      random: Math.random,
      googleClientId: env.GOOGLE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_CLIENT_SECRET,
      fetch: globalThis.fetch.bind(globalThis)
    })

    try {
      const result = await reconciler.reconcile()
      console.log({ event: 'measurement_diagnostics_reconciled', ...result })
    } catch (error) {
      console.warn({
        event: 'measurement_diagnostics_failed',
        errorClass: errorClass(error)
      })
      throw error
    } finally {
      await database.close()
    }
  }
}
