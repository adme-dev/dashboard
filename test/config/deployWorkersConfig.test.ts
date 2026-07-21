import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('cron Worker deployment wrapper', () => {
  it('pins each deployment to the Worker-local Wrangler config', () => {
    const script = readFileSync('scripts/deploy-workers.mjs', 'utf8')

    expect(script).toContain('[\'wrangler\', \'deploy\', \'--config\', \'wrangler.toml\']')
  })
})
