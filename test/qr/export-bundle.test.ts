import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('QR SVG Worker bundle', () => {
  it('renders a download without external Node PNG or filesystem modules', async () => {
    const result = await build({
      entryPoints: [fileURLToPath(new URL('../../shared/qr/render-svg.ts', import.meta.url))],
      bundle: true,
      format: 'esm',
      platform: 'node',
      // Match the production exclusion that exposed the lazy SVG-route failure.
      external: ['pngjs'],
      write: false,
      metafile: true
    })
    const externalImports = Object.values(result.metafile!.outputs)
      .flatMap(output => output.imports.filter(item => item.external).map(item => item.path))
    expect(externalImports).toEqual([])

    // A standalone module cannot resolve undeployed packages through node_modules.
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`
    const { renderQrSvg } = await import(/* @vite-ignore */ moduleUrl)
    const svg = renderQrSvg({
      text: 'https://app.xeroflow.io/q/AbC1234',
      style: { bg: '#ffffff', fg: '#000000', eye: 'square', margin: 2, pattern: 'classic' }
    })
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).toContain('</svg>')
  })
})
