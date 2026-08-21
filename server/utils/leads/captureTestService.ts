import {
  AppendLeadCaptureTestEvidenceSchema,
  CreateLeadCaptureTestSchema,
  ExchangeLeadCaptureTestTokenSchema
} from '~~/server/utils/leads/captureTestContracts'
import { leadCaptureTestRepository } from '~~/server/utils/leads/captureTestRepository'

function invalid(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message })
}

function origin(value: string | null | undefined): string {
  if (!value) invalid('Origin is required')
  try {
    return new URL(value).origin
  } catch {
    return invalid('Origin is invalid')
  }
}

function redactDiagnostic(value: string | null | undefined): string | null {
  if (!value) return null
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[redacted-phone]')
    .replace(/(?:whsec_|Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '[redacted-secret]')
    .slice(0, 1000)
}

export const leadCaptureTestService = {
  async create(raw: unknown, actorId: string) {
    const parsed = CreateLeadCaptureTestSchema.safeParse(raw)
    if (!parsed.success) invalid('Invalid lead capture test request')
    const created = await leadCaptureTestRepository.create({ ...parsed.data, actorId })
    if (!created) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Connector, site, client, or approved origin did not match'
      })
    }
    return created
  },

  async exchange(raw: unknown, requestOrigin: string | null | undefined) {
    const parsed = ExchangeLeadCaptureTestTokenSchema.safeParse(raw)
    if (!parsed.success) invalid('Invalid lead capture test token')
    const exchanged = await leadCaptureTestRepository.exchange(parsed.data.token, origin(requestOrigin))
    if (!exchanged) {
      throw createError({ statusCode: 401, statusMessage: 'Lead capture test token is invalid or expired' })
    }
    return exchanged
  },

  async appendEvidence(raw: unknown, requestOrigin: string | null | undefined) {
    const parsed = AppendLeadCaptureTestEvidenceSchema.safeParse(raw)
    if (!parsed.success) invalid('Invalid lead capture test evidence')
    const run = await leadCaptureTestRepository.resolveEvidenceToken(
      parsed.data.token,
      origin(requestOrigin)
    )
    if (!run) {
      throw createError({ statusCode: 401, statusMessage: 'Lead capture evidence token is invalid or expired' })
    }
    return leadCaptureTestRepository.appendEvent({
      run,
      stage: parsed.data.stage,
      outcome: parsed.data.outcome,
      evidenceKey: parsed.data.evidenceKey,
      diagnostic: redactDiagnostic(parsed.data.diagnostic)
    })
  },

  async resolveEvidenceContext(token: string, requestOrigin: string | null | undefined) {
    if (token.length < 32 || token.length > 512) return null
    return leadCaptureTestRepository.resolveEvidenceToken(token, origin(requestOrigin))
  },

  async get(id: string, clientId: string) {
    const run = await leadCaptureTestRepository.get(id, clientId)
    if (!run) throw createError({ statusCode: 404, statusMessage: 'Lead capture test not found' })
    return run
  }
}
