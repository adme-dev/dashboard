# Email Editor Canvas (Phase 2a-ii-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the empty email-editor shell at `/agency/email/compose` a working canvas — render the document tree, select/move/duplicate/delete blocks, and add/insert blocks from a palette and inline "+" zones.

**Architecture:** Port four presentational Vue components from the sibling flyhub EDM layer, re-skinned shadcn→Nuxt UI v4, with all automotive/dynamic-block code stripped (out of scope for the agency module). Leaf blocks render through our own ported `EdmBlockRenderer` (no `@flyhub/email-block-*` imports — keeps the `@flyhub` surface minimal per gotcha #3). The palette + per-type default data are extracted into one pure, unit-tested util (`app/utils/edmBlocks.ts`) shared by the palette, insert zones, container, and columns — removing the triplicated `availableBlocks`/`getDefaultProps` in the source. The singleton store (`useEdmBuilder`) already exposes every mutation the canvas needs.

**Tech Stack:** Nuxt 4 (Vue 3 `<script setup>`), Nuxt UI v4 (`UButton`, `UPopover`, `UIcon`), Lucide via `@iconify-json/lucide` (`i-lucide-*` name strings), Vitest (node env, logic-only).

---

## Scope & boundaries

**In scope (this phase):** leaf block renderer, block wrapper (selection + move/duplicate/delete + insert-above/below), container renderer, columns renderer, and wiring the canvas + left palette into the shell.

**Explicitly deferred (do NOT build here):**
- Block settings/inspector panel → **2a-ii-3** (`BlockSettingsPanel.vue`)
- Live preview tab, HTML view, save to `edm_templates`, undo/redo toolbar, screen-size toggle → **2a-ii-4**
- All dynamic/template/transactional blocks + `DynamicBlockPreview.vue` (automotive) → **out of scope entirely**. The store retains its dynamic-block methods (harmless, unused).

**Known parity limitation (document, don't fix):** container/columns child blocks are click-to-select only (source behavior) — they have no per-child move/delete affordance. Editing happens via the settings panel (2a-ii-3). Top-level blocks get the full wrapper. This matches the source and keeps scope bounded.

## Source of truth

Cherry-pick origin: `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm/components/edm/flyhub/`
- `EdmBlockRenderer.vue` (181) · `EditorBlockWrapper.vue` (349) · `ContainerBlockRenderer.vue` (340) · `ColumnsContainerRenderer.vue` (423)
- Canvas wiring + handlers live in `EdmFlyhubBuilder.vue` (lines 140-218, 548-556, 667-700, 910-932, 1099-1101).

## Re-skin map (apply throughout)

| Source (shadcn / lucide-vue-next) | Target (Nuxt UI v4) |
|---|---|
| `import { Button } from '~~/components/ui/button'` | remove — use `<UButton>` |
| `import { Popover, PopoverTrigger, PopoverContent } from '~~/components/ui/popover'` | remove — use `<UPopover>` + `#content` slot |
| `import { Plus, Type, ... } from 'lucide-vue-next'` | remove — use `<UIcon name="i-lucide-..." />` / `<UButton icon="i-lucide-..." />` |
| `useEdmBuilderStore()` + `storeToRefs(store)` | `useEdmBuilder()` — returns refs directly; **no `storeToRefs`** |
| `import ... from '~/stores/edmBuilder'` | `useEdmBuilder` is auto-imported; `generateBlockId` from `~~/app/types/edm` |
| `import type { EdmBlockBase } from '~/types/edm-blocks'` | not needed (dynamic stripped) |
| `text-muted-foreground` | `text-muted` |
| `hsl(var(--muted))`, `hsl(var(--background))` in `<style>` | Tailwind `@apply` or semantic classes; see each task |
| `<button class="insert-button">` (custom) | keep custom button inside `UPopover` default (trigger) slot |
| `@flyhub/email-block-*` imports + `getBlockComponent()` | remove — render via `<EmailBuilderEdmBlockRenderer>` |

**UPopover v4 shape** used everywhere:
```vue
<UPopover v-model:open="open" :content="{ side: 'top', align: 'center' }">
  <button type="button" class="insert-button"><UIcon name="i-lucide-plus" class="h-3 w-3" /></button>
  <template #content>
    <!-- panel -->
  </template>
</UPopover>
```

**Auto-import names** (folder `app/components/email/builder/` → prefix `EmailBuilder`):
`EmailBuilderEdmBlockRenderer`, `EmailBuilderEditorBlockWrapper`, `EmailBuilderContainerBlockRenderer`, `EmailBuilderColumnsContainerRenderer`. `ContainerBlockRenderer` is self-recursive via its own auto-import name.

## File Structure

- **Create** `app/utils/edmBlocks.ts` — `BLOCK_PALETTE` (data) + `getDefaultBlockData(type)`. Pure, no Vue imports. Unit-tested.
- **Create** `test/app/edmBlocks.test.ts` — tests for the util.
- **Create** `app/components/email/builder/EdmBlockRenderer.vue` — leaf block → preview HTML (stateless).
- **Create** `app/components/email/builder/EditorBlockWrapper.vue` — selection + actions + insert zones.
- **Create** `app/components/email/builder/ContainerBlockRenderer.vue` — nested children + add-child.
- **Create** `app/components/email/builder/ColumnsContainerRenderer.vue` — 2/3-col layout + per-column add.
- **Modify** `app/components/email/builder/EdmFlyhubBuilder.client.vue` — palette + canvas + handlers (replaces the two `coming in 2a-ii-2` placeholders).

---

### Task 1: Extract the shared block palette + defaults util (TDD)

**Files:**
- Create: `app/utils/edmBlocks.ts`
- Test: `test/app/edmBlocks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/app/edmBlocks.test.ts
import { describe, it, expect } from 'vitest'
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'

describe('edmBlocks palette', () => {
  it('exposes the 10 agency block types in order', () => {
    expect(BLOCK_PALETTE.map(b => b.type)).toEqual([
      'Heading', 'Text', 'Button', 'Image', 'Avatar',
      'Divider', 'Spacer', 'Html', 'ColumnsContainer', 'Container'
    ])
  })

  it('uses iconify lucide name strings (no component imports)', () => {
    for (const b of BLOCK_PALETTE) {
      expect(b.icon).toMatch(/^i-lucide-[a-z0-9-]+$/)
      expect(b.name.length).toBeGreaterThan(0)
    }
  })
})

describe('getDefaultBlockData', () => {
  it('gives a Heading text + level under props, with padding style', () => {
    const d = getDefaultBlockData('Heading')
    expect(d.props).toEqual({ text: 'New Heading', level: 'h2' })
    expect(d.style).toEqual({ padding: { top: 16, bottom: 16, left: 24, right: 24 } })
  })

  it('gives a Container an empty childrenIds array', () => {
    const d = getDefaultBlockData('Container')
    expect(d.childrenIds).toEqual([])
    expect(d.props).toEqual({})
  })

  it('gives a ColumnsContainer a 3-slot columns array + layout props, plus childrenIds', () => {
    const d = getDefaultBlockData('ColumnsContainer')
    expect(d.childrenIds).toEqual([])
    expect(d.props).toEqual({
      columnsCount: 2,
      columnsGap: 16,
      contentAlignment: 'top',
      columns: [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }]
    })
  })

  it('gives a Button its url + brand colour default', () => {
    expect(getDefaultBlockData('Button').props).toEqual({
      text: 'Click Here', url: '#', buttonBackgroundColor: '#2f4574'
    })
  })

  it('returns empty props for an unknown type', () => {
    expect(getDefaultBlockData('Nope').props).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/app/edmBlocks.test.ts`
Expected: FAIL — `Cannot find module '~~/app/utils/edmBlocks'`.

- [ ] **Step 3: Write the util**

```ts
// app/utils/edmBlocks.ts
// Shared block palette + per-type default block data for the EDM editor canvas.
// Pure data + logic (no Vue imports) so it stays unit-testable and is the single
// source of truth shared by the palette, insert zones, container, and columns.

export interface EdmPaletteItem {
  type: string
  name: string
  icon: string // iconify lucide name, e.g. 'i-lucide-type'
}

// The 10 block types the agency email editor supports. Dynamic/template/
// transactional automotive blocks from the source project are intentionally absent.
export const BLOCK_PALETTE: EdmPaletteItem[] = [
  { type: 'Heading', name: 'Heading', icon: 'i-lucide-heading' },
  { type: 'Text', name: 'Text', icon: 'i-lucide-type' },
  { type: 'Button', name: 'Button', icon: 'i-lucide-mouse-pointer-click' },
  { type: 'Image', name: 'Image', icon: 'i-lucide-image' },
  { type: 'Avatar', name: 'Avatar', icon: 'i-lucide-user' },
  { type: 'Divider', name: 'Divider', icon: 'i-lucide-minus' },
  { type: 'Spacer', name: 'Spacer', icon: 'i-lucide-move-vertical' },
  { type: 'Html', name: 'HTML', icon: 'i-lucide-code' },
  { type: 'ColumnsContainer', name: 'Columns', icon: 'i-lucide-columns-3' },
  { type: 'Container', name: 'Container', icon: 'i-lucide-square' }
]

function getDefaultProps(type: string): Record<string, unknown> {
  switch (type) {
    case 'Heading':
      return { text: 'New Heading', level: 'h2' }
    case 'Text':
      return { text: 'Enter your text here...' }
    case 'Button':
      return { text: 'Click Here', url: '#', buttonBackgroundColor: '#2f4574' }
    case 'Image':
      return { url: 'https://placehold.co/600x400/f5f5f5/ccc?text=Your+Image', alt: 'Image' }
    case 'Spacer':
      return { height: 24 }
    case 'Divider':
      return { lineColor: '#e5e7eb' }
    case 'Html':
      return { contents: '<p>Custom HTML content</p>' }
    case 'ColumnsContainer':
      return {
        columnsCount: 2,
        columnsGap: 16,
        contentAlignment: 'top',
        columns: [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }]
      }
    default:
      return {}
  }
}

// Default `data` payload for a newly-added block, ready to pass to store.addBlock.
export function getDefaultBlockData(type: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    style: { padding: { top: 16, bottom: 16, left: 24, right: 24 } },
    props: getDefaultProps(type)
  }
  if (type === 'Container' || type === 'ColumnsContainer') {
    data.childrenIds = []
  }
  return data
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/app/edmBlocks.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint app/utils/edmBlocks.ts test/app/edmBlocks.test.ts`
Expected: clean (fix any residual with `--fix`).

- [ ] **Step 6: Commit**

```bash
git add app/utils/edmBlocks.ts test/app/edmBlocks.test.ts
git commit -m "feat(email): extract shared EDM block palette + defaults util (tested)"
```

---

### Task 2: Port `EdmBlockRenderer.vue` (leaf renderer)

**Files:**
- Create: `app/components/email/builder/EdmBlockRenderer.vue`

Stateless `type/style/props → preview HTML`. Port the source verbatim with one re-skin: `text-muted-foreground` → `text-muted` on the unknown-block fallback. No store, no UI library deps.

- [ ] **Step 1: Create the component**

```vue
<!-- app/components/email/builder/EdmBlockRenderer.vue -->
<!-- Stateless leaf renderer: block type/style/props → editor-preview markup.
     Ported from layers/edm/.../EdmBlockRenderer.vue (shadcn class re-skinned). -->
<template>
  <!-- Heading -->
  <component :is="headingTag" v-if="type === 'Heading'" :style="headingStyle">
    {{ blockProps.text || 'New Heading' }}
  </component>

  <!-- Text -->
  <div
    v-else-if="type === 'Text'"
    :style="textStyle"
    class="revert-browser-styles"
    v-html="blockProps.text || ''"
  />

  <!-- Button -->
  <div v-else-if="type === 'Button'" :style="buttonWrapperStyle">
    <a :href="(blockProps.url as string) || '#'" :style="buttonLinkStyle" target="_blank">
      {{ blockProps.text || 'Click Here' }}
    </a>
  </div>

  <!-- Image -->
  <div v-else-if="type === 'Image'" :style="imageWrapperStyle">
    <a
      v-if="blockProps.linkHref"
      :href="blockProps.linkHref as string"
      target="_blank"
      style="text-decoration: none"
    >
      <img :src="(blockProps.url as string) || ''" :alt="(blockProps.alt as string) || ''" :style="imageStyle">
    </a>
    <img v-else :src="(blockProps.url as string) || ''" :alt="(blockProps.alt as string) || ''" :style="imageStyle">
  </div>

  <!-- Avatar -->
  <div v-else-if="type === 'Avatar'" :style="avatarWrapperStyle">
    <img :src="(blockProps.imageUrl as string) || ''" :alt="(blockProps.alt as string) || 'Avatar'" :style="avatarStyle">
  </div>

  <!-- Divider -->
  <div v-else-if="type === 'Divider'" :style="dividerWrapperStyle">
    <hr :style="dividerLineStyle">
  </div>

  <!-- Spacer -->
  <div v-else-if="type === 'Spacer'" :style="{ height: ((blockProps.height as number) || 24) + 'px' }" />

  <!-- Html -->
  <div
    v-else-if="type === 'Html'"
    :style="baseStyle"
    class="revert-browser-styles"
    v-html="blockProps.contents || ''"
  />

  <!-- Unknown -->
  <div
    v-else
    :style="baseStyle"
    class="text-muted text-sm p-4 text-center border border-dashed rounded"
  >
    Unknown block: {{ type }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type: string
  style?: Record<string, unknown> | null
  props?: Record<string, unknown> | null
}>()

const blockProps = computed(() => (props.props || {}) as Record<string, unknown>)

function getPadding(p: unknown): string | undefined {
  if (!p || typeof p !== 'object') return undefined
  const pad = p as { top?: number, bottom?: number, left?: number, right?: number }
  return `${pad.top ?? 0}px ${pad.right ?? 0}px ${pad.bottom ?? 0}px ${pad.left ?? 0}px`
}

function buildBaseStyle(
  s: Record<string, unknown> | null | undefined
): Record<string, string | undefined> {
  if (!s) return {}
  return {
    color: (s.color as string) || undefined,
    backgroundColor: (s.backgroundColor as string) || undefined,
    fontFamily: (s.fontFamily as string) || undefined,
    fontSize: s.fontSize ? `${s.fontSize}px` : undefined,
    fontWeight: (s.fontWeight as string) || undefined,
    textAlign: (s.textAlign as string) || undefined,
    padding: getPadding(s.padding)
  }
}

const baseStyle = computed(() => buildBaseStyle(props.style))

const headingTag = computed(() => {
  const level = (blockProps.value.level as string) || 'h2'
  return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(level) ? level : 'h2'
})
const headingStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  fontWeight: (props.style?.fontWeight as string) || 'bold'
}))

const textStyle = computed(() => buildBaseStyle(props.style))

const buttonWrapperStyle = computed(() => ({
  backgroundColor: (props.style?.backgroundColor as string) || undefined,
  textAlign: (props.style?.textAlign as string) || undefined,
  padding: getPadding(props.style?.padding)
}))
const buttonLinkStyle = computed(() => {
  const bgColor = (blockProps.value.buttonBackgroundColor as string) || '#2f4574'
  const textColor = (blockProps.value.buttonTextColor as string) || '#ffffff'
  return {
    display: 'inline-block',
    padding: '12px 20px',
    fontSize: '16px',
    fontWeight: '600',
    textDecoration: 'none',
    backgroundColor: bgColor,
    color: textColor,
    borderRadius: '4px',
    lineHeight: '1'
  }
})

const imageWrapperStyle = computed(() => ({
  padding: getPadding(props.style?.padding),
  backgroundColor: (props.style?.backgroundColor as string) || undefined,
  textAlign: (props.style?.textAlign as string) || undefined
}))
const imageStyle = computed(() => ({
  maxWidth: '100%',
  height: 'auto',
  display: 'block',
  outline: 'none',
  border: 'none',
  ...(blockProps.value.width ? { width: `${blockProps.value.width}px` } : {}),
  ...(blockProps.value.height ? { height: `${blockProps.value.height}px` } : {})
}))

const avatarWrapperStyle = computed(() => ({
  textAlign: (props.style?.textAlign as string) || undefined,
  padding: getPadding(props.style?.padding)
}))
const avatarStyle = computed(() => {
  const size = (blockProps.value.size as number) || 64
  const shape = (blockProps.value.shape as string) || 'circle'
  return {
    width: `${size}px`,
    height: `${size}px`,
    objectFit: 'cover' as const,
    display: 'inline-block',
    verticalAlign: 'middle',
    borderRadius: shape === 'circle' ? '50%' : shape === 'rounded' ? '8px' : '0'
  }
})

const dividerWrapperStyle = computed(() => ({
  padding: getPadding(props.style?.padding),
  backgroundColor: (props.style?.backgroundColor as string) || undefined
}))
const dividerLineStyle = computed(() => ({
  width: '100%',
  border: 'none',
  borderTop: `${(blockProps.value.lineHeight as number) || 1}px solid ${(blockProps.value.lineColor as string) || '#e5e7eb'}`,
  margin: '0'
}))
</script>
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint app/components/email/builder/EdmBlockRenderer.vue`
Expected: clean. (If `no-explicit-any` fires on the template casts, they're necessary for the loosely-typed `props` payload — fix any script-block `any`; template casts are acceptable. If eslint flags template casts, add a file-level `<!-- eslint-disable -->` is NOT valid in Vue templates; instead the casts shown are `as string`/`as number` which satisfy the rule since they're not bare `any`.)

- [ ] **Step 3: Commit**

```bash
git add app/components/email/builder/EdmBlockRenderer.vue
git commit -m "feat(email): port EdmBlockRenderer (leaf block preview, Nuxt UI re-skin)"
```

---

### Task 3: Port `EditorBlockWrapper.vue` (selection + actions + insert zones)

**Files:**
- Create: `app/components/email/builder/EditorBlockWrapper.vue`

Changes from source: drop `Button`/`Popover`/`lucide-vue-next` imports; drop `useRegisteredBlocks`/`isRegistered` (all palette types render); drop the entire "Dynamic" picker section + `insert-dynamic-*` emits + `dynamicBlockTypes`; use `BLOCK_PALETTE` from the util; `useEdmBuilder()` instead of Pinia; `UButton`/`UPopover`/`UIcon`. Scoped styles: replace `hsl(var(--background))` with `@apply bg-default` and `hsl(var(--muted))` with `@apply bg-muted`.

- [ ] **Step 1: Create the component**

```vue
<!-- app/components/email/builder/EditorBlockWrapper.vue -->
<!-- Wraps a top-level canvas block: hover/selection outline, move/duplicate/delete
     actions, and insert-above/below "+" popovers. Ported + Nuxt UI re-skin;
     dynamic-block paths removed. -->
<template>
  <div
    :class="['editor-block-wrapper', { 'is-selected': isSelected, 'is-hovered': isHovered }]"
    @mouseenter.stop="isHovered = true"
    @mouseleave="onLeave"
    @click.stop="handleClick"
  >
    <!-- Insert Above Zone -->
    <div
      class="insert-zone insert-above"
      @mouseenter="showInsertAbove = true"
      @mouseleave="showInsertAbove = false"
    >
      <UPopover v-model:open="insertAboveOpen" :content="{ side: 'top', align: 'center' }">
        <button
          v-show="(isHovered && showInsertAbove) || insertAboveOpen"
          type="button"
          class="insert-button"
        >
          <UIcon name="i-lucide-plus" class="h-3 w-3 pointer-events-none" />
        </button>
        <template #content>
          <div class="grid grid-cols-4 gap-1 p-2">
            <button
              v-for="blockType in BLOCK_PALETTE"
              :key="blockType.type"
              class="block-picker-item"
              @click="insertBlockAbove(blockType.type)"
            >
              <UIcon :name="blockType.icon" class="h-4 w-4" />
              <span class="text-[10px]">{{ blockType.name }}</span>
            </button>
          </div>
        </template>
      </UPopover>
    </div>

    <!-- Block Actions (shows on selection) -->
    <div v-if="isSelected" class="block-actions">
      <UButton
        icon="i-lucide-chevron-up"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Move up"
        @click.stop="emit('move-up')"
      />
      <UButton
        icon="i-lucide-chevron-down"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Move down"
        @click.stop="emit('move-down')"
      />
      <UButton
        icon="i-lucide-copy"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Duplicate"
        @click.stop="emit('duplicate')"
      />
      <UButton
        icon="i-lucide-trash-2"
        variant="ghost"
        color="error"
        size="xs"
        title="Delete"
        @click.stop="emit('delete')"
      />
    </div>

    <!-- Block Content -->
    <slot />

    <!-- Insert Below Zone -->
    <div
      class="insert-zone insert-below"
      @mouseenter="showInsertBelow = true"
      @mouseleave="showInsertBelow = false"
    >
      <UPopover v-model:open="insertBelowOpen" :content="{ side: 'bottom', align: 'center' }">
        <button
          v-show="(isHovered && showInsertBelow) || insertBelowOpen"
          type="button"
          class="insert-button"
        >
          <UIcon name="i-lucide-plus" class="h-3 w-3 pointer-events-none" />
        </button>
        <template #content>
          <div class="grid grid-cols-4 gap-1 p-2">
            <button
              v-for="blockType in BLOCK_PALETTE"
              :key="blockType.type"
              class="block-picker-item"
              @click="insertBlockBelow(blockType.type)"
            >
              <UIcon :name="blockType.icon" class="h-4 w-4" />
              <span class="text-[10px]">{{ blockType.name }}</span>
            </button>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { BLOCK_PALETTE } from '~~/app/utils/edmBlocks'

const props = defineProps<{ blockId: string }>()

const emit = defineEmits<{
  'move-up': []
  'move-down': []
  'duplicate': []
  'delete': []
  'insert-above': [type: string]
  'insert-below': [type: string]
}>()

const store = useEdmBuilder()
const isHovered = ref(false)
const showInsertAbove = ref(false)
const showInsertBelow = ref(false)
const insertAboveOpen = ref(false)
const insertBelowOpen = ref(false)

const isSelected = computed(() => store.selectedBlockId.value === props.blockId)

function onLeave() {
  isHovered.value = false
  showInsertAbove.value = false
  showInsertBelow.value = false
}

function handleClick() {
  store.setSelectedBlockId(props.blockId)
}

function insertBlockAbove(type: string) {
  emit('insert-above', type)
  insertAboveOpen.value = false
}

function insertBlockBelow(type: string) {
  emit('insert-below', type)
  insertBelowOpen.value = false
}
</script>

<style scoped>
.editor-block-wrapper {
  position: relative;
  transition: all 0.15s ease;
}

.editor-block-wrapper.is-hovered {
  outline: 2px solid rgba(59, 130, 246, 0.3);
  outline-offset: 2px;
}

.editor-block-wrapper.is-selected {
  outline: 2px solid rgb(59, 130, 246);
  outline-offset: 2px;
}

.block-actions {
  position: absolute;
  top: 0;
  left: -48px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
  @apply bg-default;
}

.insert-zone {
  position: absolute;
  left: 0;
  right: 0;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.insert-zone :deep(> *) {
  display: flex;
  justify-content: center;
  width: 100%;
}

.insert-above {
  top: -10px;
}

.insert-below {
  bottom: -10px;
}

.insert-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: rgb(59, 130, 246);
  color: white;
  border: 2px solid white;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.insert-button:hover {
  background-color: rgb(37, 99, 235);
  transform: scale(1.15);
}

.block-picker-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease;
  min-width: 56px;
}

.block-picker-item:hover {
  @apply bg-muted;
}
</style>
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint app/components/email/builder/EditorBlockWrapper.vue`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/email/builder/EditorBlockWrapper.vue
git commit -m "feat(email): port EditorBlockWrapper (selection/move/insert, dynamic stripped)"
```

---

### Task 4: Port `ContainerBlockRenderer.vue` (nested children + add-child)

**Files:**
- Create: `app/components/email/builder/ContainerBlockRenderer.vue`

Changes from source: drop `storeToRefs`/Pinia, all `@flyhub/email-block-*` imports + `getBlockComponent`, `DynamicBlockPreview`, all dynamic-block functions/UI, `EdmBlockBase` import. Render each child via `<EmailBuilderEdmBlockRenderer>`. Use `BLOCK_PALETTE` + `getDefaultBlockData` + `store.addBlock`. `useEdmBuilder()` returns `document`/`selectedBlockId` as refs (use `.value` in script; in template they auto-unwrap).

- [ ] **Step 1: Create the component**

```vue
<!-- app/components/email/builder/ContainerBlockRenderer.vue -->
<!-- Renders a Container block's children + an add-child "+" popover.
     Ported; dynamic-block + @flyhub block-component paths removed (children
     render through EdmBlockRenderer). -->
<template>
  <div
    class="container-block"
    :style="containerStyle"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <template v-if="childBlocks.length > 0">
      <div
        v-for="child in childBlocks"
        :key="child.id"
        class="container-child"
        :class="{ 'is-selected': store.selectedBlockId.value === child.id }"
        @click.stop="store.setSelectedBlockId(child.id)"
      >
        <EmailBuilderEdmBlockRenderer
          :type="child.type"
          :style="child.data.style"
          :props="child.data.props"
        />
      </div>
    </template>

    <div class="container-add-block">
      <UPopover v-model:open="showBlockPicker" :content="{ side: 'bottom', align: 'center' }">
        <button v-show="isHovered || showBlockPicker" type="button" class="add-block-trigger">
          <UIcon name="i-lucide-plus" class="h-4 w-4 pointer-events-none" />
        </button>
        <template #content>
          <div class="grid grid-cols-4 gap-1 p-2 w-64">
            <button
              v-for="blockType in CHILD_PALETTE"
              :key="blockType.type"
              class="block-picker-item"
              @click="addChildBlock(blockType.type)"
            >
              <UIcon :name="blockType.icon" class="h-4 w-4" />
              <span class="text-[10px]">{{ blockType.name }}</span>
            </button>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'

const props = defineProps<{
  blockId: string
  style?: {
    backgroundColor?: string | null
    borderColor?: string | null
    borderRadius?: number | null
    padding?: { top: number, bottom: number, left: number, right: number } | null
  } | null
  props?: Record<string, unknown> | null
}>()

const store = useEdmBuilder()
const isHovered = ref(false)
const showBlockPicker = ref(false)

// Containers can only hold leaf blocks (no nested containers/columns) — matches source.
const CHILD_PALETTE = BLOCK_PALETTE.filter(
  b => b.type !== 'Container' && b.type !== 'ColumnsContainer'
)

const containerStyle = computed(() => {
  const style = props.style || {}
  return {
    backgroundColor: style.backgroundColor || 'transparent',
    borderColor: style.borderColor || 'transparent',
    borderWidth: style.borderColor ? '1px' : '0',
    borderStyle: style.borderColor ? 'solid' : 'none',
    borderRadius: style.borderRadius ? `${style.borderRadius}px` : '0',
    paddingTop: `${style.padding?.top ?? 16}px`,
    paddingBottom: `${style.padding?.bottom ?? 16}px`,
    paddingLeft: `${style.padding?.left ?? 24}px`,
    paddingRight: `${style.padding?.right ?? 24}px`
  }
})

const childBlocks = computed(() => {
  const block = store.document.value[props.blockId]
  if (!block) return []
  const childrenIds = block.data?.childrenIds || []
  return childrenIds.map(id => ({
    id,
    type: store.document.value[id]?.type || 'Unknown',
    data: store.document.value[id]?.data || {}
  }))
})

function addChildBlock(type: string) {
  // Tighter default padding for nested blocks.
  const data = getDefaultBlockData(type)
  data.style = { padding: { top: 8, bottom: 8, left: 16, right: 16 } }
  store.addBlock(type, props.blockId, undefined, data)
  showBlockPicker.value = false
}
</script>

<style scoped>
.container-block {
  min-height: 60px;
  position: relative;
}

.container-child {
  position: relative;
  transition: outline 0.15s ease;
}

.container-child:hover {
  outline: 1px dashed rgba(59, 130, 246, 0.5);
  outline-offset: 2px;
}

.container-child.is-selected {
  outline: 2px solid rgb(59, 130, 246);
  outline-offset: 2px;
}

.container-add-block {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.add-block-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: rgb(59, 130, 246);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-block-trigger:hover {
  background-color: rgb(37, 99, 235);
  transform: scale(1.1);
}

.block-picker-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease;
  min-width: 56px;
}

.block-picker-item:hover {
  @apply bg-muted;
}
</style>
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint app/components/email/builder/ContainerBlockRenderer.vue`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/email/builder/ContainerBlockRenderer.vue
git commit -m "feat(email): port ContainerBlockRenderer (children via EdmBlockRenderer)"
```

---

### Task 5: Port `ColumnsContainerRenderer.vue` (2/3-col layout + per-column add)

**Files:**
- Create: `app/components/email/builder/ColumnsContainerRenderer.vue`

Same strip as Task 4. Per-column add uses `store.addBlockToDocument(id, type, data)` then `store.addBlockToColumn(blockId, colIndex, id)` with `generateBlockId()` from `~~/app/types/edm`.

- [ ] **Step 1: Create the component**

```vue
<!-- app/components/email/builder/ColumnsContainerRenderer.vue -->
<!-- Renders a ColumnsContainer (2 or 3 columns) with per-column children + add
     buttons. Ported; dynamic-block + @flyhub block-component paths removed. -->
<template>
  <div class="columns-container" :style="containerStyle">
    <div class="columns-grid" :style="gridStyle">
      <div
        v-for="(column, colIndex) in columns"
        :key="colIndex"
        class="column"
        :style="getColumnStyle()"
        @mouseenter="columnHovered[colIndex] = true"
        @mouseleave="columnHovered[colIndex] = false"
      >
        <template v-if="column.childrenIds && column.childrenIds.length > 0">
          <div
            v-for="childId in column.childrenIds"
            :key="childId"
            class="column-child"
            :class="{ 'is-selected': store.selectedBlockId.value === childId }"
            @click.stop="store.setSelectedBlockId(childId)"
          >
            <EmailBuilderEdmBlockRenderer
              :type="getBlockType(childId)"
              :style="getBlockData(childId).style"
              :props="getBlockData(childId).props"
            />
          </div>
        </template>

        <div class="column-add-block">
          <UPopover v-model:open="columnPickerOpen[colIndex]" :content="{ side: 'bottom', align: 'center' }">
            <button
              v-show="columnHovered[colIndex] || columnPickerOpen[colIndex]"
              type="button"
              class="add-block-trigger"
            >
              <UIcon name="i-lucide-plus" class="h-4 w-4 pointer-events-none" />
            </button>
            <template #content>
              <div class="grid grid-cols-4 gap-1 p-2 w-64">
                <button
                  v-for="blockType in CHILD_PALETTE"
                  :key="blockType.type"
                  class="block-picker-item"
                  @click="addBlockToColumn(blockType.type, colIndex)"
                >
                  <UIcon :name="blockType.icon" class="h-4 w-4" />
                  <span class="text-[10px]">{{ blockType.name }}</span>
                </button>
              </div>
            </template>
          </UPopover>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'
import { generateBlockId } from '~~/app/types/edm'

interface ColumnData { childrenIds: string[] }

const props = defineProps<{
  blockId: string
  style?: {
    backgroundColor?: string | null
    padding?: { top: number, bottom: number, left: number, right: number } | null
  } | null
  props?: {
    columnsCount?: 2 | 3
    columnsGap?: number
    contentAlignment?: 'top' | 'middle' | 'bottom'
    columns?: ColumnData[]
    fixedWidths?: (number | null)[]
  } | null
}>()

const store = useEdmBuilder()
const columnHovered = reactive<boolean[]>([false, false, false])
const columnPickerOpen = reactive<boolean[]>([false, false, false])

const CHILD_PALETTE = BLOCK_PALETTE.filter(
  b => b.type !== 'Container' && b.type !== 'ColumnsContainer'
)

const columnsCount = computed(() => props.props?.columnsCount || 2)

const columns = computed(() => {
  const cols = props.props?.columns || []
  const count = columnsCount.value
  const result: ColumnData[] = []
  for (let i = 0; i < count; i++) {
    result.push(cols[i] || { childrenIds: [] })
  }
  return result
})

const containerStyle = computed(() => {
  const style = props.style || {}
  return {
    backgroundColor: style.backgroundColor || 'transparent',
    paddingTop: `${style.padding?.top ?? 16}px`,
    paddingBottom: `${style.padding?.bottom ?? 16}px`,
    paddingLeft: `${style.padding?.left ?? 24}px`,
    paddingRight: `${style.padding?.right ?? 24}px`
  }
})

const gridStyle = computed(() => {
  const count = columnsCount.value
  const gap = props.props?.columnsGap ?? 16
  const fixedWidths = props.props?.fixedWidths || []
  const columnWidths: string[] = []
  for (let i = 0; i < count; i++) {
    columnWidths.push(fixedWidths[i] ? `${fixedWidths[i]}px` : '1fr')
  }
  return {
    display: 'grid',
    gridTemplateColumns: columnWidths.join(' '),
    gap: `${gap}px`
  }
})

function getColumnStyle() {
  const alignment = props.props?.contentAlignment || 'top'
  let alignItems = 'flex-start'
  if (alignment === 'middle') alignItems = 'center'
  if (alignment === 'bottom') alignItems = 'flex-end'
  return {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems,
    minHeight: '60px'
  }
}

function getBlockType(blockId: string): string {
  return store.document.value[blockId]?.type || 'Html'
}

function getBlockData(blockId: string): Record<string, unknown> {
  return store.document.value[blockId]?.data || {}
}

function addBlockToColumn(type: string, columnIndex: number) {
  const newBlockId = generateBlockId()
  const data = getDefaultBlockData(type)
  data.style = { padding: { top: 8, bottom: 8, left: 8, right: 8 } }
  store.addBlockToDocument(newBlockId, type, data)
  store.addBlockToColumn(props.blockId, columnIndex, newBlockId)
  columnPickerOpen[columnIndex] = false
}
</script>

<style scoped>
.columns-container {
  min-height: 80px;
  position: relative;
}

.columns-grid {
  width: 100%;
}

.column {
  background: rgba(59, 130, 246, 0.05);
  border: 1px dashed rgba(59, 130, 246, 0.3);
  border-radius: 4px;
  padding: 8px;
  min-height: 60px;
}

.column-child {
  position: relative;
  transition: outline 0.15s ease;
  width: 100%;
}

.column-child:hover {
  outline: 1px dashed rgba(59, 130, 246, 0.5);
  outline-offset: 2px;
}

.column-child.is-selected {
  outline: 2px solid rgb(59, 130, 246);
  outline-offset: 2px;
}

.column-add-block {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  margin-top: auto;
}

.add-block-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: rgb(59, 130, 246);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-block-trigger:hover {
  background-color: rgb(37, 99, 235);
  transform: scale(1.1);
}

.block-picker-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease;
  min-width: 56px;
}

.block-picker-item:hover {
  @apply bg-muted;
}
</style>
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint app/components/email/builder/ColumnsContainerRenderer.vue`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/email/builder/ColumnsContainerRenderer.vue
git commit -m "feat(email): port ColumnsContainerRenderer (per-column add via store)"
```

---

### Task 6: Wire palette + canvas into the editor shell

**Files:**
- Modify: `app/components/email/builder/EdmFlyhubBuilder.client.vue`

Replace the two `coming in 2a-ii-2` placeholders. Left sidebar → block palette (adds to `root`). Center → canvas: backdrop/canvas colours from layout settings, empty state, the block list (wrapper + the three renderers), and an add-block-at-end button. Drop the `@flyhub` `renderToStaticMarkup` smoke (the live canvas supersedes it). Keep the right-sidebar `EmailLayoutSettings`.

- [ ] **Step 1: Replace the component**

```vue
<!-- app/components/email/builder/EdmFlyhubBuilder.client.vue -->
<!-- Editor shell + canvas (2a-ii-2). Block settings panel (2a-ii-3) and
     preview/HTML/save/undo toolbar (2a-ii-4) land in later phases. -->
<script setup lang="ts">
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'

const store = useEdmBuilder()
const layout = computed(() => store.getLayoutSettings())

const childBlocks = computed(() => {
  const root = store.document.value.root
  const childrenIds = root?.data?.childrenIds || []
  return childrenIds.map(id => ({
    id,
    type: store.document.value[id]?.type || 'Unknown',
    data: store.document.value[id]?.data || {}
  }))
})

function addBlock(type: string, position?: number) {
  store.addBlock(type, 'root', position, getDefaultBlockData(type))
}

function moveBlock(blockId: string, direction: 'up' | 'down') {
  const root = store.document.value.root
  const childrenIds = [...(root?.data?.childrenIds || [])]
  const index = childrenIds.indexOf(blockId)
  if (index === -1) return
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= childrenIds.length) return
  ;[childrenIds[index], childrenIds[newIndex]] = [childrenIds[newIndex], childrenIds[index]]
  store.updateBlockData('root', { childrenIds })
}

function updateLayout(patch: Record<string, unknown>) {
  store.updateLayoutSettings(patch)
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left: block palette -->
    <aside class="w-56 border-r border-default p-3 overflow-auto">
      <p class="text-xs font-semibold uppercase text-muted mb-3">
        Add blocks
      </p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="blockType in BLOCK_PALETTE"
          :key="blockType.type"
          class="flex flex-col items-center justify-center p-3 rounded-md border border-default bg-elevated/50 text-default cursor-pointer transition-all hover:border-primary hover:bg-primary/10"
          @click="addBlock(blockType.type)"
        >
          <UIcon :name="blockType.icon" class="h-5 w-5 mb-1" />
          <span class="text-xs">{{ blockType.name }}</span>
        </button>
      </div>
    </aside>

    <!-- Center: canvas -->
    <main
      class="flex-1 p-6 overflow-auto"
      :style="{ backgroundColor: layout.backdropColor }"
      @click="store.clearSelection()"
    >
      <div
        class="mx-auto max-w-[600px] min-h-64 rounded shadow-sm"
        :style="{ backgroundColor: layout.canvasColor, color: layout.textColor }"
        @click.stop
      >
        <!-- Empty state -->
        <div
          v-if="childBlocks.length === 0"
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <UIcon name="i-lucide-plus" class="h-12 w-12 text-muted/50 mb-4" />
          <p class="text-muted">
            Click a block from the sidebar to add it here
          </p>
        </div>

        <!-- Block list -->
        <template v-for="(block, index) in childBlocks" :key="block.id">
          <EmailBuilderEditorBlockWrapper
            :block-id="block.id"
            @move-up="moveBlock(block.id, 'up')"
            @move-down="moveBlock(block.id, 'down')"
            @duplicate="store.duplicateBlock(block.id)"
            @delete="store.removeBlock(block.id)"
            @insert-above="addBlock($event, index)"
            @insert-below="addBlock($event, index + 1)"
          >
            <EmailBuilderContainerBlockRenderer
              v-if="block.type === 'Container'"
              :block-id="block.id"
              :style="block.data?.style"
              :props="block.data?.props"
            />
            <EmailBuilderColumnsContainerRenderer
              v-else-if="block.type === 'ColumnsContainer'"
              :block-id="block.id"
              :style="block.data?.style"
              :props="block.data?.props"
            />
            <EmailBuilderEdmBlockRenderer
              v-else
              :type="block.type"
              :style="block.data?.style"
              :props="block.data?.props"
            />
          </EmailBuilderEditorBlockWrapper>
        </template>

        <!-- Add at end -->
        <div v-if="childBlocks.length > 0" class="flex justify-center py-3">
          <UPopover :content="{ side: 'bottom', align: 'center' }">
            <UButton icon="i-lucide-plus" variant="soft" color="primary" size="sm" label="Add block" />
            <template #content>
              <div class="grid grid-cols-4 gap-1 p-2 w-64">
                <button
                  v-for="blockType in BLOCK_PALETTE"
                  :key="blockType.type"
                  class="flex flex-col items-center justify-center gap-1 p-2 rounded-md cursor-pointer hover:bg-muted min-w-14"
                  @click="addBlock(blockType.type)"
                >
                  <UIcon :name="blockType.icon" class="h-4 w-4" />
                  <span class="text-[10px]">{{ blockType.name }}</span>
                </button>
              </div>
            </template>
          </UPopover>
        </div>
      </div>
    </main>

    <!-- Right: email settings -->
    <aside class="w-80 border-l border-default p-3 overflow-auto">
      <p class="text-xs font-semibold uppercase text-muted mb-3">
        Email settings
      </p>
      <EmailBuilderEmailLayoutSettings :settings="layout" @update="updateLayout" />
    </aside>
  </div>
</template>
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint app/components/email/builder/EdmFlyhubBuilder.client.vue`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/email/builder/EdmFlyhubBuilder.client.vue
git commit -m "feat(email): wire palette + canvas into editor shell (2a-ii-2 complete)"
```

---

### Task 7: Verify the whole phase (build + browser smoke)

**No component-mount test infra exists** (`@vue/test-utils` absent, vitest env is `node`, all suites are logic-only). Adding it is out of scope. Per gotcha #1, presentational ports are verified by the real Nuxt build + a browser eyeball — vitest alone won't catch dynamic-import/SSR breakage.

- [ ] **Step 1: Full email test suite still green**

Run: `pnpm exec vitest run test/utils/emailMarketing*.test.ts test/utils/emailRender*.test.ts test/app/edmBuilderStore.test.ts test/app/edmBlocks.test.ts`
Expected: PASS (prior 26 + new 6 = 32).

- [ ] **Step 2: Lint the whole module**

Run: `pnpm exec eslint app/components/email/builder app/utils/edmBlocks.ts`
Expected: clean (no `any`, no trailing commas, comma member-delimiters).

- [ ] **Step 3: Dev build smoke (catches the gotcha-#1 class of failure)**

Run: `pnpm dev` (background it), wait for "Nitro built", then:
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/email/templates/render` → expect `401` (route resolves, auth-gated — proves no build break).
- Confirm dev server log shows **no** `Could not load @flyhub`, **no** `Duplicated imports`, **no** Vite transform error for the builder components.

- [ ] **Step 4: Browser eyeball at `/agency/email/compose`**

In Chrome (logged-in agency session), verify by clicking through:
1. Empty canvas shows the "Click a block…" empty state.
2. Click palette **Heading**, **Button**, **Image** → each appears on the canvas.
3. Click a block → blue selection outline + the left-side move-up/down/duplicate/delete action bar appears.
4. Move up/down reorders; duplicate adds a copy below; delete removes it.
5. Hover between blocks → "+" insert zone appears; inserting picks the right position.
6. Add a **Columns** block → 2 columns render; per-column "+" adds a child into that column.
7. Add a **Container** block → add-child "+" works; children render + select.
8. Right-panel Email settings still updates backdrop/canvas/text colours live.

- [ ] **Step 5: Final state check + push**

```bash
git status            # only intended files changed; CRM docs still untracked & untouched
git log --oneline -7  # Tasks 1-6 commits present
git push              # (adme-dev gh account — see memory github-push-access)
```

Expected: clean tree (modulo the not-ours CRM docs), branch pushed, PR #20 updated.

---

## Self-Review

**Spec coverage** (against handoff "Editor components to port for 2a-ii-2"):
- ✅ `EdmBlockRenderer` → Task 2
- ✅ `EditorBlockWrapper` → Task 3
- ✅ `ContainerBlockRenderer` → Task 4
- ✅ `ColumnsContainerRenderer` → Task 5
- ✅ "wire add/move/delete/insert into the empty editor shell" → Task 6
- ✅ shadcn→Nuxt UI map applied (re-skin table); No DnD (move = up/down + insert-at); no rich text; color via native input (in 2a-ii-3 settings, not here).

**Placeholder scan:** none — every step has full code or an exact command.

**Type consistency:** `getDefaultBlockData` (Task 1) used identically in Tasks 4/5/6; `BLOCK_PALETTE` shape (`type`/`name`/`icon`) consistent across palette, wrapper, container, columns; store calls (`addBlock(type, parent, position?, data)`, `addBlockToDocument(id, type, data)`, `addBlockToColumn(blockId, colIndex, id)`, `setSelectedBlockId`, `clearSelection`, `duplicateBlock`, `removeBlock`, `updateBlockData`) all verified against `app/composables/useEdmBuilder.ts`. `store.selectedBlockId` / `store.document` accessed as `.value` in script (composable returns raw refs, not Pinia).

**Gotchas honoured:** #1 dev-build verify (Task 7.3); #2 `~~/app/...` import paths in tested code (`edmBlocks.ts`, test); #3 no new `@flyhub` imports (leaves render via `EdmBlockRenderer`); #5 singleton composable (`.value` access); #7 ESLint strict (lint step per task); #10 CRM docs left untouched.
