<script setup lang="ts">
const messages = ref<{ role: 'user' | 'assistant', content: string }[]>([])
const input = ref('')
const sending = ref(false)

async function send() {
  const prompt = input.value.trim()
  if (!prompt || sending.value) return
  messages.value.push({ role: 'user', content: prompt })
  input.value = ''
  sending.value = true
  try {
    const res = await $fetch<{ reply: string }>('/api/ai/chat', {
      method: 'POST',
      body: { prompt }
    })
    messages.value.push({ role: 'assistant', content: res.reply })
  } catch {
    messages.value.push({ role: 'assistant', content: 'Sorry, I could not answer that.' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <UPage>
    <UPageHeader title="Ask Your Data" description="Ask questions about your KPIs and reports" />

    <div class="space-y-3">
      <div v-for="(m, i) in messages" :key="i" class="p-3 rounded border"
           :class="m.role === 'user' ? 'bg-primary/5 border-primary/20' : 'bg-muted/50 border-muted/30'">
        <div class="text-xs text-muted mb-1">{{ m.role }}</div>
        <div class="whitespace-pre-wrap">{{ m.content }}</div>
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <UInput v-model="input" placeholder="e.g. What is my profit and cash outlook?" class="flex-1" />
      <UButton :loading="sending" label="Send" @click="send" />
    </div>
  </UPage>
</template>
