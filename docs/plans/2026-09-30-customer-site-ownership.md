# Customer site ownership adapter — RND-17/20/21

## Approved direction

Continue the customer CMS roadmap after verified signup (#603). Customer content stays in customer-owned databases. Do not invent agency clients or relax customer authorization to make standalone sites fit. Existing agency sites, databases and runtime scopes must retain their identifiers.

## Findings and decision

Migration402 ties both sites and entitlements directly to `agency_clients`. Provisioning scope uses `businessId = clientId`; its actor and login checks support only agency/portal users. Passing a workspace UUID into that contract today would fail foreign keys and could misrepresent ownership.

Introduce an explicit business-owner registry. Backfill existing client owners with the same IDs, replace only the two direct site/entitlement owner foreign keys with references to this registry, and preserve all composite tenant/site/entitlement constraints. Retain the physical `client_id` name as a compatibility scope identifier until callers can migrate; never treat it as an agency-client identity in new customer code. A registry row names exactly one legacy agency client or customer workspace. Legacy agency-client inserts must automatically register their matching owner so established site-creation callers remain compatible. Existing ownership cannot be rebound by normal updates.

The initial service creates a customer preview site only with a trusted, explicit operator-supplied preview policy. It resolves verified workspace ownership, allocates one scope/entitlement/site transactionally, records an idempotent request and owner association, and rejects stale/revoked/foreign authority on retries. No public endpoint, automatic trial enrollment, provider allocation, ready status, billing charge or editor access is introduced by this prerequisite. This is the first implementable portion of RND-20; RND-21 remains open.

## Tasks and acceptance

1. Add migration444 with immutable ownership mapping and compatibility registration. Apply against disposable PostgreSQL. Verify replay-safe migration, unchanged legacy IDs, exactly-one owner and foreign-key enforcement.
2. Add trusted customer preview-site service and PostgreSQL tests. Reject missing policy, non-owner, inactive/suspended identities/workspaces and foreign workspace IDs. Preserve one site across retries/concurrency and reject changed payloads or exhausted limits. Use the existing site row, not a parallel website store.
3. Review, document, run existing signup/workspace/site regressions, commit/push a stacked draft PR. Update canonical PRD with exact scope. Public/runtime adapters and customer dashboard follow this prerequisite.

## Next cross-repository slice

Extend the private provisioning actor protocol with a distinct customer identity/login, validate that actor against the retained ownership and approved preview entitlement at every effect, and adapt checkpoint/content receipt authority before dispatching jobs. Reuse the current coordinator/D1/Worker provisioning engine. Customer routes must not pass a fabricated portal user into existing guards. Prove two customer database receipts and retry/revocation handling before reporting Ready. Then connect dashboard and editor handoff under RND-21/22.

## Verification limits

No production migration or public activation. Full frontend typecheck remains resource-limited from #603; this prerequisite has no frontend changes. Reuse the active worktree/dependencies to avoid another multi-gigabyte temporary copy.

## Execution record

Migration and trusted service implemented; 30 disposable PostgreSQL cases pass. Fresh review's repeatable-read ownership race was reproduced RED and fixed GREEN for both competing request orders. Focused lint passes; server typechecking matches the unchanged 289-diagnostic baseline. Migration444 was applied and replayed only in the owned local fixture. A populated legacy upgrade fixture is a minor review follow-up before production migration. The canonical PRD remains the task-status authority; RND-20/21 are not complete.

### 8 October populated legacy upgrade follow-up

Added a separate pre-444 fixture with populated active and archived legacy site
graphs and an existing invited-customer workspace binding. It applies/replays the
real migration and compares all retained row values, including publication pointers
and audit evidence. Cross-scope references and unsafe deletion remain rejected;
ordinary legacy name edits still work. The fixture runs in the existing PostgreSQL
CI step; its exact local run passes 263 tests in 10 files. Focused lint and independent
review pass. This closes the earlier fixture follow-up only; production migration and
native hosted acceptance remain pending. See the [current checkpoint](2026-10-08-page-studio-release-and-activation.md).
