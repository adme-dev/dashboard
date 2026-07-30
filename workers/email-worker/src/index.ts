import PostalMime from 'postal-mime'
import { deliverBoardEmail } from './boardAdapter'
import { classifyInboundEmailRoute } from './routing'
import {
  resolveInboundEmailLimits,
  validateInboundAttachments,
  validateInboundEmailSize
} from './safety'
import type {
  FetchLike,
  InboundEmailMessage,
  InboundEmailWorkerEnv,
  ParsedInboundEmail
} from './contracts'

interface InboundEmailWorkerDependencies {
  fetch?: FetchLike
  parse?: (raw: ArrayBuffer) => Promise<ParsedInboundEmail>
}

async function parseWithPostalMime(raw: ArrayBuffer): Promise<ParsedInboundEmail> {
  const parser = new PostalMime()
  const email = await parser.parse(raw)

  return {
    subject: email.subject ?? null,
    text: email.text ?? null,
    html: email.html ?? null,
    attachments: (email.attachments ?? []).map(attachment => ({
      filename: attachment.filename ?? null,
      mimeType: attachment.mimeType,
      size: attachment.content?.byteLength ?? 0
    }))
  }
}

export function createInboundEmailWorker(
  dependencies: InboundEmailWorkerDependencies = {}
) {
  const fetchImpl = dependencies.fetch ?? fetch
  const parse = dependencies.parse ?? parseWithPostalMime

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
      if (route.kind !== 'board') {
        message.setReject('Email route not enabled')
        return
      }

      const limits = resolveInboundEmailLimits(env.MAX_INBOUND_EMAIL_BYTES)
      const sizeSafety = validateInboundEmailSize(message.rawSize, limits)
      if (!sizeSafety.safe) {
        message.setReject('Email exceeds size limit')
        return
      }

      try {
        const raw = await new Response(message.raw).arrayBuffer()
        const email = await parse(raw)
        const attachmentSafety = validateInboundAttachments(
          email.attachments,
          limits
        )
        if (!attachmentSafety.safe) {
          message.setReject('Unsafe email attachments')
          return
        }

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
      } catch {
        console.error('Email worker processing failed')
        message.setReject('Internal error processing email')
      }
    }
  }
}

export default createInboundEmailWorker() satisfies ExportedHandler<InboundEmailWorkerEnv>
