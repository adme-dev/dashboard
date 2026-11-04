# Storyboard resolution and compilation — T05

Local implementation on `adme-dev/video-storyboard-contracts-20261104`, based on `7fcbe121d589950a019178c27828f85f41c42f0a` (includes fetched `origin/main` `0a13cb061`). Independent task/spec review cleared after one fix pass; the scoped re-review found both Important findings addressed and no new blocker. No push, merge, deployment, provider generation or database migration is part of this slice.

## Implemented boundary

`POST /api/agency/video/projects/:id/storyboard/resolve` accepts only a saved revision ID and requested formats. It requires write authority, project access and the default-off storyboard flag. The resolver loads canonical revision/reference records and rechecks asset scope, current usage approval, content fingerprints and storage existence. It never accepts an arbitrary URL, R2 key, media measurement or approval from this request.

Measured readiness comes from a bounded byte probe through the existing audio-jobs Worker/container. The private service binding reads the exact owned object after ETag/size checks, sends bytes to local ffprobe and validates the returned media type/duration/dimensions. Prompt/requested duration and `duration_sec` columns are not measurement evidence. No media or row is changed. Missing service binding, unavailable bytes, changed fingerprints and unmeasured/short media block compilation. The local decode fixtures exercise actual ffprobe; hosted binding/container operation remains unverified and requires a separately authorized deployment.

The pure compiler creates the existing AV timeline lanes: video/still, voiceover, music, SFX, captions and Banner overlays. Timing is derived from integer frames. Repeated source uses receive distinct deterministic clip identities. Optional music can be explicitly omitted. Spoken copy requires a matching canonical voiceover script, reviewed timing and the complete measured recording interval (zero source-in through the final complete project frame); captions require reviewed timing contained in the selected speech cue. These are human-reviewed timing contracts, not automatically measured word alignment.

Each requested Banner format must exist and contain the exact copy, including whitespace, in a visible static text layer within the canvas and present throughout its cue. The existing Banner loader checks managed-font authority. Dynamic/transformed text, unavailable formats/fonts and incomplete required overlays block readiness. Per-format layout hashes are pinned. This structural check does not certify rendered glyph overflow, occlusion or safe areas; T08 owns rendered preflight and export inspection.

Compilation emits separate server-owned source/copy obligations with canonical binding hashes, expected clips, timing, exact text and layout contracts. The response returns only the proposal timeline/readiness; future application regenerates and persists obligations server-side. A pure comparison helper identifies affected source/timing/layout/copy/presence approvals independently of optional clip metadata. Timeline-schema parsing and existing trim operations retain advisory provenance. The helper includes visual source-mode changes and changed/added/removed ducking rules and their source audio, invalidating only affected target approvals. It is not installed as save/render enforcement in T05.

## Verification

- Initial focused compiler/resolver/route plus required timeline/AI regression: **70/70 tests across 6 files**. Review fixes added full-voice-range and render-affecting-edit regressions (RED → GREEN); independent scoped re-review passed **59/59 checks**.
- Storyboard, route, legacy timeline/editor and recipe/rail regression: **189/189 tests across 23 files**, including actual local media decode fixtures.
- Scoped lint passed for all new TypeScript modules/tests; container modules pass Node syntax checks. Standalone strict TypeScript reports the same 66 existing dependency/auto-import diagnostics and none in T05 modules.
- No full Nuxt build, browser journey, hosted service/container probe, render, production or provider acceptance is claimed.

Evidence logs: `.verification/video-t05/core.log`, `regression-final.log`, `review-red.log`, `review-green.log`, `types-final.log`. Test fixtures are synthetic; no customer/provider event or production data was created.

## Remaining gates

T06 owns atomic timeline application, receipt recovery and persisted obligation lineage. T07 owns storyboard editor controls and explicit review UX. T08 owns direct-save/render enforcement, adjusted-edit review and rendered copy/layout verification, including flag-off/restored versions. T09 owns released marketing claims. The feature remains dormant; saved reads and legacy timelines remain available.

The static Banner restriction is conservative: existing animated designs may need an owned static variant until supported rendered-layout review exists. Byte probing adds no generation but consumes the existing container's compute when enabled; deployment and hosted operational acceptance remain separate release actions.

The reviewer also checked a one-second-video/five-second-audio fixture: local FFmpeg 8 measured one second, so an initially suspected mixed-stream overstatement was not reproduced. The Debian Bookworm container image was not executed; its mixed-stream and hosted decode acceptance remains a release gate.
