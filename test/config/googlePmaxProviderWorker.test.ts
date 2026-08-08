import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface WranglerConfig {
  name?: string
  workers_dev?: boolean
  services?: Array<Record<string, unknown>>
  placement?: { mode?: string }
  hyperdrive?: Array<Record<string, unknown>>
}

describe('Google PMax provider Worker deployment boundary', () => {
  it('is private and bound to the Pages application', () => {
    const worker = parse(readFileSync('workers/google-pmax-provider/wrangler.toml', 'utf8')) as WranglerConfig
    const pages = parse(readFileSync('wrangler.toml', 'utf8')) as WranglerConfig

    expect(worker).toMatchObject({
      name: 'google-pmax-provider',
      workers_dev: false,
      placement: { mode: 'smart' }
    })
    expect(worker.hyperdrive).toContainEqual({
      binding: 'HYPERDRIVE',
      id: '900b4b74ec41462cbbabebd0aa8775aa'
    })
    expect(pages.services).toContainEqual({
      binding: 'GOOGLE_PMAX_PROVIDER',
      service: 'google-pmax-provider'
    })
  })

  it('keeps dry-run and production deployment commands explicit', () => {
    const root = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> }
    expect(root.scripts?.['deploy:google-pmax-provider']).toBe(
      'pnpm --dir workers/google-pmax-provider run deploy'
    )
    expect(root.scripts?.['deploy:google-pmax-provider:dry-run']).toBe(
      'pnpm --dir workers/google-pmax-provider run deploy:dry-run'
    )
  })
})
