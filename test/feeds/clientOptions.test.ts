import { describe, expect, it, vi } from 'vitest'
import { listDealerFeedClientOptions } from '~~/server/utils/feeds/clientOptions'

type QueryRows = NonNullable<Parameters<typeof listDealerFeedClientOptions>[0]['queryRows']>

describe('listDealerFeedClientOptions', () => {
  it('combines active agency clients with unmapped social ad accounts', async () => {
    const queryRowsMock = vi.fn(async (sql: string) => {
      if (sql.includes('FROM agency_clients')) {
        return [
          { id: 'client-1', name: 'Arctic Campers', is_active: true }
        ]
      }

      return [
        {
          name: 'Blood Hyundai',
          platforms: ['google', 'meta'],
          connection_ids: ['google-conn', 'meta-conn']
        }
      ]
    })
    const queryRows = queryRowsMock as unknown as QueryRows

    await expect(listDealerFeedClientOptions({ queryRows })).resolves.toEqual([
      {
        id: 'client:client-1',
        label: 'Arctic Campers',
        name: 'Arctic Campers',
        source: 'agency',
        clientId: 'client-1',
        isActive: true,
        socialConnectionIds: [],
        socialPlatforms: []
      },
      {
        id: 'social:Blood Hyundai',
        label: 'Blood Hyundai · ad account',
        name: 'Blood Hyundai',
        source: 'social',
        clientId: null,
        isActive: true,
        socialConnectionIds: ['google-conn', 'meta-conn'],
        socialPlatforms: ['google', 'meta']
      }
    ])
  })

  it('only selects social accounts that are not already mapped to an agency client', async () => {
    const queryRowsMock = vi.fn(async () => [])
    const queryRows = queryRowsMock as unknown as QueryRows

    await listDealerFeedClientOptions({ queryRows })

    expect(queryRowsMock.mock.calls[1][0]).toContain('WHERE mapped_client_id IS NULL')
    expect(queryRowsMock.mock.calls[1][0]).toContain('sc.status = ')
    expect(queryRowsMock.mock.calls[1][1][0]).toContain('meta')
    expect(queryRowsMock.mock.calls[1][1][0]).toContain('google')
  })
})
