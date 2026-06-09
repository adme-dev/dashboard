# AI Video Generation — Slice 2A: Cloudflare AI Gateway transport swap

**Date:** 2026-06-09
**Status:** Approved for planning
**Branch:** `feat/ai-video-generation-muapi` (continue) → may rename
**Builds on:** Slice 1 (muapi adapter, dormant, merged+deployed). Spec: `2026-06-09-ai-video-generation-muapi-design.md`.

## Summary

Swap the video-generation transport from **muapi.ai** to **Cloudflare AI Gateway
(Workers AI `env.AI.run`)** as the primary, with **fal.ai** as the portable
fallback, and **retire muapi as the default**. Driven by a 3-way transport spike
(CF AI Gateway / aggregators / direct): CF is the lowest-overhead fit for our
stack (same `env.AI.run` binding we already use for audio, unified billing,
per-tenant `cf-aig-metadata`, dollar spend-limit backstop), and muapi turned out
production-risky (1.6★ parent, thin catalog, and **unsigned webhooks — which our
Slice-1 HMAC verification would reject**). fal.ai is the mature aggregator
fallback (broadest catalog, **ED25519-signed** webhooks, presigned-R2 image input).

The Slice-1 `VideoGenerationProvider` boundary makes this a **swap, not a rewrite**.

## Decisions

1. **Primary transport: CF AI Gateway via Workers AI `env.AI.run("provider/model", input)`.**
   Synchronous blocking call (20–90s) inside the queue consumer (which can run up to
   15 min) — returns a video URL we download to R2. **No webhook/reconcile needed for
   the CF path** (it reuses the existing synchronous "poll-returns-succeeded → finalize
   inline" path the mock provider already exercises).
2. **Portable fallback: fal.ai (`falProvider`).** Queue + ED25519-signed webhook
   (verifiable in a Worker via JWKS), presigned-R2 `image_url` input. Async path
   (submit → webhook/reconcile), reusing the Slice-1 machinery. Used when CF is
   unavailable or for models not in CF's catalog.
3. **Retire muapi as default.** Deregister `muapiProvider` from the default provider
   map; keep the file + tests as reference (documents the unsigned-webhook
   incompatibility). Not deleted (cheap to keep; zero cost when unregistered).
4. **Worker supports both completion models** (already true): synchronous providers
   (CF, mock) finalize inline; async providers (fal) submit→ack→webhook/reconcile.
5. **Model registry swap:** replace the muapi models with CF AI Gateway models
   (`provider: 'aigateway'`, id = the CF `"vendor/model"` string) and fal models
   (`provider: 'fal'`). Add `surface: 'tenant' | 'internal'` and `modality:
   'i2v' | 't2v' | 'i2v+t2v'` fields (lays the groundwork for the Slice-2B i2v-only
   enforcement; in 2A we only ADD the fields + seed correct values).
6. **Image input:** presigned R2 URL as the model's image field (CF + fal both fetch
   it). This is also the resolution of the Slice-1 i2v source-URL gap, but the full
   approved-asset/source-still UX is Slice 2B.
7. **Storage:** Neon only (no D1). No Durable Object (Slice 2B's pre-flight reserve
   uses a Neon transaction).

## Scope

**In (Slice 2A):**
- `aiGatewayProvider` (synchronous, injected AI binding) behind the existing boundary.
- `falProvider` (async, injected fetch; ED25519 webhook verify helper).
- Worker: select provider; CF synchronous path finalizes inline; register
  `{ aigateway, fal, mock }` (NOT muapi) keyed by `job.provider`; per-tenant
  `cf-aig-metadata` on the CF call.
- Model registry: CF + fal models seeded; `surface` + `modality` fields added;
  `muapi/*` entries removed from the default selectable set.
- fal webhook endpoint variant (ED25519/JWKS) OR generalize the Slice-1 webhook to
  verify per-provider signatures. Reconcile cron extended to poll fal too.
- No migration (registry + provider are code; jobs table already has the columns).

**Out (Slice 2B — next plan):**
- i2v-only **tenant enforcement** end-to-end (endpoint + UI hide `internal`/t2v).
- **Approved-asset** enforcement (replace hardcoded `loadVideoGenerationSourceAssets`)
  + source-still UX (the Slice-1 inert-i2v fix).
- **Pre-flight per-tenant reserve→commit→release** budget (Neon transaction),
  replacing the post-hoc `monthlyCapCents` check.
- `spend_ledger` audit (deferred until billing need).

## Architecture & flow

```
Editor slideover → POST jobs.post (gated, compliance, cost, idempotency) → enqueue
Worker (queue consumer):
  provider = providers[job.provider]            // 'aigateway' | 'fal' | 'mock'
  CF/mock (synchronous):
    submit() blocks (env.AI.run / mock) → poll() returns succeeded
      → finalize inline (download → R2 → video_assets → succeeded)
  fal (async):
    submit() → request_id → ack → fal webhook (ED25519) OR reconcile → finalize
```

`aiGatewayProvider.submit()` calls the injected AI binding
`ai.run(model, { prompt, image, duration, aspect_ratio, ... }, { metadata:
{ tenantId, jobId } })`, returns the result; `poll()` returns the stored result
(synchronous-complete). Unit-tested with a mock `ai.run`.

`falProvider.submit()` POSTs to fal queue with `fal_webhook`, returns `request_id`;
`poll()` GETs fal status/result. Webhook verified via ED25519/JWKS.

## Verify-live (operator, BEFORE flag-flip — not part of the build)

1. One real `env.AI.run` i2v call (e.g. Seedance/Hailuo) against a presigned R2 car
   image — confirm it returns a video, latency, and **actual per-clip cost**; correct
   the registry model IDs/params if they differ from the seeded (R&D-doc-sourced) values.
2. Confirm CF spend-limits cover video; set an **account-wide $ backstop** + rely on
   `cf-aig-metadata` for per-tenant attribution.
3. fal: confirm model slugs + ED25519 JWKS verification against a real callback.
4. Ensure the `video-generation` worker has an **`[ai]` AI binding** (like audio-jobs).

## Testing

- `aiGatewayProvider`: request shaping (model, image URL, metadata), result parsing,
  synchronous-complete behavior — injected `ai.run` mock.
- `falProvider`: submit request shape + `request_id`, poll mapping, ED25519 webhook
  verify (sign with a test key, verify true/false).
- Worker: CF synchronous job finalizes inline; fal job left running for webhook;
  provider selection; muapi NOT registered.
- Registry: CF + fal models present with `surface`/`modality`; muapi absent from
  default selectable; mocks retained.
- Keep all Slice-1 tests green (mock path unchanged).

## Risks / notes

- CF video specifics (model IDs, `input` field names, sync-vs-async per model,
  pricing) are **verify-live** — encapsulated in `aiGatewayProvider` + registry.
- Some CF models may be async (Sora/Veo) — out of tenant scope (those are t2v/internal).
  Tenant i2v models are the blocking-call kind.
- fal returns no per-job `$` — cost reconciled from `duration × rate` (registry rate),
  unlike muapi's `amount_usd`. Acceptable; the pre-flight reserve (2B) is the real cap.
- The `createVideoAsset` auto-import name collision found during the Slice-1 deploy
  should be cleaned up here (rename our `video-generation/createAsset.createVideoAsset`).
</content>
