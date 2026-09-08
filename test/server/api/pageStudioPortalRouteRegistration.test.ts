import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createApp, createRouter, defineEventHandler, getRouterParams, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'

const root = 'server/api/portal/page-studio/sites'
const siteId = '50000000-0000-4000-8000-000000000101'
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(directory, entry.name))
    : [join(directory, entry.name)])
}
const routes = files(root).sort().map((file) => {
  const name = relative(root, file).split(sep).join('/')
  const match = /^(.*)\.(get|post|put|patch|delete)\.ts$/.exec(name)!
  const route = '/api/portal/page-studio/sites/' + match[1]!.replace(/\[([^\]]+)\]/g, ':$1').replace(/(^|\/)index$/, '')
  return { file: name, route: route.replace(/\/$/, ''), method: match[2]! }
})

describe('portal site API registration in the installed H3 router', () => {
  it.each(routes)('dispatches $method $file without falling through to the renderer', async (target) => {
    const app = createApp()
    const router = createRouter({ preemptive: true })
    for (const route of routes) {
      router.add(route.route, defineEventHandler(event => ({ file: route.file, params: getRouterParams(event) })), route.method)
    }
    router.use('/**', defineEventHandler(() => ({ rendererFallback: true })))
    app.use(router.handler)
    const path = target.route.replace(/:([^/]+)/g, (_match, name) => name === 'versionId' ? 'version-one' : siteId)
    const response = await toWebHandler(app)(new Request('https://staging.example.invalid' + path, { method: target.method.toUpperCase() }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ file: target.file })
    if (target.route.includes('/:')) expect(body.params.siteId).toBe(siteId)
  })
})
