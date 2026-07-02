import { describe, expect, it, vi } from 'vitest'
import {
  LINKEDIN_ORGANIC_OAUTH_SCOPES,
  LINKEDIN_REST_VERSION,
  buildLinkedInOrganicAuthUrl,
  discoverLinkedInOrganizations,
  getLinkedInDiscoveryErrorReason,
  mapLinkedInOrganizationsToAccountRows,
  type LinkedInOrganizationSelection
} from '~~/server/utils/socialOAuth/linkedin'

const { ofetchSpy } = vi.hoisted(() => ({ ofetchSpy: vi.fn() }))
vi.mock('ofetch', () => ({ ofetch: ofetchSpy }))

describe('buildLinkedInOrganicAuthUrl', () => {
  it('requests the organic member-share and organization-admin scopes with signed state', () => {
    const url = new URL(buildLinkedInOrganicAuthUrl('linkedin-client', 'https://app.xeroflow.io/linkedin', 'STATE'))
    expect(`${url.origin}${url.pathname}`).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('linkedin-client')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.xeroflow.io/linkedin')
    expect(url.searchParams.get('state')).toBe('STATE')
    expect(url.searchParams.get('scope')).toBe(LINKEDIN_ORGANIC_OAUTH_SCOPES.join(' '))
  })
})

describe('discoverLinkedInOrganizations', () => {
  it('finds approved administrator organizations and hydrates their names', async () => {
    ofetchSpy
      .mockResolvedValueOnce({
        elements: [
          {
            role: 'ADMINISTRATOR',
            state: 'APPROVED',
            organization: 'urn:li:organization:79988552'
          },
          {
            role: 'ADMINISTRATOR',
            state: 'APPROVED',
            organizationTarget: 'urn:li:organization:27056405'
          }
        ]
      })
      .mockResolvedValueOnce({
        results: {
          79988552: { id: 79988552, localizedName: 'FirstDemoCompany', vanityName: 'firstdemocompany' },
          27056405: { id: 27056405, name: { localized: { en_US: 'Second Demo' } } }
        },
        statuses: { 79988552: 200, 27056405: 200 },
        errors: {}
      })

    const organizations = await discoverLinkedInOrganizations('AT')

    expect(ofetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100&start=0',
      { headers: linkedinHeaders() }
    )
    expect(ofetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://api.linkedin.com/rest/organizations?ids=List(79988552,27056405)',
      { headers: linkedinHeaders() }
    )
    expect(organizations).toEqual([
      {
        id: '79988552',
        urn: 'urn:li:organization:79988552',
        name: 'FirstDemoCompany',
        vanityName: 'firstdemocompany',
        role: 'ADMINISTRATOR'
      },
      {
        id: '27056405',
        urn: 'urn:li:organization:27056405',
        name: 'Second Demo',
        vanityName: null,
        role: 'ADMINISTRATOR'
      }
    ])
  })
})

describe('mapLinkedInOrganizationsToAccountRows', () => {
  const organizations: LinkedInOrganizationSelection[] = [{
    id: '79988552',
    urn: 'urn:li:organization:79988552',
    name: 'FirstDemoCompany',
    vanityName: 'firstdemocompany',
    role: 'ADMINISTRATOR'
  }]

  it('maps administered organizations to linkedin publishing account rows', () => {
    const rows = mapLinkedInOrganizationsToAccountRows(organizations, 'AT', 'RT', '2026-01-01T00:00:00.000Z')
    expect(rows).toEqual([{
      platform: 'linkedin',
      platform_account_id: '79988552',
      account_name: 'FirstDemoCompany',
      access_token: 'AT',
      refresh_token: 'RT',
      token_expires_at: '2026-01-01T00:00:00.000Z',
      metadata: {
        linkedinOrganizationUrn: 'urn:li:organization:79988552',
        linkedinVanityName: 'firstdemocompany',
        linkedinRole: 'ADMINISTRATOR',
        publishingReadiness: 'oauth_connected_publish_not_enabled'
      }
    }])
  })
})

describe('getLinkedInDiscoveryErrorReason', () => {
  it('classifies invalid scope responses', () => {
    expect(getLinkedInDiscoveryErrorReason({
      statusCode: 401,
      data: { message: 'Invalid scope permissions passed in the request' }
    })).toBe('linkedin_invalid_scope')
  })

  it('keeps unknown discovery errors generic', () => {
    expect(getLinkedInDiscoveryErrorReason(new Error('socket closed'))).toBe('linkedin_organization_list_failed')
  })
})

function linkedinHeaders() {
  return {
    'Authorization': 'Bearer AT',
    'LinkedIn-Version': LINKEDIN_REST_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json'
  }
}
