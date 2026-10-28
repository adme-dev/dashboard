# Unified XeroFlow Creative MCP — read-only R&D review

Date: 2026-10-28

## Verdict

Build **one unified external MCP entry point on the existing Worker → Pages authority path**, not six editor MCP servers and not a public proxy to upstream native MCP. Reuse the current OAuth, signed exact-request claims, fresh staff authority, catalog/execution registry, idempotency, audit and proposal/job patterns. Treat browser/WASM editing and native unattended execution as separate adapters behind typed XeroFlow operations; neither currently supplies a general shared-document bridge.

The new creative metadata discovery is the right first slice. Before broader assigned-staff or cross-editor use, add object-level authorization to any reused Banner/generation content paths and introduce scoped asset/document read/write APIs rather than widening existing ID-only lookups.

## What is safe to reuse now

- **Transport and authentication:** `workers/mcp-server/src/index.ts:86-114` signs every exact list/call request; `:116-231` is only MCP transport; `:237-296` delegates identity and consent to XeroFlow OAuth. Pages verifies the service credential, claim, body/tool binding, replay nonce and current owner authority (`server/utils/ai/mcp/requestClaim.ts:77-139`). Keep this boundary unchanged.
- **Fresh staff policy:** ordinary MCP calls re-read active identity, current role groups and active client assignments, failing closed (`server/utils/ai/mcp/staffAuthority.ts:123-181`). Ordinary writes require signed `mcp:write` and a writable role (`server/api/internal/mcp/call.post.ts:222-246`). Discovery and invocation share admission (`server/utils/ai/mcp/marketingPolicy.ts:191-228`).
- **Catalog discipline:** `server/utils/ai/mcp/registry.ts:52-141` is the suite inventory; `:188-275` requires one manifest and one schema-identical execution resolver per tool. Base `AiTool` registrations project automatically, but supplemental/ordinary execution still needs the corresponding route and staff-policy review—registration alone is not an authorization design.
- **Unified discovery:** `server/utils/ai/creativeWorkspace/catalog.ts:5-24` correctly labels governed suites, EDM metadata-only discovery and all six Flow editors as `browser_bridge_required`. `search_creative_workspace` returns stable `source:id` metadata only, with no file bytes, URLs, R2 keys, email HTML or editing claim (`server/utils/ai/tools/creativeWorkspace.ts:20-28`).
- **Native job primitives:** the private engine-job authority already binds saved project/client/revision, checks current access, fences attempts and validates output (`server/utils/banner/engineJobs.ts:70-113`, `:143-190`, `:285-296`). The render receipt explicitly says `editableImport: false` (`shared/bannerEngine.ts:62-70`). These are useful orchestration boundaries, not proof of hosted availability.

## New metadata-search review

No scope defect was found in the reviewed implementation:

- `resolveCreativeWorkspaceScope` requires actor identity and fresh CREATIVE authority (`server/utils/ai/creativeWorkspace/search.ts:31-39`). Application/chat calls reauthenticate and re-resolve fresh staff state, intersect current personal groups/assignments, and only a freshly verified owner receives owner scope (`server/utils/ai/marketing/readScope.ts:18-48`).
- Client and active-client predicates are inserted into every source query **before `ORDER BY/LIMIT`**, so pagination cannot leak or over-admit rows (`search.ts:79-107`). A requested client only narrows existing scope; zero assignments return no rows, never agency-wide results.
- Assigned video results preserve both client scope and asset-creator/project-creator visibility; only fresh ADMIN or verified owner removes that creator restriction (`search.ts:91-96`).
- Projection is limited to ref/source/id/name/clientId/type/updatedAt (`search.ts:66-76`). Names are marked untrusted at the tool boundary. Tests cover pre-limit scoping, revocation, video visibility, privacy and truthful truncation (`test/server/utils/creativeWorkspace.test.ts:20-116`).

Keep this implementation as the metadata baseline. Extend it with scoped content/download and document operations as separate reviewed tools; do not make `search_creative_workspace` return HTML, storage keys or arbitrary provider URLs.

## Capability and reuse boundaries

| Area | Real reusable capability now | Must not claim / next safe step |
|---|---|---|
| **Shared assets** | Scoped metadata across Banner assets/projects, audio, video and EDM templates; separate creative provenance aggregation exists. | There is no common document bus or universally scoped byte API. Add typed `read_asset_manifest` / authorized content streaming and revisioned import proposals using opaque refs. |
| **Banner Studio** | MCP project list/render status, proposed render and owner-only draft creation; image generation/upscale/compliance; bounded native preview job contracts. | Do not describe native preview as editable import. Add current actor/project/client/revision checks before reusing Banner project or render-job IDs for shared content. |
| **Video** | Governed project/model/source/job/timeline reads; proposals for generation, project creation, timeline review and creative-source promotion (`server/utils/ai/mcp/videoTools.ts:89-137`, `:291-328`). | AV visibility is admin/owner-all or creator-only, not generic assigned-client access (`videoTools.ts:166-185`). Preserve or deliberately redesign this rule; never substitute FilmFlow browser state for an AV timeline. |
| **Audio** | Voiceover and asynchronous music generation plus status, owned assets and scoped metadata discovery. | Generation is not SoundFlow multitrack editing. Add a session/stem document contract and explicit sample-rate/channel/timebase mapping before audio handoffs. |
| **EDM** | Scoped metadata search; existing HTTP template get/update uses `assertEmailClientAccess`, and HTML is re-rendered from `body_source` (`server/api/email/templates/[id].patch.ts:17-30`). | No MCP template editing or sending capability follows from metadata search. Add a separate reviewed draft proposal with `expectedUpdatedAt`, validated Flyhub document schema and private renderer; keep test-send/campaign-send outside generic editing confirmation. |
| **Six Flow editors** | Six authenticated, versioned browser/WASM applications; launcher/dock and a bounded read-only Motorstack asset island are reusable shell components. | Automatic XeroFlow project save/import is explicitly absent (`workers/craft-editors/README.md:21-24`). Startup/export checks are not server persistence, native-format conversion or cross-editor automation. |

## Authorization gaps to close before reuse

Severity below applies to the proposed unified reuse; it is not a claim of a new exploit in the currently admitted routes.

1. **HIGH — Banner object scope is currently too broad for a general shared API.** Banner project lookup is explicitly staff-wide and ignores `ctx`; render-status queries accept job IDs without a project/actor predicate (`server/utils/ai/mcp/bannerRunner.ts:150-168`, `:190-197`). Current MCP admission limits exposure, but a unified assigned-staff content API must not inherit these queries unchanged. Reuse the stronger engine-job `projectAccess` pattern or the new metadata scope and recheck after asynchronous I/O.
2. **HIGH — Generation identifiers are not a shared authorization contract.** Generation accepts optional `clientId` and persists it, while status loads an asset by ID (`server/utils/ai/mcp/generationRunner.ts:112-130`, `:190-218`, `:297-308`). Before exposing those assets cross-suite, resolve current CREATIVE + client/owner scope at invocation and status/result time, and reject client IDs outside the actor's assignments.
3. **MEDIUM — Browser SSO is not MCP authorization.** The creative Worker rechecks `/api/auth/me` and currently applies a small email allowlist (`workers/craft-editors/auth.mjs:113-135`). Keep its encrypted cookie handoff for interactive browser use only. Do not inject MCP OAuth tokens into WASM, browser storage, launch URLs or `postMessage`; broader rollout needs the same fresh role/client policy, not merely the email gate.
4. **MEDIUM — EDM updates need optimistic concurrency for MCP.** The current HTTP patch checks access but not an expected revision. An external editor proposal should bind template ID, client, current `updated_at`, source-document hash and exact operations so a stale return cannot overwrite newer human work.

## Native MCP versus browser/WASM bridge

These are complementary execution modes, not interchangeable transports:

- **External MCP:** terminate at the existing XeroFlow Worker. Pages validates authority and exposes only reviewed typed tools.
- **Interactive WASM:** launch an editor with an opaque, short-lived XeroFlow editor context containing source ref, revision and allowed operations—not credentials. Use a versioned `postMessage` protocol pinned by exact origin, source window, session nonce, message size and schema. Save/export returns bytes and a loss report to Pages as a **new proposed version**, never a silent overwrite. A synthetic canvas file drop is only an import attempt; actual Rust import, save/reopen and dirty-state behavior need per-editor acceptance.
- **Unattended native:** run upstream CLI/MCP inside isolated Linux compute, never inside Pages and never as an internet-accessible loopback/control listener. An adapter allowlists operations and arguments, sets read/write roots, resource/time/network limits, pins executable/fonts, and validates output hashes and current source revision. MCP batches are not assumed atomic; duplicate documents/proposals and explicit partial-outcome handling remain necessary.

Local native MCP/control proofs for PhotoCraft, VectorCraft, EffectCraft and FilmCraft support bounded adapters only. FigCraft/SoundCraft do not acquire runtime acceptance from those proofs. Likewise, the wire vocabulary reserves six engine IDs, but executable hosted submissions currently accept only four registered engine IDs and still require trusted capability pins (`shared/bannerEngineJobs.ts:45-57`). Reserved IDs, successful local synthetic fixtures and a hosted uncertain attempt are not production availability; the current rollout notes keep accepted proof lists empty and admission unqualified (`docs/banner-studio/editable-artwork/CRAFT-HOSTED-ROLLOUT-20261028.md:37-54`).

## Recommended delivery order

1. **Now:** keep the two metadata tools; retain their scope/privacy tests. Document that browser bridge and file access are false. Correct stale comments in `server/utils/ai/mcp/scope.ts` when next editing source—the route/runtime now always enforce ordinary write scope.
2. **Shared content slice:** add scoped manifest/content reads and revisioned import/export proposals for Banner, audio, video and EDM. Bind `actor + source ref + client + project + revision + hash + MIME/size`; return explicit truncation, unsupported-feature and loss reports.
3. **One browser editor pilot:** prove PhotoFlow or VectorFlow open → import → edit → export → server proposal → human apply/undo → reopen. Keep the original native document as a versioned asset and flattened output labelled as such.
4. **One native pilot:** reuse the private job authority for a narrowly allowlisted Photo/Vector operation after hosted qualification. Add Effect/Film only with their own accepted runtime and interchange contracts; Fig/Sound remain unproved until separately tested.
5. **Only then:** add cross-app handoffs. Every tool description and result should distinguish `metadata`, `browser_session`, `proposal`, `queued`, `succeeded`, `uncertain`, `flattened`, `editable`, `review_required` and `provider_unavailable`; never infer success from transport HTTP 200, tool discovery or a downloaded file.

## Review boundary

Read-only source/docs inspection only; no repository files changed, no tests executed, no credentials read and no deployment performed. Existing dirty native/editor work was preserved.
