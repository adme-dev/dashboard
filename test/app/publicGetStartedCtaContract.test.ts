import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const publicMarketingEntries = [
  'app/pages/index.vue',
  'app/pages/about.vue',
  'app/pages/ai-assistants.vue',
  'app/pages/ai-training.vue',
  'app/pages/contact.vue',
  'app/pages/creativity.vue',
  'app/pages/pricing.vue',
  'app/pages/privacy.vue',
  'app/pages/support.vue',
  'app/pages/terms.vue',
  'app/pages/voice-ai.vue',
  'app/pages/banner-studio',
  'app/pages/features',
  'app/pages/platform',
  'app/pages/resources'
]

function vueFiles(entry: string): string[] {
  const absolute = join(process.cwd(), entry)
  if (statSync(absolute).isFile()) return [absolute]
  return readdirSync(absolute, { withFileTypes: true }).flatMap((item) => {
    const child = join(absolute, item.name)
    if (item.isDirectory()) return vueFiles(relative(process.cwd(), child))
    return item.isFile() && item.name.endsWith('.vue') ? [child] : []
  })
}

describe('public Get Started CTA contract', () => {
  it('routes public Get Started links to contact while self-service onboarding is closed', () => {
    const violations = publicMarketingEntries.flatMap(vueFiles).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      const links = source.match(/<(?:NuxtLink|UButton)\b[\s\S]*?<\/(?:NuxtLink|UButton)>/gi) ?? []
      return links
        .filter(link => /Get Started/i.test(link.replace(/<[^>]+>/g, ' ')))
        .filter(link => !/\bto=["']\/contact["']/.test(link))
        .map(() => relative(process.cwd(), file))
    })

    expect(violations).toEqual([])
  })
})
