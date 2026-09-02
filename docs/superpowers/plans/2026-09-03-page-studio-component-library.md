# Page Studio Canonical Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated, versioned Page Studio library of canonical sections, page layouts, site shells, and complete site starters that instantiate ordinary editable draft content.

**Architecture:** Extend the backward-compatible revisioned document contract with bounded collection items and optional shell metadata. Keep all curated preset definitions and pure factories in shared TypeScript, render the expanded canonical types through focused Vue components, and expose application controls through a Nuxt UI slideover in the existing visual Studio. Preset operations mutate only the in-memory draft until the operator explicitly saves through the existing governed endpoint.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Tailwind CSS, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-09-03-page-studio-component-library-design.md`

## Global Constraints

- Phase 3 ships XeroFlow-curated presets only.
- Applying a preset creates fresh identifiers and no runtime dependency on the source preset.
- Existing schema-version-1 documents remain valid.
- Template operations mutate only the local draft until explicit save.
- Page limits remain server-authoritative and complete site starters must be disabled when they exceed the loaded entitlement.
- Page-level header/footer inheritance remains authoritative.
- Use Nuxt UI v4 for all controls, confirmations, tabs, fields, and slideovers.
- No executable markup, arbitrary CSS, or user-supplied component code may enter a preset.
- Production still requires checkpoint, review, approval, verified build, and release activation.

---

### Task 1: Extend the canonical document contract and preset registry

**Files:**
- Modify: `shared/pageStudio/document.ts`
- Create: `shared/pageStudio/presets.ts`
- Create: `test/shared/pageStudioPresets.test.ts`

**Interfaces:**
- Consumes: existing `PageStudioDocument`, `PageStudioPage`, and `PageStudioBlock` schema-version-1 types.
- Produces: `PageStudioBlockItem`, `PageStudioShell`, `PageStudioPreset`, `PAGE_STUDIO_SECTION_PRESETS`, `PAGE_STUDIO_PAGE_PRESETS`, `PAGE_STUDIO_SHELL_PRESETS`, `PAGE_STUDIO_SITE_PRESETS`, `instantiateSectionPreset()`, `instantiatePagePreset()`, `applyShellPreset()`, and `instantiateSitePreset()`.

- [ ] **Step 1: Write schema and factory tests**

Cover legacy-document compatibility, bounded collection items, valid shell metadata, fresh IDs on every instantiation, stable preset IDs, a five-layout page registry, three complete-site starters, and preservation of schema version 1.

```ts
const first = instantiateSectionPreset('service-feature-grid', fixedUuidFactory())
const second = instantiateSectionPreset('service-feature-grid', fixedUuidFactory(20))
expect(first.id).not.toBe(second.id)
expect(first.type).toBe('features')
expect(first.items).toHaveLength(3)

const result = instantiateSitePreset('professional-services', fixedUuidFactory())
expect(result.schemaVersion).toBe(1)
expect(result.pages.map(page => page.slug)).toEqual(['', 'services', 'about', 'contact'])
expect(PageStudioDocumentSchema.safeParse(result).success).toBe(true)
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/shared/pageStudioPresets.test.ts
```

Expected: failure because the preset module and expanded schema do not exist.

- [ ] **Step 3: Extend the Zod contract backward-compatibly**

Add section types `features`, `stats`, `testimonials`, `faq`, `contact`, `logo-cloud`, and `blog-grid`. Add an optional maximum-12 `items` array to blocks and an optional `shell` object to the document.

```ts
const PageStudioBlockItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(180).default(''),
  body: z.string().max(1200).default(''),
  label: z.string().max(80).default(''),
  value: z.string().max(80).default(''),
  imageUrl: z.string().max(2048).default(''),
  imageAlt: z.string().max(300).default(''),
  href: z.string().max(2048).default('')
}).strict()

const PageStudioShellSchema = z.object({
  headerPresetId: z.enum(['minimal', 'standard', 'campaign']),
  footerPresetId: z.enum(['compact', 'multi-column', 'conversion']),
  siteName: z.string().trim().min(1).max(160),
  primaryActionLabel: z.string().max(80).default(''),
  primaryActionHref: z.string().max(2048).default(''),
  navigation: z.array(PageStudioNavigationItemSchema).max(12),
  footerGroups: z.array(PageStudioFooterGroupSchema).max(6),
  copyright: z.string().max(240).default('')
}).strict()
```

Keep both new properties optional so documents already stored in `page_studio_documents` continue to parse.

- [ ] **Step 4: Implement the versioned curated registry and pure factories**

Define stable metadata and factories. Require an injected `idFactory: () => string` so tests are deterministic and browser callers use `crypto.randomUUID`.

```ts
export interface PageStudioPresetSummary {
  id: string
  name: string
  description: string
  icon: string
  version: 1
}

export function instantiateSectionPreset(id: SectionPresetId, idFactory: () => string): PageStudioBlock
export function instantiatePagePreset(id: PagePresetId, idFactory: () => string): PageStudioBlock[]
export function applyShellPreset(document: PageStudioDocument, id: ShellPresetId): PageStudioDocument
export function instantiateSitePreset(id: SitePresetId, idFactory: () => string): PageStudioDocument
```

Factories must deep-copy arrays, generate IDs for every page, block and item, remap parent IDs, assign exactly one homepage, use canonical slugs, and return no redirects unless the preset explicitly defines one.

- [ ] **Step 5: Run tests and scoped lint**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/shared/pageStudioPresets.test.ts test/shared/pageStudioPages.test.ts
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec eslint shared/pageStudio/document.ts shared/pageStudio/presets.ts test/shared/pageStudioPresets.test.ts
```

Expected: all tests pass and lint exits zero.

- [ ] **Step 6: Commit the document contract and registry**

```bash
git add shared/pageStudio/document.ts shared/pageStudio/presets.ts test/shared/pageStudioPresets.test.ts
git commit -m "feat(page-studio): add canonical preset registry"
```

### Task 2: Add focused canonical section and shell renderers

**Files:**
- Create: `app/components/page-studio/BuilderCollectionSection.vue`
- Create: `app/components/page-studio/BuilderFaqSection.vue`
- Create: `app/components/page-studio/BuilderContactSection.vue`
- Create: `app/components/page-studio/BuilderSiteHeader.vue`
- Create: `app/components/page-studio/BuilderSiteFooter.vue`
- Modify: `app/components/page-studio/BuilderCanvas.vue`
- Create: `test/app/pageStudioCanonicalRenderers.test.ts`

**Interfaces:**
- Consumes: expanded `PageStudioBlock`, `PageStudioShell`, page `headerMode`/`footerMode`, and existing desktop/tablet/mobile canvas states.
- Produces: deterministic responsive renderers with no HTML/CSS execution and `BuilderCanvas` prop `shell?: PageStudioShell`.

- [ ] **Step 1: Write renderer contract tests**

Assert each section type is dispatched to a focused component, shell components are mounted around page blocks, hidden modes omit the matching shell, images require alternative text bindings, and all interactive preview buttons prevent navigation.

```ts
expect(canvas).toContain("block.type === 'features'")
expect(canvas).toContain('<PageStudioBuilderSiteHeader')
expect(canvas).toContain("page.headerMode !== 'hidden'")
expect(collection).toContain(':alt="item.imageAlt"')
```

- [ ] **Step 2: Run the renderer test and verify it fails**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/app/pageStudioCanonicalRenderers.test.ts
```

- [ ] **Step 3: Implement collection renderers**

Use one focused collection component for features, statistics, testimonials, logo cloud, and blog cards. Select purpose-built layouts by the block discriminant, not arbitrary template markup. Preserve semantic headings, lists, figures, quotes, and link labels.

- [ ] **Step 4: Implement FAQ and contact renderers**

Render FAQ items through `UAccordion`. Render contact as an informational conversion panel in Studio; do not submit forms in Phase 3. Use `UButton` for calls to action and suppress navigation in the builder preview.

- [ ] **Step 5: Implement header and footer renderers**

Render minimal, standard, and campaign header variants and compact, multi-column, and conversion footer variants from shell metadata. On narrow canvas widths, collapse navigation to a non-functional `UButton` menu affordance rather than a raw button.

- [ ] **Step 6: Compose the renderers in BuilderCanvas**

Add `shell?: PageStudioShell`, render header/footer when the page mode is not hidden, and route each expanded block type explicitly. Keep existing hero, text, image, and CTA output unchanged.

- [ ] **Step 7: Run renderer tests and scoped lint**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/app/pageStudioCanonicalRenderers.test.ts
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec eslint app/components/page-studio/BuilderCanvas.vue app/components/page-studio/BuilderCollectionSection.vue app/components/page-studio/BuilderFaqSection.vue app/components/page-studio/BuilderContactSection.vue app/components/page-studio/BuilderSiteHeader.vue app/components/page-studio/BuilderSiteFooter.vue test/app/pageStudioCanonicalRenderers.test.ts
```

- [ ] **Step 8: Commit canonical rendering**

```bash
git add app/components/page-studio/BuilderCanvas.vue app/components/page-studio/BuilderCollectionSection.vue app/components/page-studio/BuilderFaqSection.vue app/components/page-studio/BuilderContactSection.vue app/components/page-studio/BuilderSiteHeader.vue app/components/page-studio/BuilderSiteFooter.vue test/app/pageStudioCanonicalRenderers.test.ts
git commit -m "feat(page-studio): render canonical website components"
```

### Task 3: Build the Studio template library interface

**Files:**
- Create: `app/components/page-studio/TemplateLibrarySlideover.vue`
- Create: `app/components/page-studio/TemplateApplyModal.vue`
- Create: `test/app/pageStudioTemplateLibrary.test.ts`

**Interfaces:**
- Consumes: curated registry summary arrays and active `pageCount`/`pageLimit`.
- Produces events `applySection(id)`, `applyPage(id)`, `applyShell(id)`, and `applySite(id)`; page and site events are emitted only after confirmation.

- [ ] **Step 1: Write library interaction contract tests**

Assert a permanent Sections/Pages/Shells/Sites tab set, meaningful descriptions, disabled over-limit site starters, Nuxt UI confirmation, and absence of raw form controls.

```ts
expect(library).toContain("label: 'Sections'")
expect(library).toContain(':disabled="preset.pageCount > pageLimit"')
expect(confirm).toContain('<UModal')
expect(library).not.toMatch(/<(?:button|input|select|dialog)\b/)
```

- [ ] **Step 2: Run the library test and verify it fails**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/app/pageStudioTemplateLibrary.test.ts
```

- [ ] **Step 3: Implement TemplateApplyModal**

Accept `kind: 'page' | 'site'`, preset name, affected page count, and loading state. Emit `confirm` and `cancel`. Copy must state that the operation changes only the unsaved draft and identify whether one page or the complete draft is replaced.

- [ ] **Step 4: Implement TemplateLibrarySlideover**

Use `USlideover`, `UTabs`, `UCard`, `UBadge`, and `UButton`. Render real preset names and descriptions from the shared registry. Section and shell presets apply immediately; page and site presets open `TemplateApplyModal`.

- [ ] **Step 5: Run tests and scoped lint**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/app/pageStudioTemplateLibrary.test.ts
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec eslint app/components/page-studio/TemplateLibrarySlideover.vue app/components/page-studio/TemplateApplyModal.vue test/app/pageStudioTemplateLibrary.test.ts
```

- [ ] **Step 6: Commit the template library UI**

```bash
git add app/components/page-studio/TemplateLibrarySlideover.vue app/components/page-studio/TemplateApplyModal.vue test/app/pageStudioTemplateLibrary.test.ts
git commit -m "feat(page-studio): add Studio template library"
```

### Task 4: Integrate presets into the visual Studio draft workflow

**Files:**
- Modify: `app/components/page-studio/BuilderShell.client.vue`
- Modify: `app/components/page-studio/BuilderCanvas.vue`
- Create: `test/app/pageStudioTemplateApplication.test.ts`

**Interfaces:**
- Consumes: registry factories from Task 1 and library events from Task 3.
- Produces: local-draft application handlers and passes `draft.shell` into BuilderCanvas.

- [ ] **Step 1: Write integration contract tests**

Assert the Library button is permanent, section insertion follows the selected block, page replacement affects only selected blocks, shell selection preserves pages, site replacement validates page limit, all factory calls use `crypto.randomUUID`, and no preset handler calls `$fetch`.

- [ ] **Step 2: Run the integration test and verify it fails**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/app/pageStudioTemplateApplication.test.ts
```

- [ ] **Step 3: Add library state and section application**

Add `libraryOpen`, render `PageStudioTemplateLibrarySlideover`, and insert the instantiated block after `selectedBlockId` or append when nothing is selected.

```ts
function applySectionPreset(id: SectionPresetId) {
  if (!selectedPage.value) return
  const block = instantiateSectionPreset(id, () => crypto.randomUUID())
  const selectedIndex = selectedPage.value.blocks.findIndex(item => item.id === selectedBlockId.value)
  selectedPage.value.blocks.splice(selectedIndex < 0 ? selectedPage.value.blocks.length : selectedIndex + 1, 0, block)
  selectedBlockId.value = block.id
}
```

- [ ] **Step 4: Add page, shell, and site application**

Page replacement assigns only `selectedPage.blocks`. Shell replacement assigns `draft.shell`. Site replacement assigns a newly instantiated document only when `next.pages.length <= data.pageLimit`, then selects the homepage and first block. Preserve the current document when the entitlement check fails and show a warning toast.

- [ ] **Step 5: Extend item editing in the inspector**

For collection blocks, expose each item's title/body/label/value/image/link through `UFormField` controls, plus `UButton` add/remove actions up to the schema limit. Keep generic block controls visible where relevant and do not render fields that the selected section cannot use.

- [ ] **Step 6: Pass shell metadata into the canvas and preserve explicit save**

```vue
<PageStudioBuilderCanvas
  :shell="draft.shell"
  :page="selectedPage"
  ...
/>
```

Preset handlers must not call the document endpoint. The existing Save draft action remains the only persistence path.

- [ ] **Step 7: Run the Page Studio test surface and scoped lint**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run $(find test -type f -iname '*pagestudio*' | sort)
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec eslint app/components/page-studio shared/pageStudio test/app/pageStudioTemplateApplication.test.ts test/app/pageStudioTemplateLibrary.test.ts test/app/pageStudioCanonicalRenderers.test.ts test/shared/pageStudioPresets.test.ts
```

- [ ] **Step 8: Commit Studio integration**

```bash
git add app/components/page-studio/BuilderShell.client.vue app/components/page-studio/BuilderCanvas.vue test/app/pageStudioTemplateApplication.test.ts
git commit -m "feat(page-studio): apply templates in Studio drafts"
```

### Task 5: Marketing synchronisation, review, and production release

**Files:**
- Modify: `app/pages/features/[slug].vue`
- Modify: `docs/superpowers/plans/2026-09-03-page-studio-component-library.md`
- Test: existing Page Studio tests plus deployment guards

**Interfaces:**
- Consumes: all Phase 3 deliverables.
- Produces: public feature copy, completed plan evidence, merged PR, and guarded production deployment.

- [ ] **Step 1: Update Page Studio public feature copy**

Describe the curated canonical library, ordinary editable output, complete starters, and governed publication boundary. Keep the existing four-section marketing structure and dark-mode-safe styling unchanged.

- [ ] **Step 2: Run final focused verification**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run $(find test -type f -iname '*pagestudio*' | sort)
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec eslint app/components/page-studio shared/pageStudio 'app/pages/features/[slug].vue' test/app/pageStudioTemplateApplication.test.ts test/app/pageStudioTemplateLibrary.test.ts test/app/pageStudioCanonicalRenderers.test.ts test/shared/pageStudioPresets.test.ts
```

- [ ] **Step 3: Run typecheck diagnostics and deployment guard**

Run the repository typecheck, record known baseline errors separately, and require zero diagnostics in changed Phase 3 files. Then run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm deploy:check
```

Expected target: `agency-dashboard / main`.

- [ ] **Step 4: Commit final documentation and marketing synchronisation**

```bash
git add 'app/pages/features/[slug].vue' docs/superpowers/plans/2026-09-03-page-studio-component-library.md
git commit -m "docs(page-studio): publish component library guidance"
```

- [ ] **Step 5: Push, open the PR, and wait for required CI**

The PR must describe draft-only template application, backward compatibility, entitlement enforcement, test evidence, and the absence of a migration. Do not deploy if the production Worker build, full suite, social regression surface, or target guard fails reproducibly.

- [ ] **Step 6: Merge and deploy through the guarded command**

After CI succeeds and the merged `origin/main` tree equals the reviewed worktree tree:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm run deploy:production
```

- [ ] **Step 7: Smoke-check immutable and custom production URLs**

Require HTTP 200 from the immutable Pages deployment and the authenticated Page Studio editor route. Do not apply a site starter or save a production draft during smoke verification.
