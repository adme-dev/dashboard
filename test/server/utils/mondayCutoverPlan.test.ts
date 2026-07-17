import { describe, expect, it } from 'vitest'
import { buildMondayCutoverPlan } from '~~/server/utils/mondayCutoverPlan'

describe('buildMondayCutoverPlan', () => {
  it('keeps runtime measurement fields out of task columns and exposes only governed mappings', () => {
    const plan = buildMondayCutoverPlan({
      sourceBoard: {
        id: '18422459929',
        name: 'Meta CAPI Rollout',
        state: 'active',
        groups: [{ id: 'topics', title: 'Rollout' }],
        columns: [
          { id: 'name', title: 'Name', type: 'name' },
          { id: 'dealer', title: 'Dealer Group', type: 'dropdown' },
          { id: 'domain', title: 'Domain', type: 'text' },
          { id: 'dataset', title: 'Pixel / Dataset ID', type: 'text' },
          { id: 'token', title: 'CAPI Token', type: 'status' },
          { id: 'fbp', title: 'fbp/fbc Capture', type: 'status' },
          { id: 'tests', title: 'Test Events Verified', type: 'status' },
          { id: 'dedup', title: 'Dedup (event_id)', type: 'status' },
          { id: 'consent', title: 'Consent Signal', type: 'status' },
          { id: 'go_live', title: 'Go-Live', type: 'date' },
          { id: 'owner', title: 'Owner', type: 'people' },
          { id: 'notes', title: 'Notes', type: 'long_text' },
          { id: 'subitems', title: 'Subitems', type: 'subtasks' }
        ]
      },
      sourceRecords: [],
      targetBoard: { id: '86054ef6-6454-46fb-9002-1ba4d8d060b8', name: 'Meta CAPI Rollout' },
      targetTasks: [],
      clients: [],
      isSourceTruncated: false
    })

    expect(plan.mode).toBe('dry_run')
    expect(plan.columnMappings).toEqual([
      expect.objectContaining({ sourceColumnId: 'name', destination: 'task.title', action: 'import' }),
      expect.objectContaining({ sourceColumnId: 'dealer', destination: 'agencyClient', action: 'review' }),
      expect.objectContaining({ sourceColumnId: 'domain', destination: 'measurementProfile', action: 'exclude' }),
      expect.objectContaining({ sourceColumnId: 'dataset', destination: 'measurementDestination', action: 'exclude' }),
      expect.objectContaining({ sourceColumnId: 'token', destination: 'measurementCredential', action: 'exclude' }),
      expect.objectContaining({ sourceColumnId: 'fbp', destination: 'measurementCapability', action: 'exclude' }),
      expect.objectContaining({ sourceColumnId: 'tests', destination: 'measurementValidation', action: 'exclude' }),
      expect.objectContaining({ sourceColumnId: 'dedup', destination: 'measurementEventIdentity', action: 'exclude' }),
      expect.objectContaining({ sourceColumnId: 'consent', destination: 'measurementConsent', action: 'exclude' }),
      expect.objectContaining({ sourceColumnId: 'go_live', destination: 'task.dueDate', action: 'import' }),
      expect.objectContaining({ sourceColumnId: 'owner', destination: 'task.assigneeId', action: 'review' }),
      expect.objectContaining({ sourceColumnId: 'notes', destination: 'task.description', action: 'review' }),
      expect.objectContaining({ sourceColumnId: 'subitems', destination: 'task.parentTaskId', action: 'import' })
    ])
  })

  it('prefers provenance, requires review for title-only matches, and suggests clients without auto-linking fuzzy results', () => {
    const plan = buildMondayCutoverPlan({
      sourceBoard: {
        id: '18422459929',
        name: 'Meta CAPI Rollout',
        state: 'active',
        groups: [{ id: 'topics', title: 'Rollout' }],
        columns: []
      },
      sourceRecords: [
        {
          id: '1001',
          title: 'Alan Mance Motors',
          state: 'active',
          createdAt: '2026-07-17T00:00:00Z',
          updatedAt: '2026-07-18T00:00:00Z',
          parentSourceId: null,
          groupId: 'topics',
          groupTitle: 'Rollout',
          subitemCount: 0,
          clientHint: 'Alan Mance Motors'
        },
        {
          id: '1002',
          title: 'Blood / BM Group',
          state: 'active',
          createdAt: '2026-07-17T00:00:00Z',
          updatedAt: '2026-07-18T00:00:00Z',
          parentSourceId: null,
          groupId: 'topics',
          groupTitle: 'Rollout',
          subitemCount: 0,
          clientHint: 'Blood / BM Group'
        },
        {
          id: '1003',
          title: 'Zero Measurement Signal Hub — production foundation',
          state: 'active',
          createdAt: '2026-07-17T00:00:00Z',
          updatedAt: '2026-07-18T00:00:00Z',
          parentSourceId: null,
          groupId: 'topics',
          groupTitle: 'Rollout',
          subitemCount: 1,
          clientHint: null
        },
        {
          id: '1101',
          title: 'Verify event identity',
          state: 'active',
          createdAt: '2026-07-17T00:00:00Z',
          updatedAt: '2026-07-18T00:00:00Z',
          parentSourceId: '1003',
          groupId: null,
          groupTitle: null,
          subitemCount: 0,
          clientHint: null
        }
      ],
      targetBoard: { id: '86054ef6-6454-46fb-9002-1ba4d8d060b8', name: 'Meta CAPI Rollout' },
      targetTasks: [
        {
          id: 'task-alan',
          title: 'Alan Mance Motors',
          parentTaskId: null,
          statusName: 'To Do',
          mondayItemId: '1001',
          mondayBoardId: '18422459929',
          reconciliationStatus: 'current'
        },
        {
          id: 'task-foundation',
          title: 'Zero Measurement Signal Hub — production foundation',
          parentTaskId: null,
          statusName: 'To Do',
          mondayItemId: null,
          mondayBoardId: null,
          reconciliationStatus: null
        },
        {
          id: 'task-native-only',
          title: 'P1 — Canonical control plane',
          parentTaskId: null,
          statusName: 'Verified',
          mondayItemId: null,
          mondayBoardId: null,
          reconciliationStatus: null
        }
      ],
      clients: [
        { id: 'client-alan', name: 'Alan Mance Motors', measurementProfileId: 'profile-alan' },
        { id: 'client-blood', name: 'Blood Hyundai', measurementProfileId: null },
        { id: 'client-bmw', name: 'BM Motor Group', measurementProfileId: 'profile-bmw' }
      ],
      isSourceTruncated: false
    })

    expect(plan.records.find(record => record.sourceId === '1001')).toEqual(expect.objectContaining({
      action: 'reuse',
      match: expect.objectContaining({ strategy: 'provenance', targetTaskId: 'task-alan' }),
      clientLink: {
        status: 'exact',
        clientId: 'client-alan',
        clientName: 'Alan Mance Motors',
        measurementProfileId: 'profile-alan',
        candidates: []
      }
    }))
    expect(plan.records.find(record => record.sourceId === '1002')).toEqual(expect.objectContaining({
      action: 'create',
      match: expect.objectContaining({ strategy: 'none', targetTaskId: null }),
      clientLink: expect.objectContaining({
        status: 'suggested',
        clientId: null,
        candidates: expect.arrayContaining([
          expect.objectContaining({ clientId: 'client-blood', clientName: 'Blood Hyundai' })
        ])
      })
    }))
    expect(plan.records.find(record => record.sourceId === '1003')).toEqual(expect.objectContaining({
      action: 'review',
      match: expect.objectContaining({ strategy: 'title', targetTaskId: 'task-foundation' }),
      clientLink: expect.objectContaining({ status: 'not_applicable' })
    }))
    expect(plan.records.find(record => record.sourceId === '1101')).toEqual(expect.objectContaining({
      action: 'create',
      parentSourceId: '1003'
    }))
    expect(plan.targetOnly).toEqual([
      expect.objectContaining({ id: 'task-native-only', title: 'P1 — Canonical control plane' })
    ])
    expect(plan.summary).toEqual(expect.objectContaining({
      sourceRecords: 4,
      targetRecords: 3,
      mappedByProvenance: 1,
      matchedByTitleForReview: 1,
      toCreate: 2,
      ambiguous: 0,
      targetOnly: 1,
      isReadyForImport: false
    }))
    expect(plan.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CLIENT_LINK_REQUIRED', sourceId: '1002', severity: 'blocking' }),
      expect.objectContaining({ code: 'TITLE_MATCH_REQUIRES_PROVENANCE', sourceId: '1003', severity: 'blocking' })
    ]))
  })

  it('blocks truncated source data and ambiguous title matches', () => {
    const plan = buildMondayCutoverPlan({
      sourceBoard: {
        id: '18422459929',
        name: 'Meta CAPI Rollout',
        state: 'active',
        groups: [],
        columns: []
      },
      sourceRecords: [{
        id: '1001',
        title: 'Duplicate task',
        state: 'active',
        createdAt: '2026-07-17T00:00:00Z',
        updatedAt: '2026-07-18T00:00:00Z',
        parentSourceId: null,
        groupId: null,
        groupTitle: null,
        subitemCount: 0,
        clientHint: null
      }],
      targetBoard: { id: '86054ef6-6454-46fb-9002-1ba4d8d060b8', name: 'Meta CAPI Rollout' },
      targetTasks: [
        { id: 'task-1', title: 'Duplicate task', parentTaskId: null, statusName: 'To Do', mondayItemId: null, mondayBoardId: null, reconciliationStatus: null },
        { id: 'task-2', title: 'Duplicate task', parentTaskId: null, statusName: 'To Do', mondayItemId: null, mondayBoardId: null, reconciliationStatus: null }
      ],
      clients: [],
      isSourceTruncated: true
    })

    expect(plan.records[0]).toEqual(expect.objectContaining({
      action: 'review',
      match: { strategy: 'ambiguous', targetTaskId: null, candidateTaskIds: ['task-1', 'task-2'] }
    }))
    expect(plan.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SOURCE_TRUNCATED', severity: 'blocking' }),
      expect.objectContaining({ code: 'AMBIGUOUS_TITLE_MATCH', sourceId: '1001', severity: 'blocking' })
    ]))
    expect(plan.summary).toEqual(expect.objectContaining({ ambiguous: 1, isReadyForImport: false }))
  })
})
