import { ofetch } from 'ofetch'

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'
const GOOGLE_DATA_MANAGER_BASE = 'https://datamanager.googleapis.com/v1'

export interface HashedAudienceMember {
  profileId: string
  emailHash: string | null
  phoneHash: string | null
  fingerprint: string
}

export function normalizeAudienceEmail(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

export function normalizeAudiencePhone(value: string | null | undefined): string | null {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `61${digits.slice(1)}`
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

export async function sha256AudienceValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashAudienceMember(input: {
  profileId: string
  email?: string | null
  phone?: string | null
}): Promise<HashedAudienceMember | null> {
  const email = normalizeAudienceEmail(input.email)
  const phone = normalizeAudiencePhone(input.phone)
  if (!email && !phone) return null
  const emailHash = email ? await sha256AudienceValue(email) : null
  const phoneHash = phone ? await sha256AudienceValue(phone) : null
  return {
    profileId: input.profileId,
    emailHash,
    phoneHash,
    fingerprint: await sha256AudienceValue(`${emailHash ?? ''}:${phoneHash ?? ''}`)
  }
}

interface MetaResponse {
  id?: string
  num_received?: number
  error?: { message?: string, code?: number }
}

function metaError(response: MetaResponse, fallback: string): Error {
  const error = new Error(response.error?.message || fallback) as Error & { code?: string }
  error.code = response.error?.code ? `META_${response.error.code}` : 'META_REQUEST_FAILED'
  return error
}

export async function createMetaCustomAudience(input: {
  accessToken: string
  accountId: string
  name: string
  description: string
}): Promise<string> {
  const accountId = input.accountId.replace(/^act_/, '')
  const response = await ofetch<MetaResponse>(
    `${META_GRAPH_BASE}/act_${accountId}/customaudiences`,
    {
      method: 'POST',
      body: {
        access_token: input.accessToken,
        name: input.name,
        subtype: 'CUSTOM',
        description: input.description,
        customer_file_source: 'USER_PROVIDED_ONLY'
      }
    }
  )
  if (!response.id) throw metaError(response, 'Meta did not return a Custom Audience ID')
  return response.id
}

export async function mutateMetaCustomAudience(input: {
  accessToken: string
  audienceId: string
  operation: 'add' | 'remove'
  members: HashedAudienceMember[]
}): Promise<{ received: number }> {
  let received = 0
  const groups = new Map<string, HashedAudienceMember[]>()
  for (const member of input.members) {
    const key = `${member.emailHash ? 'email' : ''}:${member.phoneHash ? 'phone' : ''}`
    groups.set(key, [...(groups.get(key) || []), member])
  }
  for (const [key, members] of groups) {
    const schema: string[] = []
    if (key.includes('email')) schema.push('EMAIL_SHA256')
    if (key.includes('phone')) schema.push('PHONE_SHA256')
    for (let index = 0; index < members.length; index += 500) {
      const batch = members.slice(index, index + 500)
      const response = await ofetch<MetaResponse>(
        `${META_GRAPH_BASE}/${input.audienceId}/users`,
        {
          method: input.operation === 'remove' ? 'DELETE' : 'POST',
          body: {
            access_token: input.accessToken,
            payload: {
              schema,
              data: batch.map(member => [
                ...(member.emailHash ? [member.emailHash] : []),
                ...(member.phoneHash ? [member.phoneHash] : [])
              ])
            }
          }
        }
      )
      if (response.error) throw metaError(response, `Meta audience ${input.operation} failed`)
      received += response.num_received ?? batch.length
    }
  }
  return { received }
}

function googleHeaders(accessToken: string, loginCustomerId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
  if (loginCustomerId) {
    headers['login-account'] = `accountTypes/GOOGLE_ADS/accounts/${loginCustomerId.replace(/\D/g, '')}`
  }
  return headers
}

export async function createGoogleCustomerMatchAudience(input: {
  accessToken: string
  customerId: string
  loginCustomerId?: string | null
  name: string
  description: string
  integrationCode: string
  membershipDays?: number
  validateOnly?: boolean
}): Promise<{ id: string | null, name: string | null }> {
  const customerId = input.customerId.replace(/\D/g, '')
  const result = await ofetch<{ id?: string, name?: string }>(
    `${GOOGLE_DATA_MANAGER_BASE}/accountTypes/GOOGLE_ADS/accounts/${customerId}/userLists`,
    {
      method: 'POST',
      headers: googleHeaders(input.accessToken, input.loginCustomerId),
      query: { validateOnly: input.validateOnly === true },
      body: {
        displayName: input.name,
        description: input.description,
        integrationCode: input.integrationCode,
        membershipDuration: `${(input.membershipDays ?? 180) * 86400}s`,
        ingestedUserListInfo: {
          contactIdInfo: { dataSourceType: 'DATA_SOURCE_TYPE_FIRST_PARTY' },
          uploadKeyTypes: ['CONTACT_ID']
        }
      }
    }
  )
  return { id: result.id ?? null, name: result.name ?? null }
}

function googleDestination(input: {
  customerId: string
  loginCustomerId?: string | null
  audienceId: string
}) {
  return {
    operatingAccount: {
      accountId: input.customerId.replace(/\D/g, ''),
      accountType: 'GOOGLE_ADS'
    },
    ...(input.loginCustomerId
      ? {
          loginAccount: {
            accountId: input.loginCustomerId.replace(/\D/g, ''),
            accountType: 'GOOGLE_ADS'
          }
        }
      : {}),
    productDestinationId: input.audienceId
  }
}

export async function mutateGoogleCustomerMatchAudience(input: {
  accessToken: string
  customerId: string
  loginCustomerId?: string | null
  audienceId: string
  operation: 'add' | 'remove'
  members: HashedAudienceMember[]
}): Promise<string[]> {
  const requestIds: string[] = []
  for (let index = 0; index < input.members.length; index += 10_000) {
    const batch = input.members.slice(index, index + 10_000)
    const response = await ofetch<{ requestId: string }>(
      `${GOOGLE_DATA_MANAGER_BASE}/audienceMembers:${input.operation === 'remove' ? 'remove' : 'ingest'}`,
      {
        method: 'POST',
        headers: googleHeaders(input.accessToken),
        body: {
          destinations: [googleDestination(input)],
          audienceMembers: batch.map(member => ({
            compositeData: {
              userData: {
                userIdentifiers: [
                  ...(member.emailHash ? [{ emailAddress: member.emailHash }] : []),
                  ...(member.phoneHash ? [{ phoneNumber: member.phoneHash }] : [])
                ]
              }
            }
          })),
          encoding: 'HEX',
          ...(input.operation === 'add'
            ? {
                consent: {
                  adUserData: 'CONSENT_GRANTED',
                  adPersonalization: 'CONSENT_GRANTED'
                },
                termsOfService: { customerMatchTermsOfServiceStatus: 'ACCEPTED' }
              }
            : {})
        }
      }
    )
    if (!response.requestId) throw new Error('Google Data Manager did not return a request ID')
    requestIds.push(response.requestId)
  }
  return requestIds
}

export async function getGoogleDataManagerRequestStatus(
  accessToken: string,
  requestId: string
): Promise<{
  status: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'PARTIAL_SUCCESS' | 'REQUEST_STATUS_UNKNOWN'
  details: unknown
}> {
  const response = await ofetch<{
    requestStatusPerDestination?: Array<{
      requestStatus?: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'PARTIAL_SUCCESS' | 'REQUEST_STATUS_UNKNOWN'
      errorInfo?: unknown
      warningInfo?: unknown
    }>
  }>(`${GOOGLE_DATA_MANAGER_BASE}/requestStatus:retrieve`, {
    headers: googleHeaders(accessToken),
    query: { requestId }
  })
  const item = response.requestStatusPerDestination?.[0]
  return {
    status: item?.requestStatus ?? 'REQUEST_STATUS_UNKNOWN',
    details: { errorInfo: item?.errorInfo, warningInfo: item?.warningInfo }
  }
}
