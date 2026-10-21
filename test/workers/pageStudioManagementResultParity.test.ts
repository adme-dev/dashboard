import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cmsManagementResultSchema } from '~~/shared/pageStudio/cmsManagementContract'
import { CompletedManagedTransferManagementResultSchema } from '~~/shared/pageStudio/completed-managed-transfer-management'
import { ManagedTransferCopyExecutionManagementResultSchema } from '~~/shared/pageStudio/managed-transfer-copy-execution-management'
import { ManagedTransferCopyManagementResultSchema } from '~~/shared/pageStudio/managed-transfer-copy-management'
import { ManagedTransferDestinationAuthoringManagementResultSchema } from '~~/shared/pageStudio/managed-transfer-destination-authoring-management'
import { ManagedTransferSourceRetentionManagementResultSchema } from '~~/shared/pageStudio/managed-transfer-source-retention-management'
import { TransferControlsResponseSchema } from '~~/shared/pageStudio/transferControls'
import { TransferWorkflowResponseSchema } from '~~/shared/pageStudio/transferWorkflow'

const id = '10000000-0000-4000-8000-000000000001', digest = 'a'.repeat(64)
const status = { phase: 'idle', adoptionId: null, progress: null, recoveryId: null, recoveryRequired: false,
  recoveryReason: null, receiptDigest: null, application: null, progressDigest: digest }
const commit = { acknowledged: true, operationId: 'op_1', checkpointId: 'cp_1', application: { id, digest }, versionId: null,
  currentCheckpointId: null, isCurrent: true }
const cases = [
  { name: 'CMS adoption', schema: cmsManagementResultSchema('adoption'), value: status, coded: true },
  { name: 'CMS transition', schema: cmsManagementResultSchema('transition'), value: commit, coded: true },
  { name: 'CMS checkpoint', schema: cmsManagementResultSchema('checkpoint'), value: commit, coded: true },
  { name: 'CMS restore', schema: cmsManagementResultSchema('restore'), value: { checkpointId: 'cp_1', currentCheckpointId: null, isCurrent: true }, coded: true },
  { name: 'completion', schema: CompletedManagedTransferManagementResultSchema, value: { siteId: id, completed: true,
    editorConnection: 'pending', sourceRetention: 'pending', canRetryConnection: true, canRetryRetention: true } },
  { name: 'copy execution', schema: ManagedTransferCopyExecutionManagementResultSchema, value: { operationId: id, state: 'not-started' } },
  { name: 'copy admission', schema: ManagedTransferCopyManagementResultSchema, value: { operationId: id, state: 'not-started' } },
  { name: 'destination authoring', schema: ManagedTransferDestinationAuthoringManagementResultSchema, value: null },
  { name: 'source retention', schema: ManagedTransferSourceRetentionManagementResultSchema, value: null },
  { name: 'transfer controls', schema: TransferControlsResponseSchema, value: { requests: [], nextCursor: null } },
  { name: 'transfer workflow', schema: TransferWorkflowResponseSchema, value: { siteId: id, requestId: id, revision: 1,
    phases: [{ phase: 'resources', state: 'not-started', allowedActions: ['start'] }] } }
]

// These compact fingerprints were captured from the original committed schemas.
// Include complete parsed output or ordered Zod issues, not merely success booleans.
describe('private management result wire parity', () => {
  it('preserves the baseline accepted/rejected/output/issue matrix for every result contract', () => {
    const summaries = cases.map(({ name, schema, value, coded }) => {
      const success = { ok: true, requestDigest: digest, value }
      expect(schema.parse(success)).toStrictEqual(success)
      const inputs: unknown[] = [success, { ...success, extra: true }, { ...success, ok: 'true' }, { ...success, ok: 1 },
        { ...success, value: undefined }, { ...success, requestDigest: undefined }, null, [], {},
        ...['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), null, 1].map(requestDigest => ({ ...success, requestDigest })),
        ...[null, {}, [], 1, 'text', { ...value as object, extra: true }].map(value => ({ ...success, value }))]
      for (const statusCode of [-1, 0, 399, 400, 401, 403, 404, 409, 413, 422, 429, 500, 503, 599, 600, 1.5, NaN, Infinity, '503', null]) {
        for (const message of ['', 'safe', 'a'.repeat(160), 'a'.repeat(161), 'a'.repeat(256), 'a'.repeat(257), 'a'.repeat(512), 'a'.repeat(513), null, 1]) {
          const error = { ...(coded ? { code: 'CMS_FAILURE' } : {}), statusCode, message }
          inputs.push({ ok: false, requestDigest: digest, error })
        }
      }
      const error = { ...(coded ? { code: 'CMS_FAILURE' } : {}), statusCode: 503, message: 'safe' }
      inputs.push({ ok: false, requestDigest: digest, error: { ...error, extra: true } },
        { ok: false, requestDigest: digest, error, extra: true }, { ok: false, requestDigest: digest, error: null })
      for (const code of ['', 'x', 'X', 'CMS_FAIL', 'X'.repeat(128), 'X'.repeat(129), 1, null])
        inputs.push({ ok: false, requestDigest: digest, error: { ...error, code } })
      const results = inputs.map(input => {
        const result = schema.safeParse(input)
        return result.success ? { success: true, data: result.data } : { success: false, issues: result.error.issues }
      })
      return { name, cases: results.length, accepted: results.filter(result => result.success).length,
        sha256: createHash('sha256').update(JSON.stringify(results)).digest('hex') }
    })
    expect(summaries).toMatchInlineSnapshot(`
      [
        {
          "accepted": 66,
          "cases": 233,
          "name": "CMS adoption",
          "sha256": "c3606f190fbe4a02d834d9251f9ea998bde0065dae412168b9392ebdca9cd566",
        },
        {
          "accepted": 66,
          "cases": 233,
          "name": "CMS transition",
          "sha256": "ea6c0435b0b54aa2e74c2658ab8b88c2ea5010a9739404ade71e746018adb815",
        },
        {
          "accepted": 66,
          "cases": 233,
          "name": "CMS checkpoint",
          "sha256": "ea6c0435b0b54aa2e74c2658ab8b88c2ea5010a9739404ade71e746018adb815",
        },
        {
          "accepted": 66,
          "cases": 233,
          "name": "CMS restore",
          "sha256": "3dd993a7e3ce51f72048173ae853082e91f035597a319cf6050c1fdc52d50dc1",
        },
        {
          "accepted": 45,
          "cases": 233,
          "name": "completion",
          "sha256": "16c328750d40f90397b420e8b3cf1d4d4ae78edc4331dc3e37bd09aed8fc19b3",
        },
        {
          "accepted": 76,
          "cases": 233,
          "name": "copy execution",
          "sha256": "356e6548f1d0d44320b5649fd1f82537b80d36bb24b34e76b7ac142f2bc275be",
        },
        {
          "accepted": 76,
          "cases": 233,
          "name": "copy admission",
          "sha256": "5ea8412ec07f2ab591853ce09375b1f5c3383bef5b8c31ce0ac2ab43e1755c05",
        },
        {
          "accepted": 51,
          "cases": 233,
          "name": "destination authoring",
          "sha256": "84510176f8a57ebe6d10e9f4719f8e57dcb4732bcdb1c228b064d78d7bbac08f",
        },
        {
          "accepted": 51,
          "cases": 233,
          "name": "source retention",
          "sha256": "84510176f8a57ebe6d10e9f4719f8e57dcb4732bcdb1c228b064d78d7bbac08f",
        },
        {
          "accepted": 47,
          "cases": 233,
          "name": "transfer controls",
          "sha256": "34dddce0ca2b7c235f9aac1da4b515caa75bdea101f41c8590937377f68e04b0",
        },
        {
          "accepted": 34,
          "cases": 233,
          "name": "transfer workflow",
          "sha256": "52ceb33d0158d2ded315995d1c919059186518a0148323aac40fdf7d82f4e453",
        },
      ]
    `)
  })

  it('retains the intentionally different error bounds and completion refinement', () => {
    const error = (statusCode: number, message = '') => ({ ok: false, requestDigest: digest, error: { statusCode, message } })
    expect(ManagedTransferCopyManagementResultSchema.safeParse(error(0)).success).toBe(true)
    expect(TransferControlsResponseSchema.safeParse(error(0)).success).toBe(true)
    expect(TransferWorkflowResponseSchema.safeParse(error(0)).success).toBe(false)
    expect(TransferWorkflowResponseSchema.safeParse(error(400)).success).toBe(true)
    expect(CompletedManagedTransferManagementResultSchema.safeParse(error(400)).success).toBe(false)
    expect(CompletedManagedTransferManagementResultSchema.safeParse(error(400, 'safe')).success).toBe(true)
    expect(cmsManagementResultSchema('adoption').safeParse({ ...error(500, 'safe'), error: { code: 'CMS_FAILURE', statusCode: 500, message: 'safe' } }).success).toBe(false)
    const completion = cases.find(value => value.name === 'completion')!.value
    expect(CompletedManagedTransferManagementResultSchema.safeParse({ ok: true, requestDigest: digest,
      value: { ...completion as object, canRetryConnection: false } }).success).toBe(false)
  })
})
