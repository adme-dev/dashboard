# Email Marketing — Phase 2a-ii-1: Editor Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for the flyhub email editor in the dashboard — install the `@flyhub/*` packages with a Cloudflare-Workers-safe stub-alias build config, port the editor's type definitions and state store (Pinia → `useState`/module-scope composable, no new dependency), and mount an empty client-only editor shell with the simplest panel (EmailLayoutSettings) re-skinned to Nuxt UI v4.

**Architecture:** The `@flyhub/*` packages are **client-only** — aliased to a stub in the Nitro build so they never enter the Workers server bundle (the server already renders via the pure-TS pipeline from Phase 2a-i, which has no `@flyhub` dependency). The 660-line Pinia store is converted to a module-scoped singleton composable (`useEdmBuilder`) — the editor is `.client`-only so module-scope refs are a safe singleton (no SSR cross-request bleed). Editor components live under `app/components/email/builder/`.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, `@flyhub/email-builder` (+ block packages), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-email-marketing-module-design.md`
**Source to port from:** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm`

**Decision (flagged for review):** the editor store is ported as a **module-scoped composable** (`app/composables/useEdmBuilder.ts`), NOT by adding Pinia — keeps the dashboard's no-Pinia convention. The Pinia *setup* store body copies nearly verbatim; only the `defineStore(...)` wrapper and the top-level `ref()` declarations change (see Task 4).

**Scope note:** Foundation only. OUT of scope here: the canvas + block renderers (2a-ii-2), the BlockSettingsPanel inspector (2a-ii-3), live preview + save + undo/redo wiring into the page (2a-ii-4). This phase ends with an empty editor shell that mounts cleanly with `@flyhub` installed and the build config proven.

---

## File Structure

**Created:**
- `lib/flyhub-stub.ts` — empty-module stub for the `@flyhub/*` packages on the server bundle.
- `app/types/edm.ts` — editor types: `EdmFlyhubBlock`, `EdmFlyhubDocument`, `EdmEmailLayoutSettings`, `EdmBlockBase`, `EditorSnapshot`, `SidebarTab`, `MainTab`, `ScreenSize`, `generateBlockId`, `createEmptyDocument`.
- `app/composables/useEdmBuilder.ts` — state store (ported from `stores/edmBuilder.ts`).
- `app/components/email/builder/EmailLayoutSettings.vue` — root layout inspector, Nuxt UI re-skin (proof-of-concept panel).
- `app/components/email/builder/EdmFlyhubBuilder.client.vue` — empty editor shell (client-only).
- `app/pages/agency/email/compose.vue` — composer route hosting the shell.
- `test/app/edmBuilderStore.test.ts` — store unit tests (block CRUD + undo/redo).

**Modified:**
- `package.json` — add `@flyhub/*` deps (via `pnpm add`).
- `nuxt.config.ts` — add `nitro.alias` + `vite.resolve.alias` entries pointing `@flyhub/*` at the stub.

---

## Task 1: Install the @flyhub packages

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install the builder + block packages**

Run:
```bash
pnpm add @flyhub/email-builder @flyhub/email-core @flyhub/email-document-core \
  @flyhub/email-block-avatar @flyhub/email-block-button @flyhub/email-block-columns-container \
  @flyhub/email-block-container @flyhub/email-block-divider @flyhub/email-block-heading \
  @flyhub/email-block-html @flyhub/email-block-image @flyhub/email-block-spacer @flyhub/email-block-text
```
Expected: all 13 packages added. A `zod` peer warning (`@flyhub` wants `^3`, dashboard has `4.x`) is EXPECTED and acceptable — the spike confirmed rendering works under zod 4; we only validate block-schema parsing in a later phase.

- [ ] **Step 2: Verify they resolve**

Run: `node -e "import('@flyhub/email-builder').then(m => console.log('exports:', Object.keys(m)))"`
Expected: `exports: [ 'Reader', 'renderToStaticMarkup' ]`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(email): add @flyhub/* editor packages (client-only)"
```

---

## Task 2: Workers-safe stub-alias build config

**Files:**
- Create: `lib/flyhub-stub.ts`
- Modify: `nuxt.config.ts`

- [ ] **Step 1: Create the stub**

```ts
// lib/flyhub-stub.ts
// Server/Workers stub for the @flyhub/* editor packages. They are CLIENT-ONLY
// (the visual builder runs in the browser). The server renders email HTML via
// the pure-TS pipeline in server/utils/email-marketing/render (no @flyhub dep),
// so the heavy builder packages must never enter the Nitro/Workers bundle.
export default {}
export const Reader = () => null
export function renderToStaticMarkup(): string {
  return ''
}
```

- [ ] **Step 2: Find the existing `nitro` config block in `nuxt.config.ts`**

Run: `grep -nE "nitro:|alias:|vite:|resolve:" nuxt.config.ts | head -20`
Expected: locate the `nitro: { ... }` object and the `vite: { ... }` object. Note their line numbers.

- [ ] **Step 3: Add the stub aliases**

In `nuxt.config.ts`, inside the existing `nitro` object add (or extend) an `alias` map, and inside `vite` add a `resolve.alias` map, both mapping every `@flyhub/*` package to the stub. Use `fileURLToPath`/`new URL` (already imported in this config — verify with `grep -n "fileURLToPath" nuxt.config.ts`; if absent, add `import { fileURLToPath } from 'node:url'` at the top).

```ts
// Inside nitro: { ... }
  alias: {
    '@flyhub/email-builder': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-core': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-document-core': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-avatar': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-button': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-columns-container': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-container': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-divider': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-heading': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-html': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-image': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-spacer': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
    '@flyhub/email-block-text': fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url)),
  },
```

> **Important:** the `vite.resolve.alias` map must NOT include these (the client needs the real packages). Only `nitro.alias` (server bundle) points at the stub. If `nuxt.config.ts` already merges a shared alias into both, instead add the stub aliases ONLY under `nitro.alias` and leave `vite` untouched.

- [ ] **Step 4: Verify the server bundle excludes @flyhub and 2a-i render still works**

Run (start dev, hit the existing render endpoint which is server-side and must NOT pull @flyhub):
```bash
(pnpm dev > /tmp/edm_dev.log 2>&1 &) ; sleep 25
PORT=$(grep -oE "localhost:[0-9]+" /tmp/edm_dev.log | head -1 | cut -d: -f2)
curl -s -o /dev/null -w "render endpoint: %{http_code}\n" -X POST "http://localhost:$PORT/api/email/templates/render" \
  -H 'content-type: application/json' \
  -d '{"body_source":{"root":{"type":"EmailLayout","data":{"childrenIds":[]}}}}'
grep -iE "flyhub.*error|cannot find|failed to load" /tmp/edm_dev.log | head || echo "no flyhub build errors"
pkill -f "nuxt dev" 2>/dev/null; lsof -ti :$PORT 2>/dev/null | xargs kill 2>/dev/null || true
```
Expected: `render endpoint: 401` (auth required — proves the server route compiled WITHOUT pulling @flyhub through the stub) and `no flyhub build errors`. A 500 would mean the server tried to bundle @flyhub — re-check the nitro.alias.

- [ ] **Step 5: Commit**

```bash
git add lib/flyhub-stub.ts nuxt.config.ts
git commit -m "feat(email): stub @flyhub packages out of the Workers server bundle"
```

---

## Task 3: Port editor types

**Files:**
- Create: `app/types/edm.ts`

- [ ] **Step 1: Identify the source type definitions**

Run:
```bash
SRC=/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm
grep -nE "export interface EdmFlyhubBlock|export type EdmFlyhubDocument|EdmEmailLayoutSettings|EditorSnapshot|type SidebarTab|type MainTab|type ScreenSize|generateBlockId|createEmptyDocument|EdmBlockBase" \
  "$SRC/stores/edmBuilder.ts" "$SRC/types/edm-blocks.ts" "$SRC/types/edm.ts"
```
Expected: lists where each type is declared (mostly in `stores/edmBuilder.ts` and `types/edm-blocks.ts`).

- [ ] **Step 2: Write the consolidated types file**

Copy the exact definitions found in Step 1 into `app/types/edm.ts`. Use the real shapes from the source (do not invent). The file MUST export at least:

```ts
// app/types/edm.ts
// Editor document model + state types, ported from the flyhub EDM layer.

export interface EdmFlyhubBlockStyle {
  padding?: { top?: number, right?: number, bottom?: number, left?: number } | null
  textAlign?: string | null
  color?: string | null
  backgroundColor?: string | null
  fontSize?: number | null
  fontFamily?: string | null
  fontWeight?: string | null
  borderColor?: string | null
  borderRadius?: number | null
}

export interface EdmFlyhubBlock {
  type: string
  data: {
    props?: Record<string, unknown> | null
    style?: EdmFlyhubBlockStyle | null
    childrenIds?: string[]
  }
}

// Flat keyed map of blockId -> block, with a `root` EmailLayout entry.
export type EdmFlyhubDocument = Record<string, EdmFlyhubBlock>

export interface EdmEmailLayoutSettings {
  backdropColor: string
  canvasColor: string
  textColor: string
  fontFamily: string
  borderColor?: string
  borderRadius?: number
}

export interface EdmBlockBase {
  id: string
  type: string
  label: string
  data: Record<string, unknown>
}

export interface EditorSnapshot {
  document: EdmFlyhubDocument
  dynamicBlocks: EdmBlockBase[]
  dynamicBlockMapping: Record<string, string>
}

export type SidebarTab = 'blocks' | 'styles'
export type MainTab = 'editor' | 'preview' | 'html'
export type ScreenSize = 'desktop' | 'mobile'

export function generateBlockId(): string {
  return 'block-' + Math.random().toString(36).slice(2, 10)
}

export function createEmptyDocument(): EdmFlyhubDocument {
  return { root: { type: 'EmailLayout', data: { props: {}, childrenIds: [] } } }
}
```

> **Verify against source:** if `SidebarTab`/`MainTab`/`ScreenSize` unions or `generateBlockId`'s format differ in the source, use the source versions (the canvas + store depend on exact values). The block IDs must match whatever `generateBlockId` produces in the source so ported store logic stays consistent.

- [ ] **Step 3: Typecheck the file in isolation**

Run: `pnpm exec vue-tsc --noEmit app/types/edm.ts 2>&1 | grep "app/types/edm.ts" || echo "no errors in edm.ts"`
Expected: `no errors in edm.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/types/edm.ts
git commit -m "feat(email): port editor document model + state types"
```

---

## Task 4: Port the state store as a composable (Pinia → useState)

**Files:**
- Create: `app/composables/useEdmBuilder.ts`

- [ ] **Step 1: Copy the source store**

Run:
```bash
cp /Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm/stores/edmBuilder.ts \
   app/composables/useEdmBuilder.ts
```

- [ ] **Step 2: Apply the conversion recipe (Pinia setup-store → singleton composable)**

Make exactly these edits to `app/composables/useEdmBuilder.ts`:

1. **Remove the Pinia import:** delete `import { defineStore } from 'pinia'`.
2. **Fix the types import:** change any local type imports to `import type { ... } from '~/types/edm'` (and import `generateBlockId`, `createEmptyDocument` from there too). Remove now-duplicated inline type/helper definitions that you moved to `app/types/edm.ts` in Task 3.
3. **Convert the wrapper.** Replace:
   ```ts
   export const useEdmBuilderStore = defineStore('edmBuilder', () => {
   ```
   with a module-scoped singleton pattern:
   ```ts
   // Module-scoped singleton state — the editor is client-only, so a single
   // shared instance across all callers is correct (no SSR cross-request bleed).
   const document = ref<EdmFlyhubDocument>(createEmptyDocument())
   const selectedBlockId = ref<string | null>(null)
   const selectedSidebarTab = ref<SidebarTab>('styles')
   const selectedMainTab = ref<MainTab>('editor')
   const selectedScreenSize = ref<ScreenSize>('desktop')
   const inspectorDrawerOpen = ref(false)
   const dynamicBlocks = ref<EdmBlockBase[]>([])
   const selectedDynamicBlock = ref<EdmBlockBase | null>(null)
   const dynamicBlockMapping = ref<Map<string, string>>(new Map())
   const past = ref<EditorSnapshot[]>([])
   const future = ref<EditorSnapshot[]>([])
   let _isRecording = false

   export function useEdmBuilder() {
   ```
   i.e. **hoist the top-level `ref()`/`let` state declarations OUT of the function to module scope**, then open `export function useEdmBuilder() {` where `defineStore('edmBuilder', () => {` used to be. Leave ALL the inner functions (takeSnapshot, recordHistory, undo, redo, addBlock, removeBlock, moveBlock, duplicateBlock, updateBlock*, getLayoutSettings, updateLayoutSettings, dynamic-block helpers, etc.) and computed (`canUndo`, `canRedo`) exactly as they are.
4. **Fix the closing return + brace.** The store body ends with `return { ...everything... }` then `})`. Change the trailing `})` to `}` (plain function close). The `return { ... }` stays — it's the composable's public surface.
5. **`ref`/`computed` auto-imports:** Nuxt auto-imports `ref`/`computed`/`reactive`. Remove any `import { ref, computed } from 'vue'` line if present (optional; harmless if kept).

- [ ] **Step 3: Lint + typecheck**

Run:
```bash
pnpm exec eslint --fix app/composables/useEdmBuilder.ts >/dev/null 2>&1
pnpm exec eslint app/composables/useEdmBuilder.ts && echo "lint clean"
```
Expected: `lint clean` (fix unused imports / style as needed — do not change logic).

- [ ] **Step 4: Write store unit tests**

```ts
// test/app/edmBuilderStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useEdmBuilder } from '~/composables/useEdmBuilder'

describe('useEdmBuilder store', () => {
  beforeEach(() => {
    const s = useEdmBuilder()
    s.resetDocument()
  })

  it('starts with an empty root EmailLayout', () => {
    const s = useEdmBuilder()
    expect(s.document.value.root.type).toBe('EmailLayout')
    expect(s.document.value.root.data.childrenIds).toEqual([])
  })

  it('addBlock adds a child under root and records history', () => {
    const s = useEdmBuilder()
    const id = s.addBlock('Heading', 'root')
    expect(s.document.value[id]).toBeTruthy()
    expect(s.document.value.root.data.childrenIds).toContain(id)
    expect(s.canUndo.value).toBe(true)
  })

  it('undo reverses the last addBlock', () => {
    const s = useEdmBuilder()
    const id = s.addBlock('Heading', 'root')
    s.undo()
    expect(s.document.value[id]).toBeUndefined()
    expect(s.document.value.root.data.childrenIds).not.toContain(id)
  })

  it('removeBlock deletes the block and its parent reference', () => {
    const s = useEdmBuilder()
    const id = s.addBlock('Text', 'root')
    s.removeBlock(id)
    expect(s.document.value[id]).toBeUndefined()
    expect(s.document.value.root.data.childrenIds).not.toContain(id)
  })
})
```

> **Note:** the exact `addBlock` signature/return is from the source store. If `addBlock` returns the new block id, the tests above work as written; if it returns void, capture the id via `s.document.value.root.data.childrenIds.at(-1)` instead. Adjust to the real signature (confirmed in the source) — the assertions stay.

- [ ] **Step 5: Run the store tests**

Run: `pnpm exec vitest run test/app/edmBuilderStore.test.ts`
Expected: PASS (4 tests). If a test fails because the store is not a singleton (state resets between calls), confirm the `ref()` declarations were hoisted to MODULE scope (Step 2.3), not left inside the function.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useEdmBuilder.ts test/app/edmBuilderStore.test.ts
git commit -m "feat(email): port editor store as singleton composable (no Pinia) + tests"
```

---

## Task 5: Port EmailLayoutSettings panel (Nuxt UI re-skin — proof of concept)

**Files:**
- Create: `app/components/email/builder/EmailLayoutSettings.vue`

- [ ] **Step 1: Write the re-skinned panel**

Port `layers/edm/components/edm/flyhub/EmailLayoutSettings.vue`, mapping shadcn → Nuxt UI v4: `Input` → `UInput`, `Select` → `USelect`. Native color inputs stay as `UInput type="color"`. Keep the same props (`settings`) + emit (`update`).

```vue
<!-- app/components/email/builder/EmailLayoutSettings.vue -->
<script setup lang="ts">
import type { EdmEmailLayoutSettings } from '~/types/edm'

const props = defineProps<{ settings: EdmEmailLayoutSettings }>()
const emit = defineEmits<{ update: [Partial<EdmEmailLayoutSettings>] }>()

const FONT_OPTIONS = [
  { label: 'Modern Sans', value: 'MODERN_SANS' },
  { label: 'Book Sans', value: 'BOOK_SANS' },
  { label: 'Geometric Sans', value: 'GEOMETRIC_SANS' },
  { label: 'Modern Serif', value: 'MODERN_SERIF' },
  { label: 'Monospace', value: 'MONOSPACE' }
]

function update<K extends keyof EdmEmailLayoutSettings>(key: K, value: EdmEmailLayoutSettings[K]) {
  emit('update', { [key]: value } as Partial<EdmEmailLayoutSettings>)
}
</script>

<template>
  <div class="space-y-4">
    <UFormField label="Background color">
      <div class="flex gap-2">
        <UInput
          type="color"
          :model-value="props.settings.backdropColor"
          class="w-12"
          @update:model-value="(v: string) => update('backdropColor', v)"
        />
        <UInput
          :model-value="props.settings.backdropColor"
          class="flex-1"
          @update:model-value="(v: string) => update('backdropColor', v)"
        />
      </div>
    </UFormField>

    <UFormField label="Content background">
      <div class="flex gap-2">
        <UInput
          type="color"
          :model-value="props.settings.canvasColor"
          class="w-12"
          @update:model-value="(v: string) => update('canvasColor', v)"
        />
        <UInput
          :model-value="props.settings.canvasColor"
          class="flex-1"
          @update:model-value="(v: string) => update('canvasColor', v)"
        />
      </div>
    </UFormField>

    <UFormField label="Text color">
      <div class="flex gap-2">
        <UInput
          type="color"
          :model-value="props.settings.textColor"
          class="w-12"
          @update:model-value="(v: string) => update('textColor', v)"
        />
        <UInput
          :model-value="props.settings.textColor"
          class="flex-1"
          @update:model-value="(v: string) => update('textColor', v)"
        />
      </div>
    </UFormField>

    <UFormField label="Font family">
      <USelect
        :model-value="props.settings.fontFamily"
        :items="FONT_OPTIONS"
        value-key="value"
        class="w-full"
        @update:model-value="(v: string) => update('fontFamily', v)"
      />
    </UFormField>
  </div>
</template>
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint --fix app/components/email/builder/EmailLayoutSettings.vue && pnpm exec eslint app/components/email/builder/EmailLayoutSettings.vue && echo "lint clean"`
Expected: `lint clean`.

- [ ] **Step 3: Commit**

```bash
git add app/components/email/builder/EmailLayoutSettings.vue
git commit -m "feat(email): port EmailLayoutSettings panel (Nuxt UI re-skin)"
```

---

## Task 6: Empty editor shell + composer route

**Files:**
- Create: `app/components/email/builder/EdmFlyhubBuilder.client.vue`
- Create: `app/pages/agency/email/compose.vue`

- [ ] **Step 1: Write the empty shell (client-only)**

```vue
<!-- app/components/email/builder/EdmFlyhubBuilder.client.vue -->
<!-- Editor shell — foundation only. Canvas (2a-ii-2), settings (2a-ii-3),
     preview/save (2a-ii-4) land in later phases. -->
<script setup lang="ts">
import { renderToStaticMarkup } from '@flyhub/email-builder'

const store = useEdmBuilder()
const layout = computed(() => store.getLayoutSettings())

// Smoke: prove the client-side @flyhub renderer is reachable from the editor.
const rendererReady = ref(false)
onMounted(async () => {
  try {
    await renderToStaticMarkup(store.document.value as any, { rootBlockId: 'root' })
    rendererReady.value = true
  } catch {
    rendererReady.value = false
  }
})

function updateLayout(patch: Record<string, unknown>) {
  store.updateLayoutSettings(patch as any)
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left: block library (placeholder for 2a-ii-2) -->
    <aside class="w-56 border-r border-default p-3 text-sm text-muted">
      Blocks panel — coming in 2a-ii-2
    </aside>

    <!-- Center: canvas (placeholder for 2a-ii-2) -->
    <main class="flex-1 p-6 overflow-auto bg-elevated/30">
      <div class="mx-auto max-w-[600px] rounded border border-default bg-white min-h-64 p-4 text-sm text-gray-500">
        Canvas — coming in 2a-ii-2
        <span class="block mt-2 text-xs">flyhub renderer reachable: {{ rendererReady }}</span>
      </div>
    </main>

    <!-- Right: settings (EmailLayoutSettings wired now) -->
    <aside class="w-80 border-l border-default p-3 overflow-auto">
      <p class="text-xs font-semibold uppercase text-muted mb-3">Email settings</p>
      <EmailBuilderEmailLayoutSettings :settings="layout" @update="updateLayout" />
    </aside>
  </div>
</template>
```

> **Component name note:** `app/components/email/builder/EmailLayoutSettings.vue` auto-imports as `<EmailBuilderEmailLayoutSettings>` (nested folder prefixes: `email` + `builder`). Confirm the resolved name with `npx nuxi … ` is impractical — instead reference it as `<EmailBuilderEmailLayoutSettings>` and adjust if Nuxt logs an unresolved-component warning. (Update the tag in this file to the real auto-import name.)

- [ ] **Step 2: Write the composer page**

```vue
<!-- app/pages/agency/email/compose.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Compose — Email Marketing' })
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-3 border-b border-default flex items-center justify-between">
      <h1 class="text-lg font-semibold">Compose email</h1>
    </header>
    <div class="flex-1 overflow-hidden">
      <ClientOnly>
        <EmailBuilderEdmFlyhubBuilder />
        <template #fallback>
          <div class="p-6 text-sm text-muted">Loading editor…</div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Verify the shell loads (dev server + browser)**

Run: start `pnpm dev`, then visit `http://localhost:<port>/agency/email/compose` (authenticated).
Expected: the 3-pane shell renders; right pane shows the EmailLayoutSettings color inputs + font select; the canvas placeholder shows `flyhub renderer reachable: true`. Check the browser console for unresolved-component warnings and fix the auto-import names (`EmailBuilderEmailLayoutSettings` / `EmailBuilderEdmFlyhubBuilder`) if Nuxt resolves them differently.

- [ ] **Step 4: Commit**

```bash
git add app/components/email/builder/EdmFlyhubBuilder.client.vue app/pages/agency/email/compose.vue
git commit -m "feat(email): empty editor shell + composer route (client-only mount)"
```

---

## Task 7: Verification

- [ ] **Step 1: Store tests + all email tests pass**

Run: `pnpm exec vitest run test/app/edmBuilderStore.test.ts test/utils/emailMarketing*.test.ts test/utils/emailRender*.test.ts`
Expected: all PASS.

- [ ] **Step 2: Lint all new editor files**

Run: `pnpm exec eslint app/composables/useEdmBuilder.ts app/components/email/builder/ app/types/edm.ts app/pages/agency/email/compose.vue lib/flyhub-stub.ts`
Expected: exit 0.

- [ ] **Step 3: Confirm the Workers server bundle still excludes @flyhub**

Re-run Task 2 Step 4's render-endpoint check. Expected: `render endpoint: 401` + `no flyhub build errors` (server route compiles without @flyhub).

- [ ] **Step 4: Browser smoke (authenticated)** — `/agency/email/compose` renders the shell, the layout settings update the store (change background color → no console errors), `flyhub renderer reachable: true`.

---

## Out of scope (later sub-phases)

- **2a-ii-2 Canvas:** `EdmBlockRenderer`, `EditorBlockWrapper` (insert/move/delete + popovers), `ContainerBlockRenderer`, `ColumnsContainerRenderer`; add/move/delete/insert wiring.
- **2a-ii-3 Settings panel:** the 1,154-line `BlockSettingsPanel` with Slider/Select/Popover re-skins.
- **2a-ii-4 Preview + save:** wire preview to `POST /api/email/templates/render` (from 2a-i), HTML view, save to `edm_templates`, undo/redo toolbar, link from `/agency/email`.
- **2b:** campaigns + sending engine.

## Phase 2a-ii-1 Definition of Done

- `@flyhub/*` installed; aliased to a stub so the **Workers server bundle excludes them** (verified the 2a-i render endpoint still compiles + responds 401).
- Editor types ported to `app/types/edm.ts`.
- Store ported as a **singleton composable** (no Pinia); 4 store unit tests pass (add/undo/remove + empty root).
- `EmailLayoutSettings` panel re-skinned to Nuxt UI v4.
- Empty editor shell mounts client-only at `/agency/email/compose`; client-side `@flyhub` renderer reachable; layout settings update the store.
