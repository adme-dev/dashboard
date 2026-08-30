import { describe, expect, it } from 'vitest'

import {
  requirePageStudioMachineAuth,
  resolvePageStudioControlSecret
} from '~~/server/utils/pageStudio/machineAuth'

function captureError(input: Record<string, unknown>) {
  return Object.assign(new Error(String(input.statusMessage)), input)
}

const event = { context: {} } as never

describe('Page Studio machine authentication', () => {
  it('fails closed with 503 when the runtime secret is not configured', () => {
    expect(() => requirePageStudioMachineAuth(event, {
      createHttpError: captureError,
      readAuthorization: () => 'Bearer supplied-secret',
      resolveExpectedSecret: () => null
    })).toThrowError(expect.objectContaining({
      statusCode: 503,
      data: {
        error: {
          code: 'PAGE_STUDIO_CONTROL_UNAVAILABLE',
          message: 'Page Studio control authentication is not configured'
        }
      }
    }))
  })

  it('requires a syntactically valid bearer credential', () => {
    for (const authorization of [null, '', 'supplied-secret', 'Basic supplied-secret', 'Bearer']) {
      expect(() => requirePageStudioMachineAuth(event, {
        createHttpError: captureError,
        readAuthorization: () => authorization,
        resolveExpectedSecret: () => 'expected-secret'
      })).toThrowError(expect.objectContaining({
        statusCode: 401,
        data: { error: { code: 'MACHINE_AUTH_REQUIRED', message: 'Bearer authentication required' } }
      }))
    }
  })

  it('rejects the wrong bearer credential and accepts the exact configured secret', () => {
    expect(() => requirePageStudioMachineAuth(event, {
      createHttpError: captureError,
      readAuthorization: () => 'Bearer wrong-secret',
      resolveExpectedSecret: () => 'expected-secret'
    })).toThrowError(expect.objectContaining({
      statusCode: 403,
      data: { error: { code: 'MACHINE_AUTH_INVALID', message: 'Machine credential rejected' } }
    }))

    expect(requirePageStudioMachineAuth(event, {
      createHttpError: captureError,
      readAuthorization: () => 'Bearer expected-secret',
      resolveExpectedSecret: () => 'expected-secret'
    })).toEqual({ service: 'page-studio' })
  })

  it('never treats the diagnostic service header as authentication', () => {
    const diagnosticOnlyEvent = {
      context: {},
      headers: new Headers({ 'x-xeroflow-service': 'page-studio' })
    } as never

    expect(() => requirePageStudioMachineAuth(diagnosticOnlyEvent, {
      createHttpError: captureError,
      readAuthorization: () => null,
      resolveExpectedSecret: () => 'expected-secret'
    })).toThrowError(expect.objectContaining({ statusCode: 401 }))
  })

  it('bounds both configured and supplied secrets to 256 UTF-8 bytes', () => {
    const oversized = 'a'.repeat(257)
    expect(() => requirePageStudioMachineAuth(event, {
      createHttpError: captureError,
      readAuthorization: () => `Bearer ${oversized}`,
      resolveExpectedSecret: () => 'expected-secret'
    })).toThrowError(expect.objectContaining({ statusCode: 403 }))

    expect(() => requirePageStudioMachineAuth(event, {
      createHttpError: captureError,
      readAuthorization: () => 'Bearer expected-secret',
      resolveExpectedSecret: () => oversized
    })).toThrowError(expect.objectContaining({ statusCode: 503 }))

    const exactLimit = 'é'.repeat(128)
    expect(requirePageStudioMachineAuth(event, {
      createHttpError: captureError,
      readAuthorization: () => `Bearer ${exactLimit}`,
      resolveExpectedSecret: () => exactLimit
    })).toEqual({ service: 'page-studio' })
  })

  it('prefers the Cloudflare runtime binding and otherwise uses the local process environment', () => {
    const previous = process.env.PAGE_STUDIO_CONTROL_SECRET
    process.env.PAGE_STUDIO_CONTROL_SECRET = 'local-secret'
    try {
      expect(resolvePageStudioControlSecret({ context: {} } as never)).toBe('local-secret')
      expect(resolvePageStudioControlSecret({
        context: { cloudflare: { env: { PAGE_STUDIO_CONTROL_SECRET: 'edge-secret' } } }
      } as never)).toBe('edge-secret')
      expect(resolvePageStudioControlSecret({
        context: { cloudflare: { env: { PAGE_STUDIO_CONTROL_SECRET: '' } } }
      } as never)).toBeNull()
    } finally {
      if (previous === undefined) delete process.env.PAGE_STUDIO_CONTROL_SECRET
      else process.env.PAGE_STUDIO_CONTROL_SECRET = previous
    }
  })
})
