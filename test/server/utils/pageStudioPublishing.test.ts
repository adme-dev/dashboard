import { describe, expect, it, vi } from 'vitest'

import {
  activatePageStudioRelease,
  getPageStudioBuildPointer,
  getPageStudioReleasePointer,
  rollbackPageStudioRelease,
  type PageStudioPublishingQueryClient
} from '~~/server/utils/pageStudio/publishing'

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const digest = 'a'.repeat(64)
const buildId = `build_${digest.slice(0, 32)}`
const artifactPrefix
  = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${digest}`
const buildRow = {
  artifact_prefix: artifactPrefix,
  build_id: buildId,
  manifest_digest: 'b'.repeat(64),
  manifest_key: `${artifactPrefix}/release-manifest.json`,
  version_digest: digest
}

const actorId = '44444444-4444-4444-8444-444444444444'
const releaseId = '33333333-3333-4333-8333-333333333333'
const hostname = 'site.staging.pages.xeroflow.com'

function database(respond: (sql: string, params: unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => ({ rows: respond(sql, params) }))
  const client = { query } as PageStudioPublishingQueryClient
  const runTransaction = vi.fn(async <T>(
    callback: (db: PageStudioPublishingQueryClient) => Promise<T>
  ) => callback(client))
  return { query, runTransaction }
}

function activation(overrides: Record<string, unknown> = {}) {
  return {
    actorId,
    buildId,
    environment: 'staging' as const,
    expectedActiveReleaseId: null,
    hostname,
    idempotencyKey: 'publish_01HXYZ',
    scope,
    ...overrides
  }
}

function rollback(overrides: Record<string, unknown> = {}) {
  return {
    actorId,
    environment: 'staging' as const,
    expectedActiveReleaseId: '66666666-6666-4666-8666-666666666666',
    hostname,
    idempotencyKey: 'rollback_01HXYZ',
    scope,
    targetReleaseId: releaseId,
    ...overrides
  }
}

describe('Page Studio publishing catalog', () => {
  it('returns an environment-neutral immutable build pointer in the exact scope', async () => {
    const queryOne = vi.fn().mockResolvedValue(buildRow)

    await expect(getPageStudioBuildPointer(scope, buildId, { queryOne })).resolves.toEqual({
      artifactPrefix,
      buildId,
      manifestDigest: buildRow.manifest_digest,
      manifestKey: buildRow.manifest_key,
      scope,
      versionDigest: digest
    })
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining('build.state = \'succeeded\''),
      [scope.tenantId, scope.clientId, scope.siteId, buildId]
    )
  })

  it('returns one historical release pointer only from the same scoped succeeded build', async () => {
    const releaseId = '33333333-3333-4333-8333-333333333333'
    const queryOne = vi.fn().mockResolvedValue({
      ...buildRow,
      environment: 'staging',
      release_id: releaseId
    })

    await expect(getPageStudioReleasePointer(scope, releaseId, { queryOne })).resolves.toEqual({
      artifactPrefix,
      buildId,
      environment: 'staging',
      manifestDigest: buildRow.manifest_digest,
      manifestKey: buildRow.manifest_key,
      releaseId,
      scope,
      versionDigest: digest
    })
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining('build.state = \'succeeded\''),
      [scope.tenantId, scope.clientId, scope.siteId, releaseId]
    )
  })

  it('fails closed when persisted artifact metadata leaves its deterministic scope', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      ...buildRow,
      artifact_prefix: 'tenants/other/builds/outside'
    })

    await expect(getPageStudioBuildPointer(scope, buildId, { queryOne })).rejects.toMatchObject({
      code: 'RELEASE_RECORD_INVALID',
      statusCode: 500
    })
  })
})

describe('Page Studio atomic release activation', () => {
  it('locks the scoped site and pointer, creates one release, advances state, and audits before commit', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites') && sql.includes('FOR UPDATE')) {
        return [{ id: scope.siteId }]
      }
      if (sql.includes('idempotency_key') && sql.includes('FROM page_studio_releases')) return []
      if (sql.includes('FROM page_studio_release_pointers')) return []
      if (sql.includes('FROM page_studio_builds') && sql.includes('latest_review_decision')) {
        return [{
          ...buildRow,
          latest_review_decision: 'approved',
          version_id: '55555555-5555-4555-8555-555555555555',
          version_status: 'approved'
        }]
      }
      if (sql.includes('INSERT INTO page_studio_releases')) return [{ release_id: releaseId }]
      return []
    })

    await expect(activatePageStudioRelease(activation(), {
      runTransaction: db.runTransaction
    })).resolves.toEqual({
      artifactPrefix,
      buildId,
      environment: 'staging',
      manifestDigest: buildRow.manifest_digest,
      manifestKey: buildRow.manifest_key,
      releaseId,
      scope,
      versionDigest: digest
    })

    const statements = db.query.mock.calls.map(([sql]) => String(sql))
    const releaseInsert = statements.findIndex(sql => sql.includes('INSERT INTO page_studio_releases'))
    const pointerWrite = statements.findIndex(sql =>
      sql.includes('page_studio_release_pointers') && /^\s*(?:INSERT|UPDATE)/.test(sql)
    )
    const auditWrite = statements.findIndex(sql => sql.includes('INSERT INTO page_studio_audit_events'))
    expect(releaseInsert).toBeGreaterThanOrEqual(0)
    expect(pointerWrite).toBeGreaterThan(releaseInsert)
    expect(auditWrite).toBeGreaterThan(pointerWrite)
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('release.activated'),
      expect.arrayContaining([scope.tenantId, scope.clientId, scope.siteId, actorId, releaseId])
    )
  })

  it('rejects a stale expected release before validating or mutating the build', async () => {
    const activeReleaseId = '66666666-6666-4666-8666-666666666666'
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('idempotency_key') && sql.includes('FROM page_studio_releases')) return []
      if (sql.includes('FROM page_studio_release_pointers')) {
        return [{ active_release_id: activeReleaseId }]
      }
      return []
    })

    await expect(activatePageStudioRelease(activation(), {
      runTransaction: db.runTransaction
    })).rejects.toMatchObject({ code: 'RELEASE_POINTER_CONFLICT', statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('FROM page_studio_builds')))
      .toBe(false)
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_releases')))
      .toBe(false)
  })

  it('serializes hostname claims and rejects a pointer owned by another scope', async () => {
    const activeReleaseId = '66666666-6666-4666-8666-666666666666'
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('idempotency_key') && sql.includes('FROM page_studio_releases')) return []
      if (sql.includes('FROM page_studio_release_pointers')) {
        return [{
          active_release_id: activeReleaseId,
          client_id: '77777777-7777-4777-8777-777777777777',
          site_id: '88888888-8888-4888-8888-888888888888',
          tenant_id: 'tenant-other'
        }]
      }
      return []
    })

    await expect(activatePageStudioRelease(activation({
      expectedActiveReleaseId: activeReleaseId
    }), { runTransaction: db.runTransaction })).rejects.toMatchObject({
      code: 'RELEASE_POINTER_CONFLICT',
      statusCode: 409
    })
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [`page-studio-release:staging:${hostname}`]
    )
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('FROM page_studio_builds')))
      .toBe(false)
  })

  it('requires the same digest to remain approved and the build to remain succeeded', async () => {
    for (const buildRows of [[], [{
      ...buildRow,
      latest_review_decision: 'rejected',
      version_id: '55555555-5555-4555-8555-555555555555',
      version_status: 'rejected'
    }]]) {
      const db = database((sql) => {
        if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
        if (sql.includes('idempotency_key') && sql.includes('FROM page_studio_releases')) return []
        if (sql.includes('FROM page_studio_release_pointers')) return []
        if (sql.includes('FROM page_studio_builds')) return buildRows
        return []
      })

      await expect(activatePageStudioRelease(activation(), {
        runTransaction: db.runTransaction
      })).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE', statusCode: 422 })
      expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_releases')))
        .toBe(false)
    }
  })

  it('returns the immutable release for an exact idempotency replay without moving the pointer', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('idempotency_key') && sql.includes('FROM page_studio_releases')) {
        return [{
          ...buildRow,
          actor_id: actorId,
          environment: 'staging',
          normalized_hostname: hostname,
          release_id: releaseId
        }]
      }
      return []
    })

    await expect(activatePageStudioRelease(activation(), {
      runTransaction: db.runTransaction
    })).resolves.toMatchObject({ releaseId })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('FROM page_studio_release_pointers')))
      .toBe(false)
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_releases')))
      .toBe(false)
  })

  it('conflicts when an idempotency key is replayed with changed activation input', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('idempotency_key') && sql.includes('FROM page_studio_releases')) {
        return [{
          ...buildRow,
          actor_id: actorId,
          environment: 'production',
          normalized_hostname: hostname,
          release_id: releaseId
        }]
      }
      return []
    })

    await expect(activatePageStudioRelease(activation(), {
      runTransaction: db.runTransaction
    })).rejects.toMatchObject({ code: 'RELEASE_IDEMPOTENCY_CONFLICT', statusCode: 409 })
  })
})

describe('Page Studio atomic release rollback', () => {
  it('moves the pointer to an existing verified release and audits without building or inserting a release', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('action = \'release.rolled_back\'')) return []
      if (sql.includes('FROM page_studio_release_pointers')) {
        return [{
          active_release_id: rollback().expectedActiveReleaseId,
          client_id: scope.clientId,
          site_id: scope.siteId,
          tenant_id: scope.tenantId
        }]
      }
      if (sql.includes('FROM page_studio_releases') && sql.includes('build.state')) {
        return [{
          ...buildRow,
          environment: 'staging',
          normalized_hostname: hostname,
          release_id: releaseId
        }]
      }
      return []
    })

    await expect(rollbackPageStudioRelease(rollback(), {
      runTransaction: db.runTransaction
    })).resolves.toMatchObject({ environment: 'staging', releaseId })

    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_releases')))
      .toBe(false)
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('page_studio_builds') && String(sql).startsWith('INSERT')))
      .toBe(false)
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('\'release.rolled_back\''),
      expect.arrayContaining([scope.tenantId, scope.clientId, scope.siteId, actorId, releaseId])
    )
  })

  it('rejects a stale current pointer before loading the rollback target', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('action = \'release.rolled_back\'')) return []
      if (sql.includes('FROM page_studio_release_pointers')) {
        return [{
          active_release_id: '77777777-7777-4777-8777-777777777777',
          client_id: scope.clientId,
          site_id: scope.siteId,
          tenant_id: scope.tenantId
        }]
      }
      return []
    })

    await expect(rollbackPageStudioRelease(rollback(), {
      runTransaction: db.runTransaction
    })).rejects.toMatchObject({ code: 'RELEASE_POINTER_CONFLICT', statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('build.state'))).toBe(false)
  })

  it('rejects the current release and releases from another environment or hostname as rollback targets', async () => {
    await expect(rollbackPageStudioRelease(rollback({
      targetReleaseId: rollback().expectedActiveReleaseId
    }), { runTransaction: database(() => []).runTransaction })).rejects.toMatchObject({
      code: 'ROLLBACK_TARGET_INVALID',
      statusCode: 422
    })

    for (const targetRows of [[], [{
      ...buildRow,
      environment: 'production',
      normalized_hostname: hostname,
      release_id: releaseId
    }], [{
      ...buildRow,
      environment: 'staging',
      normalized_hostname: 'other.staging.pages.xeroflow.com',
      release_id: releaseId
    }]]) {
      const db = database((sql) => {
        if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
        if (sql.includes('action = \'release.rolled_back\'')) return []
        if (sql.includes('FROM page_studio_release_pointers')) {
          return [{
            active_release_id: rollback().expectedActiveReleaseId,
            client_id: scope.clientId,
            site_id: scope.siteId,
            tenant_id: scope.tenantId
          }]
        }
        if (sql.includes('FROM page_studio_releases') && sql.includes('build.state')) return targetRows
        return []
      })
      await expect(rollbackPageStudioRelease(rollback(), {
        runTransaction: db.runTransaction
      })).rejects.toMatchObject({ code: 'ROLLBACK_TARGET_INVALID', statusCode: 422 })
    }
  })

  it('returns the original target for an exact rollback replay without moving the pointer again', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('action = \'release.rolled_back\'')) {
        return [{
          ...buildRow,
          actor_id: actorId,
          environment: 'staging',
          normalized_hostname: hostname,
          previous_release_id: rollback().expectedActiveReleaseId,
          release_id: releaseId
        }]
      }
      return []
    })

    await expect(rollbackPageStudioRelease(rollback(), {
      runTransaction: db.runTransaction
    })).resolves.toMatchObject({ releaseId })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('FROM page_studio_release_pointers')))
      .toBe(false)
  })

  it('conflicts when a rollback idempotency key is replayed with changed input', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('action = \'release.rolled_back\'')) {
        return [{
          ...buildRow,
          actor_id: actorId,
          environment: 'production',
          normalized_hostname: hostname,
          previous_release_id: rollback().expectedActiveReleaseId,
          release_id: releaseId
        }]
      }
      return []
    })

    await expect(rollbackPageStudioRelease(rollback(), {
      runTransaction: db.runTransaction
    })).rejects.toMatchObject({ code: 'RELEASE_IDEMPOTENCY_CONFLICT', statusCode: 409 })
  })
})
