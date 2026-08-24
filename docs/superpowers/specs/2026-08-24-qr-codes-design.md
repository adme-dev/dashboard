# QR Code Generator — Design Spec

**Date:** 2026-08-24
**Requested by:** Tina Yu (Slack, #C08UE9E6PNH) for Paul & Rob
**Status:** approved direction, pre-implementation

## Goal

Bring QR code generation in-house so the agency owns the data and the redirects, removing reliance on a third-party QR site. Every printed code must keep working when the landing page moves, and every scan must be counted.

## Requirements

Must-have (from brief):
1. **SVG export** — vector output sharp at any print size (PNG also offered for convenience).
2. **Dynamic linking** — the code encodes a short redirect URL; the destination is editable at any time, including to a different domain, with no reprint.
3. **Scan tracking** — total scans plus date-specific series per code.

Value-add (in v1):
4. **Visual customisation** — templates + pattern/eye styles + colours + centre logo (matches the reference screenshot).
5. **Organised assets** — codes live under a client, optionally inside client-scoped folders.
6. **Enhanced insights** — country (from `cf-ipcountry`) and device / OS / browser (from User-Agent). No raw IP stored.

Decisions taken:
- Short URL host: `https://app.xeroflow.io/q/<code>` (Nitro public route, zero extra infra).
- Custom/client short domains: **not in v1**. `qr_codes.domain` is nullable and reserved so it can be added without touching printed codes.
- Placement: new `/agency/qr-codes` page + a "QR Codes" tab inside `/agency/clients/[id]`.

## Architecture

```
Browser (editor)          Nitro (Cloudflare Pages)                  Data
──────────────            ────────────────────────                  ────
QrEditor.vue  ──preview──▶ shared utils/qr renderer (isomorphic)
      │ save                        │
      ▼                             ▼
POST /api/agency/qr-codes ──▶ INSERT qr_codes ──▶ kvPut(qr:<code>)   Postgres + KV
GET  /api/agency/qr-codes/:id.svg ──▶ render from stored style       (no R2 needed)

Phone scan ──▶ GET /q/:code ──▶ kvGet → (miss) DB ──▶ 302 destination
                                   └─ waitUntil: INSERT qr_scans
```

### Rendering module — `shared/qr/` (isomorphic, no DOM)
- `matrix.ts` — thin wrapper around the `qrcode` npm package (`QRCode.create()` gives the module matrix; pure JS, runs on Workers). Error correction defaults to `Q`; `H` when a logo is set.
- `render-svg.ts` — `renderQrSvg(matrix, style): string`. Style schema (Zod, in `shared/qr/style.ts`):
  - `pattern: 'classic' | 'rounded' | 'thin' | 'smooth' | 'circles'`
  - `eye: 'square' | 'rounded' | 'circle'`
  - `fg`, `bg` (hex), `eyeFg` optional, `margin` (modules)
  - `logo?: { url, sizePct (10–25), padding }` — centre knock-out; logo embedded as `<image href=…>` (data URI on export so the SVG is self-contained).
- `templates.ts` — named presets (Default, Facebook, Instagram, Rocket, Shop, Info…) = a style + optional built-in icon.
- Used by both the Vue editor (live preview) and the server export endpoints, so a stored `style` JSON always reproduces the identical file.

### Data model — migration `337_qr_codes.sql`
```sql
CREATE TABLE qr_folders (
  id UUID PK, client_id UUID NOT NULL REFERENCES agency_clients ON DELETE CASCADE,
  name TEXT NOT NULL, created_at, updated_at, UNIQUE (client_id, name));

CREATE TABLE qr_codes (
  id UUID PK,
  client_id UUID NOT NULL REFERENCES agency_clients ON DELETE CASCADE,
  folder_id UUID NULL REFERENCES qr_folders ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,                 -- 7-char base58 slug, immutable
  domain TEXT NULL,                          -- reserved for custom short domains
  name TEXT NOT NULL,
  destination_url TEXT NOT NULL,             -- editable; http(s) only
  style JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  scan_count INTEGER NOT NULL DEFAULT 0,     -- denormalised for list views
  last_scanned_at TIMESTAMPTZ,
  created_by UUID, created_at, updated_at);
CREATE INDEX ON qr_codes (client_id, folder_id);

CREATE TABLE qr_destination_history (
  id BIGSERIAL PK, qr_code_id UUID REFERENCES qr_codes ON DELETE CASCADE,
  old_url TEXT, new_url TEXT NOT NULL, changed_by UUID, changed_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE qr_scans (
  id BIGSERIAL PK,
  qr_code_id UUID NOT NULL REFERENCES qr_codes ON DELETE CASCADE,
  client_id UUID NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  country TEXT, device_type TEXT, os TEXT, browser TEXT,
  ip_hash TEXT,                              -- sha256(ip + daily salt); unique-scan estimate
  referrer TEXT, ua TEXT);
CREATE INDEX ON qr_scans (qr_code_id, scanned_at DESC);
CREATE INDEX ON qr_scans (client_id, scanned_at DESC);
```
`code` generation: 7 chars from a base58 alphabet via `crypto.getRandomValues`, retried on unique-violation. Slug is never derived from the name and never changes.

### Redirect — `server/api/q/[code].get.ts` → served at `/q/:code`
1. Validate slug shape (`/^[1-9A-HJ-NP-Za-km-z]{7}$/`), else 404 page.
2. `kvGet('qr:<code>')` → `{ id, clientId, url, active }`; on miss read DB and `kvPut` with 24 h TTL. Any mutation deletes the KV key.
3. If inactive or missing → 404 branded page (dark, same styling as `track.get.ts`), `noindex`.
4. Record scan inside `event.waitUntil` (CF `context.waitUntil` via `event.context.cloudflare`); fall back to fire-and-forget promise locally. Never blocks the redirect.
5. `302` with `Cache-Control: no-store` (must not be cached — destination is editable).
6. Excluded from RBAC middleware like the other `/api/public` and webhook routes; no cookies read.

Scan enrichment: `country = cf-ipcountry`; device/OS/browser via a small UA classifier (`server/utils/qr/ua.ts`, ~60 lines, no dependency); `ip_hash = sha256(cf-connecting-ip + salt(YYYY-MM-DD))`.

### Agency API — `server/api/agency/qr-codes/`
All routes use `requireClientTrackingAccess(event, clientId)` (management roles see all clients; scoped roles only assigned clients — `accessibleClientIds()` for lists). This helper is imported as-is from `server/utils/tracking/analytics-access.ts`; the module is renamed to `server/utils/client-access.ts` with a re-export shim so tracking imports keep working.

| Method & path | Purpose |
|---|---|
| `GET /` `?clientId&folderId&search` | list with scan_count, last_scanned_at, 7-day sparkline |
| `POST /` | create (name, clientId, folderId, destinationUrl, style) → returns code + short URL |
| `GET /:id` | detail incl. destination history |
| `PATCH /:id` | rename, move folder, change destination (writes history, clears KV), toggle active, update style |
| `DELETE /:id` | delete (cascade scans) |
| `GET /:id/export.svg` / `export.png?size=` | server-rendered download. PNG via `resvg-wasm` on Workers; if bundle size proves a problem the PNG path falls back to client-side canvas from the SVG |
| `GET /:id/analytics?from&to` | totals, unique estimate, daily series, top countries, device/OS/browser breakdown |
| `GET/POST/PATCH/DELETE /folders` | folder CRUD, client-scoped |

Validation: Zod schemas in `shared/qr/style.ts` and `server/utils/qr/schemas.ts`. `destination_url` must parse as `http:`/`https:`; block `localhost`, private IP literals, and `app.xeroflow.io/q/` (no redirect loops).

### UI
- **`/agency/qr-codes`** — left rail: client picker + folders; main: card grid (live SVG thumbnail, name, short URL with copy, scan count, 7-day sparkline, active badge). Toolbar: search, New folder, New QR code.
- **Editor (`USlideover`)** — fields: Name, Client, Folder, Destination URL; then the style panel mirroring the screenshot: *Templates* row, *Pattern and Style* row (Classic / Rounded / Thin / Smooth / Circles), *Eyes*, colours (foreground/background/eye), Logo upload (goes through existing `uploadFile` with a new `qr-logos` category, ≤ 512 KB PNG/SVG). Live preview on the right updates on every change. Uses `UFormField`, `USelectMenu`, `UInput`; follows the `frontend-design` skill before coding.
- **Detail page `/agency/qr-codes/[id]`** — large preview + download SVG/PNG buttons; short URL; destination with inline edit + history; analytics: KPI row (total, unique est., last 7 d, last scanned), daily line chart (Unovis), country bar list, device/OS/browser donuts. Date range picker (`UPopover`+`UCalendar`).
- **Client tab** — `QR Codes` tab on `/agency/clients/[id]` rendering the same grid filtered to that client.
- **Marketing** — add "Dynamic QR Codes" to `features/index.vue`, `features/[slug].vue` (3–4 sections), and `MarketingNav.vue`.

Components: `app/components/qr/QrGrid.vue`, `QrCard.vue`, `QrEditor.vue`, `QrStylePicker.vue`, `QrPreview.vue`, `QrAnalytics.client.vue`, `QrFolderRail.vue`. Composable `useQrCodes()`.

### Error handling
- Redirect path never throws to the scanner: any DB/KV failure with an unknown code → 404 page; scan-log failure is logged and swallowed.
- Editor surfaces API errors via `useToast()`; destination validation errors show under the field.
- Export endpoints 404 for codes the user cannot access (same gate as detail).

### Testing (Vitest)
- `shared/qr`: renderer snapshot tests per pattern/eye combo; logo knock-out geometry; style schema rejects bad hex / oversized logo.
- Slug generator: alphabet, length, collision retry.
- Redirect handler: valid → 302 + scan row; inactive → 404; malformed slug → 404 without DB hit; KV hit skips DB.
- UA classifier table tests.
- API: access gate (scoped role on unassigned client → 403), destination change writes history and clears KV, loop/SSRF URL rejected.
- Analytics query: daily series fills missing days with 0.

## Delivery slices (one PR each)
1. **Foundation** — migration, `shared/qr` renderer + templates, slug, redirect route + scan logging, export endpoints, CRUD + folder APIs, tests.
2. **Library & editor UI** — page, grid, folder rail, editor with live preview, downloads, client tab.
3. **Analytics & marketing** — analytics endpoint + detail page charts, destination history UI, marketing pages, feature flag `QR_CODES_ENABLED` removed once verified.

## Out of scope (v1)
Custom short domains, UTM auto-append, city-level geo, bulk CSV creation, client-portal visibility, MCP tools (all schema-compatible follow-ups).
