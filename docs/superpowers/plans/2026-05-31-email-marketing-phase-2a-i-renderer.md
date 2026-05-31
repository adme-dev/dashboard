# Email Marketing — Phase 2a-i: Render Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Workers-safe pure-TS flyhub document→HTML renderer (block registry + generic blocks + orchestrator) into the dashboard, add `email_templates` persistence (JSONB `body_source` + rendered `body_html`), and CRUD + stateless render endpoints — so we can store a flyhub JSON document and render it to email-safe HTML at the edge, with merge-field substitution.

**Architecture:** All rendering is pure TypeScript string-building — **no `@flyhub` npm packages, no MJML, no build-config changes** (those belong to Phase 2a-ii, the editor). The renderer is cherry-picked from `promotion-knoxgwmhaval/layers/edm/server/utils` (proven in production), trimmed to generic blocks, placed under `server/utils/email-marketing/render/`. Templates store the document as JSONB and the rendered HTML is regenerated on every write.

**Tech Stack:** Nitro, Neon Postgres, Zod, Vitest. (Vue editor is Phase 2a-ii.)

**Spec:** `docs/superpowers/specs/2026-05-31-email-marketing-module-design.md`
**Source to port from:** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm/server/utils/`

**Scope note:** Phase 2a-i is the render + persistence foundation. OUT of scope here: the visual editor (2a-ii, full port + Nuxt UI re-skin), campaigns table + sending engine (2b), Resend webhooks (Phase 3), public pages (Phase 4). No automotive blocks, no MJML/Maizzle paths exercised (the `renderMjml`/`renderMaizzle` functions are ported as dead code for fidelity but only `renderHtml` is called).

---

## File Structure

**Created — render core (ported, mostly verbatim):**
- `server/utils/email-marketing/render/blocks/types.ts` — `FlyhubBlock`, `FlyhubDocument`, `BlockRenderContext`, `BlockDefinition`, `RenderFormat`, `FONT_FAMILY_MAP`, `resolveFontFamily`, `formatPadding`. (verbatim copy)
- `server/utils/email-marketing/render/blocks/helpers.ts` — `escapeHtml`, `escapeUrl`, `escapeFontFamilyForHtml`, `renderMergeField`, `formatAudPrice`, `renderStarsHtml`, `renderStarsMjml`. (verbatim copy)
- `server/utils/email-marketing/render/block-registry.ts` — registry + `renderBlock`, pinned on `globalThis.__edmBlockRegistry`. (verbatim copy)
- `server/utils/email-marketing/render/blocks/<22 generic block files>.ts` — verbatim copies (one adapted: `html-block.ts`).
- `server/utils/email-marketing/render/blocks/offer-html-generator.ts` — **new stub** replacing the automotive `~~/shared/offer-html-generator`.
- `server/utils/email-marketing/render/blocks/index.ts` — **new, trimmed** registration barrel (generic blocks only) + `BLOCKS_LOADED`.
- `server/utils/email-marketing/render/flyhub-html-renderer.ts` — `renderFlyhubDocumentToHtml`, `isFlyhubFormat`. (verbatim copy)
- `server/utils/email-marketing/render/index.ts` — **new** thin wrapper `renderTemplateDocument(doc, opts)`.

**Created — persistence + API:**
- `server/database/migrations/133-email-templates.sql`
- `server/utils/email-marketing/templates.ts` — templates DB layer.
- `server/api/email/templates/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`
- `server/api/email/templates/render.post.ts` — stateless render (for live preview + tests).

**Created — tests:**
- `test/utils/emailRenderHeading.test.ts`, `test/utils/emailRenderDocument.test.ts`, `test/utils/emailRenderMerge.test.ts`

---

## Task 1: Migration 133 — email_templates

**Files:**
- Create: `server/database/migrations/133-email-templates.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 133: email marketing — reusable email templates / drafts (Phase 2a-i)
-- Stores the flyhub document (JSONB body_source) and its server-rendered HTML.
-- The editor (Phase 2a-ii) edits body_source; the renderer regenerates body_html.
CREATE TABLE IF NOT EXISTS email_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  subject      TEXT,
  preview_text TEXT,
  body_source  JSONB NOT NULL DEFAULT '{"root":{"type":"EmailLayout","data":{"childrenIds":[]}}}'::jsonb,
  body_html    TEXT,
  content_type TEXT NOT NULL DEFAULT 'flyhub' CHECK (content_type IN ('flyhub','html')),
  client_id    UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_client ON email_templates(client_id);
```

- [ ] **Step 2: Run + verify**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/133-email-templates.sql
psql "$DATABASE_URL" -c "\d email_templates"
```
Expected: `CREATE TABLE`/`CREATE INDEX`; table prints with `body_source` jsonb + `body_html` text.

- [ ] **Step 3: Commit**

```bash
git add server/database/migrations/133-email-templates.sql
git commit -m "feat(email): migration 133 — email_templates (flyhub doc + rendered html)"
```

---

## Task 2: Port render core — types + helpers + registry

**Files:**
- Create: `server/utils/email-marketing/render/blocks/types.ts`
- Create: `server/utils/email-marketing/render/blocks/helpers.ts`
- Create: `server/utils/email-marketing/render/block-registry.ts`

- [ ] **Step 1: Copy the three core files verbatim**

Run:
```bash
SRC=/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm/server/utils
DST=server/utils/email-marketing/render
mkdir -p "$DST/blocks"
cp "$SRC/blocks/types.ts"   "$DST/blocks/types.ts"
cp "$SRC/blocks/helpers.ts" "$DST/blocks/helpers.ts"
cp "$SRC/block-registry.ts" "$DST/block-registry.ts"
```

- [ ] **Step 2: Verify these files have NO external (`@flyhub`, `~~/`, npm) imports**

Run:
```bash
grep -nE "from '(@|~~/|node:)" server/utils/email-marketing/render/blocks/types.ts \
  server/utils/email-marketing/render/blocks/helpers.ts \
  server/utils/email-marketing/render/block-registry.ts || echo "CLEAN — relative imports only"
```
Expected: `CLEAN — relative imports only`. (`block-registry.ts` imports `./blocks/types` — relative, fine.)

- [ ] **Step 3: Commit**

```bash
git add server/utils/email-marketing/render/
git commit -m "feat(email): port render core — block types, helpers, registry"
```

---

## Task 3: Port generic block renderers (22 files) + offer stub + trimmed barrel

**Files:**
- Create: `server/utils/email-marketing/render/blocks/{heading,text,button,image,divider,spacer,avatar,html-block,container,columns-container,email-layout,social,menu,header-block,footer-block,hero-section,feature-grid,countdown-timer,cta-banner,testimonial,review-stars,next-steps}.ts`
- Create: `server/utils/email-marketing/render/blocks/offer-html-generator.ts` (stub)
- Create: `server/utils/email-marketing/render/blocks/index.ts` (trimmed)

- [ ] **Step 1: Copy the 22 generic block files verbatim**

Run:
```bash
SRC=/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm/server/utils/blocks
DST=server/utils/email-marketing/render/blocks
for f in heading text button image divider spacer avatar html-block container columns-container email-layout social menu header-block footer-block hero-section feature-grid countdown-timer cta-banner testimonial review-stars next-steps; do
  cp "$SRC/$f.ts" "$DST/$f.ts"
done
echo "copied 22 generic blocks"
```

(Domain blocks `vehicle-*`, `aged-inventory-alert`, `new-arrival-banner`, `price-drop-alert`, `brand-badge`, `inquiry-summary`, `vehicle-of-interest`, `similar-vehicles`, `salesperson-card`, `appointment-details` are intentionally NOT copied.)

- [ ] **Step 2: Create the offer-html-generator stub** (replaces the automotive `~~/shared/offer-html-generator`)

```ts
// server/utils/email-marketing/render/blocks/offer-html-generator.ts
// Minimal stub for the automotive offers feature that html-block.ts references.
// The OEM-offers dynamic block is out of scope for the agency email module;
// this returns empty markup so html-block renders everything else normally.

export interface OfferData {
  id?: string
  title?: string
  description?: string
  ctaUrl?: string
  ctaText?: string
  [key: string]: unknown
}

export function generateOffersSectionHtml(_offers: OfferData[], _opts?: Record<string, unknown>): string {
  return ''
}
```

- [ ] **Step 3: Repoint `html-block.ts`'s two offer imports to the local stub**

Run:
```bash
sed -i '' "s#~~/shared/offer-html-generator#./offer-html-generator#g" \
  server/utils/email-marketing/render/blocks/html-block.ts
grep -n "offer-html-generator" server/utils/email-marketing/render/blocks/html-block.ts
```
Expected: both occurrences now read `./offer-html-generator` (the static `import { generateOffersSectionHtml, type OfferData }` and the dynamic `import('./offer-html-generator')`).

- [ ] **Step 4: Write the trimmed registration barrel**

```ts
// server/utils/email-marketing/render/blocks/index.ts
// Block registration barrel — importing this registers all generic block
// definitions with the registry. Generic blocks only (no automotive).
import './heading'
import './text'
import './button'
import './image'
import './divider'
import './spacer'
import './avatar'
import './html-block'
import './container'
import './columns-container'
import './email-layout'
import './social'
import './menu'
import './header-block'
import './footer-block'
import './hero-section'
import './feature-grid'
import './countdown-timer'
import './cta-banner'
import './testimonial'
import './review-stars'
import './next-steps'

// Sentinel re-export so renderers can `import { BLOCKS_LOADED } from './blocks'`
// — keeps the side-effect imports alive against Vite SSR tree-shaking.
export const BLOCKS_LOADED = true
```

- [ ] **Step 5: Verify no copied block still imports an external module**

Run:
```bash
grep -rnE "from '(@|~~/|node:)" server/utils/email-marketing/render/blocks/ \
  | grep -v "offer-html-generator" || echo "CLEAN — only relative imports remain"
```
Expected: `CLEAN — only relative imports remain`. If any other `~~/` import appears (e.g. a block referencing a domain helper), stub or remove that block from `index.ts`.

- [ ] **Step 6: Commit**

```bash
git add server/utils/email-marketing/render/blocks/
git commit -m "feat(email): port 22 generic block renderers + offer stub + trimmed barrel"
```

---

## Task 4: Port the document renderer + wrapper

**Files:**
- Create: `server/utils/email-marketing/render/flyhub-html-renderer.ts`
- Create: `server/utils/email-marketing/render/index.ts`

- [ ] **Step 1: Copy the renderer verbatim**

Run:
```bash
cp /Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/edm/server/utils/flyhub-html-renderer.ts \
   server/utils/email-marketing/render/flyhub-html-renderer.ts
grep -nE "from '(@|~~/|node:)" server/utils/email-marketing/render/flyhub-html-renderer.ts || echo "CLEAN"
```
Expected: `CLEAN` (it imports only `./blocks`, `./block-registry`, `./blocks/types`).

- [ ] **Step 2: Write the thin wrapper**

```ts
// server/utils/email-marketing/render/index.ts
// Public entry for the email render pipeline. Renders a flyhub document to
// email-safe HTML (pure TS — Workers-safe; no @flyhub/MJML deps) and
// substitutes {{merge_tags}} from `variables`.

import { renderFlyhubDocumentToHtml, isFlyhubFormat } from './flyhub-html-renderer'
import type { FlyhubDocument } from './blocks/types'

export interface RenderTemplateOptions {
  subjectLine?: string
  previewText?: string
  primaryColor?: string
  variables?: Record<string, string>
}

export function renderTemplateDocument(doc: unknown, opts: RenderTemplateOptions = {}): string {
  if (!isFlyhubFormat(doc)) {
    throw new Error('invalid_flyhub_document')
  }
  return renderFlyhubDocumentToHtml(doc as FlyhubDocument, {
    subjectLine: opts.subjectLine,
    previewText: opts.previewText,
    primaryColor: opts.primaryColor,
    variables: opts.variables,
  })
}

export { isFlyhubFormat }
export type { FlyhubDocument }
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/email-marketing/render/flyhub-html-renderer.ts server/utils/email-marketing/render/index.ts
git commit -m "feat(email): port document renderer + renderTemplateDocument wrapper"
```

---

## Task 5: Renderer unit tests (TDD — the correctness gate)

**Files:**
- Test: `test/utils/emailRenderHeading.test.ts`
- Test: `test/utils/emailRenderDocument.test.ts`
- Test: `test/utils/emailRenderMerge.test.ts`

- [ ] **Step 1: Write the heading render test**

```ts
// test/utils/emailRenderHeading.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'

// A flyhub document is a flat keyed map with a `root` EmailLayout whose
// childrenIds reference other blocks. Block type strings are capitalized.
function docWithHeading(text: string, level = 'h1') {
  return {
    root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h1'] } },
    h1: { type: 'Heading', data: { props: { level, text }, style: {} } },
  }
}

describe('renderTemplateDocument — heading', () => {
  it('renders the heading text inside the requested tag', () => {
    const html = renderTemplateDocument(docWithHeading('Welcome aboard', 'h1'))
    expect(html).toContain('Welcome aboard')
    expect(html).toMatch(/<h1[^>]*>/)
  })
  it('escapes HTML in heading text', () => {
    const html = renderTemplateDocument(docWithHeading('<script>x</script>'))
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;')
  })
  it('wraps output in a full HTML email document', () => {
    const html = renderTemplateDocument(docWithHeading('Hi'))
    expect(html).toContain('<!DOCTYPE html>')
    expect(html.toLowerCase()).toContain('<body')
  })
})
```

- [ ] **Step 2: Run — expect FAIL (module/render not wired)**

Run: `pnpm exec vitest run test/utils/emailRenderHeading.test.ts`
Expected: PASS if Tasks 2–4 are correct. If it FAILS with "available in upcoming update" placeholder text, the block registry lost its registrations — confirm `flyhub-html-renderer.ts` imports `BLOCKS_LOADED` from `./blocks` and that `void BLOCKS_LOADED` (or a reference) is present so the barrel isn't tree-shaken.

- [ ] **Step 3: Write the multi-block document test**

```ts
// test/utils/emailRenderDocument.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplateDocument, isFlyhubFormat } from '~~/server/utils/email-marketing/render'

describe('renderTemplateDocument — multi-block document', () => {
  it('renders heading + button + text in order', () => {
    const doc = {
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['a', 'b', 'c'] } },
      a: { type: 'Heading', data: { props: { level: 'h2', text: 'Title' }, style: {} } },
      b: { type: 'Text', data: { props: { text: 'Body copy here' }, style: {} } },
      c: { type: 'Button', data: { props: { text: 'Click me', url: 'https://example.com' }, style: {} } },
    }
    const html = renderTemplateDocument(doc)
    expect(html).toContain('Title')
    expect(html).toContain('Body copy here')
    expect(html).toContain('Click me')
    expect(html).toContain('https://example.com')
    // ordering: heading before button
    expect(html.indexOf('Title')).toBeLessThan(html.indexOf('Click me'))
  })

  it('renders an empty EmailLayout without throwing', () => {
    const html = renderTemplateDocument({ root: { type: 'EmailLayout', data: { childrenIds: [] } } })
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('throws on a non-flyhub document', () => {
    expect(() => renderTemplateDocument({ not: 'a doc' })).toThrow('invalid_flyhub_document')
    expect(isFlyhubFormat({ not: 'a doc' })).toBe(false)
    expect(isFlyhubFormat({ root: { type: 'EmailLayout', data: {} } })).toBe(true)
  })
})
```

> **Verified prop keys** (from the source blocks): Button reads `props.text` + `props.url`; Text reads `props.text`; Heading reads `props.level` + `props.text`. The test inputs above use these exact keys — no adjustment needed.

- [ ] **Step 4: Write the merge-field test**

```ts
// test/utils/emailRenderMerge.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'

describe('renderTemplateDocument — merge fields', () => {
  it('substitutes {{tokens}} from variables', () => {
    const doc = {
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h'] } },
      h: { type: 'Heading', data: { props: { level: 'h1', text: 'Hi {{first_name}}' }, style: {} } },
    }
    const html = renderTemplateDocument(doc, { variables: { first_name: 'Paul' } })
    expect(html).toContain('Hi Paul')
    expect(html).not.toContain('{{first_name}}')
  })

  it('leaves unknown tokens untouched', () => {
    const doc = {
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h'] } },
      h: { type: 'Heading', data: { props: { level: 'h1', text: '{{unknown}}' }, style: {} } },
    }
    const html = renderTemplateDocument(doc, { variables: { first_name: 'Paul' } })
    expect(html).toContain('{{unknown}}')
  })
})
```

- [ ] **Step 5: Run all three — expect PASS**

Run: `pnpm exec vitest run test/utils/emailRender*.test.ts`
Expected: all PASS. Fix any prop-key mismatches per the Step-3 note.

- [ ] **Step 6: Commit**

```bash
git add test/utils/emailRender*.test.ts
git commit -m "test(email): renderer unit tests — heading, multi-block, merge fields"
```

---

## Task 6: Templates DB layer

**Files:**
- Create: `server/utils/email-marketing/templates.ts`

- [ ] **Step 1: Write the DB layer**

```ts
// server/utils/email-marketing/templates.ts
// DB layer for email_templates. body_html is always (re)rendered from
// body_source on write via the pure-TS renderer.

import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { renderTemplateDocument, isFlyhubFormat } from './render'

export interface EmailTemplate {
  id: string
  name: string
  subject: string | null
  preview_text: string | null
  body_source: unknown
  body_html: string | null
  content_type: string
  client_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function renderHtml(bodySource: unknown, subject?: string | null, previewText?: string | null): string {
  if (!isFlyhubFormat(bodySource)) return ''
  return renderTemplateDocument(bodySource, {
    subjectLine: subject ?? undefined,
    previewText: previewText ?? undefined,
  })
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  return queryRows<EmailTemplate>(
    'SELECT * FROM email_templates ORDER BY updated_at DESC',
  )
}

export async function getTemplate(id: string): Promise<EmailTemplate | null> {
  return queryOne<EmailTemplate>('SELECT * FROM email_templates WHERE id = $1', [id])
}

export async function createTemplate(input: {
  name: string
  subject?: string | null
  preview_text?: string | null
  body_source?: unknown
  client_id?: string | null
  created_by: string
}): Promise<EmailTemplate> {
  const source = input.body_source ?? { root: { type: 'EmailLayout', data: { childrenIds: [] } } }
  const html = renderHtml(source, input.subject, input.preview_text)
  const row = await queryOne<EmailTemplate>(`
    INSERT INTO email_templates (name, subject, preview_text, body_source, body_html, client_id, created_by)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
    RETURNING *
  `, [
    input.name,
    input.subject ?? null,
    input.preview_text ?? null,
    JSON.stringify(source),
    html,
    input.client_id ?? null,
    input.created_by,
  ])
  return row as EmailTemplate
}

export async function updateTemplate(id: string, patch: {
  name?: string
  subject?: string | null
  preview_text?: string | null
  body_source?: unknown
}): Promise<EmailTemplate | null> {
  const existing = await getTemplate(id)
  if (!existing) return null

  const name = patch.name ?? existing.name
  const subject = patch.subject !== undefined ? patch.subject : existing.subject
  const previewText = patch.preview_text !== undefined ? patch.preview_text : existing.preview_text
  const source = patch.body_source !== undefined ? patch.body_source : existing.body_source
  const html = renderHtml(source, subject, previewText)

  return queryOne<EmailTemplate>(`
    UPDATE email_templates
    SET name = $1, subject = $2, preview_text = $3, body_source = $4::jsonb, body_html = $5, updated_at = NOW()
    WHERE id = $6
    RETURNING *
  `, [name, subject, previewText, JSON.stringify(source), html, id])
}

export async function deleteTemplate(id: string): Promise<void> {
  await execute('DELETE FROM email_templates WHERE id = $1', [id])
}
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint server/utils/email-marketing/templates.ts`
Expected: exit 0 (run `--fix` first if needed for comma/style).

- [ ] **Step 3: Commit**

```bash
git add server/utils/email-marketing/templates.ts
git commit -m "feat(email): templates DB layer (renders body_html on write)"
```

---

## Task 7: Templates CRUD API

**Files:**
- Create: `server/api/email/templates/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`

- [ ] **Step 1: `index.get.ts`**

```ts
// server/api/email/templates/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { listTemplates } from '~~/server/utils/email-marketing/templates'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const items = await listTemplates()
  return { items }
})
```

- [ ] **Step 2: `index.post.ts`**

```ts
// server/api/email/templates/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createTemplate } from '~~/server/utils/email-marketing/templates'

const Body = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().max(300).optional().nullable(),
  preview_text: z.string().max(300).optional().nullable(),
  body_source: z.any().optional(),
  client_id: z.string().uuid().optional().nullable()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const template = await createTemplate({ ...parsed.data, created_by: user.id })
  return { template }
})
```

- [ ] **Step 3: `[id].get.ts`**

```ts
// server/api/email/templates/[id].get.ts
import { requireAuth } from '~~/server/utils/auth'
import { getTemplate } from '~~/server/utils/email-marketing/templates'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const template = await getTemplate(id)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { template }
})
```

- [ ] **Step 4: `[id].patch.ts`**

```ts
// server/api/email/templates/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { updateTemplate } from '~~/server/utils/email-marketing/templates'

const Body = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().max(300).optional().nullable(),
  preview_text: z.string().max(300).optional().nullable(),
  body_source: z.any().optional()
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const template = await updateTemplate(id, parsed.data)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { template }
})
```

- [ ] **Step 5: `[id].delete.ts`**

```ts
// server/api/email/templates/[id].delete.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { deleteTemplate } from '~~/server/utils/email-marketing/templates'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  await deleteTemplate(id)
  return { ok: true }
})
```

- [ ] **Step 6: Lint + commit**

Run: `pnpm exec eslint --fix server/api/email/templates/ && pnpm exec eslint server/api/email/templates/`
Expected: exit 0.

```bash
git add server/api/email/templates/
git commit -m "feat(email): templates CRUD API"
```

---

## Task 8: Stateless render/preview endpoint

**Files:**
- Create: `server/api/email/templates/render.post.ts`

- [ ] **Step 1: Write the endpoint**

```ts
// server/api/email/templates/render.post.ts
// Stateless render of a flyhub document to email HTML — used by the editor's
// live preview (Phase 2a-ii) and for test sends. Does not persist anything.

import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { renderTemplateDocument, isFlyhubFormat } from '~~/server/utils/email-marketing/render'

const Body = z.object({
  body_source: z.any(),
  subject: z.string().optional().nullable(),
  preview_text: z.string().optional().nullable(),
  variables: z.record(z.string()).optional()
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  if (!isFlyhubFormat(parsed.data.body_source)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_flyhub_document' })
  }
  const html = renderTemplateDocument(parsed.data.body_source, {
    subjectLine: parsed.data.subject ?? undefined,
    previewText: parsed.data.preview_text ?? undefined,
    variables: parsed.data.variables
  })
  return { html }
})
```

- [ ] **Step 2: Lint + commit**

Run: `pnpm exec eslint --fix server/api/email/templates/render.post.ts && pnpm exec eslint server/api/email/templates/render.post.ts`
Expected: exit 0.

```bash
git add server/api/email/templates/render.post.ts
git commit -m "feat(email): stateless flyhub render/preview endpoint"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run all email-marketing tests**

Run: `pnpm exec vitest run test/utils/emailMarketing*.test.ts test/utils/emailRender*.test.ts`
Expected: all PASS (Phase 1's 13 + Phase 2a-i's ~8).

- [ ] **Step 2: Lint all new render + template files**

Run: `pnpm exec eslint server/utils/email-marketing/render/ server/utils/email-marketing/templates.ts server/api/email/templates/`
Expected: exit 0. (Ported block files may need `--fix` for comma/style — run `pnpm exec eslint --fix server/utils/email-marketing/render/` first. Do NOT rewrite block logic to satisfy lint; only formatting.)

- [ ] **Step 3: Live render check against the DB (no dev server needed)**

Create a throwaway script `scripts/_render_verify.ts`:
```ts
import { createTemplate, getTemplate, deleteTemplate } from '~~/server/utils/email-marketing/templates'
async function main() {
  const doc = {
    root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h'] } },
    h: { type: 'Heading', data: { props: { level: 'h1', text: 'Smoke {{name}}' }, style: {} } },
  }
  const t = await createTemplate({ name: '__render_smoke', body_source: doc, created_by: null as any })
  const fresh = await getTemplate(t.id)
  if (!fresh?.body_html?.includes('Smoke')) throw new Error('FAIL: body_html not rendered: ' + fresh?.body_html)
  console.log('OK: body_html rendered (', fresh.body_html.length, 'bytes)')
  await deleteTemplate(t.id)
  console.log('cleaned up ✅')
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/_render_verify.ts
rm scripts/_render_verify.ts
```
Expected: `OK: body_html rendered ( <n> bytes )` then `cleaned up ✅`. (Note: `{{name}}` stays literal here since no variables passed on create — that's fine; the test asserts the heading text rendered.)

- [ ] **Step 4: Final commit (if any lint formatting fixes were made)**

```bash
git add -A
git commit -m "chore(email): phase 2a-i lint + verification" || echo "nothing to commit"
```

---

## Out of scope (later phases — do NOT build here)

- Visual editor UI (Phase 2a-ii: full port of EdmFlyhubBuilder.vue + 6 sub-components, shadcn-vue → Nuxt UI v4 re-skin, `@flyhub` install + stub-alias build config).
- `campaigns` table, `campaign_recipients`, sending engine, queue pacing, cron (Phase 2b).
- Resend webhooks, tracking, suppression (Phase 3); public pages + opt-out (Phase 4).

## Phase 2a-i Definition of Done

- Migration 133 applied; `email_templates` present.
- Render pipeline ported under `server/utils/email-marketing/render/` — **no `@flyhub`/npm/MJML deps**, relative imports only.
- ~8 renderer unit tests passing (heading, multi-block ordering, merge fields, invalid-doc guard).
- Templates CRUD + stateless render endpoint working; `body_html` regenerated from `body_source` on every write (verified against the live DB).
- All new files lint-clean.
