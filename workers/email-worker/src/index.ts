import { deliverBoardEmail } from './boardAdapter'
import { queryOne, transaction } from './db'
import { classifyCrmInboundEmail } from './inboundClassification'
import {
  type CrmInboundQueueProcessingStage,
  processCrmInboundQueueJob
} from './inboundQueue'
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
import { createCrmInboundEmailProcessor } from '../../../server/utils/crm/emailInboundProcessor'
import { resolveCrmInboundEmailRoute } from '../../../server/utils/crm/emailRouteRepository'
import { parseCrmEmailReplySecrets } from '../../../server/utils/crm/emailInboundConfig'
import {
  CrmEmailRetainedArtifactJobSchema
} from '../../../server/utils/crm/emailInboundProcessingContracts'

interface InboundEmailWorkerDependencies {
  fetch?: FetchLike
  parse?: (raw: ArrayBuffer) => Promise<ParsedInboundEmail>
  now?: () => Date
  randomUUID?: () => string
}

const createIdempotencyKey = async (
  routeTokenHash: string,
  providerMessageId: string
): Promise<string> => {
  const input = new TextEncoder().encode(`${routeTokenHash}\u0000${providerMessageId}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  const bytes = new Uint8Array(digest)
  return `crm-inbound:${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
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
          !env.CRM_EMAIL_BUCKET
          || !env.CRM_EMAIL_RETAINED_QUEUE
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
        try {
          processingStage = 'enqueue_retained'
          const recipientDomain = message.to.split('@')[1]?.toLowerCase()
          if (!recipientDomain) {
            throw new Error('Invalid CRM email recipient')
          }
          const retainedJob = CrmEmailRetainedArtifactJobSchema.parse({
            version: 1,
            type: 'crm.email.retained',
            routeKind: route.kind === 'lead'
              ? 'lead_inbox'
              : 'conversation_reply',
            routeToken: route.token,
            recipientDomain,
            provider: 'cloudflare_email',
            providerMessageId: email.messageId?.trim()
              || `sha256:${manifest.rawMimeSha256}`,
            ...manifest,
            receivedAt
          })
          await env.CRM_EMAIL_RETAINED_QUEUE!.send(retainedJob)
        } catch (error) {
          await cleanupCrmArtifacts(env.CRM_EMAIL_BUCKET!, manifest)
          throw error
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
        let processingStage: CrmInboundQueueProcessingStage = 'configuration'
        try {
          if (env.HYPERDRIVE?.connectionString) {
            ;(globalThis as { __HYPERDRIVE_CS?: string }).__HYPERDRIVE_CS
              = env.HYPERDRIVE.connectionString
          }
          if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL
          const processor = env.HYPERDRIVE?.connectionString || env.DATABASE_URL
            ? createCrmInboundEmailProcessor({
                transaction,
                onStage: (stage) => {
                  processingStage = `canonical_${stage}`
                }
              })
            : undefined
          const result = await processCrmInboundQueueJob(message.body, env, {
            parse,
            fetch: fetchImpl,
            process: processor?.process,
            resolveRoute: input => resolveCrmInboundEmailRoute({
              ...input,
              secrets: parseCrmEmailReplySecrets(env.CRM_EMAIL_REPLY_SECRETS)
            }, { queryOne }),
            createIdempotencyKey,
            onStage: (stage) => {
              processingStage = stage
            }
          })
          if (result.status === 'suppressed') {
            console.info('CRM email inbound suppressed', {
              reason: result.reason
            })
          }
          message.ack()
        } catch {
          console.error('CRM email inbound Queue processing failed', {
            stage: processingStage
          })
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
