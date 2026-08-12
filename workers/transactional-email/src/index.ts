/// <reference types="@cloudflare/workers-types/latest" />

import type { PreparedCrmTransactionalEmail } from '../../../server/utils/crm/transactionalEmail'
import { PORTAL_AUTH_SENDER_ADDRESS } from '../../../server/utils/portalAuthEmailPolicy'
import { createCloudflareTransactionalEmailProvider } from '../../email-worker/src/cloudflareTransactionalEmail'

interface TransactionalEmailWorkerEnv {
  EMAIL: SendEmail
}

interface GatewayMessage {
  to: string
  from: {
    address: string
    name: string
  }
  subject: string
  text: string
  html: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const HEADER_INJECTION = /[\r\n]/u
const MAX_BODY_LENGTH = 200_000
const MAX_REQUEST_BYTES = 450_000

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function validAddress(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 320
    && !HEADER_INJECTION.test(value)
    && EMAIL_PATTERN.test(value)
}

function validMessage(value: unknown): value is GatewayMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const message = value as Record<string, unknown>
  if (!exactKeys(message, ['to', 'from', 'subject', 'text', 'html'])) return false
  if (!validAddress(message.to)) return false
  if (!message.from || typeof message.from !== 'object' || Array.isArray(message.from)) return false

  const from = message.from as Record<string, unknown>
  if (!exactKeys(from, ['address', 'name'])) return false
  if (
    !validAddress(from.address)
    || from.address !== PORTAL_AUTH_SENDER_ADDRESS
  ) return false
  if (
    typeof from.name !== 'string'
    || from.name.length < 1
    || from.name.length > 100
    || HEADER_INJECTION.test(from.name)
  ) return false

  if (
    typeof message.subject !== 'string'
    || message.subject.length < 1
    || message.subject.length > 998
    || HEADER_INJECTION.test(message.subject)
  ) return false
  if (
    typeof message.text !== 'string'
    || message.text.length < 1
    || message.text.length > MAX_BODY_LENGTH
  ) return false
  if (
    typeof message.html !== 'string'
    || message.html.length < 1
    || message.html.length > MAX_BODY_LENGTH
  ) return false
  return true
}

function json(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' }
  })
}

function prepared(message: GatewayMessage): PreparedCrmTransactionalEmail {
  return {
    from: message.from,
    to: [{ address: message.to, name: null }],
    cc: [],
    bcc: [],
    replyTo: null,
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: { 'X-XeroFlow-Origin': 'portal-auth' },
    attachments: []
  }
}

export function createTransactionalEmailWorker() {
  return {
    async fetch(
      request: Request,
      env: TransactionalEmailWorkerEnv
    ): Promise<Response> {
      const url = new URL(request.url)
      if (url.pathname !== '/v1/send') return json({ error: 'not_found' }, 404)
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return json({ error: 'invalid_request' }, 400)
      }

      const declaredLength = Number(request.headers.get('content-length') || '0')
      if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
        return json({ error: 'request_too_large' }, 413)
      }

      const payload = await request.json().catch(() => null)
      if (!validMessage(payload)) return json({ error: 'invalid_request' }, 400)

      const result = await createCloudflareTransactionalEmailProvider(env.EMAIL)
        .send(prepared(payload))
      const status = result.outcome === 'accepted'
        ? 202
        : result.outcome === 'retryable'
          ? 503
          : 422
      return json(result, status)
    }
  }
}

export default createTransactionalEmailWorker() satisfies ExportedHandler<
  TransactionalEmailWorkerEnv
>
