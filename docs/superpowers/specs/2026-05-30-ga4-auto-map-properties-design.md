# GA4 Auto-Map Properties + Dedicated Page — Design

**Date:** 2026-05-30
**Status:** Approved (design), pending implementation plan
**Author:** Paul + Claude

This bundles two related GA4 connect-card improvements shipped together:
**(1)** move the GA4 card off the ad-platform connections grid onto its own page,
and **(2)** add an auto-map button to that card.

## Part 2 addition — dedicated GA4 page

**Problem:** the GA4 connect card currently renders at the top of
`/agency/social` (`app/pages/agency/social/index.vue:283`), sitting above the
ad-platform grid (Meta, Google Ads, Pinterest, …). GA4 is *website analytics*,
not ad spend — visually and conceptually it doesn't belong on that grid.

**Decision (locked):** give it a dedicated route **`/agency/social/ga4`**,
reached via a **"Google Analytics"** button in the `/agency/social` header.

- **New page** `app/pages/agency/social/ga4.vue` —
  `definePageMeta({ layout: 'agency', middleware: ['role-media'] })` (same as the
  social index), a header ("Google Analytics" + a back link to `/agency/social`),
  rendering `<SocialGa4ConnectCard />`.
- **Remove** `<SocialGa4ConnectCard class="mb-6" />` from
  `app/pages/agency/social/index.vue` (line ~283).
- **Add** a header button on `/agency/social`, beside the existing
  `View Spend Dashboard` button (`index.vue:231`):
  `<UButton to="/agency/social/ga4" variant="soft" icon="i-lucide-line-chart">Google Analytics</UButton>`.

The `SocialGa4ConnectCard` component itself is unchanged by the move — it just
renders on the new page instead of inline. The auto-map work below applies to it
in its new home.

---

## Problem

Mapping GA4 properties to clients one-by-one is painful at scale. The org has 57
clients (19 named `<Location> Motor Group`), and each dealer group has several
brand GA4 properties (`Northern KIA - GA4`, `Northern MG - GA4`, …). Manually
selecting a client for each of ~100 properties — and the property name never
literally equals the client name (the brand confuses search) — is slow and
error-prone.

## Goal

One **"Auto-map"** button on the GA4 connect card that matches each unmapped
property to a client by location prefix, **auto-saves the high-confidence
matches**, and leaves ambiguous ones blank for manual selection.

### Decision locked during brainstorming

| Decision | Choice |
|---|---|
| Match behaviour | **Auto-save high-confidence only**; ambiguous left blank for manual |
| Confidence definition | Exactly one client whose **location key** is a whole-word leading prefix of the property name |
| Where matching runs | **Client-side** (card already holds both lists in memory) — no suggestions endpoint |
| Out of scope | Fuzzy/typo matching, ML, remembering past manual corrections |

## Matching rule

1. **Client location key** = client `name` with a trailing `" Motor Group"`
   removed, case-insensitively. Clients without that suffix (e.g.
   `Pakenham Isuzu UTE`, `Victorian Motor Traders`) use the full name as the key.
2. A property **confidently matches** a client when the property's normalized
   name (lowercased, trailing `"- GA4"` / `"GA4"` stripped, whitespace collapsed)
   **starts with that client's location key as a whole-word prefix**.
   - `"Northern KIA - GA4"` → starts with `northern` → client `Northern Motor Group`. ✓
   - `"South Morang Ssangyong"` → no client key `south morang` → no match → blank.
   - `"Pakenham Isuzu UTE - GA4"` → starts with `pakenham isuzu ute` → exact key match. ✓
3. **High confidence = exactly one** client key is a leading whole-word prefix.
   Zero or >1 → leave blank. If multiple client keys are prefixes, the **longest**
   key wins, and it only auto-saves if that longest match is unique.
4. Brands (KIA, MG, RAM, Jeep, Isuzu, Ssangyong, …) are never enumerated — the
   rule only needs client location keys, so no brand list to maintain.

## Architecture

Three files + one test file. Each unit has one job.

### 1. `app/utils/ga4PropertyMatch.ts` (pure, unit-tested)

Auto-imported Nuxt app util. All matching logic, no I/O.

```ts
export interface MatchableProperty { propertyId: string; propertyDisplayName: string }
export interface MatchableClient { id: string; name: string }
export interface PropertyMatch { propertyId: string; clientId: string | null }

/** Returns one match per input property; clientId null when not high-confidence. */
export function matchPropertiesToClients(
  properties: MatchableProperty[],
  clients: MatchableClient[]
): PropertyMatch[]
```

Helpers (not exported): `locationKey(clientName)` (strip trailing " motor group"),
`normalizeProperty(name)` (lowercase, strip "- ga4"/"ga4" suffix, collapse spaces),
`isWholeWordPrefix(key, name)`.

### 2. `server/api/agency/social/ga4/map-bulk.post.ts`

Zod-validated bulk upsert. Same `ga4_property_map` ON CONFLICT (property_id)
upsert as the single-map endpoint, looped inside one request. Returns
`{ ok: true, mapped: <count> }`.

```ts
const schema = z.object({
  items: z.array(z.object({
    connectionId: z.string().uuid(),
    propertyId: z.string().min(1),
    propertyDisplayName: z.string().optional().default(''),
    clientId: z.string().uuid()
  })).min(1)
})
```

### 3. `app/components/social/Ga4ConnectCard.vue` (extend)

- Add an **"Auto-map"** button in the header (next to Connect / Sync now),
  disabled when there are no connections.
- On click: gather all properties across connections, call
  `matchPropertiesToClients(properties, clients)`, keep the confident ones
  (`clientId !== null`) that aren't already mapped, POST them to `map-bulk`,
  then `loadProperties()`. Toast summary:
  *"N properties auto-mapped, M need manual review."*
- Also reflect each auto-matched `clientId` into `selectedClient[propertyId]` so
  the dropdowns show the saved selection after refresh (already handled by
  `loadProperties()` seeding `selectedClient` from `maps`).
- Manual per-row dropdown + Save stay exactly as they are.

## Data flow

```
Auto-map click
  → matchPropertiesToClients(allProps, clients)   [pure, client-side]
  → filter clientId !== null AND not already in maps
  → POST /api/agency/social/ga4/map-bulk { items }  [bulk upsert]
  → loadProperties()  → maps refresh → dropdowns show saved + blanks remain
  → toast "N mapped, M manual"
```

## Error handling

- Bulk endpoint requires `requireAuth`; Zod rejects malformed items with 400.
- If the bulk POST fails, toast an error and leave state untouched (nothing was
  saved client-side; the upsert is all-or-nothing per request but each row is an
  independent upsert — a partial failure surfaces as the request error).
- If zero confident matches, toast *"No confident matches — map manually."* and
  don't POST.

## Testing

`test/app/utils/ga4PropertyMatch.test.ts` (Vitest):
- Confident match: `Northern KIA - GA4` + clients incl. `Northern Motor Group` → that client.
- The group's own property: `Northern Motor Group - GA4` → `Northern Motor Group`.
- No match: `South Morang Ssangyong` with no South Morang client → null.
- Exact-name exception: `Pakenham Isuzu UTE - GA4` → `Pakenham Isuzu UTE`.
- Case-insensitivity: mixed-case property/client still matches.
- Longest-prefix-wins / uniqueness: if two client keys are prefixes, the longer
  unique one is chosen; a tie at the longest length → null.

## Out of scope (YAGNI)

- Fuzzy/Levenshtein matching, ML, synonyms.
- Persisting/learning from manual corrections.
- A server-side "suggested matches" endpoint (matching is client-side).
- Bulk *unmap*.
