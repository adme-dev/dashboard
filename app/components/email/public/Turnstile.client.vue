<script setup lang="ts">
// Cloudflare Turnstile widget (vanilla explicit render — no extra Nuxt module).
// Client-only (.client) since it touches window/document. Emits the token on
// success and clears it on expiry/error so the parent can gate submission.
interface TurnstileApi {
  ready?: (cb: () => void) => void
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}

const props = withDefaults(defineProps<{ siteKey: string, theme?: 'light' | 'dark' | 'auto' }>(), {
  theme: 'dark'
})
const emit = defineEmits<{ verified: [token: string], expired: [] }>()

const el = ref<HTMLElement | null>(null)
let widgetId: string | undefined

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('turnstile_script_error')))
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile_script_error'))
    document.head.appendChild(s)
  })
}

onMounted(async () => {
  if (!props.siteKey || !el.value) return
  try {
    await loadScript()
    const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile
    if (!ts) return
    const render = () => {
      widgetId = ts.render(el.value as HTMLElement, {
        sitekey: props.siteKey,
        theme: props.theme,
        callback: (token: string) => emit('verified', token),
        'expired-callback': () => emit('expired'),
        'error-callback': () => emit('expired')
      })
    }
    ts.ready ? ts.ready(render) : render()
  } catch {
    // Script blocked / failed — leave the slot empty. With Turnstile enabled the
    // server requires a token, so the parent's disabled submit fails closed.
  }
})

onBeforeUnmount(() => {
  const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile
  if (ts && widgetId) ts.remove(widgetId)
})
</script>

<template>
  <div ref="el" />
</template>
