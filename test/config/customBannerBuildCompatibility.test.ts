import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

describe('custom banner editor build compatibility', () => {
  it('does not embed a minified JavaScript dependency through Vite raw imports', async () => {
    const source = await readFile(
      `${projectRoot}app/composables/useCustomBannerEditor.ts`,
      'utf8'
    )

    expect(source).not.toContain('gsap/dist/gsap.min.js?raw')
    expect(source).not.toContain('gsapSource: gsapMinSource')
  })
})
