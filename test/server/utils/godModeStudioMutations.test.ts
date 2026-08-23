// Guard: every write route the Video/Audio Studio UI calls must be registered
// as a God mode mutation family, or owners (always in God mode) get a 503.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import { prepareRegisteredGodModeMutation, seedGodModeRouteAuditState } from '../../../server/utils/godMode/featureGate'

const testGlobal = globalThis as Record<string, unknown>
testGlobal.defineEventHandler = <T>(handler: T) => handler
testGlobal.defineNitroPlugin = <T>(plugin: T) => plugin

const { registerGodModeMediaProjectMutationFamilies } = await import('../../../server/utils/audio/godModeMutations')
const { registerGodModeMediaExternalMutationFamilies } = await import('../../../server/utils/audio/godModeExternalMutations')
const { registerGodModeStudioMutationFamilies, matchStudioFamily } = await import('../../../server/utils/video/godModeStudioMutations')

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const ID = 'eca5685a-14bf-411b-ad35-53394f6bbb44'

const STUDIO_FRONTEND = [
  'app/composables/useMediaProjectEditor.ts',
  'app/pages/agency/audio/projects',
  'app/components/media',
]

function files(root: string): string[] {
  if (statSync(root).isFile()) return [root]
  return readdirSync(root).flatMap(name => files(join(root, name))).filter(f => /\.(ts|vue)$/.test(f))
}

/** Every `/api/agency/(audio|video)/…` called with a write method from the studio frontend. */
function studioWriteRoutes(): Array<{ method: string; path: string; file: string; key: boolean }> {
  const found: Array<{ method: string; path: string; file: string; key: boolean }> = []
  for (const file of STUDIO_FRONTEND.flatMap(files)) {
    const source = readFileSync(file, 'utf8')
    const callPattern = /\$?(?:apiFetch|fetch)(?:<[^>]*>)?\(\s*[`'"](\/api\/agency\/(?:audio|video)\/[^`'"]+)[`'"]\s*,\s*\{([\s\S]*?)\n\s*\}\)|\$?(?:apiFetch|fetch)(?:<[^>]*>)?\(\s*[`'"](\/api\/agency\/(?:audio|video)\/[^`'"]+)[`'"]\s*,\s*\{([^}]*)\}\)/g
    for (const match of source.matchAll(callPattern)) {
      const rawPath = (match[1] ?? match[3])!
      const options = (match[2] ?? match[4])!
      // A lazy match can run from one call's options into the next call; ignore those.
      if (/apiFetch|\$fetch/.test(options)) continue
      const method = /method:\s*'(POST|PUT|PATCH|DELETE)'/.exec(options)?.[1]
      if (!method) continue
      const path = rawPath.replace(/\$\{[^}]+\}/g, ID)
      found.push({ method, path, file, key: /Idempotency-Key/.test(options) })
    }
  }
  return found
}

function event(method: string, path: string): H3Event {
  const request = {
    method,
    context: { user: { id: ACTOR_ID } },
    node: { req: { originalUrl: path, headers: { host: 'app.xeroflow.test' }, connection: {} }, res: { statusCode: 200, statusMessage: 'OK' } }
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

describe('Video Studio God mode coverage', () => {
  const routes = studioWriteRoutes()

  it('finds the studio write routes (sanity: the scanner is not silently empty)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(20)
  })

  it('sends an Idempotency-Key from every studio write call', () => {
    const missing = routes.filter(route => !route.key).map(route => `${route.method} ${route.path} (${route.file})`)
    expect(missing).toEqual([])
  })

  it('admits every studio write route under God mode (428 = matched family, key required)', async () => {
    const unregister = [
      registerGodModeMediaProjectMutationFamilies(),
      registerGodModeMediaExternalMutationFamilies(),
      registerGodModeStudioMutationFamilies(),
    ]
    const unregistered: string[] = []
    try {
      for (const route of routes) {
        try {
          await prepareRegisteredGodModeMutation(event(route.method, route.path))
          unregistered.push(`${route.method} ${route.path}: prepared without a key?!`)
        } catch (error) {
          const status = (error as { statusCode?: number; reason?: string })
          if (status.statusCode !== 428) unregistered.push(`${route.method} ${route.path} → ${status.reason ?? status.statusCode ?? String(error)}`)
        }
      }
    } finally {
      for (const fn of unregister.reverse()) fn()
    }
    expect(unregistered).toEqual([])
  })

  it('maps the remaining studio routes to their families', () => {
    expect(matchStudioFamily('POST', `/api/agency/audio/projects/${ID}/renders/${ID}/save-asset`)).toBe('renderSaveAsset')
    expect(matchStudioFamily('POST', '/api/agency/audio/voiceover')).toBe('voiceover')
    expect(matchStudioFamily('POST', `/api/agency/video/assets/${ID}/captions`)).toBe('assetCaptions')
    expect(matchStudioFamily('POST', '/api/agency/video/generation/source-assets')).toBe('sourceAssetUpload')
    expect(matchStudioFamily('POST', '/api/agency/video/generation/source-assets/x')).toBeNull()
    expect(matchStudioFamily('GET', '/api/agency/audio/voiceover')).toBeNull()
  })
})
