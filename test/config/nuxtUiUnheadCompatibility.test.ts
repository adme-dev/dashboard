// @vitest-environment happy-dom

import { HookableCore } from 'hookable'
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

type HeadFixture = {
  hooks: HookableCore<Record<string, (...args: unknown[]) => unknown>>
}

let colorsPlugin: () => void

beforeAll(async () => {
  const moduleEntry = fileURLToPath(import.meta.resolve('@nuxt/ui'))
  const pluginEntry = path.join(path.dirname(moduleEntry), 'runtime', 'plugins', 'colors.js')
  const bundled = await build({
    entryPoints: [pluginEntry],
    bundle: true,
    define: { 'import.meta.client': 'true' },
    format: 'esm',
    platform: 'browser',
    write: false,
    plugins: [{
      name: 'nuxt-imports-fixture',
      setup(build) {
        build.onResolve({ filter: /^#imports$/ }, () => ({
          path: '#imports',
          namespace: 'nuxt-imports-fixture'
        }))
        build.onLoad({ filter: /.*/, namespace: 'nuxt-imports-fixture' }, () => ({
          loader: 'js',
          contents: `
            export const defineNuxtPlugin = setup => setup
            export const injectHead = () => globalThis.__NUXT_UI_TEST_HEAD__
            export const useAppConfig = () => ({
              ui: {
                colors: { primary: 'emerald', neutral: 'slate' },
                prefix: ''
              }
            })
            export const useHead = () => globalThis.__NUXT_UI_TEST_HEAD__.hooks.callHook(
              'dom:rendered',
              { renders: [] }
            )
            export const useNuxtApp = () => ({
              isHydrating: true,
              payload: { serverRendered: false }
            })
          `
        }))
      }
    }]
  })
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`
  colorsPlugin = (await import(moduleUrl)).default
})

describe('Nuxt UI SPA hydration with the Nuxt 4.5 head runtime', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    ;(globalThis as typeof globalThis & { __NUXT_UI_TEST_HEAD__: HeadFixture })
      .__NUXT_UI_TEST_HEAD__ = { hooks: new HookableCore() }
  })

  it('registers temporary-color cleanup on HookableCore without crashing', async () => {
    expect(() => colorsPlugin()).not.toThrow()
    await Promise.resolve()

    expect(document.querySelector('[data-nuxt-ui-colors]')).toBeNull()
  })
})
