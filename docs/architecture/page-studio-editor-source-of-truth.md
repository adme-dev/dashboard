# Page Studio editor source of truth

## Status

Accepted on 2026-09-03. This decision supersedes the dashboard-local visual builder introduced by dashboard PR #492.

## Decision

XeroFlow has one website editor: the private `adme-dev/xeroflow-page-studio` repository and its separately deployed `*-editor.xeroflow.io` runtime.

That repository is an independently maintained derivative of the MIT-licensed Airship snapshot imported from `https://github.com/0xnyn/airship` at commit `1063ba0002e33b2e19de586f2330b4356e51e8f5`. Its provenance is recorded in the Page Studio repository's `THIRD_PARTY_NOTICES.md`.

The standalone Page Studio owns:

- visual canvas and responsive frames;
- DOM selection, inspection, inline editing, and undo;
- page and component composition;
- shared site-shell, header, footer, and navigation authoring;
- AI-assisted editing, proposals, diffs, and checkpoint creation;
- isolated workspace and preview orchestration.

The Agency Dashboard owns:

- authenticated tenant, client, membership, and permission scope;
- site inventory and governed page metadata;
- signed, short-lived editor-session issuance;
- reviews, approvals, builds, releases, rollback, domains, and subscriptions;
- audit history, policy, production state, and operational visibility.

The Dashboard must never implement a second visual website builder. In particular, it must not add local canvas, frame, inspector, component-renderer, template-composer, or AI page-composer components under `app/components/page-studio/`. The compatibility route `/agency/page-studio/:siteId/edit` redirects to the governed site workspace, where the signed **Launch Studio** action opens the canonical editor.

## Data and migration policy

Removing the duplicate UI does not remove migration `404_page_studio_documents.sql`, existing document rows, immutable checkpoints, versions, reviews, builds, releases, or audit history. Existing storage remains until a separate production-data audit proves whether it is required by the canonical Studio contract and defines a reversible retirement path.

## Enforcement

- Scoped `AGENTS.md` instructions prohibit dashboard-local editor implementations.
- `test/app/pageStudioEditorBoundary.test.ts` fails if retired builder files return or the compatibility route mounts a local builder.
- Current architecture documentation is included in the dashboard Graphify corpus.
- Historical implementation commits remain available in Git; obsolete implementation plans are not retained as active documentation.

## Operational flow

1. An operator opens a governed site workspace in the Dashboard.
2. The Dashboard authorises the operator and issues a short-lived signed editor session.
3. The browser opens the separately deployed Page Studio editor.
4. Page Studio edits the isolated site workspace and creates immutable checkpoints.
5. The Dashboard governs review, approval, build, release, rollback, domain, and audit operations.
