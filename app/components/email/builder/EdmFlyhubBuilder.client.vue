<!-- app/components/email/builder/EdmFlyhubBuilder.client.vue -->
<!-- Editor shell — foundation only. Canvas (2a-ii-2), settings panel (2a-ii-3),
     preview/save (2a-ii-4) land in later phases. -->
<script setup lang="ts">
import { renderToStaticMarkup } from '@flyhub/email-builder'

const store = useEdmBuilder()
const layout = computed(() => store.getLayoutSettings())

// Smoke: prove the client-side @flyhub renderer is reachable from the editor.
const rendererReady = ref(false)
onMounted(async () => {
  try {
    await renderToStaticMarkup(store.document.value as never, { rootBlockId: 'root' })
    rendererReady.value = true
  } catch {
    rendererReady.value = false
  }
})

function updateLayout(patch: Record<string, unknown>) {
  store.updateLayoutSettings(patch)
}
</script>

<template>
  <div class="flex h-full">
    <aside class="w-56 border-r border-default p-3 text-sm text-muted">
      Blocks panel — coming in 2a-ii-2
    </aside>

    <main class="flex-1 p-6 overflow-auto bg-elevated/30">
      <div class="mx-auto max-w-[600px] rounded border border-default bg-white min-h-64 p-4 text-sm text-gray-500">
        Canvas — coming in 2a-ii-2
        <span class="block mt-2 text-xs">flyhub renderer reachable: {{ rendererReady }}</span>
      </div>
    </main>

    <aside class="w-80 border-l border-default p-3 overflow-auto">
      <p class="text-xs font-semibold uppercase text-muted mb-3">
        Email settings
      </p>
      <EmailBuilderEmailLayoutSettings :settings="layout" @update="updateLayout" />
    </aside>
  </div>
</template>
