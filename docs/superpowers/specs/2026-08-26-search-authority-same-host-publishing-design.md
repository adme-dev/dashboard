# Search Authority — same-host publishing and on-site injection options

Status: Design spec (R&D complete, no code changes)
Date: 2026-08-26
Default remains: **client subdomain** (`learn.<client>`) via Cloudflare for SaaS on `xeroflowpages.com`

## 1. Question

Can XeroFlow publish guides *inside* the client's website (`www.client.com.au/guides/…`)
with less friction than today's subdomain model, and can the same mechanism place
"feature posts" on the client's front page and keep the client's sitemap in step?

## 2. Constraints that decide the answer

1. **A page is only indexable if the client's `www` origin returns it with HTTP 200.**
   Googlebot renders JavaScript, but it renders the HTML *the origin served for that
   URL*. A Next.js/Dealer Studio site returns 404 for `/guides/anything`, so no amount of
   GTM/JS can turn that URL into an indexed page. JS can add *content and links* to
   pages that already exist; it cannot create pages.
2. **Only two things can make `www.client.com.au/guides/*` return our content:**
   a routing rule inside the client's web platform, or a proxy in front of `www` that
   intercepts that path. There is no third mechanism (DNS cannot route by path).
3. **Vercel's official guidance** is not to put a reverse proxy (Cloudflare or otherwise)
   in front of a Vercel deployment: it removes traffic visibility for their firewall /
   bot protection, adds a hop, and complicates caching. Dealer Studio builds on
   Next.js/React; treat Vercel-hosted as the likely case until confirmed per client.
4. **Google's position on subdomain vs subdirectory** (Mueller): both are fine, "use
   what works for your setup"; industry data (Backlinko, 11.8M SERPs) shows
   subdirectories tending to outperform for competitive terms. So same-host is
   *preferable* for ranking, not *required* for indexing.
5. **XeroFlow must never have edit access to a dealer CMS** (PRD §2.2 constraint) and
   must never become a single point of failure for a dealership's whole site.

## 3. Options evaluated

| # | Option | Client action | Indexable at `www/guides/*` | Blast radius | Verdict |
|---|---|---|---|---|---|
| A | **Subdomain via Cloudflare for SaaS** (shipped) | one CNAME (`learn`) | no — indexed at `learn.` | none (separate host) | **Default** |
| B | **Client-side rewrite rule** `/guides/*` → `publish.xeroflowpages.com` | one rewrite in their platform (Next.js `rewrites()` / `vercel.json` / Dealer Studio config) | **yes** | none — their platform stays the origin; if our publisher is down only `/guides/*` fails | **Offer per client where the platform allows it** |
| C | **Cloudflare for SaaS + custom origin, path-scoped Worker** — client CNAMEs `www` to us, we proxy everything, Worker serves `/guides/*`, passes the rest to the client's origin | change `www` CNAME (big ask) | yes | **whole site** goes through XeroFlow; conflicts with Vercel guidance; TLS/caching/bot-protection ownership shifts to us | Rejected for dealers; keep only for clients who already sit behind Cloudflare and ask for it |
| D | **GTM / JS "virtual pages"** (script creates `/guides/*` in the SPA, history API) | none | **no** — origin 404s the URL; Google indexes what the server returned | none | Rejected (PRD §2.3 already bans it) |
| E | **GTM-injected on-page content** (feature-post cards, nav link, related-guide blocks on existing pages) | GTM tag publish | n/a — adds links/teasers to *existing* indexed pages | bounded DOM insert with kill switch | **Adopt** — this is the "front page feature posts" ask |

Notes on C: Cloudflare's *custom origin server* for SaaS hostnames is now available on
Free/Pro/Business (was Enterprise-only), so the technical door is open — the reason to
reject it is ownership/blast radius, not capability.

## 4. Recommendation

1. **Keep A as the default.** Zero access, zero blast radius, one CNAME, already live.
2. **Add B as an opt-in "same-host mode" per site** (spec below). It is the only way to get
   `www/guides/*` without taking over the client's site, and for a Vercel/Next.js
   platform it is a five-line config change their developer can make in minutes.
3. **Build E for feature posts** on top of the existing Menu Agent bootstrap — same GTM
   tag, same config endpoint, one more bounded insertion type.
4. Do not build C or D.

## 5. Same-host mode (Option B) — design

### 5.1 What changes

- `search_authority_sites` gains `publishing_mode` (`'subdomain' | 'same_host'`, default
  `'subdomain'`) and `content_path_prefix` (default `/guides`). In same-host mode
  `content_hostname` = `canonical_hostname` (e.g. `www.knoxgwmhaval.com.au`).
- Publisher Worker: manifest lookup key stays `hosts/<hostname>/manifests/current.json`
  where `<hostname>` is the **Host header the client's platform forwards**. Vercel
  rewrites to an external destination forward the request with the *destination* host
  (`publish.xeroflowpages.com`) unless configured otherwise, so the Worker must also
  accept a tenant hint: `X-XeroFlow-Site: <public_id>` header set in the rewrite, or a
  per-client path on the publish host (`publish.xeroflowpages.com/s/<public_id>/guides/*`).
  **Decision: per-client path** — it needs no custom headers and works on any platform
  that can rewrite a path to a URL. The renderer keeps emitting the public canonical
  (`https://www.client.com.au/guides/<slug>`), never the publish-host URL.
- Renderer: canonical, OG, JSON-LD `mainEntityOfPage`, sitemap `<loc>` and internal links
  all use `https://<canonical_hostname><content_path_prefix>/<slug>`.
- Sitemap / robots:
  - The client's own `/robots.txt` and `/sitemap.xml` stay theirs — we never touch them.
  - We publish `https://www.client.com.au/guides/sitemap.xml` (served via the same rewrite)
    and register it in Search Console for the client's domain property (any verified
    property in the account can host sitemaps for the domain — Google cross-submission
    rules). Optionally the client adds one line `Sitemap: https://www.client.com.au/guides/sitemap.xml`
    to their robots.txt; not required.
  - The guides hub (`/guides/`) links every guide, so discovery does not depend on the
    sitemap alone.
- Menu Agent unchanged (href validation already allows `/guides/<slug>` on the content
  hostname — in same-host mode that *is* `www`).
- Measurement: no cross-subdomain concerns any more; the `publication_<uuid>` UTM marker
  still identifies CTA hand-offs.

### 5.2 Client-side setup (what we hand the client's developer)

Next.js (`next.config.js`):

```js
async rewrites() {
  return [
    { source: '/guides', destination: 'https://publish.xeroflowpages.com/s/<public_id>/guides' },
    { source: '/guides/:path*', destination: 'https://publish.xeroflowpages.com/s/<public_id>/guides/:path*' },
  ]
}
```

Vercel-only (`vercel.json`) equivalent, or the platform's own "proxy path" feature if
Dealer Studio exposes one. Non-Next platforms (WordPress/Nginx/Apache) get the equivalent
`proxy_pass` / `RewriteRule [P]` snippet. Connections shows the exact snippet with the
site's `public_id` filled in and a **Verify** button that fetches
`https://www.client.com.au/guides/healthz` and checks for the publisher's signature header.

### 5.3 Readiness gate

Same-host mode is only activatable when the verify call returns the publisher signature
from the client's `www` host. Until then the site stays in subdomain mode and publishing
targets `learn.`. Switching modes re-renders on next publish (snapshots are immutable);
we do not rewrite existing snapshots. A 301 map from `learn.<client>/guides/<slug>` →
`www.<client>/guides/<slug>` is emitted into the `learn.` manifest so old links keep
working.

### 5.4 Effort

~1 day: migration (2 columns), publisher path prefix (`/s/<public_id>`), renderer URL
base, Connections UI (mode toggle, snippet, verify), tests, runbook. No new infrastructure.

## 6. Feature posts on the front page (Option E) — design

The Menu Agent already proves the pattern: GTM loads a versioned script, it fetches a
bounded JSON config for the site, inserts marked nodes into configured selectors,
observes rerenders for 30 s, and removes only its own nodes when disabled.

Add a second insertion type, **`feature-block`**:

- Config: `{ enabled, selector, position: 'prepend'|'append'|'before'|'after', maxItems (1–3), template: 'cards'|'list' }`
  plus the server-chosen list of the newest *published* guides (title, excerpt ≤160
  chars, href, publishedAt, optional image URL from the approved snapshot).
- Rendering: plain `<section data-xeroflow-search-authority-feature="v1">` with
  `<a href>` cards, text content set via `textContent` (never `innerHTML`), styling via
  a scoped class and a few CSS custom properties the client can override. No images
  unless the snapshot has an approved one.
- Safety identical to the menu: selector allow-regex, hostname allow-list, kill switch,
  one block per page, idempotent across hydration.
- SEO reality: Google will see these cards after rendering and treat them as ordinary
  internal links to the guides — that is genuinely useful (crawl path + anchor text).
  They are **not** indexable content in their own right and must not be sold as such.
- Analytics: `feature_impression` / `feature_click` via the existing observed endpoint.

Effort: ~1 day (agent v2 script, config schema + PUT/GET, card UI in the dashboard, GTM
runbook addendum). Works in both subdomain and same-host modes.

## 7. What we will *not* claim to clients

- GTM cannot create indexable pages, canonical tags or vehicle schema (PRD boundary).
- Same-host mode does not make XeroFlow the host of their website; a rewrite is a
  delegation of one path, reversible by deleting one line.
- Neither mode requires XeroFlow to have dealer-CMS credentials.

## Sources

- Cloudflare for SaaS custom origin server (now Free/Pro/Business): https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/custom-origin/
- Vercel: "Should I use Cloudflare in front of Vercel?": https://vercel.com/kb/guide/cloudflare-with-vercel
- Vercel rewrites to external destinations: https://vercel.com/docs/rewrites and https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites
- Google on JS rendering / dynamic rendering as a workaround: https://vercel.com/blog/how-google-handles-javascript-throughout-the-indexing-process
- Google sitemap cross-submissions: https://developers.google.com/search/blog/2007/10/dealing-with-sitemap-cross-submissions and https://developers.google.com/search/blog/2008/02/cross-submissions-via-robotstxt-on
- Mueller on subdomain vs subdirectory: https://www.improvemysearchranking.com/subdomain-subdirectory-googles-john-mueller-clarifies/
- Dealer Studio builds on Next.js/React: https://www.dealerstudio.com.au/automotive-websites
