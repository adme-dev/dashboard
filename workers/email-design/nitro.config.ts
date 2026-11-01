import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineNitroConfig } from 'nitropack/config'

const spikeDir = fileURLToPath(new URL('./', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const fromRepo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

export default defineNitroConfig({
  rootDir: repoRoot,
  srcDir: spikeDir,
  scanDirs: [],
  buildDir: join(spikeDir, '.nitro'),
  output: { dir: join(spikeDir, 'dist') },
  preset: 'cloudflare_module',
  compatibilityDate: '2024-12-01',
  experimental: { asyncContext: true },
  imports: {
    dirs: [],
    presets: [
      {
        from: 'nitropack/runtime/internal/plugin',
        imports: ['defineNitroPlugin']
      },
      {
        from: 'nitropack/runtime/internal/context',
        imports: ['useEvent']
      },
      {
        from: 'h3',
        imports: [
          'createError',
          'defineEventHandler',
          'getCookie',
          'getHeader',
          'getRequestWebStream',
          'getRouterParam',
          'readBody',
          'setHeader'
        ]
      }
    ]
  },
  alias: {
    '~~': repoRoot,
    '~~/server/utils/sessionToken': fromRepo('workers/email-design/sessionToken.ts')
  },
  nodeModulesDirs: [join(repoRoot, 'node_modules')],
  handlers: [
    {
      route: '/api/email/design/roundtrip',
      method: 'post',
      handler: fromRepo('server/api/email/design/roundtrip.post.ts')
    },
    {
      route: '/api/email/design/drafts/:id',
      method: 'get',
      handler: fromRepo('server/api/email/design/drafts/[id].get.ts')
    },
    {
      route: '/api/email/design/drafts/:id',
      method: 'patch',
      handler: fromRepo('server/api/email/design/drafts/[id].patch.ts')
    },
    {
      route: '/api/email/design/drafts/:id/metadata',
      method: 'patch',
      handler: fromRepo('server/api/email/design/drafts/[id]/metadata.patch.ts')
    },
    {
      route: '/api/email/design/drafts/initialize',
      method: 'post',
      handler: fromRepo('server/api/email/design/drafts/initialize.post.ts')
    },
    {
      route: '/api/email/templates/:id',
      method: 'patch',
      handler: fromRepo('server/utils/email-marketing/templateUpdateHandler.ts')
    },
    {
      route: '/api/email/templates/:id',
      method: 'delete',
      handler: fromRepo('server/utils/email-marketing/templateDeleteHandler.ts')
    }
  ],
  plugins: [fromRepo('server/plugins/database-connections.ts')],
  cloudflare: { nodeCompat: true },
  sourceMap: false,
  minify: true,
  esbuild: { options: { target: 'es2020' } },
  rollupConfig: {
    external: [
      '@react-email/render',
      '@cloudflare/puppeteer',
      'puppeteer',
      'gifenc',
      'pngjs',
      'pg-native'
    ]
  }
})
