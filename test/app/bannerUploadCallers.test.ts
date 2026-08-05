import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const callers = [
  ['AssetsPanel', 'app/components/banner/AssetsPanel.client.vue', 'onFileSelect', 'uploadFiles'],
  ['Background image', 'app/components/banner/inspector/Background.vue', 'onFileSelect', 'uploadBgImage'],
  ['Background video', 'app/components/banner/inspector/Background.vue', 'onVideoFileSelect', 'uploadBgVideo'],
  ['BrandKitManager', 'app/components/banner/BrandKitManager.vue', 'onLogoFileSelect', 'uploadLogo']
] as const

describe('banner upload picker integrations', () => {
  it.each(callers)('%s awaits upload handling before resetting the picker input', (_name, path, handler, upload) => {
    const source = readFileSync(path, 'utf8')
    const handlerBody = source.match(new RegExp(`async function ${handler}\\(e: Event\\) \\{([\\s\\S]*?)\\n\\}`))?.[1]

    expect(handlerBody).toContain(`await ${upload}(input.files)`)
    expect(handlerBody).toMatch(/await [\s\S]*input\.value = ''/)
  })

  it.each([
    ['AssetsPanel', 'app/components/banner/AssetsPanel.client.vue'],
    ['Background', 'app/components/banner/inspector/Background.vue'],
    ['BrandKitManager', 'app/components/banner/BrandKitManager.vue']
  ])('%s delegates upload coordination to the shared session', (_name, path) => {
    const source = readFileSync(path, 'utf8')

    expect(source).toContain('createBannerUploadSession')
    expect(source).toContain('.attemptFiles(')
  })
})
