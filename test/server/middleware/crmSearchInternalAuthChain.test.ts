import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import {
  createError,
  createEvent,
  deleteCookie,
  getCookie,
  getHeader,
  getRequestURL
} from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CRM_SEARCH_DEAD_LETTER_PATH,
  CRM_SEARCH_HEALTH_PATH,
  CRM_SEARCH_PROCESS_PATH
} from '../../../shared/crmSearchIndexProtocol'
import { CRM_SEARCH_SERVICE_KEY_BYTES } from '../../../shared/crmSearchIndexSigning'

const mocks = vi.hoisted(() => ({
  acceptGodModeInternalExecution: vi.fn(async () => null),
  validateSession: vi.fn(),
  kvGet: vi.fn()
}))

vi.mock('../../../server/utils/auth', () => ({
  acceptGodModeInternalExecution: mocks.acceptGodModeInternalExecution,
  validateSession: mocks.validateSession,
  TransientAuthError: class TransientAuthError extends Error {}
}))
vi.mock('../../../server/utils/kv', () => ({
  kvGet: mocks.kvGet,
  kvPut: vi.fn()
}))
vi.mock('../../../server/utils/roleResolver', () => ({
  resolveUserPermissions: vi.fn()
}))
vi.mock('../../../server/utils/permissions', () => ({
  isReadOnlyRole: vi.fn(() => false)
}))

Object.assign(globalThis, {
  createError,
  defineEventHandler: <T>(handler: T) => handler,
  deleteCookie,
  getCookie,
  getHeader,
  getRequestURL
})

const { default: authMiddleware } = await import('../../../server/middleware/auth')
const { default: processHandler } = await import(
  '../../../server/api/internal/crm-search/process.post'
)
const { default: deadLetterHandler } = await import(
  '../../../server/api/internal/crm-search/dead-letter.post'
)
const { default: healthHandler } = await import(
  '../../../server/api/internal/crm-search/health.get'
)

const sha = 'a'.repeat(40)
const pagesArtifact = `sha256:${'b'.repeat(64)}`
const workerArtifact = `sha256:${'c'.repeat(64)}`
const bindingManifest = `sha256:${'d'.repeat(64)}`
const keyring = JSON.stringify({
  activeKeyVersion: 'k1',
  keys: {
    k1: {
      keyVersion: 'k1',
      secret: Buffer.alloc(CRM_SEARCH_SERVICE_KEY_BYTES, 0x55).toString('base64url'),
      status: 'active',
      notBefore: 1,
      notAfter: 9_999_999_999
    }
  }
})

function event(path: string, method = 'POST', body = '{}') {
  const bytes = Buffer.from(body)
  const request = Readable.from([bytes]) as unknown as IncomingMessage
  request.method = method
  request.url = path
  request.headers = {
    'host': 'app.xeroflow.test',
    'content-type': 'application/json',
    'content-length': String(bytes.byteLength)
  }
  const setHeader = vi.fn()
  const result = createEvent(request, {
    writableEnded: false,
    headersSent: false,
    setHeader
  } as unknown as ServerResponse)
  result.context.cloudflare = {
    env: {
      CRM_SEARCH_SERVICE_KEYRING: keyring,
      CF_PAGES_COMMIT_SHA: sha,
      CRM_SEARCH_IMPLEMENTATION_SHA: sha,
      CRM_SEARCH_PAGES_ARTIFACT_DIGEST: pagesArtifact,
      CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST: pagesArtifact,
      CRM_SEARCH_BINDING_MANIFEST_DIGEST: bindingManifest,
      CRM_SEARCH_EXPECTED_BINDING_MANIFEST_DIGEST: bindingManifest,
      CRM_SEARCH_EXPECTED_WORKER_SHA: sha,
      CRM_SEARCH_EXPECTED_WORKER_ARTIFACT_DIGEST: workerArtifact,
      CRM_SEARCH_EXPECTED_WORKER_BINDING_MANIFEST_DIGEST: bindingManifest,
      CRM_SEARCH_EXPECTED_WORKER_PROTOCOL_VERSION: '1'
    }
  }
  return result
}

describe('CRM search internal routes through the real auth middleware chain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [CRM_SEARCH_PROCESS_PATH, processHandler],
    [CRM_SEARCH_DEAD_LETTER_PATH, deadLetterHandler]
  ])('lets exact machine route %s reach and fail its HMAC guard', async (path, handler) => {
    const request = event(path)

    await expect(authMiddleware(request)).resolves.toBeUndefined()
    await expect(handler(request)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'invalid_crm_search_service_request'
    })
    expect(mocks.validateSession).not.toHaveBeenCalled()
  })

  it('lets only the exact health route reach its fail-closed release proof', async () => {
    const request = event(CRM_SEARCH_HEALTH_PATH, 'GET', '')

    await expect(authMiddleware(request)).resolves.toBeUndefined()
    await expect(healthHandler(request)).resolves.toMatchObject({
      status: 'ready',
      component: 'crm_search_pages'
    })
    expect(mocks.validateSession).not.toHaveBeenCalled()
  })

  it.each([
    '/api/internal/crm-search',
    '/api/internal/crm-search/',
    '/api/internal/crm-search/process/extra',
    '/api/internal/crm-search/dead-letter/extra',
    '/api/internal/crm-search/health/extra',
    '/api/internal/crm-search-process'
  ])('keeps sibling route %s behind staff authentication', async (path) => {
    await expect(authMiddleware(event(path))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  })
})
