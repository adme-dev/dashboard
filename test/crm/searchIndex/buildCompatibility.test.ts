import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(
  fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
  'utf8'
)

describe('CRM search build compatibility', () => {
  it('keeps the publication repository claim shape internal to avoid duplicate auto-imports', () => {
    const repository = source('server/utils/crm/searchIndex/publicationRepository.ts')

    expect(repository).not.toMatch(/export\s+interface\s+CrmSearchOperationPublicationClaim\b/)
  })

  it('avoids BigInt literal syntax that is incompatible with the ES2019 build target', () => {
    const usage = source('server/utils/crm/searchIndex/usage.ts')

    expect(usage).not.toMatch(/\b(?:\d[\d_]*|0[xob][\da-f_]+)n\b/i)
  })
})
