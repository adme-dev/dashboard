import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'

import { buildWorkerDispatcherModule } from '../../scripts/compact-worker-module.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ))
})

it('builds an executable Pages dispatcher with every required Worker delegation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-dispatcher-'))
  temporaryDirectories.push(directory)
  await writeFile(path.join(directory, 'package.json'), '{"type":"module"}\n', 'utf8')
  await writeFile(path.join(directory, '_nitro.js'), `export default {
  async fetch(request, env, ctx) {
    return { route: 'nitro', pathname: new URL(request.url).pathname, env, ctx }
  },
  scheduled(event, env, ctx) {
    return { route: 'scheduled', event, env, ctx }
  }
}\n`, 'utf8')
  await writeFile(path.join(directory, '_ws.js'), `export async function handleBoardConnect(request, env, id) {
  return { route: 'board', id, env }
}
export async function handleChatConnect(request, env, id) {
  return { route: 'chat', id, env }
}
export async function handleBannerConnect(request, env, id) {
  return { route: 'banner', id, env }
}\n`, 'utf8')
  await writeFile(path.join(directory, 'index.js'), buildWorkerDispatcherModule(), 'utf8')

  const dispatcher = (await import(`${pathToFileURL(path.join(directory, 'index.js')).href}?v=1`)).default
  const env = { marker: 'env' }
  const ctx = { marker: 'ctx' }
  const event = { cron: '0 * * * *' }
  const websocketRequest = (pathname: string) => new Request(`https://example.test${pathname}`, {
    headers: { Upgrade: 'websocket' }
  })

  await expect(dispatcher.fetch(
    websocketRequest('/api/agency/boards/board%20one/connect'),
    env,
    ctx
  )).resolves.toEqual({ route: 'board', id: 'board one', env })
  await expect(dispatcher.fetch(
    websocketRequest('/api/chat/chat%20one/connect'),
    env,
    ctx
  )).resolves.toEqual({ route: 'chat', id: 'chat one', env })
  await expect(dispatcher.fetch(
    websocketRequest('/api/agency/banner-studio/banner%20one/connect'),
    env,
    ctx
  )).resolves.toEqual({ route: 'banner', id: 'banner one', env })
  await expect(dispatcher.fetch(
    new Request('https://example.test/api/ordinary'),
    env,
    ctx
  )).resolves.toEqual({ route: 'nitro', pathname: '/api/ordinary', env, ctx })
  expect(dispatcher.scheduled(event, env, ctx)).toEqual({
    route: 'scheduled',
    event,
    env,
    ctx
  })
})
