import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  isMediaProjectCreatePath,
  isMediaProjectDeletePath,
  isMediaProjectTimelineSavePath,
  isMediaProjectVersionCreatePath,
  registerGodModeMediaProjectMutationFamilies
} from '../../../server/utils/audio/godModeMutations'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const PROJECT_ID = 'eca5685a-14bf-411b-ad35-53394f6bbb44'
const PROJECT_ROUTE = `/api/agency/audio/projects/${PROJECT_ID}`
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

function event(path: string, method: string): H3Event {
  const request = {
    method,
    body: { state: {} },
    context: { user: { id: ACTOR_ID } },
    node: {
      req: { originalUrl: path, headers: { host: 'app.xeroflow.test' }, connection: {} },
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

describe('media project (Audio/Video Studio) God mode mutation boundary', () => {
  it('matches only the four DB-bound editing routes', () => {
    expect(isMediaProjectCreatePath('/api/agency/audio/projects')).toBe(true)
    expect(isMediaProjectCreatePath(PROJECT_ROUTE)).toBe(false)
    expect(isMediaProjectDeletePath(PROJECT_ROUTE)).toBe(true)
    expect(isMediaProjectDeletePath(`${PROJECT_ROUTE}/timeline`)).toBe(false)
    expect(isMediaProjectTimelineSavePath(`${PROJECT_ROUTE}/timeline`)).toBe(true)
    expect(isMediaProjectTimelineSavePath(`${PROJECT_ROUTE}/timeline/x`)).toBe(false)
    expect(isMediaProjectVersionCreatePath(`${PROJECT_ROUTE}/versions`)).toBe(true)
    expect(isMediaProjectVersionCreatePath(`${PROJECT_ROUTE}/render-video`)).toBe(false)
    expect(isMediaProjectTimelineSavePath('/api/agency/audio/projects/not-a-uuid/timeline')).toBe(false)
  })

  it.each([
    ['/api/agency/audio/projects', 'POST', 'media project creation'],
    [PROJECT_ROUTE, 'DELETE', 'media project deletion'],
    [`${PROJECT_ROUTE}/timeline`, 'PUT', 'media timeline save'],
    [`${PROJECT_ROUTE}/versions`, 'POST', 'media timeline version snapshot']
  ])('requires a stable idempotency key before admitting %s %s', async (path, method, mutationName) => {
    const unregister = registerGodModeMediaProjectMutationFamilies()
    try {
      await expect(prepareRegisteredGodModeMutation(event(path, method))).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: `A stable Idempotency-Key header is required for God mode ${mutationName}`
      })
    } finally {
      unregister()
    }
  })

  it('leaves render / upload / AI routes unregistered (they are not transaction-bound)', async () => {
    const unregister = registerGodModeMediaProjectMutationFamilies()
    try {
      await expect(prepareRegisteredGodModeMutation(event(`${PROJECT_ROUTE}/render-video`, 'POST')))
        .rejects.toMatchObject({ reason: 'required' })
    } finally {
      unregister()
    }
  })

  it('routes all four handlers through the coordinator and registers the families', () => {
    expect(readFileSync('server/api/agency/audio/projects/index.post.ts', 'utf8')).toContain('executeGodModeMediaProjectCreate')
    expect(readFileSync('server/api/agency/audio/projects/[id]/index.delete.ts', 'utf8')).toContain('executeGodModeMediaProjectDelete')
    expect(readFileSync('server/api/agency/audio/projects/[id]/timeline.put.ts', 'utf8')).toContain('executeGodModeMediaTimelineSave')
    expect(readFileSync('server/api/agency/audio/projects/[id]/versions.post.ts', 'utf8')).toContain('executeGodModeMediaVersionCreate')
    expect(readFileSync('server/plugins/godModeExecution.ts', 'utf8')).toContain('registerGodModeMediaProjectMutationFamilies()')
  })

  it('sends an Idempotency-Key from every frontend caller of those routes', () => {
    const editor = readFileSync('app/composables/useMediaProjectEditor.ts', 'utf8')
    const list = readFileSync('app/pages/agency/audio/projects/index.vue', 'utf8')
    expect(editor).toMatch(/timeline`,\s*\{[\s\S]*?'Idempotency-Key'/)
    expect(editor).toMatch(/versions`,\s*\{[\s\S]*?'Idempotency-Key'/)
    expect(list).toMatch(/method: 'DELETE'[\s\S]*?'Idempotency-Key'/)
    expect(list).toMatch(/method: 'POST'[\s\S]*?'Idempotency-Key'/)
  })
})
