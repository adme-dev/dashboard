// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmBlockRenderer from '~~/app/components/email/builder/EdmBlockRenderer.vue'
import { annotateHtmlEditables } from '~~/app/utils/edmHtmlEditables'

const sampleContents = '<table><tr><td><div>Drive smarter</div><a href="https://example.com">Claim offer</a><img src="/car.png" alt="Car"></td></tr></table>'
const backgroundContents = '<table><tr><td background="/hero-bg.jpg" style="background-image:url(\'/hero-bg.jpg\');background-size:cover;"><div>Drive smarter</div></td></tr></table>'
const repeatedOfferContents = '<table><tbody><tr><td><img src="/check-1.png" alt=""></td><td><span>20% off your first upgrade</span></td></tr><tr><td><img src="/check-2.png" alt=""></td><td><span>Get 30% off on your setup</span></td></tr></tbody></table>'

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
      htmlEditingEnabled: true,
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

function repeatedOfferTextId(): string {
  const root = document.createElement('div')
  root.innerHTML = annotateHtmlEditables(repeatedOfferContents, { editable: true })
  const el = Array.from(root.querySelectorAll('[data-edm-html-editable-kind="text"]'))
    .find(node => node.textContent?.includes('20% off')) as HTMLElement | undefined
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

  it('keeps unselected imported HTML cheap to render on initial canvas load', async () => {
    const html = await renderHtmlBlock({ htmlEditingEnabled: false })

    expect(html).toContain('Drive smarter')
    expect(html).not.toContain('data-edm-html-editable-kind')
    expect(html).not.toContain('edm-html-editable')
    expect(html).not.toContain('contenteditable="true"')
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
    expect(html).toContain('aria-label="Duplicate item"')
    expect(html).toContain('aria-label="Delete item"')
  })

  it('prevents editable imported HTML links from navigating while selecting them', async () => {
    const selections: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(EdmBlockRenderer, {
        type: 'Html',
        props: { contents: sampleContents },
        editable: true,
        htmlEditingEnabled: true,
        'onSelect:html-editable': (value: unknown) => selections.push(value)
      })
    })
    app.component('UIcon', iconStub)
    app.mount(host)

    const link = host.querySelector('[data-edm-html-editable-kind="link"]') as HTMLElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    const dispatched = link.dispatchEvent(event)

    expect(dispatched).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(selections.at(-1)).toMatchObject({ kind: 'link', href: 'https://example.com' })

    app.unmount()
    host.remove()
  })

  it('does not cancel plain imported HTML text clicks while selecting them', async () => {
    const selections: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(EdmBlockRenderer, {
        type: 'Html',
        props: { contents: sampleContents },
        editable: true,
        htmlEditingEnabled: true,
        'onSelect:html-editable': (value: unknown) => selections.push(value)
      })
    })
    app.component('UIcon', iconStub)
    app.mount(host)

    const text = host.querySelector('[data-edm-html-editable-kind="text"]') as HTMLElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    const dispatched = text.dispatchEvent(event)

    expect(dispatched).toBe(true)
    expect(event.defaultPrevented).toBe(false)
    expect(selections.at(-1)).toMatchObject({ kind: 'text', text: 'Drive smarter' })

    app.unmount()
    host.remove()
  })

  it('duplicates a selected imported HTML item from the quick-action toolbar', async () => {
    const textId = repeatedOfferTextId()
    const updates: Record<string, unknown>[] = []
    const selections: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(EdmBlockRenderer, {
        type: 'Html',
        props: { contents: repeatedOfferContents },
        editable: true,
        htmlEditingEnabled: true,
        selectedHtmlEditableId: textId,
        'onUpdate:props': (value: Record<string, unknown>) => updates.push(value),
        'onSelect:html-editable': (value: unknown) => selections.push(value)
      })
    })
    app.component('UIcon', iconStub)
    app.mount(host)

    const duplicate = host.querySelector('[data-edm-html-action="duplicate"]') as HTMLElement
    duplicate.click()

    expect(String(updates[0]?.contents || '').match(/20% off your first upgrade/g)).toHaveLength(2)
    expect(String(updates[0]?.contents || '').match(/check-1\.png/g)).toHaveLength(2)
    expect(selections.at(-1)).toMatchObject({ kind: 'text', text: '20% off your first upgrade' })

    app.unmount()
    host.remove()
  })

  it('deletes a selected imported HTML item from the quick-action toolbar', async () => {
    const textId = repeatedOfferTextId()
    const updates: Record<string, unknown>[] = []
    const selections: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(EdmBlockRenderer, {
        type: 'Html',
        props: { contents: repeatedOfferContents },
        editable: true,
        htmlEditingEnabled: true,
        selectedHtmlEditableId: textId,
        'onUpdate:props': (value: Record<string, unknown>) => updates.push(value),
        'onSelect:html-editable': (value: unknown) => selections.push(value)
      })
    })
    app.component('UIcon', iconStub)
    app.mount(host)

    const deleteItem = host.querySelector('[data-edm-html-action="delete"]') as HTMLElement
    deleteItem.click()

    expect(String(updates[0]?.contents || '')).not.toContain('20% off your first upgrade')
    expect(String(updates[0]?.contents || '')).not.toContain('check-1.png')
    expect(String(updates[0]?.contents || '')).toContain('Get 30% off on your setup')
    expect(selections.at(-1)).toBeNull()

    app.unmount()
    host.remove()
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
          htmlEditingEnabled: true,
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
