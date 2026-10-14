import { createRequire } from 'node:module'
import { realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('validates newsroom approvals with native Workers fetch and rejects redirects without following them', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const require = createRequire(await realpath(root + 'node_modules/wrangler/package.json'))
  const { build } = require('esbuild')
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare')
  const built = await build({
    stdin: { resolveDir: root, contents: `
      import { signNewsroomPost, verifyNewsroomSource } from './server/utils/newsroomSocialSource.ts';
      const config = { secret: 'runtime-fixture-secret-only', clientId: 'client', accountId: 'account' };
      export default { async fetch() {
        const post = { id: 'post', client_id: 'client', created_by: 'driveagent-newsroom',
          content: 'Approved copy', link_url: 'https://driveagent.news/news/a-story', media_urls: [],
          platforms: ['facebook'], account_ids: ['account'], scheduled_at: '2026-10-14T06:30:00Z',
          metadata: { source: 'driveagent-newsroom', articleId: 'article', articleUpdatedAt: '2026-10-13T23:26:22.060Z' } };
        post.metadata.signature = signNewsroomPost(post, config.secret);
        return Response.json({ status: await verifyNewsroomSource(post, config) });
      } };`
    },
    alias: { '~~': root }, bundle: true, write: false, format: 'esm', platform: 'node'
  })
  let status = 200
  const requests: string[] = []
  const options = {
    modules: true, script: built.outputFiles[0].text, compatibilityDate: '2024-12-01',
    compatibilityFlags: ['nodejs_compat'],
    outboundService: async (request: Request) => {
      requests.push(request.url)
      expect(request.url).toBe('https://driveagent.news/api/news/articles/a-story')
      if (status !== 200) return new Response(null, { status, headers: { location: 'https://unexpected.example/article' } })
      return Response.json({ id: 'article', slug: 'a-story', status: 'published', updatedAt: '2026-10-13T23:26:22.060Z' })
    }
  }
  const mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options)
  try {
    const result = await (await mf.dispatchFetch('https://local.test/')).json()
    expect(result).toEqual({ status: 'ready' })
    expect(requests).toHaveLength(1)
    for (const responseStatus of [301, 302, 303, 307, 308, 403, 500]) {
      status = responseStatus
      requests.length = 0
      expect(await (await mf.dispatchFetch('https://local.test/')).json()).toEqual({ status: 'blocked' })
      expect(requests).toEqual(['https://driveagent.news/api/news/articles/a-story'])
    }
  } finally {
    await mf.dispose()
  }
}, 90_000)
