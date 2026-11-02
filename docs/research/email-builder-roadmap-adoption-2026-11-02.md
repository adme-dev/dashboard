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
