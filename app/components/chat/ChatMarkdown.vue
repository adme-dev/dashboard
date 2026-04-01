<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  content: string
}>()

// Configure marked for chat messages (inline only, no full HTML)
const renderer = new marked.Renderer()

// Override link rendering to add target="_blank" and rel="noopener"
renderer.link = ({ href, text }) => {
  const escapedHref = href.replace(/"/g, '&quot;')
  return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${text}</a>`
}

// Override image rendering to prevent arbitrary images
renderer.image = ({ href, text }) => {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">[Image: ${text || href}]</a>`
}

marked.setOptions({
  renderer,
  gfm: true,
  breaks: true
})

// Sanitize and render markdown
const rendered = computed(() => {
  // Parse with marked first, then sanitize with DOMPurify
  const html = marked.parse(props.content, { async: false }) as string

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'del', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false
  })
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="chat-markdown text-sm whitespace-pre-wrap break-words" v-html="rendered" />
</template>

<style scoped>
.chat-markdown :deep(p) {
  margin: 0;
}
.chat-markdown :deep(p + p) {
  margin-top: 0.25rem;
}
.chat-markdown :deep(code) {
  background: var(--ui-bg-elevated);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
}
.chat-markdown :deep(pre) {
  background: var(--ui-bg-elevated);
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}
.chat-markdown :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.8125rem;
}
.chat-markdown :deep(blockquote) {
  border-left: 3px solid var(--ui-border-default);
  padding-left: 0.75rem;
  margin: 0.25rem 0;
  color: var(--ui-text-muted);
}
.chat-markdown :deep(ul), .chat-markdown :deep(ol) {
  padding-left: 1.25rem;
  margin: 0.25rem 0;
}
.chat-markdown :deep(strong) {
  font-weight: 600;
}
.chat-markdown :deep(a) {
  word-break: break-all;
}
</style>
