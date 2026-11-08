# Dashboard UI/UX follow-through — 8 November 2026

Source baseline: `86795cd24eccd9889320c1b0930a41158847f404`. User authorized dashboard-wide audit and bounded repairs. Claude Code 2.1.319 reported `claude-opus-5-5`; Codex independently confirmed the scroll and render-access findings. Kimi `kimi-code/k3.1-pro` implements video prerequisites; Grok `grok-4.7` reviews accounting. No customer edits, sends, invoices, ad changes or paid media runs were performed.

## Coverage and evidence limits

| Area | Evidence | Status |
|---|---|---|
| Agency layout / 135 agency page inventory | Source scroll scan; nine plain page roots confirmed under clipped flex layout | Nine local root-only fixes; not deployed or hosted-accepted |
| Boards / Tasks / Kanban | Representative source | Legacy select props, inert task actions, keyboard menu labels need verification/repair |
| Clients / Projects / CRM / Monday | Representative source | CRM and Monday scroll fixed locally; select migration pending |
| Finance / Xero / cashflow / EOM | Invoice, commitments, EOM source samples | Commitments scroll fixed locally; native dialogs/checkbox findings pending; financial actions untested |
| Leads / notifications | Source samples | Watching scroll fixed locally; narrow drawer, lead viewport findings pending |
| AI | Knowledge / command-center source | Root scroll fixed locally; no change to freshly merged authority logic |
| Ads / social | Initial grep-level source only | Detailed coverage pending; no campaigns or social sends changed |
| Briefs / proofs / assets / QR / most settings | Follow-up source audit running | Not yet accepted |
| Audio / Video | T09 source and owned authenticated no-client pilot | Manual six-shot apply/replay, trim and stale-token rejection passed; hosted render repair pending release; no R1/R2/R3 acceptance |
| Public feature pages | Initial source sample | No blanket dark-mode or capability acceptance; further coverage pending |
| Loading / empty / error / retry states | Initial sample inconclusive | Explicitly pending representative hosted checks |

## Bounded scroll repair

These routes had no vertical scroll owner inside the agency layout's `overflow-hidden` main slot: `/agency/notifications/watching`, `/cashflow/commitments`, `/agency/monday-cutover`, `/agency/ai/knowledge`, `/agency/operations/billing`, `/agency/operations/jobs`, `/agency/crm`, `/agency/ai/command-center`, `/agency/analytics/reports`.

Each root now has `flex-1 min-h-0 overflow-y-auto w-full`, retaining its padding, maximum width, data fetching and authorization. All changed Vue SFC templates parsed and compiled. Claude independently approved the bounded source changes; the settings/Monday page was excluded after its parent panel was found to provide scrolling.  Desktop/narrow authenticated scrolling and deployment remain separate gates.

## Findings requiring follow-through

- Confirmed video render-distribution authorization gap is repaired separately in PR897; project authorization runs before execution-ledger replay and side effects, with rejection tests. Release pending.
- Legacy Nuxt UI select `options` / `option-attribute` / `value-attribute` usage in ClientForm, MigrationPreview, KanbanCardDetail and KanbanFilters needs migration after checking actual installed component contracts.
- Task Like/Reply buttons appear inert; verify supported actions before implementing or removing affordances.
- Board menu keyboard visibility and accessible names need repair.
- Native confirmation/prompt dialogs in invoice and email suppression flows require careful flow-specific replacement; active email-owned files must be handed to that owner.
- Narrow form grids and native checkbox findings remain pending verification and scoped fixes.

This ledger is a coverage record, not a claim that every dashboard workflow has been verified. External detailed audit/evidence is under `/Volumes/Backups/xf-video-followthrough-20261108/`; preserve source versus hosted evidence and exact release receipts at each milestone.

## Follow-up source review

Claude's second review approved the bounded scroll changes and corrected the settings/Monday false positive before commit. QR pages have explicit scroll owners; audio/project gallery pages also do. Public feature links resolved to known detail entries or static pages in the source scan. This does not establish hosted acceptance.

New pending findings: brief attachment download button lacks an action (`agency/briefs/[id].vue`); proof card comment button appears inert (`agency/proofs/[id].vue`); settings Xero selector/radio uses old options props; security Delete account button appears inert. Brief/proof wrapper min-height concerns remain **unconfirmed**, requiring a long owned fixture before claiming a defect. Loading/error/retry coverage, portal brief flows and several settings pages remain incomplete.

### Authenticated Watching-page reproduction

The legitimate owner session loaded `/agency/notifications/watching` read-only. At 390×600 CSS pixels, the production page root was 702 pixels tall with `overflow: visible`; its 600-pixel parent clipped with `overflow: hidden`. A temporary DOM-only application of the proposed root classes produced a 600-pixel scroll region and reached the bottom (`scrollTop: 138`, `scrollHeight: 738`). The original classes and scroll position were restored in `finally`. This is a confirmed production defect and prototype check, **not a deployed fix**, not physical-device evidence, and no subscription or customer data was changed. Privacy-safe geometry receipts: `dashboard-watching-narrow-before.json` and `dashboard-watching-narrow-prototype.json` in the external evidence directory.
