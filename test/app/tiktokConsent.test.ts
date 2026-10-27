// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h, Suspense, computed, watch, ref, nextTick } from 'vue'

const creator = { creator_nickname: 'Reviewed creator', creator_username: 'reviewed', privacy_level_options: ['SELF_ONLY'], comment_disabled: true, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 90 }
Object.assign(globalThis, { computed, watch, useFetch: async () => ({ data: ref(creator), error: ref(null) }) })
const { default: Consent } = await import('~~/app/components/social-publishing/TikTokConsent.vue')
const stubs = {
  UAlert: { props: ['title', 'description'], template: '<aside>{{title}} {{description}}</aside>' },
  UFormField: { props: ['label'], template: '<label>{{label}}<slot/></label>' },
  USelect: { props: ['modelValue', 'items', 'placeholder'], template: '<select :value="modelValue"><option value="">{{placeholder}}</option><option v-for="item in items">{{item}}</option></select>' },
  UInput: { props: ['modelValue'], template: '<input :value="modelValue" />' },
  UCheckbox: { props: ['modelValue', 'disabled', 'label'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\',$event.target.checked)"/>{{label}}</label>' }
}
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
describe('TikTok consent component', () => {
  it('renders exact preview/account, no privacy default, disabled unchecked interactions, and resets consent on copy change', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const content = ref('Exact reviewed copy'), model = ref<Record<string, unknown>>({})
    const app = createApp({ render: () => h(Suspense, {}, { default: () => h(Consent, { 'clientId': 'client', 'accountId': 'account', 'content': content.value, 'payloadIdentity': content.value, 'mediaUrls': ['https://fixture/photo.jpg'], 'modelValue': model.value, 'onUpdate:modelValue': (v: Record<string, unknown>) => model.value = v }) }) })
    for (const [name, component] of Object.entries(stubs))app.component(name, component)
    try {
      app.mount(host)
      await flush()
      expect(host.textContent).toContain('Reviewed creator')
      expect(host.textContent).toContain('Exact reviewed copy')
      expect(host.querySelector('select')!.value).toBe('')
      const checks = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))
      expect(checks.every(c => !c.checked)).toBe(true)
      expect(checks[0]!.disabled).toBe(true)
      checks.at(-1)!.checked = true
      checks.at(-1)!.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
      expect(model.value.consent).toBe(true)
      content.value = 'Changed copy'
      await flush()
      expect(model.value.consent).toBe(false)
      expect(host.textContent).toContain('TikTok publishing unavailable')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
