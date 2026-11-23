// @vitest-environment happy-dom
import { computed, createApp, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { expect, it, vi } from 'vitest'
import TeamViewer from '../../app/pages/creative/banner-studio/view/[id].client.vue'

it('clearly labels the team preview and opens the existing client-sharing dialog for this project', async () => {
  const id = '22222222-2222-4222-8222-222222222222'
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useRoute', () => ({ params: { id } }))
  for (const [name, fn] of Object.entries({ computed, ref, shallowRef, onMounted, onBeforeUnmount })) vi.stubGlobal(name, fn)
  vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ name: 'Artwork', canvasData: {}, revision: 'saved' }))
  const app = createApp(TeamViewer)
  app.component('UButton', defineComponent({ props: ['label', 'to'], setup: (p, { attrs, slots }) => () => h('button', attrs, p.label || slots.default?.()) }))
  app.component('BannerClientVideoPreview', defineComponent({ props: ['projectId'], setup: p => () => h('video', { 'data-project': p.projectId }) }))
  app.component('BannerProjectShareModal', defineComponent({ props: ['open', 'project'], setup: p => () => h('div', { 'data-share-open': String(p.open), 'data-share-project': p.project?.id }) }))
  for (const name of ['BannerThemeToggle', 'BannerVideoDownloads', 'UAlert', 'USkeleton']) app.component(name, { template: '<div />' })
  const host = document.createElement('div')
  document.body.append(host)
  try {
    app.mount(host)
    for (let i = 0; i < 8; i++) await nextTick()
    expect(host.textContent).toContain('Team preview · Sign-in required')
    expect(host.querySelector('video')?.dataset.project).toBe(id)
    expect(host.querySelector('iframe')).toBeNull()
    const share = [...host.querySelectorAll('button')].find(button => button.textContent === 'Share with client')!
    expect(share.disabled).toBe(false)
    share.click()
    await nextTick()
    expect(host.querySelector('[data-share-open="true"]')?.getAttribute('data-share-project')).toBe(id)
  } finally {
    app.unmount()
    host.remove()
    vi.unstubAllGlobals()
  }
})
