import { deliverBoardEmail } from './boardAdapter'
import { deliverCrmInboundEmail } from './crmAdapter'
import { classifyCrmInboundEmail } from './inboundClassification'
import { processCrmInboundQueueJob } from './inboundQueue'
import { parseInboundEmail } from './mime'
import { classifyInboundEmailRoute } from './routing'
import {
  deleteCrmInboundEmailArtifacts,
  resolveCrmEmailRetentionDays,
  storeCrmInboundEmailArtifacts
} from './r2Artifacts'
import {
  resolveInboundEmailLimits,
  validateInboundAttachments,
  validateInboundEmailSize
} from './safety'
import type {
  CrmEmailBucketBinding,
  FetchLike,
  InboundEmailMessage,
  InboundEmailWorkerEnv,
  ParsedInboundEmail
} from './contracts'
import type { CrmInboundArtifactManifest } from './r2Artifacts'
import type {
  CrmEmailInboundQueueJob
} from '../../../server/utils/crm/emailInboundProcessingContracts'

interface InboundEmailWorkerDependencies {
  fetch?: FetchLike
  parse?: (raw: ArrayBuffer) => Promise<ParsedInboundEmail>
  now?: () => Date
  randomUUID?: () => string
}

async function cleanupCrmArtifacts(
  bucket: CrmEmailBucketBinding,
  manifest: CrmInboundArtifactManifest
): Promise<void> {
  try {
    await deleteCrmInboundEmailArtifacts(bucket, manifest)
  } catch {
    console.error('CRM email artifact cleanup failed')
  }
}

export function createInboundEmailWorker(
  dependencies: InboundEmailWorkerDependencies = {}
) {
  const fetchImpl = dependencies.fetch ?? fetch
  const parse = dependencies.parse ?? parseInboundEmail

  return {
    async email(
      message: InboundEmailMessage,
      env: InboundEmailWorkerEnv
    ): Promise<void> {
      const route = classifyInboundEmailRoute(message.to)
      if (route.kind === 'invalid') {
        message.setReject('Invalid email route')
        return
      }
      const isCrmRoute = route.kind === 'lead' || route.kind === 'crm_reply'
      if (
        isCrmRoute
        && env.CRM_EMAIL_INBOUND_ENABLED !== 'true'
      ) {
        message.setReject('Email route not enabled')
        return
      }
      if (
        isCrmRoute
        && (
          !env.CRM_EMAIL_WORKER_SECRET?.trim()
          || !env.CRM_EMAIL_BUCKET
        )
      ) {
        message.setReject('Email route not configured')
        return
      }

      const limits = resolveInboundEmailLimits(env.MAX_INBOUND_EMAIL_BYTES)
      const sizeSafety = validateInboundEmailSize(message.rawSize, limits)
      if (!sizeSafety.safe) {
        message.setReject('Email exceeds size limit')
        return
      }

      let processingStage = 'read_raw'
      try {
        const raw = await new Response(message.raw).arrayBuffer()
        processingStage = 'parse_mime'
        const email = await parse(raw)

        if (isCrmRoute) {
          processingStage = 'classify_automation'
          const classification = classifyCrmInboundEmail(email)
          if (classification.kind === 'suppressed') {
            console.info('CRM email inbound suppressed', {
              reason: classification.reason
            })
            return
          }
        }

        processingStage = 'validate_attachments'
        const attachmentSafety = validateInboundAttachments(
          email.attachments,
          limits
        )
        if (!attachmentSafety.safe) {
          message.setReject('Unsafe email attachments')
          return
        }

        if (route.kind === 'board') {
          processingStage = 'handoff_board'
          const result = await deliverBoardEmail({
            token: route.token,
            from: message.from,
            email,
            apiUrl: env.API_URL,
            internalApiKey: env.INTERNAL_API_KEY
          }, { fetch: fetchImpl })

          if (!result.accepted) {
            console.error('Email-to-board request failed', {
              status: result.status
            })
            message.setReject(`Failed to process email: ${result.status}`)
          }
          return
        }

        const receivedDate = dependencies.now?.() ?? new Date()
        const receivedAt = receivedDate.toISOString()
        processingStage = 'store_r2'
        const manifest = await storeCrmInboundEmailArtifacts({
          bucket: env.CRM_EMAIL_BUCKET!,
          raw,
          attachments: email.attachments,
          retentionDays: resolveCrmEmailRetentionDays(
            env.CRM_EMAIL_RETENTION_DAYS
          )
        }, {
          now: () => receivedDate,
          randomUUID: dependencies.randomUUID
        })
        let result
        try {
          processingStage = 'handoff_pages'
          result = await deliverCrmInboundEmail({
            route,
            recipient: message.to,
            messageId: email.messageId ?? null,
            manifest,
            receivedAt,
            apiUrl: env.API_URL,
            workerSecret: env.CRM_EMAIL_WORKER_SECRET!
          }, { fetch: fetchImpl })
        } catch (error) {
          await cleanupCrmArtifacts(env.CRM_EMAIL_BUCKET!, manifest)
          throw error
        }

        if (!result.accepted) {
          await cleanupCrmArtifacts(env.CRM_EMAIL_BUCKET!, manifest)
          console.error('CRM email inbound request failed', {
            status: result.status
          })
          message.setReject(`Failed to process email: ${result.status}`)
        }
      } catch {
        console.error('Email worker processing failed', {
          stage: processingStage
        })
        message.setReject('Internal error processing email')
      }
    },

    async queue(
      batch: MessageBatch<CrmEmailInboundQueueJob>,
      env: InboundEmailWorkerEnv,
      _context: ExecutionContext
    ): Promise<void> {
      for (const message of batch.messages) {
        try {
          const result = await processCrmInboundQueueJob(message.body, env, {
            fetch: fetchImpl,
            parse
          })
          if (result.status === 'suppressed') {
            console.info('CRM email inbound suppressed', {
              reason: result.reason
            })
          }
          message.ack()
        } catch {
          console.error('CRM email inbound Queue processing failed')
          message.retry({ delaySeconds: 30 })
        }
      }
    }
  }
}

export default createInboundEmailWorker() satisfies ExportedHandler<
  InboundEmailWorkerEnv,
  CrmEmailInboundQueueJob
>
