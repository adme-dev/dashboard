# Email builder R&D adoption

The adjacent `email-builder-roadmap-2026-11-02.md` is an unchanged copy of the
owner-supplied R&D. Its Beefree observations are research inputs, not independent
verification or permission to copy SDK code. Keep XeroFlow's canonical documents,
private renderer, scoped library and existing sender.

## Order and scope

1. Finish the supplied-template import repair and native fidelity acceptance.
2. Adopt the merge-tag foundation and extend the existing preflight panel.
3. Add client brand defaults and explicit role/locking policy.
4. Design conditional content and versioned shared modules before activation.
5. Extend client rendering and review/version workflows with separate acceptance.

Phase 1's renderer reference has moved to
`workers/email-rendering/src/render/mergeFields.ts`; the server rendering layer is
an RPC client, not a place to duplicate compilation. The initial adoption shares
one bounded merge resolver between preview and campaign formatting, supports
spaced/case-insensitive names and fallbacks, treats replacement dollars literally,
and escapes HTML values while retaining plain email subjects. The renderer also
escapes subject/preheader text before embedding it in HTML. Tracking reads
the logical HTML-decoded destination once before signing and re-encodes its href,
so escaped merge values retain their destination and signature. No actual email send,
new database table, form, tag picker or role change belongs to this first slice.

Preview deliberately retains unknown tags for editing; final campaign formatting
clears them. Both use the same resolver and agree for supplied recipient values
and fallbacks. Resolution is one pass: a recipient value cannot insert a second
tag that is then evaluated.

The current preflight already checks unsubscribe, sender/authentication,
media URLs, HTML size, footer identity and recipients. Extend that contract with
alt text, typography/contrast, headings and metadata; avoid a parallel checker.

The import repair now retains source media rules, backgrounds, declared widths
and Outlook conditional fragments in isolated full-document mode. It does not
certify Outlook/Gmail/Apple Mail rendering or complete native FigFlow authoring.
Dark-mode generation should be opt-in and preserve an imported template's stated
light-only policy. Do not globally inline/remove responsive stylesheet rules.

## Decisions still needed before those phases

- Conditional content needs typed predicates, recipient-field scope and send-time
  evaluation shared with preview. Raw `before`/`after` strings alone are not an
  executable contract for the sender.
- Shared modules need version pins, explicit update/detach and campaign snapshots;
  changing a library item must not silently change approved/scheduled campaigns.
- Brand defaults should reuse the existing client brand source after auditing
  tenancy and authority. Dealer edit restrictions must be enforced server-side.
- Retire packages and merge template tables only after checking live consumers,
  migrations, automation ownership and stored references. Treat this as a separate
  compatibility project, not incidental cleanup.

Implementation and test status are recorded in the PR and release receipt. This
note does not mark the six-phase roadmap complete.

## First-slice implementation checkpoint

The shared resolver and metadata encoding changes are implemented locally, with
100 focused checks across nine suites, private Worker TypeScript and focused
lint passing. The customer notification preview keeps its captured HTML exactly;
only the deliberate raw-ampersand merge-value case changes from the historical
rendering fixture. Independent Kimi review found no blocker. Follow-up review
also covers one-time HTML URL decoding/signing and the bounded whole-token scan.
No actual emails were sent. This slice is awaiting integration/release; the
responsive import correction recorded in `../email-builder/html-import-repair-20261102.md`
is already live.

Merge values are supported as text and quoted HTML attribute values. Tags inside
CSS declarations need a separate CSS-context contract; this foundation does not
introduce CSS-variable personalization or treat HTML encoding as CSS escaping.

## Owner confirmation and transport check — 2 November

The owner approved proceeding and reiterated that the native FigFlow editor must
follow the component-authoring, responsive-preview and compiled-email workflow
referenced by Emailify. The acceptance checklist lives in
`../superpowers/plans/2026-11-02-figflow-template-fidelity.md`; the native editor is not complete.

PR823's first CI run found one missed Workerd RPC fixture expectation for the
intentional raw-ampersand encoding correction. The same failure reproduced
locally (10 passing / 1 failing); direct and RPC tests now share the explicit
expected fixture contract while preserving the frozen historical golden file.
This is test alignment to reviewed behavior, not a runtime rollback of escaping.

## Job-to-email workflow and current online R&D — 2 November, 08:05 UTC

Owner steering: retain the working documents and MCP journey from the account
manager/user through job/task, brief, budget, template, sending and workflow.
The [source-backed owner audit](email-job-mcp-owner-audit-2026-11-02.md) maps the
existing PRDs and actual implementations. Old unchecked PRD boxes are not evidence
that shipped owners must be recreated. XeroFlow Send is file transfer, not the
EDM campaign sender. Media-spend allocations and proposed job budgets are also
different records; neither grants authority over the other.

Online primary references checked on 2 November:

- [Emailify fundamentals](https://docs.hypermatic.com/emailify/design/fundamentals)
  uses email components and responsive overrides for HTML generation. Adopt the
  component constraint and existing renderer boundary; do not build an arbitrary
  canvas exporter or copy the vendor's components.
- [Emailify MCP contract](https://docs.hypermatic.com/emailify/design/figma-mcp)
  requires recognizable linked components, preserved overrides/locked content,
  explicit subject/preheader metadata and validation before adoption. This is
  evidence for bounded typed design actions. FigFlow must use its own canonical
  IDs/revisions and policy; the vendor's Figma naming/metadata API is not our API.
- [Emailify preview](https://docs.hypermatic.com/emailify/design/preview) separates
  responsive HTML preview, production preflight and manual inbox testing; its
  approximate dark preview is explicitly not client emulation. Preserve that
  distinction in our existing preview and preflight surfaces.
- [Mailchimp campaign checklist](https://mailchimp.com/help/create-and-send-regular-email/)
  brings recipients, sender, subject/preview, time and content together before
  sending. [Sending](https://mailchimp.com/help/send-regular-email/) is a separate
  action after checklist completion. Reuse our campaign checklist, frozen send
  proposal/review/execute and existing provider delivery records.
- [MCP tools specification, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
  describes schema-based tools and authorization-sensitive discovery. Retain
  current staff/client/board admission and explicit consequential-action review;
  no protocol migration or additional permission dialogs are inferred here.

Coordinator recommendation (an inference from those patterns and our source):
keep one connected journey: account-manager brief/job context → existing task
and budget owners → exact template revision → FigFlow proposal/review/Apply →
existing campaign/audience/sender checklist → frozen approved sending → existing
recipient/provider event status linked back to the task. An agent uses the same
application service boundaries as a person; it does not write these tables or
send through a parallel route.

The minimum candidate follow-ups are (1) server-validated campaign-to-project/task
references with readback, (2) immutable template-revision discovery/selection in
existing MCP campaign creation, and (3) authorized brief detail plus clearly
labelled proposed job-budget context. Existing MCP already provides task/brief
assignment and exact-revision campaign propose/review/execute. No new scheduler,
agent runtime, finance engine, file-transfer dependency or workflow database is
justified by this R&D. These follow-ups are research, not implemented or deployed
claims, and must not displace the core FigFlow acceptance gate.
