// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmBlockRenderer from '~~/app/components/email/builder/EdmBlockRenderer.vue'
import { annotateHtmlEditables } from '~~/app/utils/edmHtmlEditables'

const sampleContents = '<table><tr><td><div>Drive smarter</div><a href="https://example.com">Claim offer</a><img src="/car.png" alt="Car"></td></tr></table>'
const backgroundContents = '<table><tr><td background="/hero-bg.jpg" style="background-image:url(\'/hero-bg.jpg\');background-size:cover;"><div>Drive smarter</div></td></tr></table>'

const iconStub = {
  props: ['name'],
  template: '<span :data-icon="name" />'
}

async function renderHtmlBlock(extra: Record<string, unknown> = {}) {
  const app = createSSRApp({
    render: () => h(EdmBlockRenderer, {
      type: 'Html',
      props: {
        contents: sampleContents
      },
      editable: true,
      ...extra
    })
  })
  app.component('UIcon', iconStub)
  return renderToString(app)
}

function editableIdFor(kind: string): string {
  const root = document.createElement('div')
  root.innerHTML = annotateHtmlEditables(sampleContents, { editable: true })
  const el = root.querySelector(`[data-edm-html-editable-kind="${kind}"]`) as HTMLElement | null
  return el?.dataset.edmHtmlEditableId || ''
}

function backgroundEditableId(): string {
  const root = document.createElement('div')
  root.innerHTML = annotateHtmlEditables(backgroundContents, { editable: true })
  const el = root.querySelector('[data-edm-html-editable-mode="background"]') as HTMLElement | null
  return el?.dataset.edmHtmlEditableId || ''
}

describe('EmailBuilderEdmBlockRenderer imported HTML editables', () => {
  it('annotates imported HTML text, link, and image regions in editable mode', async () => {
    const html = await renderHtmlBlock()

    expect(html).toContain('data-edm-html-editable-kind="text"')
    expect(html).toContain('data-edm-html-editable-kind="link"')
    expect(html).toContain('data-edm-html-editable-kind="image"')
    expect(html).toContain('contenteditable="true"')
  })

  it('marks the selected imported HTML region without making thumbnails editable by default', async () => {
    const editable = await renderHtmlBlock({ selectedHtmlEditableId: 'text:' })
    expect(editable).toContain('edm-html-editable')

    const app = createSSRApp({
      render: () => h(EdmBlockRenderer, {
        type: 'Html',
        props: { contents: '<div>Preview only</div>' }
      })
    })
    app.component('UIcon', iconStub)
    const preview = await renderToString(app)
    expect(preview).not.toContain('data-edm-html-editable-kind')
    expect(preview).not.toContain('contenteditable')
  })

  it('renders a quick-action bubble for the selected imported HTML image region', async () => {
    const html = await renderHtmlBlock({ selectedHtmlEditableId: editableIdFor('image') })

    expect(html).toContain('data-edm-html-region-toolbar')
    expect(html).toContain('aria-label="Imported image quick actions"')
    expect(html).toContain('aria-label="Change image"')
    expect(html).toContain('aria-label="Edit image link"')
  })

  it('renders a formatting toolbar for the selected imported HTML text region', async () => {
    const html = await renderHtmlBlock({ selectedHtmlEditableId: editableIdFor('text') })

    expect(html).toContain('data-edm-html-region-toolbar')
    expect(html).toContain('data-edm-html-text-toolbar')
    expect(html).toContain('aria-label="Imported text quick actions"')
    expect(html).toContain('aria-label="Decrease font size"')
    expect(html).toContain('aria-label="Text color"')
  })

  it('changes a selected imported image from the right-click path', async () => {
    const imageId = editableIdFor('image')
    const updates: Record<string, unknown>[] = []
    const prompts: Array<{ message?: string, value?: string }> = []
    const originalPrompt = window.prompt
    window.prompt = ((message?: string, value?: string) => {
      prompts.push({ message, value })
      return '/updated-car.png'
    }) as typeof window.prompt

    try {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const app = createApp({
        render: () => h(EdmBlockRenderer, {
          type: 'Html',
          props: { contents: sampleContents },
          editable: true,
          selectedHtmlEditableId: imageId,
          'onUpdate:props': (value: Record<string, unknown>) => updates.push(value)
        })
      })
      app.component('UIcon', iconStub)
      app.mount(host)

      const image = host.querySelector('[data-edm-html-editable-kind="image"]') as HTMLElement
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      const dispatched = image.dispatchEvent(event)

      expect(dispatched).toBe(false)
      expect(event.defaultPrevented).toBe(true)
      expect(prompts).toEqual([{ message: 'Image URL', value: '/car.png' }])
      expect(updates[0]?.contents).toContain('/updated-car.png')

      app.unmount()
      host.remove()
    } finally {
      window.prompt = originalPrompt
    }
  })

  it('requests the image library for selected imported images when enabled', async () => {
    const imageId = editableIdFor('image')
    const requests: unknown[] = []
    let promptCalled = false
    const originalPrompt = window.prompt
    window.prompt = (() => {
      promptCalled = true
      return '/should-not-be-used.png'
    }) as typeof window.prompt

    try {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const app = createApp({
        render: () => h(EdmBlockRenderer, {
          type: 'Html',
          props: { contents: sampleContents },
          editable: true,
          imageLibraryEnabled: true,
          selectedHtmlEditableId: imageId,
          'onRequest:html-image-library': (value: unknown) => requests.push(value)
        })
      })
      app.component('UIcon', iconStub)
      app.mount(host)

      const image = host.querySelector('[data-edm-html-editable-kind="image"]') as HTMLElement
      image.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

      expect(promptCalled).toBe(false)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ kind: 'image', src: '/car.png' })

      app.unmount()
      host.remove()
    } finally {
      window.prompt = originalPrompt
    }
  })

  it('requests the image library for imported background images when enabled', async () => {
    const backgroundId = backgroundEditableId()
    const requests: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(EdmBlockRenderer, {
        type: 'Html',
        props: { contents: backgroundContents },
        editable: true,
        imageLibraryEnabled: true,
        selectedHtmlEditableId: backgroundId,
        'onRequest:html-image-library': (value: unknown) => requests.push(value)
      })
    })
    app.component('UIcon', iconStub)
    app.mount(host)

    const background = host.querySelector('[data-edm-html-editable-mode="background"]') as HTMLElement
    background.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ kind: 'image', imageMode: 'background', src: '/hero-bg.jpg' })

    app.unmount()
    host.remove()
  })
})
