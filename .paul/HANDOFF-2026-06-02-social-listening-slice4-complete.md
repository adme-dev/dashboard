# PAUL Session Handoff — Social Listening (Slice 4) complete + deployed

**Session:** 2026-06-02 — shipped **3c-2 schedules UI** then **all of Slice 4 (Social Listening)** end-to-end (design → 4 phases → production).
**Status:** Slice 4 fully merged to `origin/main` **and deployed to production**. The Social Suite (Slices 1–4) is now fully built. Everything new ships **dormant/gated**.

---

## TL;DR — what merged this session

| PR | Phase | Squash | Migration |
|----|-------|--------|-----------|
| #85 | Slice 3 / 3c-2 — scheduled-report management UI | `82f21072` | none |
| #91 | Slice 4a — Listening foundation (data model, owned projection, UI shell) | `e0ebf89f` | **156** |
| #94 | Slice 4b — 5 external source adapters + poll cron + worker | `2c48ee50` | none |
| #97 | Slice 4c — Groq enrichment + analytics dashboard | `dfa30ca7` | none |
| #99 | Slice 4d — gated alerting + client-portal surface | `307d8c59` | **158** |

Every PR: full **subagent-driven-development** (implementer subagent per task + final whole-diff review), TDD pure cores, **0 new type errors** (baseline ~1252), review findings fixed in-PR, worktrees cleaned up. Migrations 156 + 158 applied to prod Neon.

**🚀 Deployed to production 2026-06-02** — `origin/main 307d8c59` → deployment `46cc1d38` at `agency-dashboard-6cm.pages.dev`. Prod-verified: `/`→200, listening APIs→401 (auth-gated), `/api/cron/sync-social-listening`→401 (cron-secret), `/agency/social/listening`→200.

---

## What Slice 4 delivers

A per-client **brand-listening** layer = owned signals (Slice-2 inbox conversations/reviews) **+** five free off-property sources, unified into one searchable, sentiment-scored, topic-tagged feed with analytics and alerts.

- **4a foundation:** `social_listening_queries` + `social_listening_mentions` (mig 156). Pure `matchesQuery`/`bucketSentiment` (`app/utils/socialListeningMatch.ts`), owned-signal projection + injected store (`server/utils/socialListening/{types,ownedProjection,store}.ts`), query CRUD + `mentions.get` + `sync-owned.post` API, `useSocialListening` + `SocialListeningQueryManager` + `/agency/social/listening` page + nav.
- **4b adapters:** pluggable `ListeningSource` + pure `collectForQuery` + 5 adapters (`sources/{news,reddit,youtube,bluesky,mastodon}.ts`, each pure normalizer + injected fetch) + registry + poll cron `/api/cron/sync-social-listening` + companion worker `workers/social-listening-cron`. Each source **per-key/flag gated**; News/RSS + Mastodon SSRF-guarded (Mastodon has a private-host blocklist).
- **4c enrichment + analytics:** `socialListening/enrich.ts` (Groq batch classify → sentiment+topics, fail-safe) wired into the cron after upsert; pure `socialListening/analytics.ts` + `overview.get` + dashboard strip (sentiment / volume / share-of-voice / top topics) + days selector.
- **4d alerting + portal:** `socialListening/alerts.ts` (`dispatchListeningAlerts`) wired into the cron, **doubly dormant**; tenant-scoped `socialListening/portal.ts` + `client-portal/social/listening/{mentions,overview}.get` + `/portal/social-listening` page + portal nav (mig 158 `alerted_at`).

---

## What's LEFT (the remaining work)

1. **Wire `detectVolumeSpike` into alert dispatch.** It's built + unit-tested in `server/utils/socialListening/alerts.ts` but `dispatchListeningAlerts` currently only fires the **negative-sentiment** path. Wiring volume-spike needs a **per-query spike-dedupe marker** (so a sustained spike doesn't re-alert every 6h) — e.g. a `social_listening_queries.last_spike_alert_at` column (small migration) + per-query daily-count SQL in the dispatch. Small, well-scoped follow-up.
2. **Listening marketing-page sync** — add Listening to `app/pages/features/index.vue` + `[slug].vue` + `MarketingNav.vue`. This is part of a larger **deferred social-arc marketing catch-up**: the whole Inbox (2a–2d) + Reporting (3a–3c) + Listening arc was never synced to the public `/features` pages. One catch-up pass when convenient.
3. **Verify external API shapes live (4b).** The Reddit / YouTube / Bluesky / Mastodon request+response shapes are best-effort "verify-live" (coded from docs, same posture as the 3a Graph metric names). The **pure normalizers are the tested contract**; the fetch wrappers need a live smoke per source before trusting prod numbers. Safe to defer — all sources are dormant until keyed.
4. **(Optional) Broaden listening alert recipients.** v1 uses an explicit `SOCIAL_LISTENING_NOTIFY_ALLOWLIST` (safest). Could later fan out to CREATIVE-permission staff via `resolveUserPermissions` + `hasRole` (the anomaly pattern).

---

## Operator activation (NOT buildable in-session — yours; all gated)

Nothing collects, enriches, or alerts until you provision these. ⚠️ **Never flip an alert/send gate without explicit sign-off.**

### External listening sources (each independently gated; set what you want)
- **Reddit:** `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` (free Reddit app).
- **YouTube:** `YOUTUBE_API_KEY` (Google API key).
- **Bluesky:** `SOCIAL_LISTENING_BLUESKY_ENABLED=true`.
- **Mastodon:** `SOCIAL_LISTENING_MASTODON_INSTANCES=https://mastodon.social,https://...` (comma-sep; private hosts blocked).
- **News/RSS:** works with **no key** (only runs for queries that select `news`).

### Companion Worker (Pages has no `scheduled()`)
- Deploy `workers/social-listening-cron` (cron `40 */6 * * *` → POST `/api/cron/sync-social-listening`) + set `CRON_SECRET` matching the Pages project.
- **Deploy sub-workers from an isolated copy OUTSIDE the repo tree** (root `.wrangler/deploy/config.json` redirect breaks sub-worker `wrangler deploy`).

### Alerting (DOUBLY gated — both required, default off)
- `SOCIAL_LISTENING_ALERTS_ENABLED=true` **AND** `SOCIAL_LISTENING_NOTIFY_ALLOWLIST=owner@agency.com` (≥1 active team_member). Empty allowlist = no fan-out even with the gate on.

The **portal surface** (`/portal/social-listening`) and the **agency dashboard** are live as soon as listening data exists — no gate.

---

## Key facts / lessons for whoever resumes

- **Migrations this session: 156 (4a), 158 (4d).** 4a's was renumbered 155→156 mid-PR (a concurrent session merged `155-fix-quote-number-extraction.sql` during the build). **Always re-check `ls server/database/migrations | grep -oE '^[0-9]+' | sort -n | tail -1` at exec** — other sessions add migrations concurrently. Next free is likely **159** (verify).
- **Subagent file-writes WORKED this session** — the prior "denied" note in `[[subagent-driven-execution-notes]]` was stale and has been corrected. Full subagent-driven (implementer-per-task + reviewer subagents) ran end-to-end. Dispatch one implementer for task 1 and check the write lands; fall back to inline-implement only if denied.
- **Deploy gotcha (hit + recovered this session):** `pnpm deploy:production` builds the **working tree**, so deploy from a **fresh worktree at `origin/main` with its OWN `pnpm install` node_modules** — NOT a symlinked one (symlink shares `node_modules/.cache/nuxt` and breaks prerender). The deploy's **final CF-API step can fail transiently** (`code 8000000`) *after* a clean build + full upload — that's a Cloudflare-side error, not your code; **retry just the wrangler step** (`wrangler --cwd dist pages deploy --project-name agency-dashboard --branch main --commit-dirty=true`) — no rebuild needed since `dist/` is built. Don't trust the deploy exit code / `tee` pipeline; grep the log for `Deployment complete`.
- **`origin/main` advances under you** — a concurrent session periodically pushes (CRM P4.x, audio, plus this session's spec/plan docs). After the #99 merge, origin/main moved to a docs-only `…4d plan` commit; prod was deployed from the #99 merge commit which has all the code. `.env` lives only in the main checkout (copy it into a deploy/worktree).
- **typecheck:** `noUncheckedIndexedAccess` is ON — guard array/regex/Map index access (`m?.[1]`, `parsed[id] ?? {…}`). Two real new-file type errors were caught + fixed by the gate this session (news regex group, enrich Set generic). Bar is **0 errors in MY files** against the ~1252 baseline.
- **Other open PRs are NOT mine** — #101 (CRM AI), #100 (audio docs), #59 (spend), #19 (GA4), #11 (virtual office) belong to other sessions; left untouched.

## Specs / plans (committed)
- Spec: `docs/superpowers/specs/2026-06-02-social-listening-slice4-design.md`
- Plans: `docs/superpowers/plans/2026-06-02-social-listening-slice4{a,b,c,d}-*.md`

## Memory
`social-suite.md` (full detail) + `MEMORY.md` index updated through Slice 4 complete + deployed. Subagent-write correction in `subagent-driven-execution-notes.md`.

---

*Handoff created 2026-06-02. Resume: read this file. Quickest next = wire `detectVolumeSpike` (needs a spike-dedupe column) OR the Listening marketing-page sync. Slice 4 is DONE and in production.*
