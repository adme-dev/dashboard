import { describe, expect, it } from 'vitest'
import {
  LakebasePilotSafetyError,
  redactPilotTarget,
  resolvePilotMode,
  resolvePilotTarget
} from '../../scripts/lakebase-pilot/contracts'

const safeEnv = {
  LAKEBASE_PILOT_PROJECT_ID: 'pilot-green-river-12345678',
  LAKEBASE_PILOT_ENDPOINT_ID: 'ep-pilot-green-river-a1b2c3d4',
  LAKEBASE_PILOT_DATABASE_URL: 'postgresql://pilot:secret@ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  NEON_PRODUCTION_PROJECT_ID: 'prod-silent-tree-87654321',
  DATABASE_URL: 'postgresql://prod:secret@ep-prod-silent-tree-z9y8x7w6.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT: '1'
}

describe('Lakebase pilot safety contract', () => {
  it('rejects missing identifiers, same-project targets, same database URLs, and missing mutation acknowledgement', () => {
    expect(() => resolvePilotTarget({}, 'read')).toThrow(LakebasePilotSafetyError)
    expect(() => resolvePilotTarget({ ...safeEnv, LAKEBASE_PILOT_PROJECT_ID: safeEnv.NEON_PRODUCTION_PROJECT_ID }, 'read'))
      .toThrow('production_project_targeted')
    expect(() => resolvePilotTarget({ ...safeEnv, LAKEBASE_PILOT_DATABASE_URL: safeEnv.DATABASE_URL }, 'read'))
      .toThrow('production_database_targeted')
    expect(() => resolvePilotTarget({ ...safeEnv, LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT: undefined }, 'mutate'))
      .toThrow('mutation_not_confirmed')
  })

  it('requires the URL host to belong to the declared endpoint and rejects direct/pooler production aliases', () => {
    expect(() => resolvePilotTarget({
      ...safeEnv,
      LAKEBASE_PILOT_ENDPOINT_ID: 'ep-another-endpoint-aabbccdd'
    }, 'read')).toThrow('pilot_endpoint_database_mismatch')

    expect(() => resolvePilotTarget({
      ...safeEnv,
      LAKEBASE_PILOT_ENDPOINT_ID: 'ep-prod-silent-tree-z9y8x7w6',
      LAKEBASE_PILOT_DATABASE_URL: 'postgresql://pilot:secret@ep-prod-silent-tree-z9y8x7w6.ap-southeast-2.aws.neon.tech/app?sslmode=require',
      DATABASE_URL: 'postgresql://prod:secret@ep-prod-silent-tree-z9y8x7w6-pooler.ap-southeast-2.aws.neon.tech/app?sslmode=require'
    }, 'read')).toThrow('production_database_targeted')
  })

  it('never includes credentials in redacted output', () => {
    const target = resolvePilotTarget(safeEnv, 'mutate')
    const output = JSON.stringify(redactPilotTarget(target))
    expect(output).not.toContain('secret')
    expect(output).not.toContain('postgresql://')
    expect(output).toContain('ep-pilot-green-river-a1b2c3d4')
  })

  it('defaults to off, allows shadow and bm25 only for the pilot, and rejects hybrid', () => {
    const target = resolvePilotTarget(safeEnv, 'mutate')
    expect(resolvePilotMode(undefined, target)).toBe('off')
    expect(resolvePilotMode('shadow', target)).toBe('shadow')
    expect(resolvePilotMode('bm25', target)).toBe('bm25')
    expect(() => resolvePilotMode('hybrid', target)).toThrow('hybrid_not_approved')
  })
})
