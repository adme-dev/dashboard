import { readFile } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

type PagesConfig = { env: Record<'production' | 'preview', { vars: Record<string, string> }> }
const config = parse(await readFile(new URL('../../wrangler.toml', import.meta.url), 'utf8')) as unknown as PagesConfig
const PLACEHOLDER = /^(?:astro_runtime_)?0{64}$/
// Outgoing current generations. Releases on them stay restorable only while
// they are listed as retained (rollback.post.ts) and bound in delivery.
const outgoing = {
  production: 'astro_runtime_5986dc6fe5cac2da5d354b0bfa611394e463f93ab42f86776caeb9853251f781',
  preview: 'astro_runtime_55f4c2813577ad0dedcfce08ac60edb4843e5d3604b9bdf9349b708210955a06'
}

describe('Page Studio runtime renderer pin', () => {
  it.each(['production', 'preview'] as const)('%s pins an actually uploaded generation and retains the outgoing one', (environment) => {
    const vars = config.env[environment].vars
    const renderer = JSON.parse(vars.PAGE_STUDIO_RUNTIME_RENDERER) as Record<string, string>
    // Release guard: replace the zero-digest placeholder with the recorded upload.
    for (const value of Object.values(renderer)) expect(value).not.toMatch(PLACEHOLDER)
    const retained = vars.PAGE_STUDIO_RUNTIME_RETAINED_GENERATIONS.split(',').map(value => value.trim())
    expect(retained).toContain(outgoing[environment])
    expect(retained).not.toContain(renderer.generation)
  })
})
