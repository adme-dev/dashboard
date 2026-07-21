import {
  R2ObjectCreateEventSchema,
  SendScanQueueMessageSchema
} from '../../../shared/types/sendScan'
import type { SendScanProcessResult } from '../../../server/utils/send/scanning'

export interface SendScanQueueMessageLike {
  id: string
  attempts: number
  body: unknown
  ack(): void
  retry(options?: { delaySeconds: number }): void
}

export interface SendScanQueueLog extends Record<string, unknown> {
  event: 'send_scan_message_ignored' | 'send_scan_message_completed' | 'send_scan_message_retried' | 'send_scan_message_failed'
  messageId: string
  attempt: number
  durationMs: number
}

export interface SendScanQueueHandlerDeps {
  expectedAccountId: string
  expectedBucket: string
  findJobForObject(objectKey: string): Promise<string | null>
  processJob(input: { jobId: string, now: Date }): Promise<SendScanProcessResult>
  log(event: SendScanQueueLog): void
  now(): Date
}

const SEND_OBJECT_KEY = /^send\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function boundedDelaySeconds(value: number): number {
  if (!Number.isFinite(value)) return 30
  return Math.max(1, Math.min(43_200, Math.ceil(value)))
}

function ignoreMessage(
  message: SendScanQueueMessageLike,
  deps: SendScanQueueHandlerDeps,
  reasonCode: string,
  startedAt: number
): void {
  deps.log({
    event: 'send_scan_message_ignored',
    messageId: message.id,
    attempt: message.attempts,
    reasonCode,
    durationMs: Date.now() - startedAt
  })
  message.ack()
}

export function createSendScanQueueHandler(deps: SendScanQueueHandlerDeps) {
  return async function handleSendScanQueueMessage(message: SendScanQueueMessageLike): Promise<void> {
    const startedAt = Date.now()
    try {
      const replay = SendScanQueueMessageSchema.safeParse(message.body)
      let jobId: string | null = replay.success ? replay.data.jobId : null

      if (!jobId) {
        const event = R2ObjectCreateEventSchema.safeParse(message.body)
        if (!event.success) {
          ignoreMessage(message, deps, 'INVALID_MESSAGE', startedAt)
          return
        }
        if (event.data.account !== deps.expectedAccountId) {
          ignoreMessage(message, deps, 'ACCOUNT_MISMATCH', startedAt)
          return
        }
        if (event.data.bucket !== deps.expectedBucket) {
          ignoreMessage(message, deps, 'BUCKET_MISMATCH', startedAt)
          return
        }
        if (!SEND_OBJECT_KEY.test(event.data.object.key)) {
          ignoreMessage(message, deps, 'OBJECT_KEY_INVALID', startedAt)
          return
        }

        jobId = await deps.findJobForObject(event.data.object.key)
        if (!jobId) {
          message.retry({ delaySeconds: 30 })
          deps.log({
            event: 'send_scan_message_retried',
            messageId: message.id,
            attempt: message.attempts,
            reasonCode: 'CANONICAL_JOB_NOT_FOUND',
            delaySeconds: 30,
            durationMs: Date.now() - startedAt
          })
          return
        }
      }

      const result = await deps.processJob({ jobId, now: deps.now() })
      if (result.action === 'retry') {
        const delaySeconds = boundedDelaySeconds(result.delaySeconds)
        message.retry({ delaySeconds })
        deps.log({
          event: 'send_scan_message_retried',
          messageId: message.id,
          attempt: message.attempts,
          outcome: result.outcome,
          delaySeconds,
          durationMs: Date.now() - startedAt
        })
        return
      }
      message.ack()
      deps.log({
        event: 'send_scan_message_completed',
        messageId: message.id,
        attempt: message.attempts,
        outcome: result.outcome,
        durationMs: Date.now() - startedAt
      })
    } catch {
      deps.log({
        event: 'send_scan_message_failed',
        messageId: message.id,
        attempt: message.attempts,
        reasonCode: 'UNEXPECTED_FAILURE',
        durationMs: Date.now() - startedAt
      })
      message.retry({ delaySeconds: 30 })
    }
  }
}
