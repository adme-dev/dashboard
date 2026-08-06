import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync('workers/audio-jobs/container/Dockerfile', 'utf8')
const server = readFileSync('workers/audio-jobs/container/server.mjs', 'utf8')
const bannerCapture = readFileSync('workers/audio-jobs/container/bannerCapture.mjs', 'utf8')
const overlayCapture = readFileSync('workers/audio-jobs/container/overlayCapture.mjs', 'utf8')

describe('audio-jobs local Chromium container runtime', () => {
  it('uses Puppeteer Core instead of the Browser Rendering endpoint SDK', () => {
    expect(dockerfile).toContain('npm install puppeteer-core@25.5.0')
    expect(server).toContain("import('puppeteer-core')")
    expect(bannerCapture).toContain("import('puppeteer-core')")
    expect(overlayCapture).toContain("import('puppeteer-core').Browser")

    for (const source of [dockerfile, server, bannerCapture, overlayCapture]) {
      expect(source).not.toContain('@cloudflare/puppeteer')
    }
  })
})
