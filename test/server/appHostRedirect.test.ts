import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('app host marketing access', () => {
  it('does not force app.xeroflow.io marketing pages to the login screen', async () => {
    const middlewareDirectory = fileURLToPath(
      new URL('../../server/middleware/', import.meta.url)
    )
    const middlewareFiles = (await readdir(middlewareDirectory))
      .filter(file => file.endsWith('.ts'))

    const appHostLoginRedirects: string[] = []
    for (const file of middlewareFiles) {
      const source = await readFile(`${middlewareDirectory}/${file}`, 'utf8')
      if (source.includes('app.xeroflow.io') && source.includes('/auth/login')) {
        appHostLoginRedirects.push(file)
      }
    }

    expect(appHostLoginRedirects).toEqual([])
  })
})
