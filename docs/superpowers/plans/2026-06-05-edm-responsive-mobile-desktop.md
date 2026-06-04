# EDM Responsive Mobile/Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional mobile/desktop overrides and hide-on-device support to the EDM builder while preserving byte-identical output for existing documents.

**Architecture:** Keep the base desktop document unchanged and add an optional `data.mobile` override layer plus optional `hideOnMobile`/`hideOnDesktop` flags. Editor rendering merges base + mobile for the active device; server rendering keeps desktop inline styles and emits mobile-only CSS classes inside the existing responsive `<style>` block. Existing documents without responsive fields must render exactly as they do today.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Vitest SSR component tests, pure TypeScript helpers, existing EDM server renderer.

---

## File Structure

- Create `app/utils/edmResponsive.ts`: pure helper functions for device types, mobile override merging, visibility flags, deterministic responsive class names, and mobile CSS declaration generation.
- Modify `app/types/edm.ts`: add optional mobile override and hide flags to `EdmFlyhubBlock['data']`.
- Modify `server/utils/email-marketing/render/blocks/types.ts`: mirror the optional responsive fields in server `FlyhubBlock`.
- Modify `app/composables/useEdmBuilder.ts`: add `updateBlockMobileStyle`, `updateBlockMobileProps`, and `updateBlockVisibility` store methods with undo history.
- Modify `app/components/email/builder/BlockSettingsPanel.vue`: accept `device` and `baseBlock` inputs; emit updates for the active layer; add visibility toggles.
- Modify `app/components/email/builder/EdmFlyhubBuilder.client.vue`: add Desktop/Mobile segmented toolbar toggle, pass merged block styles/props to renderers, pass active-device context to the inspector, and show hidden-on-device blocks as selected/editable muted wrappers instead of removing them from the editor.
- Modify `app/components/email/builder/ContainerBlockRenderer.vue` and `app/components/email/builder/ColumnsContainerRenderer.vue`: accept active device and merge child block responsive overrides before rendering nested children.
- Modify `app/components/email/builder/EdmBlockRenderer.vue`: accept `hiddenOnDevice` and render an editor-only muted hidden state around the existing output without affecting preview/thumbnails.
- Modify `server/utils/email-marketing/render/flyhub-html-renderer.ts`: collect per-block mobile CSS, inject it into the existing media query, and keep no-responsive output byte-identical.
- Modify `server/utils/email-marketing/render/blocks/email-layout.ts` and block render dispatch path: wrap root child HTML in stable classes only when that block has responsive fields.
- Add tests in `test/utils/edmResponsive.test.ts`, `test/app/edmBuilderStore.test.ts`, `test/components/emailEdmBlockSettingsPanel.test.ts`, `test/components/emailEdmBlockRenderer.test.ts`, and `test/utils/emailRenderResponsive.test.ts`.

## Data Model Decisions

- `data.mobile?: { style?: Partial<EdmFlyhubBlock['data']['style']>, props?: Record<string, unknown> }`
- `data.hideOnMobile?: boolean`
- `data.hideOnDesktop?: boolean`
- Desktop edits write to `data.style` / `data.props`.
- Mobile edits write to `data.mobile.style` / `data.mobile.props`.
- Mobile rendering uses `{ ...base, ...mobile }` shallow merges for style and props. Nested objects such as `padding` are replaced as whole values; this matches current inspector behavior where padding writes the complete object.
- A missing `data.mobile` and falsey hide flags produce no output changes.

---

### Task 1: Pure Responsive Helpers

**Files:**
- Create: `app/utils/edmResponsive.ts`
- Test: `test/utils/edmResponsive.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  edmBlockHasResponsiveRules,
  edmResponsiveClassForBlock,
  getBlockForDevice,
  getHideClassForBlock,
  isHiddenOnDevice,
  mobileStyleDeclarationsForBlock
} from '~~/app/utils/edmResponsive'

describe('edmResponsive helpers', () => {
  it('keeps desktop/base blocks unchanged when no mobile override exists', () => {
    const block = { type: 'Text', data: { props: { text: 'Base' }, style: { color: '#111111' } } }

    expect(getBlockForDevice(block, 'desktop')).toEqual(block)
    expect(getBlockForDevice(block, 'mobile')).toEqual(block)
    expect(edmBlockHasResponsiveRules(block)).toBe(false)
  })

  it('merges mobile style and props over base values', () => {
    const block = {
      type: 'Text',
      data: {
        props: { text: 'Desktop', align: 'left' },
        style: { color: '#111111', padding: { top: 16, right: 24, bottom: 16, left: 24 } },
        mobile: {
          props: { text: 'Mobile' },
          style: { color: '#222222', padding: { top: 8, right: 12, bottom: 8, left: 12 } }
        }
      }
    }

    expect(getBlockForDevice(block, 'mobile').data.props).toEqual({ text: 'Mobile', align: 'left' })
    expect(getBlockForDevice(block, 'mobile').data.style).toEqual({
      color: '#222222',
      padding: { top: 8, right: 12, bottom: 8, left: 12 }
    })
  })

  it('computes visibility flags per device', () => {
    const block = { type: 'Text', data: { hideOnMobile: true, hideOnDesktop: false } }

    expect(isHiddenOnDevice(block, 'mobile')).toBe(true)
    expect(isHiddenOnDevice(block, 'desktop')).toBe(false)
    expect(getHideClassForBlock(block)).toBe('edm-hide-mobile')
  })

  it('uses deterministic responsive class names from block ids', () => {
    expect(edmResponsiveClassForBlock('block-123_abc')).toBe('edm-r-block-123_abc')
    expect(edmResponsiveClassForBlock('bad id!')).toBe('edm-r-bad-id-')
  })

  it('builds sanitized mobile CSS declarations for supported style values', () => {
    const block = {
      type: 'Text',
      data: {
        mobile: {
          style: {
            color: '#123456',
            backgroundColor: 'javascript:alert(1)',
            fontSize: 14,
            textAlign: 'center',
            padding: { top: 4, right: 8, bottom: 4, left: 8 },
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: '#abcdef'
          }
        }
      }
    }

    expect(mobileStyleDeclarationsForBlock(block)).toEqual([
      ['color', '#123456'],
      ['font-size', '14px'],
      ['text-align', 'center'],
      ['padding', '4px 8px 4px 8px'],
      ['border', '2px solid #abcdef']
    ])
  })
})
```

- [ ] **Step 2: Run the helper tests to verify RED**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/utils/edmResponsive.test.ts
```

Expected: FAIL because `~~/app/utils/edmResponsive` does not exist.

- [ ] **Step 3: Implement the helper**

Create `app/utils/edmResponsive.ts`:

```ts
import {
  extendedStyleDeclarations,
  safeCssColor,
  type EdmExtendedStyle
} from '~~/app/utils/edmStyle'
import type { EdmFlyhubBlock } from '~~/app/types/edm'

export type EdmDevice = 'desktop' | 'mobile'

export interface EdmMobileOverride {
  style?: Partial<NonNullable<EdmFlyhubBlock['data']['style']>> | null
  props?: Record<string, unknown> | null
}

type ResponsiveBlock = {
  type: string
  data: {
    props?: Record<string, unknown> | null
    style?: Record<string, unknown> | null
    mobile?: EdmMobileOverride | null
    hideOnMobile?: boolean | null
    hideOnDesktop?: boolean | null
    childrenIds?: string[]
  }
}

function hasKeys(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0
}

function cloneBlock<T extends ResponsiveBlock>(block: T, props: Record<string, unknown> | null | undefined, style: Record<string, unknown> | null | undefined): T {
  return {
    ...block,
    data: {
      ...block.data,
      props: props ?? block.data.props,
      style: style ?? block.data.style
    }
  }
}

export function getBlockForDevice<T extends ResponsiveBlock>(block: T, device: EdmDevice): T {
  if (device === 'desktop') return block
  const mobile = block.data.mobile
  if (!mobile || (!hasKeys(mobile.props) && !hasKeys(mobile.style))) return block
  return cloneBlock(
    block,
    { ...(block.data.props || {}), ...(mobile.props || {}) },
    { ...(block.data.style || {}), ...(mobile.style || {}) }
  )
}

export function isHiddenOnDevice(block: ResponsiveBlock, device: EdmDevice): boolean {
  return device === 'mobile' ? !!block.data.hideOnMobile : !!block.data.hideOnDesktop
}

export function getHideClassForBlock(block: ResponsiveBlock): string | null {
  if (block.data.hideOnMobile && block.data.hideOnDesktop) return 'edm-hide-all'
  if (block.data.hideOnMobile) return 'edm-hide-mobile'
  if (block.data.hideOnDesktop) return 'edm-hide-desktop'
  return null
}

export function edmBlockHasResponsiveRules(block: ResponsiveBlock): boolean {
  return !!getHideClassForBlock(block) || hasKeys(block.data.mobile?.props) || hasKeys(block.data.mobile?.style)
}

export function edmResponsiveClassForBlock(blockId: string): string {
  return `edm-r-${blockId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function baseStyleDeclarations(style: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const color = safeCssColor(style.color as string | null | undefined)
  if (color) out.push(['color', color])
  const backgroundColor = safeCssColor(style.backgroundColor as string | null | undefined)
  if (backgroundColor) out.push(['background-color', backgroundColor])
  if (typeof style.fontSize === 'number' && Number.isFinite(style.fontSize)) out.push(['font-size', `${style.fontSize}px`])
  if (typeof style.fontWeight === 'string' && /^(normal|bold|[1-9]00)$/.test(style.fontWeight)) out.push(['font-weight', style.fontWeight])
  if (typeof style.textAlign === 'string' && ['left', 'center', 'right'].includes(style.textAlign)) out.push(['text-align', style.textAlign])
  const padding = style.padding as { top?: number, right?: number, bottom?: number, left?: number } | null | undefined
  if (padding) {
    out.push(['padding', `${padding.top ?? 0}px ${padding.right ?? 0}px ${padding.bottom ?? 0}px ${padding.left ?? 0}px`])
  }
  return out
}

export function mobileStyleDeclarationsForBlock(block: ResponsiveBlock): Array<[string, string]> {
  const mobileStyle = block.data.mobile?.style as Record<string, unknown> | null | undefined
  if (!mobileStyle) return []
  return [
    ...baseStyleDeclarations(mobileStyle),
    ...extendedStyleDeclarations(mobileStyle as EdmExtendedStyle)
  ]
}
```

- [ ] **Step 4: Run the helper tests to verify GREEN**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/utils/edmResponsive.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/utils/edmResponsive.ts test/utils/edmResponsive.test.ts
git commit -m "feat(email): add EDM responsive helpers"
```

---

### Task 2: Add Optional Responsive Types And Store Writes

**Files:**
- Modify: `app/types/edm.ts`
- Modify: `server/utils/email-marketing/render/blocks/types.ts`
- Modify: `app/composables/useEdmBuilder.ts`
- Test: `test/app/edmBuilderStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Append to `test/app/edmBuilderStore.test.ts`:

```ts
it('updates mobile style without changing desktop style', () => {
  const s = useEdmBuilder()
  const id = s.addBlock('Text', 'root', undefined, {
    style: { color: '#111111' },
    props: { text: 'Desktop' }
  })

  s.updateBlockMobileStyle(id, { color: '#222222', fontSize: 14 })

  expect(s.document.value[id].data.style).toEqual({ color: '#111111' })
  expect(s.document.value[id].data.mobile?.style).toEqual({ color: '#222222', fontSize: 14 })
  expect(s.canUndo.value).toBe(true)
})

it('updates mobile props and device visibility flags', () => {
  const s = useEdmBuilder()
  const id = s.addBlock('Text', 'root', undefined, { props: { text: 'Desktop' } })

  s.updateBlockMobileProps(id, { text: 'Mobile' })
  s.updateBlockVisibility(id, { hideOnDesktop: true, hideOnMobile: false })

  expect(s.document.value[id].data.props).toEqual({ text: 'Desktop' })
  expect(s.document.value[id].data.mobile?.props).toEqual({ text: 'Mobile' })
  expect(s.document.value[id].data.hideOnDesktop).toBe(true)
  expect(s.document.value[id].data.hideOnMobile).toBe(false)
})
```

- [ ] **Step 2: Run the store tests to verify RED**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/app/edmBuilderStore.test.ts
```

Expected: FAIL because `updateBlockMobileStyle`, `updateBlockMobileProps`, and `updateBlockVisibility` are missing.

- [ ] **Step 3: Extend editor and server types**

In `app/types/edm.ts`, add:

```ts
export interface EdmMobileOverride {
  style?: Partial<NonNullable<EdmFlyhubBlock['data']['style']>> | null
  props?: Record<string, unknown> | null
}
```

Inside `EdmFlyhubBlock['data']`, add:

```ts
mobile?: EdmMobileOverride | null
hideOnMobile?: boolean | null
hideOnDesktop?: boolean | null
```

In `server/utils/email-marketing/render/blocks/types.ts`, add the equivalent server-only shape:

```ts
export interface FlyhubMobileOverride {
  style?: Partial<FlyhubBlockStyle> | null
  props?: Record<string, unknown> | null
}
```

Inside `FlyhubBlock['data']`, add:

```ts
mobile?: FlyhubMobileOverride | null
hideOnMobile?: boolean | null
hideOnDesktop?: boolean | null
```

- [ ] **Step 4: Add store write methods**

In `app/composables/useEdmBuilder.ts`, add functions near `updateBlockProps`:

```ts
function updateBlockMobileStyle(
  blockId: string,
  styleUpdates: Partial<NonNullable<EdmFlyhubBlock['data']['style']>>
) {
  recordHistory()
  const block = document.value[blockId]
  if (!block) return
  const mobile = block.data.mobile || {}
  document.value = {
    ...document.value,
    [blockId]: {
      ...block,
      data: {
        ...block.data,
        mobile: {
          ...mobile,
          style: {
            ...(mobile.style || {}),
            ...styleUpdates
          }
        }
      }
    }
  }
}

function updateBlockMobileProps(blockId: string, propsUpdates: Record<string, unknown>) {
  recordHistory()
  const block = document.value[blockId]
  if (!block) return
  const mobile = block.data.mobile || {}
  document.value = {
    ...document.value,
    [blockId]: {
      ...block,
      data: {
        ...block.data,
        mobile: {
          ...mobile,
          props: {
            ...(mobile.props || {}),
            ...propsUpdates
          }
        }
      }
    }
  }
}

function updateBlockVisibility(blockId: string, flags: { hideOnMobile?: boolean, hideOnDesktop?: boolean }) {
  updateBlockData(blockId, flags)
}
```

Return these methods from the composable:

```ts
updateBlockMobileStyle,
updateBlockMobileProps,
updateBlockVisibility,
```

- [ ] **Step 5: Run store tests to verify GREEN**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/app/edmBuilderStore.test.ts test/utils/edmResponsive.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/types/edm.ts server/utils/email-marketing/render/blocks/types.ts app/composables/useEdmBuilder.ts test/app/edmBuilderStore.test.ts
git commit -m "feat(email): add EDM responsive document fields"
```

---

### Task 3: Editor Device Toggle And Device-Aware Inspector Writes

**Files:**
- Modify: `app/components/email/builder/EdmFlyhubBuilder.client.vue`
- Modify: `app/components/email/builder/BlockSettingsPanel.vue`
- Test: `test/components/emailEdmBlockSettingsPanel.test.ts`

- [ ] **Step 1: Write failing inspector SSR tests**

Add to `test/components/emailEdmBlockSettingsPanel.test.ts`:

```ts
it('labels the inspector as Mobile override when editing mobile styles', async () => {
  const html = await render({
    id: 'b',
    type: 'Text',
    data: {
      props: { text: 'Desktop' },
      style: { color: '#111111' },
      mobile: { props: { text: 'Mobile' }, style: { color: '#222222' } }
    }
  }, { device: 'mobile' })

  expect(html).toContain('Mobile override')
  expect(html).toContain('Hide on mobile')
  expect(html).toContain('Hide on desktop')
})
```

Update the local `render()` helper in that test file to accept extra props:

```ts
async function render(block: { id: string, type: string, data: Record<string, unknown> }, extra: Record<string, unknown> = {}) {
  const app = createSSRApp({ render: () => h(BlockSettingsPanel, { block, ...extra }) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp as never))
  return renderToString(app)
}
```

- [ ] **Step 2: Run inspector tests to verify RED**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/components/emailEdmBlockSettingsPanel.test.ts
```

Expected: FAIL because `BlockSettingsPanel` does not accept a device prop or render visibility controls.

- [ ] **Step 3: Add active device state in the builder**

In `app/components/email/builder/EdmFlyhubBuilder.client.vue`, add:

```ts
import { getBlockForDevice, isHiddenOnDevice, type EdmDevice } from '~~/app/utils/edmResponsive'
```

Add state near `viewMode`:

```ts
const activeDevice = ref<EdmDevice>('desktop')
const DEVICE_TABS: { value: EdmDevice, label: string, icon: string }[] = [
  { value: 'desktop', label: 'Desktop', icon: 'i-lucide-monitor' },
  { value: 'mobile', label: 'Mobile', icon: 'i-lucide-smartphone' }
]
```

Update `selectedBlock` to include base and active data:

```ts
const selectedBlock = computed(() => {
  const id = store.selectedBlockId.value
  if (!id || id === 'root') return null
  const b = store.document.value[id]
  if (!b) return null
  const active = getBlockForDevice({ id, type: b.type, data: b.data }, activeDevice.value)
  return { id, type: b.type, data: active.data, baseData: b.data }
})
```

Update `onBlockUpdate`:

```ts
function onBlockUpdate(updates: { style?: unknown, props?: unknown, visibility?: { hideOnMobile?: boolean, hideOnDesktop?: boolean } }) {
  const id = store.selectedBlockId.value
  if (!id) return
  if (updates.visibility) store.updateBlockVisibility(id, updates.visibility)
  if (activeDevice.value === 'mobile') {
    if (updates.style) store.updateBlockMobileStyle(id, updates.style as Record<string, unknown>)
    if (updates.props) store.updateBlockMobileProps(id, updates.props as Record<string, unknown>)
    return
  }
  if (updates.style) store.updateBlockStyle(id, updates.style as Record<string, unknown>)
  if (updates.props) store.updateBlockProps(id, updates.props as Record<string, unknown>)
}
```

Add the device toggle near the existing editor/preview/html tabs:

```vue
<div class="inline-flex rounded-md border border-default bg-default p-1">
  <UButton
    v-for="device in DEVICE_TABS"
    :key="device.value"
    :icon="device.icon"
    :label="device.label"
    size="xs"
    :variant="activeDevice === device.value ? 'solid' : 'ghost'"
    color="neutral"
    @click="activeDevice = device.value"
  />
</div>
```

- [ ] **Step 4: Add inspector props and visibility controls**

In `BlockSettingsPanel.vue`, extend props:

```ts
import type { EdmDevice } from '~~/app/utils/edmResponsive'

const props = withDefaults(defineProps<{
  block: { id: string, type: string, data: BlockData }
  baseBlock?: { id: string, type: string, data: BlockData } | null
  device?: EdmDevice
}>(), {
  baseBlock: null,
  device: 'desktop'
})
```

Extend emits:

```ts
const emit = defineEmits<{ update: [updates: { style?: unknown, props?: unknown, visibility?: { hideOnMobile?: boolean, hideOnDesktop?: boolean } }] }>()
```

Add helpers:

```ts
const isMobileEditing = computed(() => props.device === 'mobile')
const visibilityData = computed(() => props.baseBlock?.data || props.block.data)

function updateVisibility(key: 'hideOnMobile' | 'hideOnDesktop', value: boolean) {
  emit('update', { visibility: { [key]: value } })
}
```

Add this at the top of the template:

```vue
<UBadge v-if="isMobileEditing" color="primary" variant="soft">
  Mobile override
</UBadge>

<div class="grid grid-cols-2 gap-2">
  <UCheckbox
    :model-value="!!visibilityData.hideOnMobile"
    label="Hide on mobile"
    @update:model-value="updateVisibility('hideOnMobile', !!$event)"
  />
  <UCheckbox
    :model-value="!!visibilityData.hideOnDesktop"
    label="Hide on desktop"
    @update:model-value="updateVisibility('hideOnDesktop', !!$event)"
  />
</div>
```

- [ ] **Step 5: Wire inspector props**

In `EdmFlyhubBuilder.client.vue`, change:

```vue
<EmailBuilderBlockSettingsPanel :block="selectedBlock" @update="onBlockUpdate" />
```

to:

```vue
<EmailBuilderBlockSettingsPanel
  :block="selectedBlock"
  :base-block="{ id: selectedBlock.id, type: selectedBlock.type, data: selectedBlock.baseData }"
  :device="activeDevice"
  @update="onBlockUpdate"
/>
```

- [ ] **Step 6: Run tests to verify GREEN**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/components/emailEdmBlockSettingsPanel.test.ts test/app/edmBuilderStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/email/builder/EdmFlyhubBuilder.client.vue app/components/email/builder/BlockSettingsPanel.vue test/components/emailEdmBlockSettingsPanel.test.ts
git commit -m "feat(email): add EDM device inspector"
```

---

### Task 4: Device-Aware Editor Rendering

**Files:**
- Modify: `app/components/email/builder/EdmFlyhubBuilder.client.vue`
- Modify: `app/components/email/builder/ContainerBlockRenderer.vue`
- Modify: `app/components/email/builder/ColumnsContainerRenderer.vue`
- Modify: `app/components/email/builder/EdmBlockRenderer.vue`
- Test: `test/components/emailEdmBlockRenderer.test.ts`

- [ ] **Step 1: Write failing renderer SSR test**

Add to `test/components/emailEdmBlockRenderer.test.ts`:

```ts
it('marks hidden-on-device blocks in editor mode without removing their content', async () => {
  const html = await renderBlock(
    'Text',
    { text: 'Hidden mobile copy' },
    { color: '#111111' },
    { editable: true, hiddenOnDevice: true }
  )

  expect(html).toContain('edm-hidden-on-device')
  expect(html).toContain('Hidden mobile copy')
})
```

- [ ] **Step 2: Run renderer test to verify RED**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/components/emailEdmBlockRenderer.test.ts
```

Expected: FAIL because `hiddenOnDevice` is not rendered.

- [ ] **Step 3: Add hidden editor styling wrapper**

In `EdmBlockRenderer.vue`, add prop:

```ts
hiddenOnDevice?: boolean
```

Wrap the existing template content in a shell whose normal state uses `display: contents`, so thumbnails and desktop editor rendering keep their layout:

```vue
<div
  :class="['edm-render-shell', { 'edm-hidden-on-device': hiddenOnDevice }]"
  :data-hidden-on-device="hiddenOnDevice ? 'true' : undefined"
>
  <!-- existing block branches remain inside this wrapper -->
</div>
```

Add scoped CSS:

```css
.edm-render-shell {
  display: contents;
}

.edm-hidden-on-device {
  display: block;
  opacity: 0.38;
  filter: grayscale(0.35);
  position: relative;
}

.edm-hidden-on-device::after {
  content: "Hidden on this device";
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
  background: color-mix(in srgb, var(--ui-bg) 65%, transparent);
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
}
```

- [ ] **Step 4: Pass active merged data to root blocks**

In `EdmFlyhubBuilder.client.vue`, update each renderer call:

```vue
<EmailBuilderEdmBlockRenderer
  :type="block.type"
  :style="blockForCanvas(block.id)?.data?.style"
  :props="blockForCanvas(block.id)?.data?.props"
  :hidden-on-device="isHiddenOnDevice(store.document.value[block.id], activeDevice)"
  editable
  @update:text="(t) => activeDevice === 'mobile' ? store.updateBlockMobileProps(block.id, { text: t }) : store.updateBlockProps(block.id, { text: t })"
/>
```

Use a small script helper to avoid repeated inline calls:

```ts
function blockForCanvas(blockId: string) {
  const block = store.document.value[blockId]
  return block ? getBlockForDevice(block, activeDevice.value) : null
}
```

- [ ] **Step 5: Pass device through nested containers**

In `ContainerBlockRenderer.vue` and `ColumnsContainerRenderer.vue`, add props:

```ts
device?: EdmDevice
```

Use `getBlockForDevice(childBlock, props.device || 'desktop')` before passing `style` and `props` into child `EdmBlockRenderer` instances, and pass `hiddenOnDevice`.

- [ ] **Step 6: Run renderer tests to verify GREEN**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/components/emailEdmBlockRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/email/builder/EdmFlyhubBuilder.client.vue app/components/email/builder/ContainerBlockRenderer.vue app/components/email/builder/ColumnsContainerRenderer.vue app/components/email/builder/EdmBlockRenderer.vue test/components/emailEdmBlockRenderer.test.ts
git commit -m "feat(email): render EDM mobile overrides in editor"
```

---

### Task 5: Server Responsive CSS And Hide Classes

**Files:**
- Modify: `server/utils/email-marketing/render/flyhub-html-renderer.ts`
- Modify: `server/utils/email-marketing/render/blocks/email-layout.ts`
- Test: `test/utils/emailRenderResponsive.test.ts`

- [ ] **Step 1: Write failing server render tests**

Create `test/utils/emailRenderResponsive.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'

const baseDoc = {
  root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['a'] } },
  a: { type: 'Text', data: { props: { text: 'Body copy' }, style: { color: '#111111' } } }
}

describe('responsive server render', () => {
  it('keeps documents without responsive fields byte-identical', () => {
    const before = renderTemplateDocument(baseDoc)
    const after = renderTemplateDocument(JSON.parse(JSON.stringify(baseDoc)))

    expect(after).toBe(before)
    expect(after).not.toContain('edm-r-a')
    expect(after).not.toContain('edm-hide-mobile')
  })

  it('emits mobile media CSS only for blocks with mobile overrides', () => {
    const html = renderTemplateDocument({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['a'] } },
      a: {
        type: 'Text',
        data: {
          props: { text: 'Body copy' },
          style: { color: '#111111' },
          mobile: { style: { color: '#222222', fontSize: 14 } }
        }
      }
    })

    expect(html).toContain('class="edm-r-a"')
    expect(html).toContain('@media only screen and (max-width: 620px)')
    expect(html).toContain('.edm-r-a { color: #222222 !important; font-size: 14px !important; }')
  })

  it('emits hide-on-device classes', () => {
    const html = renderTemplateDocument({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['a', 'b'] } },
      a: { type: 'Text', data: { props: { text: 'Mobile hidden' }, hideOnMobile: true } },
      b: { type: 'Text', data: { props: { text: 'Desktop hidden' }, hideOnDesktop: true } }
    })

    expect(html).toContain('class="edm-hide-mobile"')
    expect(html).toContain('class="edm-hide-desktop"')
    expect(html).toContain('.edm-hide-mobile { display: none !important; max-height: 0 !important; overflow: hidden !important; }')
    expect(html).toContain('.edm-hide-desktop { display: none !important; max-height: 0 !important; overflow: hidden !important; }')
    expect(html).toContain('@media only screen and (max-width: 620px)')
  })
})
```

- [ ] **Step 2: Run server responsive tests to verify RED**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/utils/emailRenderResponsive.test.ts
```

Expected: FAIL because no responsive classes or mobile CSS exist.

- [ ] **Step 3: Add class wrapping in root layout renderer**

In `server/utils/email-marketing/render/blocks/email-layout.ts`, import helpers:

```ts
import { edmBlockHasResponsiveRules, edmResponsiveClassForBlock, getHideClassForBlock } from '~~/app/utils/edmResponsive'
```

Wrap child HTML only when needed:

```ts
function responsiveClassesForChild(id: string, childBlock: FlyhubBlock): string {
  const classes = [
    edmBlockHasResponsiveRules(childBlock) ? edmResponsiveClassForBlock(id) : '',
    getHideClassForBlock(childBlock) || ''
  ].filter(Boolean)
  return classes.join(' ')
}

function wrapResponsiveHtml(id: string, childBlock: FlyhubBlock, html: string): string {
  const className = responsiveClassesForChild(id, childBlock)
  return className ? `<div class="${className}">${html}</div>` : html
}
```

Use `wrapResponsiveHtml(id, childBlock, renderBlock(childBlock, 'html', context))` in `renderHtml`.

- [ ] **Step 4: Inject responsive CSS only when needed**

In `flyhub-html-renderer.ts`, import helpers:

```ts
import { edmBlockHasResponsiveRules, edmResponsiveClassForBlock, getHideClassForBlock, mobileStyleDeclarationsForBlock } from '~~/app/utils/edmResponsive'
```

Add:

```ts
function collectResponsiveCss(doc: FlyhubDocument): { desktopCss: string[], mobileCss: string[] } {
  const desktopCss: string[] = []
  const mobileCss: string[] = []

  for (const [blockId, block] of Object.entries(doc)) {
    if (blockId === 'root' || !edmBlockHasResponsiveRules(block)) continue
    const className = edmResponsiveClassForBlock(blockId)
    const hideClass = getHideClassForBlock(block)
    const mobileDeclarations = mobileStyleDeclarationsForBlock(block)
    if (mobileDeclarations.length > 0) {
      mobileCss.push(`      .${className} { ${mobileDeclarations.map(([prop, value]) => `${prop}: ${value} !important;`).join(' ')} }`)
    }
    if (hideClass === 'edm-hide-desktop' || hideClass === 'edm-hide-all') {
      desktopCss.push(`    .${hideClass} { display: none !important; max-height: 0 !important; overflow: hidden !important; }`)
    }
    if (hideClass === 'edm-hide-mobile' || hideClass === 'edm-hide-all') {
      mobileCss.push(`      .${hideClass} { display: none !important; max-height: 0 !important; overflow: hidden !important; }`)
    }
  }

  return { desktopCss, mobileCss }
}
```

Before constructing `html`, call:

```ts
const responsiveCss = collectResponsiveCss(doc)
```

In the `<style>` block, insert desktop CSS before `@media` and mobile CSS inside the media query:

```ts
    ${responsiveCss.desktopCss.join('\n')}
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { max-width: 100% !important; height: auto !important; margin-left: auto !important; margin-right: auto !important; }
      .stack-column, .stack-column-center { display: block !important; width: 100% !important; max-width: 100% !important; direction: ltr !important; }
      .columns-row { display: block !important; }
${responsiveCss.mobileCss.join('\n')}
    }
```

Keep empty arrays as empty strings so no-responsive documents keep the same output.

- [ ] **Step 5: Run server responsive tests to verify GREEN**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/utils/emailRenderResponsive.test.ts test/utils/emailRenderDocument.test.ts test/utils/emailRenderRichStyle.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/email-marketing/render/flyhub-html-renderer.ts server/utils/email-marketing/render/blocks/email-layout.ts test/utils/emailRenderResponsive.test.ts
git commit -m "feat(email): emit responsive EDM email CSS"
```

---

### Task 6: Final EDM Regression Suite

**Files:**
- Modify only files surfaced by failing tests in this task.

- [ ] **Step 1: Run Nuxt prepare under Node 24**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm exec nuxt prepare
```

Expected: PASS with the known missing-env and duplicate-import warnings.

- [ ] **Step 2: Run focused EDM tests**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm test:run test/utils/edm*.test.ts test/utils/emailRender*.test.ts test/components/emailEdm*.test.ts test/components/emailEditorBlockWrapper.test.ts test/app/edmBuilderStore.test.ts test/server/edmCustomModules.test.ts
```

Expected: PASS. Current baseline after T3b.3 was 19 files / 148 tests; this phase should add responsive tests and increase that count.

- [ ] **Step 3: Run targeted lint on changed EDM files**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && pnpm exec eslint app/types/edm.ts app/utils/edmResponsive.ts app/composables/useEdmBuilder.ts app/components/email/builder/EdmFlyhubBuilder.client.vue app/components/email/builder/BlockSettingsPanel.vue app/components/email/builder/ContainerBlockRenderer.vue app/components/email/builder/ColumnsContainerRenderer.vue app/components/email/builder/EdmBlockRenderer.vue server/utils/email-marketing/render/blocks/types.ts server/utils/email-marketing/render/blocks/email-layout.ts server/utils/email-marketing/render/flyhub-html-renderer.ts test/utils/edmResponsive.test.ts test/utils/emailRenderResponsive.test.ts test/app/edmBuilderStore.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/components/emailEdmBlockRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typecheck with high heap**

Run:

```bash
eval "$(fnm env --use-on-cd)" && fnm use 24 && NODE_OPTIONS='--max-old-space-size=16384' pnpm run typecheck
```

Expected: The repo currently fails typecheck from unrelated pre-existing errors. Confirm no errors reference the Phase 3c files listed in Step 3; if any do, fix them before continuing.

- [ ] **Step 5: Commit final verification notes if code changed during fixes**

If Step 4 required code fixes, run:

```bash
git add <fixed-files>
git commit -m "fix(email): polish EDM responsive editor"
```

If Step 4 required no code fixes, do not create an empty commit.

---

## Self-Review

- **Spec coverage:** T3c.1 covered by Tasks 1-2; T3c.2 covered by Task 3; T3c.3 covered by Task 4; T3c.4 and T3c.5 covered by Task 5; T3c.6 covered by Task 6.
- **Backwards compatibility:** Task 5 includes byte-identical no-responsive render protection and Task 6 reruns existing render tests.
- **Scope control:** No migration is planned because responsive state is additive inside existing `body_source` JSON. Thumbnails remain desktop because only the builder canvas passes `activeDevice`; existing thumbnail render calls do not pass mobile state.
- **Known limitations:** Interactive browser drag and mobile device switching still need manual browser verification after code lands. Unit/SSR tests cover deterministic helpers and rendered attributes because `@vue/test-utils` is not installed.
