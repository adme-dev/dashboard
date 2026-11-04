# FigFlow email designer — PRD delivery checklist

Updated: 3 November 2026. **Overall status: in progress; not released or accepted end to end.**

Product owner: Paul. Implementation lead: Anthropic Opus. Verification and release coordination: Codex.

This is the concise acceptance view of the [approved PRD](../superpowers/specs/2026-10-30-figflow-edm-design.md) and the owner's latest clarifications. The [current task queue](figflow-current-task-list.md) controls the next work; the [evidence ledger](figflow-background-delivery-20261102.md) retains detailed results. These records have distinct jobs and must agree. Emailify is an interaction reference, not a plugin dependency or a requirement to copy the whole Hypermatic suite.

## Product outcome

Designers can start an email in FigFlow, or open an existing supported template, edit it visually, save it to the existing XeroFlow template library, and use that exact design in a campaign rendered as responsive email tables with working images. Staff can edit permitted content and return to FigFlow without losing their changes.

Both entry paths are required:

1. **Start in FigFlow:** choose a blank email or reusable starter → design → preview → save/publish to the template library → reopen.
2. **Edit a template:** choose an existing template → open supported content in FigFlow, or explicitly convert an imported HTML copy → edit → review → save → reopen.

## Acceptance list

An unchecked box means the complete user requirement remains open, even when parts of its implementation or tests pass.

| Done | ID | Requirement and observable acceptance | Current state / evidence |
|---|---|---|---|
| [ ] | E01 | **Start directly in FigFlow.** A designer chooses Email, selects authorised client/agency scope, starts blank or from a starter, and creates a named design without manually importing HTML or making a dummy composer template first. | Partial: existing Starters path creates a named, client-scoped draft and opens FigFlow. No blank starter yet. Hosted direct-start → save → reopen not verified (queue 14). |
| [ ] | E02 | **Open and edit an existing template.** Open the selected saved revision with its content, layout, images and metadata; unsupported content has a clear explanation. | Partial and **failing for owner repro**: structured "Electric Drive (copy)" opens unstyled in live FigFlow because the app still loads native package edm1 (`6ad41045…`); CI edm2 (`58eabea2…`) renders it largely styled but heading/body weights and the lower two-column `Html` CTA remain wrong. [Queue 15](figflow-current-task-list.md); [edm2 evidence path](../../.verification/opus-imported-conversion-repair-20261103/native/electric-edm2/). Local (uncommitted): native weight fix edm3 source reviewed (no Linux build yet); already-saved split CTAs can be explicitly converted to layers by reviewed Apply — [known-section report](known-section-update-20261103.md); review requested changes (inherited locks, literal copy, async continuation), repaired locally; the final carried-link boundary is A0: sections whose image or button link contains “&” (including ordinary tracking parameters) are not converted and stay Html, as disclosed in the composer. Source-approved by independent review (A0); runtime/hosted acceptance is open. The owner example is eligible on a reconstruction only; live verification is open. Link-serialization contract follow-up is queue item 16. |
| [ ] | E03 | **Useful visual editing.** Add, reorder, duplicate and remove permitted sections; edit text, typography, colours, spacing, images, buttons and supported columns. Undo/redo works and protected brand/legal content stays protected. | Partial: supported component operations exist and have bounded local evidence. Full designer acceptance remains open. [Fidelity checklist](../superpowers/plans/2026-11-02-figflow-template-fidelity.md). |
| [ ] | E04 | **Imported HTML becomes an explicit editable copy.** Show before/after results and unsupported sections; preserve the original, responsive alternatives, content, links and legal text. Never pretend a flattened screenshot or an unsupported HTML placeholder is fully editable. | Source implemented locally (uncommitted). Two review rounds: R3/R5 closed; R1/R2/R4 repaired again (write-once receipt at the persistence boundary, no false `not_committed`, per-source settlement), re-review pending. Reviewed **Create editable FigFlow copy** with before/after, report and limits; original untouched; receipt-first replay. Actual Ford/Nissan/Cinco: identical visible text/image sets at 800/390 px; 6/6 actual-WASM admissions. Buttons/columns/rich text stay protected. Hosted visible edit/save/reopen open. [Report](imported-html-editable-copy-20261103.md). Final-round R1 (rootless body dropped the receipt) repaired locally; independent review closed it as a scoped source repair. E04 runtime/visual acceptance remains open. |
| [ ] | E05 | **Preview real email output.** Desktop/mobile previews use the canonical compiled email output; stacking, spacing, widths, buttons and images behave correctly without duplicate responsive sections. | Partial: previews exist. Fixed a pre-existing renderer bug (hide-on-desktop content never showed on mobile) and added the image desktop/mobile swap; browser-computed visibility checked locally. Nested Container device flags unsupported (disclosed). Email-client checks remain open. Columns renderer now honours an explicit zero gap in HTML and MJML (missing still 16px), matching canvas/native — [report](known-section-update-20261103.md#2-columns-gap-explicit-0-is-honoured-starter-review-p2); independent review approved as a scoped source repair. |
| [ ] | E06 | **Reliable images.** Insert or replace permitted images, retain alt text and links, and verify published email images load without staff login. Preserve referenced assets and old campaign output. | Partial: image-reference/library and browser loading checks exist; converted copies keep every image and section background image; module asset and preflight guards now cover mobile/background images. Recipient-facing delivery remains open. [Library evidence](native-library-browser-20261103.md). |
| [ ] | E07 | **Save drafts and publish templates clearly.** Distinguish private design Save from authorised library Publish; preserve identity and scope, confirm persistence, then reopen the exact saved result. Publishing a new version does not rewrite existing campaigns. | Partial: version/publication UI and server contracts implemented. Same-template successor acceptance is blocked by migration 499 verification. |
| [ ] | E08 | **Reuse sections in both editors.** Save a selected supported section into the existing module library and insert it in FigFlow or the composer. Updates are explicit; overrides survive or produce a readable conflict. | Partial: a bounded local library journey passed. Complete hosted, ordinary-user acceptance remains open. [Library evidence](native-library-browser-20261103.md). |
| [ ] | E09 | **Return to the same working draft safely.** Review and Apply a FigFlow proposal as one undoable change. Save staff edits, reopen FigFlow a second time, and retain them. Stale revisions and uncertain replies do not overwrite content or create duplicate operations. | Partial: reviewed implementation and focused local tests. Full current campaign Pages/Worker/native journey remains open. |
| [ ] | E10 | **Use a template in a campaign.** Select an exact published revision; create an independent campaign; edit and render correct tables/images. A later template version never changes the earlier campaign implicitly. | Partial: campaign-owned contracts/UI implemented; full same-template R1/R2 and two-campaign runtime is unvalidated. |
| [ ] | E11 | **Enforce access and preflight.** Ordinary designers/staff see only authorised scope/actions. Client isolation, locks, revoked access, missing assets, required footer/links and send readiness are enforced by existing server owners. | Partial: source/unit/integration checks exist. Ordinary hosted employee/client and final campaign acceptance are open. A superadmin browser session is not proof of ordinary access. |
| [ ] | E12 | **Release and verify the real journey.** Reviewed current-main source, exact build/package and migration receipts, guarded deployment, then hosted start/edit/save/reopen/campaign acceptance. Verify Gmail, Outlook and Apple Mail separately with authorised test recipients. | Open. PR #827 remains draft/unmerged at the last read; no full authoring release or real email-client acceptance is claimed. |

## What the passing checks actually establish

Checkpoint `981943bb1` passed general CI `41515080078` and native CI `41515080116`. The parent verified the complete CI evidence manifest, the matching native package and prior bounded browser evidence. The full suite recorded 21,951 passes and 4,255 skips; optional campaign/successor runtime cases were skipped. Those checks support the implementation but do not tick the complete user journeys above.

Local implementation, scoped tests, full runtime, merge, deployment and hosted acceptance are separate states. A requirement becomes **accepted** only when its observable behaviour passes with evidence from the relevant source and environment. Skips and known unsupported content stay visible.

## Current blocker and next work

- **Implementation:** Opus owns the direct-create/existing-template editing experience and explicit supported HTML conversion. Use the existing canonical template/module, asset and table-rendering paths.
- **Blocked verification:** migration 499's independent review remains failed/incomplete after automated classification. Candidate `422555` is source-only, unapproved and not configured-applied. No blocked probes are to be retried, reassigned or bypassed. Dependent full campaign/successor acceptance stays open.
- **Integration:** current main has advanced beyond the branch's earlier base. Reconcile reviewed work with fresh main and run the required exact-source checks before release.
- **Evidence still needed:** whole campaign/native runtime, ordinary hosted staff/client workflow, recipient-facing assets and authorised real inbox checks.

The broader account-manager → job/task → brief/budget → template/campaign workflow remains linked in the [existing owner/MCP audit](../research/email-job-mcp-owner-audit-2026-11-02.md). Reuse its existing task, finance and sending owners; do not create another operations system to deliver this editor.

## Update rule

At each meaningful checkpoint, Opus updates the affected E-ID with implementation status and a link to its evidence; Codex verifies acceptance and reconciles the task queue/ledger. Record source revision, environment, expected/actual behaviour, test failures/skips and next action. Keep historical failures. Do not tick a requirement from CI counts alone.

No delivery dates have been agreed. Report concrete remaining work rather than inventing a completion percentage or deadline.
