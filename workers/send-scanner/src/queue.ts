import {
  R2ObjectCreateEventSchema,
  SendScanQueueMessageSchema
} from '../../../shared/types/sendScan'
import type { SendScanProcessResult } from '../../../server/utils/send/scanning'

interface SendScanQueueMessageLike {
  id: string
  body: unknown
  ack(): void
  retry(options?: { delaySeconds: number }): void
}

export interface SendScanQueueHandlerDeps {
  expectedAccountId: string
  expectedBucket: string
  findJobForObject(objectKey: string): Promise<string | null>
  processJob(input: { jobId: string, now: Date }): Promise<SendScanProcessResult>
  log(event: Record<string, unknown>): void
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
  reasonCode: string
): void {
  deps.log({
    event: 'send_scan_message_ignored',
    messageId: message.id,
    reasonCode
  })
  message.ack()
}

export function createSendScanQueueHandler(deps: SendScanQueueHandlerDeps) {
  return async function handleSendScanQueueMessage(message: SendScanQueueMessageLike): Promise<void> {
    try {
      const replay = SendScanQueueMessageSchema.safeParse(message.body)
      let jobId: string | null = replay.success ? replay.data.jobId : null

      if (!jobId) {
        const event = R2ObjectCreateEventSchema.safeParse(message.body)
        if (!event.success) {
          ignoreMessage(message, deps, 'INVALID_MESSAGE')
          return
        }
        if (event.data.account !== deps.expectedAccountId) {
          ignoreMessage(message, deps, 'ACCOUNT_MISMATCH')
          return
        }
        if (event.data.bucket !== deps.expectedBucket) {
          ignoreMessage(message, deps, 'BUCKET_MISMATCH')
          return
        }
        if (!SEND_OBJECT_KEY.test(event.data.object.key)) {
          ignoreMessage(message, deps, 'OBJECT_KEY_INVALID')
          return
        }

        jobId = await deps.findJobForObject(event.data.object.key)
        if (!jobId) {
          message.retry({ delaySeconds: 30 })
          return
        }
      }

      const result = await deps.processJob({ jobId, now: deps.now() })
      if (result.action === 'retry') {
        message.retry({ delaySeconds: boundedDelaySeconds(result.delaySeconds) })
        return
      }
      message.ack()
    } catch {
      deps.log({
        event: 'send_scan_message_failed',
        messageId: message.id,
        reasonCode: 'UNEXPECTED_FAILURE'
      })
      message.retry({ delaySeconds: 30 })
    }
  }
}
