import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { ROUTES } from '../../workers/pages-cron/src/index'

describe('Google Ads call reporting schedule', () => {
  it('runs daily after spend sync and is declared in Wrangler', () => {
    expect(ROUTES['15 6 * * *']).toEqual(['/api/cron/google-ads-call-reporting'])

    const config = readFileSync('workers/pages-cron/wrangler.toml', 'utf8')
    expect(config).toContain('"15 6 * * *"')
  })
})
