import type { EmailAiAuditEvent, EmailAiRuntime } from '../../../shared/leads/email/ai'

interface RuntimeOptions {
  audit?: (event: EmailAiAuditEvent) => Promise<void> | void
  nowMs?: () => number
}

export function createWorkerEmailAiRuntime(ai: Ai, options: RuntimeOptions = {}): EmailAiRuntime {
  return {
    async invoke(invocation) {
      const result = await ai.run(invocation.model, {
        messages: [
          { role: 'system', content: invocation.system },
          { role: 'user', content: invocation.user }
        ],
        response_format: invocation.responseFormat,
        stream: false,
        max_tokens: 1_000,
        temperature: 0
      }, {
        signal: invocation.signal,
        tags: ['email-lead-extraction', invocation.promptVersion]
      })
      if (typeof result === 'string') return result
      if (!('response' in result) || typeof result.response !== 'string') {
        throw new Error('Workers AI returned no response')
      }
      return result.response
    },
    audit: options.audit ?? ((event) => {
      console.log(JSON.stringify({ event: 'email_lead_ai_extraction', ...event }))
    }),
    nowMs: options.nowMs ?? (() => Date.now()),
    timeoutSignal: milliseconds => AbortSignal.timeout(milliseconds)
  }
}
