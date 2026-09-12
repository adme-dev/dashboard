import { describe, expect, it, vi } from 'vitest'

import {
  buildApprovedPageStudioVersion,
  type PageStudioBuildQueryClient
} from '~~/server/utils/pageStudio/builds'

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const versionId = '33333333-3333-4333-8333-333333333333'
const approvalId = '44444444-4444-4444-8444-444444444444'
const actorId = '55555555-5555-4555-8555-555555555555'
const digest = 'a'.repeat(64)
const buildId = `build_${digest.slice(0, 32)}`
const artifactPrefix
  = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${digest}`
const result = {
  artifactPrefix,
  buildId,
  manifestDigest: 'b'.repeat(64),
  manifestKey: `${artifactPrefix}/release-manifest.json`,
  success: true as const,
  validationKey: `${artifactPrefix}/validation-report.json`,
  versionDigest: digest
}

function database(respond: (sql: string, params: unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => ({ rows: respond(sql, params) }))
  const client = { query } as PageStudioBuildQueryClient
  const runTransaction = vi.fn(async <T>(
    callback: (db: PageStudioBuildQueryClient) => Promise<T>
  ) => callback(client))
  return { query, runTransaction }
}

function authority() {
  return {
    approval_id: approvalId,
    client_id: scope.clientId,
    digest,
    review_decision: 'approved',
    site_status: 'draft',
    version_status: 'approved'
  }
}

function input() {
  return {
    actorId,
    assets: [],
    idempotencyKey: 'build_01HXYZ',
    manifest: { schemaVersion: 2 },
    siteId: scope.siteId,
    tenantId: scope.tenantId,
    versionId
  }
}

describe('Page Studio approved build orchestration', () => {
  it('turns structured RPC validation failures into actionable errors and a failed build', async () => {
    const db = database(sql => sql.includes('latest_review') ? [authority()] : [])
    const worker = { build: vi.fn().mockResolvedValue({ success: false, error: {
      code: 'BUILD_VALIDATION_FAILED', issueCount: 2,
      issues: [{ code: 'missing_seo_description', pageIndex: 1 }, { code: 'missing_canonical_origin' }]
    } }) }
    await expect(buildApprovedPageStudioVersion(input(), {
      queryOne: vi.fn().mockResolvedValue(authority()), runTransaction: db.runTransaction, worker
    })).rejects.toMatchObject({ code: 'BUILD_VALIDATION_FAILED', statusCode: 422,
      message: 'Cannot publish: add an SEO description to page 2; set the website canonical HTTPS address.' })
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('\'failed\''), expect.any(Array))
    expect(db.query.mock.calls.some(([sql]) => sql.includes('build.succeeded'))).toBe(false)
  })

  it.each([
    { code: 'BUILD_VALIDATION_FAILED', issueCount: 1, issues: [{ code: 'private-error', message: 'secret' }] },
    { code: 'BUILD_VALIDATION_FAILED', issueCount: 1, issues: [{ code: 'missing_seo_description', pageIndex: -1 }] },
    { code: 'BUILD_VALIDATION_FAILED', issueCount: 1, issues: Array.from({ length: 21 }, () => ({ code: 'invalid_content' })) }
  ])('does not expose malformed worker validation details', async (error) => {
    const db = database(sql => sql.includes('latest_review') ? [authority()] : [])
    await expect(buildApprovedPageStudioVersion(input(), {
      queryOne: vi.fn().mockResolvedValue(authority()), runTransaction: db.runTransaction,
      worker: { build: vi.fn().mockResolvedValue({ success: false, error }) }
    })).rejects.toMatchObject({ code: 'BUILD_RESULT_INVALID', statusCode: 502 })
  })

  it('bounds guidance while reporting omitted issues', async () => {
    const db = database(sql => sql.includes('latest_review') ? [authority()] : [])
    const error = await buildApprovedPageStudioVersion(input(), {
      queryOne: vi.fn().mockResolvedValue(authority()), runTransaction: db.runTransaction,
      worker: { build: vi.fn().mockResolvedValue({ success: false, error: {
        code: 'BUILD_VALIDATION_FAILED', issueCount: 30,
        issues: Array.from({ length: 20 }, (_, pageIndex) => ({ code: 'missing_seo_description', pageIndex }))
      } }) }
    }).catch(error => error)
    expect(error).toMatchObject({ code: 'BUILD_VALIDATION_FAILED', statusCode: 422 })
    expect(error.message).toContain('25 further validation issues remain')
    expect(error.message.length).toBeLessThanOrEqual(500)
  })

  it('calls the private worker with the exact approval and records only its deterministic result', async () => {
    const db = database((sql) => {
      if (sql.includes('latest_review')) return [authority()]
      if (sql.includes('FROM page_studio_builds')) return []
      if (sql.includes('INSERT INTO page_studio_builds')) return [{ id: buildId }]
      return []
    })
    const worker = { build: vi.fn().mockResolvedValue(result) }

    await expect(buildApprovedPageStudioVersion(input(), {
      queryOne: vi.fn().mockResolvedValue(authority()),
      runTransaction: db.runTransaction,
      worker
    })).resolves.toMatchObject({ buildId, scope, versionDigest: digest })

    expect(worker.build).toHaveBeenCalledWith({
      approval: { approvalId, digest, status: 'approved', versionId },
      assets: [],
      manifest: input().manifest,
      scope,
      versionDigest: digest,
      versionId
    })
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_builds'),
      expect.arrayContaining([buildId, digest, result.manifestDigest])
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('build.succeeded'),
      expect.arrayContaining([actorId, buildId])
    )
  })

  it('rejects before calling the worker unless the latest exact-digest review is approved', async () => {
    const worker = { build: vi.fn() }
    await expect(buildApprovedPageStudioVersion(input(), {
      queryOne: vi.fn().mockResolvedValue({ ...authority(), review_decision: 'rejected' }),
      runTransaction: database(() => []).runTransaction,
      worker
    })).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED', statusCode: 422 })
    expect(worker.build).not.toHaveBeenCalled()
  })

  it('rechecks approval after the external build and refuses to register a changed decision', async () => {
    const db = database(sql => sql.includes('latest_review')
      ? [{ ...authority(), review_decision: 'rejected' }]
      : [])
    const worker = { build: vi.fn().mockResolvedValue(result) }

    await expect(buildApprovedPageStudioVersion(input(), {
      queryOne: vi.fn().mockResolvedValue(authority()),
      runTransaction: db.runTransaction,
      worker
    })).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED', statusCode: 422 })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_builds')))
      .toBe(false)
  })

  it('records a bounded failed build without exposing worker error content', async () => {
    const db = database((sql) => {
      if (sql.includes('latest_review')) return [authority()]
      if (sql.includes('FROM page_studio_builds')) return []
      if (sql.includes('INSERT INTO page_studio_builds')) return [{ id: buildId }]
      return []
    })
    const validationError = new Error('private customer content must not persist')
    validationError.name = 'ReleaseValidationError'
    const worker = {
      build: vi.fn().mockRejectedValue(validationError)
    }

    await expect(buildApprovedPageStudioVersion(input(), {
      queryOne: vi.fn().mockResolvedValue(authority()),
      runTransaction: db.runTransaction,
      worker
    })).rejects.toMatchObject({ code: 'BUILD_VALIDATION_FAILED', statusCode: 422 })
    const serializedParams = JSON.stringify(db.query.mock.calls.map(([, params]) => params))
    expect(serializedParams).not.toContain('private customer content')
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('\'failed\''),
      expect.arrayContaining(['Build worker rejected the approved version'])
    )
  })

  it('projects private worker infrastructure failures as retryable unavailability', async () => {
    const db = database((sql) => {
      if (sql.includes('latest_review')) return [authority()]
      if (sql.includes('FROM page_studio_builds')) return []
      return []
    })

    await expect(buildApprovedPageStudioVersion(input(), {
      queryOne: vi.fn().mockResolvedValue(authority()),
      runTransaction: db.runTransaction,
      worker: { build: vi.fn().mockRejectedValue(new Error('RPC disconnected')) }
    })).rejects.toMatchObject({ code: 'BUILD_WORKER_UNAVAILABLE', statusCode: 503 })
  })
})
