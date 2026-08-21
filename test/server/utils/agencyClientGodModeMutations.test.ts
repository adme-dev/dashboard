import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  isAgencyClientCreatePath,
  isAgencyClientCrmSettingsUpdatePath,
  isAgencyClientUpdatePath,
  registerGodModeAgencyClientMutationFamilies
} from '../../../server/utils/clients/godModeMutations'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'
const CLIENT_ROUTE = `/api/agency/clients/${CLIENT_ID}`
const CRM_ROUTE = `${CLIENT_ROUTE}/crm-settings`
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

function event(path: string, method = 'PUT'): H3Event {
  const request = {
    method,
    body: { name: 'Northern Motor Group' },
    context: { user: { id: ACTOR_ID } },
    node: {
      req: {
        originalUrl: path,
        headers: { host: 'app.xeroflow.test' },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(request, {
    actorUserId: ACTOR_ID,
    correlationId: '22222222-2222-4222-8222-222222222222',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `${method} ${path}`,
    emergencyDisabled: false
  })
  return request
}

describe('agency client God mode mutation boundary', () => {
  it('matches only the exact client create and settings mutations', () => {
    expect(isAgencyClientCreatePath('/api/agency/clients')).toBe(true)
    expect(isAgencyClientCreatePath(`${CLIENT_ROUTE}/extra`)).toBe(false)
    expect(isAgencyClientUpdatePath(CLIENT_ROUTE)).toBe(true)
    expect(isAgencyClientUpdatePath(CRM_ROUTE)).toBe(false)
    expect(isAgencyClientCrmSettingsUpdatePath(CRM_ROUTE)).toBe(true)
    expect(isAgencyClientCrmSettingsUpdatePath(`${CRM_ROUTE}/extra`)).toBe(false)
    expect(isAgencyClientUpdatePath('/api/agency/clients/not-a-uuid')).toBe(false)
  })

  it.each([
    ['/api/agency/clients', 'POST', 'client creation'],
    [CLIENT_ROUTE, 'PUT', 'client update'],
    [CRM_ROUTE, 'PUT', 'client CRM settings update']
  ])('requires a stable idempotency key before admitting %s', async (path, method, mutationName) => {
    const unregister = registerGodModeAgencyClientMutationFamilies()
    try {
      await expect(prepareRegisteredGodModeMutation(event(path, method))).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: `A stable Idempotency-Key header is required for God mode ${mutationName}`
      })
    } finally {
      unregister()
    }
  })

  it('routes all handlers through the transaction-bound coordinator and registers the families', () => {
    const createRoute = readFileSync('server/api/agency/clients/index.post.ts', 'utf8')
    const clientRoute = readFileSync('server/api/agency/clients/[id].put.ts', 'utf8')
    const crmRoute = readFileSync('server/api/agency/clients/[id]/crm-settings.put.ts', 'utf8')
    const plugin = readFileSync('server/plugins/godModeExecution.ts', 'utf8')

    expect(createRoute).toContain('executeGodModeAgencyClientCreate')
    expect(clientRoute).toContain('executeGodModeAgencyClientUpdate')
    expect(crmRoute).toContain('executeGodModeAgencyClientCrmSettingsUpdate')
    expect(plugin).toContain('registerGodModeAgencyClientMutationFamilies()')
  })
})
