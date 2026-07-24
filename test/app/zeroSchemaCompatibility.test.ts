import { describe, expect, it } from 'vitest'
import { schema } from '../../app/zero/schema'

describe('Zero schema compatibility', () => {
  it('normalizes the legacy agency schema for Zero 1.x', () => {
    expect(schema.enableLegacyQueries).toBe(true)
    expect(schema.enableLegacyMutators).toBe(true)
    expect(schema.tables.agencyClients).toMatchObject({
      name: 'agencyClients',
      serverName: 'agency_clients',
      primaryKey: ['id'],
    })
    expect(schema.relationships.projects?.client).toEqual([
      {
        sourceField: ['clientId'],
        destField: ['id'],
        destSchema: 'agencyClients',
        cardinality: 'one',
      },
    ])
    expect(schema.tables.taskLabelAssignments.primaryKey).toEqual(['taskId', 'labelId'])
  })
})
