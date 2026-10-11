# Page Studio visual feedback — decisions and first work

Date: 12 October 2026.
Status: documented product direction and recommended implementation order;
product implementation has not started. This document does not activate features.

## Purpose and source

Paul wants Page Studio to understand what an editor points at, accept several
visual review comments in one request, and keep each client's branding consistent.
The immediate priority is accurate targeting and inspectable agent context while
preserving the newly released Fantasy Limo showcase.

The supplied [original PRD](../research/2026-10-12-page-studio-visual-feedback-original-prd.md)
is preserved byte-for-byte from `/Users/paulgiurin/Downloads/Untitled.md`.
It proposes five features: rich context, selection cycling, pinned comments,
annotation and design systems. Its Claude Desktop findings are supplied static
research, not independently verified runtime behaviour. They motivate the design;
they are not dependencies or proof that our hosted implementation works.

This plan supplements the original with narrower sequencing and acceptance gates.
The original remains a reference, not an executable implementation plan.

## Start first

| Order | Work | Result | Completion evidence |
| --- | --- | --- | --- |
| 1 | Hosted context contract and targeting fixtures | An explicit path from Fantasy's selected element to the hosted model, with repeatable heading/link/card/mobile examples | Trace strict admission and model messages; record intended versus actual target; preserve typed proposal validation |
| 2 | Sanitised text context for one selection | The agent sees bounded attributes, layout/type styles, token matches and a readable element path | Composer preview, submitted request and hosted model messages contain the same sanitised context; privacy, byte-budget and compatibility tests pass |
| 3 | Identity and context regression tests | Regression coverage for target/frame isolation, hostile delimiters and sensitive-data suppression | Exact target/frame assertions, delimiter-escape cases, sensitive-input fixtures and UTF-8 limits |

These three items form the first implementation slice. It is text-only: capture
pixels, raw HTML, new persistent records and sharing are outside this slice.
Use Fantasy locally first, then the existing controlled staging environment.
Record an initial accuracy baseline without claiming a representative ten-site
result; expand to ten varied client sites before a broad rollout.

### Verified source boundaries

Read-only source inspection at native main
`f678ba8dd61fdd5e67523b826c138c51dd80540b` found important differences from the
PRD's current-state description. Paths below are relative to the native repository.

| Boundary | Evidence | Implication |
| --- | --- | --- |
| Context and source | `packages/protocol/src/index.ts:149`, `:158`, `:478`; `packages/source/src/browser.ts:72`, `:94`, `:236` | Five-field element context exists, but source is already a separate field with React debug/sourcemap discovery and a four-level path. Extend these rather than duplicating them; Astro/production availability is unresolved. |
| Frame extraction and freshness | `packages/overlay/src/surface.ts:406`; `packages/overlay/src/frame-agent.ts:319`; `packages/overlay/src/picker.ts:670`, `:689` | Extract from the selected node's frame/window. Existing async selection guards and cached extraction must be retained; define when a snapshot is refreshed before Send. |
| Local source-edit assembly | `packages/overlay/src/chat/build-request.ts:58`, `:106`; `packages/server/src/index.ts:402`, `:510` | Local request assembly is pure and local Send/preview share prompt preparation. Keep DOM capture outside the pure builder. |
| Controlled manifest preparation | `packages/server/src/prompt-input.ts:86` | This branch intentionally discards element/source today. It needs explicit bounded context admission, with manifest and edit authority preserved. |
| Hosted submission | `packages/overlay/src/app.ts:4530`, `:4574`; `packages/overlay/src/ai-builder/generation.ts:25`; `services/sandbox-worker/src/ai-generation.ts:29`, `:94` | Hosted AI rejects current images/comments/visual deltas and admits a separate strict text proposal schema. Extending the local element schema alone will not deliver context to the hosted model. |
| Hosted authority | `services/sandbox-worker/src/index.ts:639`, `:677` | Fresh session/scope checks, a 32,000-byte body limit, strict admission and the authoritative checkpoint/page validation must remain intact. |
| Selection identity | `packages/protocol/src/index.ts:400`; `services/sandbox-worker/src/index.ts:689`, `:710`, `:714` | Selection path shape is checked, but component membership is not established by that shape. Resolve enrichment against the authoritative page/component/revision; preserve fresh return-time authority and revision checks. |
| Hosted model contexts | `services/sandbox-worker/src/ai-generation.ts:688`, `:775`, `:796`; `services/sandbox-worker/src/index.ts:719` | Deliver advisory context to both planning and per-operation model messages. Keep server-owned identity/scope and typed proposal/acceptance authority. |
| Hosted prompt preview | `packages/overlay/src/app.ts:5545` | This is a separate summary, not the complete Workers AI prompt. Share the admitted context renderer/object across preview, submission and model assembly; do not label the existing summary exact prompt parity. |
| Prompt formatting | `packages/core/src/prompt.ts:438`, `:630`, `:683`, `:749` | Context appears in several local prompt branches. Cover every relevant branch rather than adding delimiters only to plain chat. |
| Hit testing | `packages/overlay/src/surface.ts:80`, `:93` | Candidate hit testing already exists; cross-origin embeds are opaque leaves. Cycling can extend the current selection mechanism, subject to the covered-element fixture. |
| Later comments/images | `packages/overlay/src/comment-set.ts:15`, `:91`; `packages/protocol/src/index.ts:349` | Existing comments are diff/job-specific, not page pins. The general image schema lacks the proposed size cap, and the hosted model path is text-only; later work needs explicit contracts. |

The first milestone is **F1a, partial rich text context**, not completion of F1.
It must work on the genuine hosted editor used from xeroflowpages.com, as well as
retain local behaviour. Do not add hidden context to the user's prompt string:
`packages/overlay/src/ai-builder/generation.ts:61` validates the returned proposal
against the original prompt. Carry context as a separate validated data field.
The text-only slice can extend the existing proposal input without adding a new
proposal mechanism or changing output/acceptance authority. Confirm the concrete
optional field and schema versions in the implementation plan.

### First slice contract

- Keep the existing selected element identity, ordinary visible-target behaviour
  and today's context fields. Source locations and component names are optional
  hints only when actually available; never infer a source path or line.
- Add a bounded allow-list of attributes and computed layout/type properties.
  Treat even allowed attributes as potentially sensitive. Suppress password,
  hidden and sensitive input content; strip secrets from URL query strings,
  credentials and fragments. Do not serialise entire attributes or DOM subtrees.
- Prefer a small purpose-built structural description to raw `outerHTML`.
  If markup is added later, independently sanitise it before truncation; an
  attribute allow-list elsewhere does not make raw markup safe.
- Resolve token names only against the current authorised project's tokens.
  Preserve literal style values if no token matches; do not invent a token.
- Carry page/frame/viewport identity so equivalent selectors in another frame
  cannot be substituted. Whether these use existing identifiers or schema fields
  must be established from source before implementation.
- Browser selection metadata is advisory, not authoritative component membership.
  Bind enriched context to the loaded checkpoint's page/component/revision. A
  syntactically valid path is insufficient; ambiguous or unresolved bindings must
  produce unavailable context or a validation error, never guessed authority.
- Capture freshness must be explicit: stale cached styles, another selection or
  a replaced node must invalidate or refresh the snapshot before submission.
- Enforce a hard maximum of 6 KiB (6,144 UTF-8 bytes) for the complete serialised
  selection text, including labels and framing. Bound fields individually and
  truncate deterministically; test non-ASCII text and large DOM/class lists.
  Retain the existing hosted 32,000-byte whole-request limit and define aggregate
  budgeting with the manifest/prompt; a valid selection alone need not fit the
  complete request. Do not raise that limit as an incidental context change.
- Assemble preview and Send through the same request builder. Explain unavailable
  or truncated context visibly. New fields must be optional and admitted only
  when the receiving contract supports them; adding optional fields alone is not
  sufficient evidence of compatibility with an older strict receiver.
- Prove that the hosted model actually receives the admitted snapshot. Verify
  controlled-manifest and local source-edit branches separately; retain current
  typed proposal/operation validation and fresh scope authority. Older receiving
  contracts may deliberately use the legacy payload without enriched context.
- Keep page-derived context separate from the user's instructions. Serialize and
  escape hostile text so it cannot close a delimiter or create another block.
  The warning that context is untrusted supplements fresh server authority and
  scoped edit validation; it is not a prompt-injection security boundary by itself.
- For inaccessible cross-origin embeds, show unavailable context and target the
  accessible iframe container. Do not promise the embedded element's five fields
  when its DOM cannot be inspected.

## Next bounded improvement: selection cycling

Keep the ordinary visible target as the initial selection. Add explicit previous
and next controls for other eligible candidates, a count and a tested keyboard
binding. Cycling changes the existing selection and inspector; it must not create
an edit, reset the user's prompt or activate a link.

Before choosing the algorithm, prove the covered-heading example with a local
fixture. A hit-test candidate list is not by itself evidence that every obscured
descendant can be selected. Use supported page structure to build candidates where
needed; exclude editor chrome and respect modal and frame boundaries. Preserve
the selected node when rebuilding candidates; if it disappears, invalidate the
selection visibly rather than silently selecting another element.

Gate: covered card heading reachable, repeated instances stay distinct, narrow
and full-browser editing work, and shortcuts do not clash with existing bindings.

## Investigate before committing to screenshot capture

Run a small hosted feasibility spike after the text slice is proven. Establish
the actual capture mechanism, permissions, active-frame coordinates, editor zoom,
scroll position, CSS pixels versus device pixels, media/font readiness and payload
limits. No new production service or browser permission is implied by this plan.

The spike must demonstrate a correctly aligned crop on desktop and mobile, both
light and dark editor modes, a bounded capture time and an explicit failure path.
Captures exclude unrelated frames/editor chrome. Text-only feedback remains usable
when capture is unavailable. Verify actual downstream model/request limits rather
than assuming the PRD's 5 MB upload cap guarantees hosted model acceptance.

## Later work, retained in the backlog

| Work | Required design decisions before implementation |
| --- | --- |
| Page-pinned comments and batch send | Site/page/frame/document revision scope; repeated-instance anchoring; ambiguous or detached state; request acknowledgement/idempotency; account-scoped local persistence and sign-out cleanup |
| Lightweight client brand guide | Explicit session choice, including none, takes precedence over client/site default, then agency default; permission checks and an immutable version bound to the session |
| Screenshot annotation | Proven capture path first; image plus mark-data redaction; mark target semantics; coordinates/zoom; storage and aggregate attachment budget |
| Shared design-system library/admin | Tenant/client access, default permission model, Neon versus native storage, asset ownership, versioning and withdrawal behaviour |

Comments leave the staged tray only after a confirmed accepted request. Unknown
outcomes must remain recoverable without duplicate jobs. Preserve sent comments
in history and never guess a replacement anchor. A source location is a hint, not
a unique instance identity. Pin fractions are relative to the resolved element's
current bounds; verify alignment across supported breakpoints.

For annotation, start with solid redaction. Redacted content must be absent from
both the flattened image and accompanying text, markup, thumbnails and mark
snapshots. Resolve arrows by their endpoint and other mark types by explicit,
testable rules; area overlap alone does not prove the intended target.

Client branding should not inherit an agency default ahead of a client/site
default. The user's explicit selection of none must remain none. A guide is
reference data, not authority; edits and assets still require current access.
Do not assume public/link sharing is needed for the first brand-guide slice.

## Workflow and release constraints

Implementation ownership: the native Page Studio repository owns overlay picker,
context, request assembly and browser tests; Dashboard changes are needed only
when a proven slice requires persistent data, an API or administration UI.
Before coding, inspect the exact protocol/receiver chain, write the concrete
first-slice implementation plan, and settle compatibility and aggregate limits.

Use a fresh branch from current main, local development and focused regression
tests, then independent review and hosted staging verification. New features
remain behind their own flags until these gates pass. Preserve existing session,
tenant/site isolation, edit/checkpoint authority and production configuration.
Update relevant public feature pages when the feature is actually implemented.

Hosted model verification is a later execution gate: the currently documented
staging AI allowance is zero. Settle the authorised inference test mechanism in
the concrete implementation plan; this documentation changes no allowance.

Keep Tuesday's Fantasy showcase on its verified production release. This plan
does not supersede existing shared-form, hosted authority, staging-media and save
latency work or activate native production signup. Cold editor-frame loading also
remains a recorded performance follow-up.

No extra clone, dependency install, full build, database migration, paid inference,
email or deployment is required to document this work. Conserving disk and Actions
continues to apply to implementation and documentation commits.

## Checklist

- [x] Preserve the original PRD in the repository.
- [x] Record the privacy, targeting, redaction and branding clarifications.
- [x] Select the text-context slice as the first implementation priority.
- [x] Map local, controlled-manifest and hosted request boundaries against current main.
- [ ] Write the concrete first-slice plan, including hosted schema/model admission.
- [ ] Establish local targeting/accuracy fixtures and baseline.
- [ ] Implement bounded sanitised context and admitted-context preview/Send parity.
- [ ] Prove compatibility, isolation, byte limits and exact targeting.
- [ ] Verify the slice in controlled hosted staging before any release.
- [ ] Prove the covered-element fixture and then add cycling.
- [ ] Run the hosted screenshot feasibility spike.
- [ ] Design pinned comments and the lightweight client brand guide.
- [ ] Plan annotation and design-system sharing after their dependencies pass.
