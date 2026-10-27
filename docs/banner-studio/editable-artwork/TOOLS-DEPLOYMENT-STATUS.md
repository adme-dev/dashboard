# Craft tool deployment status — 28 October 2026

**The complete Craft toolset is not live in XeroFlow.** The existing Banner editor and its PNG/JPG/GIF export workflow are separate from native Craft execution.

| Tool | Implemented integration | Hosted availability |
|---|---|---|
| PhotoCraft | Pinned Linux runtime, native document tests, manual text bridge, private preview-job contract and service | Private canary deployed; execution disabled. No hosted native acceptance or production activation. |
| VectorCraft | Pinned Linux runtime, native document tests, private preview-job contract and service | Same disabled private canary; no hosted native acceptance or production activation. |
| EffectCraft | Reserved engine identifier only | No qualified adapter or deployed integration. |
| FilmCraft | Reserved engine identifier only | No qualified adapter or deployed integration. |
| FigCraft | Reserved engine identifier only | No qualified adapter or deployed integration. |
| SoundCraft | Reserved engine identifier only | No qualified adapter or deployed integration. |

Read-only Cloudflare verification at 2026-10-27 21:45 UTC confirmed `banner-engine-native-canary`, version `90f29fcc-73b6-461a-922d-5181b2ca061b`, deployment `4dca3f63-ea82-429c-aeb2-c9b74feb01ec`, `BANNER_NATIVE_CANARY_ENABLED=false`, workers.dev disabled and preview URLs disabled. The existing Wrangler session refreshed normally; no new login was requested. This verifies configuration, not successful native execution. Evidence: `/private/tmp/banner-canary-worker-readback.json`.

The two implemented engines currently return validated PNG preview evidence (`editableImport:false`), not arbitrary editable Banner documents. The manual companion text bridge has separate local round-trip evidence. Existing XeroFlow video and audio features do not establish FilmCraft, EffectCraft or SoundCraft integration.

The prepared next hosted action is the bounded synthetic native canary qualification described in [release verification](RELEASE-VERIFICATION.md#explicit-approval-boundaries). Automatic review previously rejected enabling that action because of potential external compute cost and irreversible one-time consumption; it remains unexecuted. Live AI-provider qualification is separately blocked and production OpenAI credentials were absent at the last verified check. Broad continuation was not treated as approval of either rejected action.

The current protected-ingestion increment remains a release candidate; see [integration evidence](OWNED-INGEST-INTEGRATION.md). Its tests do not activate any Craft tool. Complete reconstruction, the other four adapters and print acceptance remain open.
