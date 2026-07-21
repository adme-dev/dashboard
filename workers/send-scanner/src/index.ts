import { createPostgresSendScanRepository } from '../../../server/utils/send/scanRepository'
import { createSendScanOrchestrator } from '../../../server/utils/send/scanning'
import { ClamAvContainer, ContainerProxy } from './container'
import { createHyperdriveDatabase } from './db'
import {
  createSendScanQueueHandler,
  type SendScanQueueLog
} from './queue'

export { ClamAvContainer, ContainerProxy }

type ClamAvContainerStub = DurableObjectStub & {
  scan(input: {
    jobId: string
    objectKey: string
    objectEtag: string
    expectedMimeType: string
  }): Promise<unknown>
}

function log(record: SendScanQueueLog): void {
  const serialized = JSON.stringify({ ...record, timestamp: new Date().toISOString() })
  if (record.event === 'send_scan_message_failed') {
    console.error(serialized)
  } else if (record.event === 'send_scan_message_retried') {
    console.warn(serialized)
  } else {
    console.log(serialized)
  }
}

function createHandler(env: Env) {
  const database = createHyperdriveDatabase(env.HYPERDRIVE.connectionString)
  const repository = createPostgresSendScanRepository(database)
  const orchestrator = createSendScanOrchestrator({
    claimJob: repository.claimJob,
    releaseJob: repository.releaseJob,
    completeJob: repository.completeJob,
    async getObjectMetadata(key) {
      const object = await env.MEDIA_BUCKET.head(key)
      if (!object) return null
      return {
        key,
        size: object.size,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        etag: object.etag
      }
    },
    async scanObject(input) {
      const stub = env.SCAN_CONTAINER.getByName(input.jobId) as ClamAvContainerStub
      return stub.scan(input)
    }
  })
  return createSendScanQueueHandler({
    expectedAccountId: env.EXPECTED_R2_ACCOUNT_ID,
    expectedBucket: env.EXPECTED_R2_BUCKET,
    findJobForObject: repository.findJobForObject,
    processJob: orchestrator.process,
    log,
    now: () => new Date()
  })
}

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const handle = createHandler(env)
    for (const message of batch.messages) {
      await handle(message)
    }
  },

  fetch(): Response {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' }
    })
  }
} satisfies ExportedHandler<Env, unknown>
