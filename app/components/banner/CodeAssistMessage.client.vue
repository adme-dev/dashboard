<script setup lang="ts">
import type { CodeAssistMessage } from '~/composables/useCodeAssistant'

const props = defineProps<{
  message: CodeAssistMessage
}>()

const emit = defineEmits<{
  apply: [language: string, code: string]
}>()

const toast = useToast()

// Split assistant content into text sections and code block references
const sections = computed(() => {
  if (props.message.role === 'user') return []

  const content = props.message.content
  const parts: { type: 'text' | 'code'; text?: string; blockIndex?: number }[] = []
  const regex = /```(\w+)?\s*\n([\s\S]*?)```/g
  let lastIndex = 0
  let blockIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Text before code block
    const before = content.slice(lastIndex, match.index).trim()
    if (before) {
      parts.push({ type: 'text', text: before })
    }
    parts.push({ type: 'code', blockIndex })
    blockIndex++
    lastIndex = match.index + match[0].length
  }

  // Remaining text after last code block
  const remaining = content.slice(lastIndex).trim()
  if (remaining) {
    parts.push({ type: 'text', text: remaining })
  }

  // If no code blocks found, treat entire content as text
  if (parts.length === 0) {
    parts.push({ type: 'text', text: content })
  }

  return parts
})

function langLabel(lang: string): string {
  switch (lang) {
    case 'html': return 'HTML'
    case 'css': return 'CSS'
    case 'javascript': return 'JavaScript'
    default: return 'Code'
  }
}

function applyTarget(lang: string): string {
  switch (lang) {
    case 'html': return 'HTML'
    case 'css': return 'CSS'
    case 'javascript': return 'JS'
    default: return 'Code'
  }
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    toast.add({ title: 'Copied', description: 'Code copied to clipboard', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', description: 'Could not copy to clipboard', color: 'error' })
  }
}
</script>

<template>
  <div
    class="flex"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <!-- User message -->
    <div
      v-if="message.role === 'user'"
      class="max-w-[85%] bg-primary/10 text-sm rounded-lg px-3 py-2"
    >
      {{ message.content }}
    </div>

    <!-- Assistant message -->
    <div
      v-else
      class="max-w-full w-full text-sm space-y-2"
    >
      <template v-for="(section, i) in sections" :key="i">
        <!-- Text section -->
        <p v-if="section.type === 'text'" class="text-muted whitespace-pre-wrap leading-relaxed">
          {{ section.text }}
        </p>

        <!-- Code block -->
        <div
          v-else-if="section.type === 'code' && message.codeBlocks?.[section.blockIndex!]"
          class="rounded-lg border border-default overflow-hidden"
        >
          <div class="flex items-center justify-between px-3 py-1.5 bg-elevated border-b border-default">
            <span class="text-xs font-mono text-muted">
              {{ langLabel(message.codeBlocks[section.blockIndex!].language) }}
            </span>
            <div class="flex items-center gap-1">
              <UButton
                v-if="message.codeBlocks[section.blockIndex!].language !== 'unknown'"
                :label="`Apply to ${applyTarget(message.codeBlocks[section.blockIndex!].language)}`"
                icon="i-lucide-check"
                variant="ghost"
                size="xs"
                @click="emit('apply', message.codeBlocks[section.blockIndex!].language, message.codeBlocks[section.blockIndex!].code)"
              />
              <UButton
                icon="i-lucide-copy"
                variant="ghost"
                size="xs"
                @click="copyCode(message.codeBlocks[section.blockIndex!].code)"
              />
            </div>
          </div>
          <pre class="p-3 overflow-x-auto text-xs font-mono bg-default leading-relaxed"><code>{{ message.codeBlocks[section.blockIndex!].code }}</code></pre>
        </div>
      </template>

      <!-- Model indicator -->
      <span v-if="message.model" class="text-[10px] text-muted/50">
        via {{ message.model }}
      </span>
    </div>
  </div>
</template>
