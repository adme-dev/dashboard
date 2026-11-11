# R10 — reference workflows and starter specifications

Date: 18 September 2026. Status: **documentation research complete; D09 proposed**.
No competitor account was opened, no generation was purchased, and none of the
competitor workflows below was trialled. These are official documented behaviours,
not a feature-parity promise or a measured comparison.

## Outcome

Keep the customer journey inside one selected website: client admin → Open Page
Studio → Content/Components/Pages → reviewed draft → preview → explicit release.
Adopt useful planning, selection, review and recovery interactions while keeping
XeroFlow's own schema, permission, package and publication contracts authoritative.

Two implementation fixtures make that journey concrete:

- [Service enquiry starter](./fixtures/R10-service-enquiry.md): Fleet, reusable
  cards and private enquiries. No assumed booking engine.
- [Product catalogue starter](./fixtures/R10-product-catalogue.md): Products,
  reusable cards and private enquiries. No vehicle or commerce assumptions.

These extend the local R02 journey, R03 schema and R04 component contracts. They
do not change the owner-confirmed placement of CMS inside Studio or client admin
as its entry point. Both use one shared records/revision API across those surfaces.

## Official source register and observed documentation

Every linked page below was retrieved on **18 September 2026**. “Documented” means
the provider describes it; no claim of successful hands-on use is made here.

| Source / surface | Documented behaviour | Useful Page Studio application |
| --- | --- | --- |
| B1: [Bolt Plan Mode](https://support.bolt.new/best-practices/plan-mode) | In-project discussion can precede code changes; an implementation action moves into building. The homepage flow may first create a base app structure. | Proposed schema/component impact can be reviewed before applying to an existing draft. Do not assume all competitor planning is mutation-free. |
| B2: [Bolt visual edits](https://support.bolt.new/building/visual-edits) | Select elements, preview text/style edits, collect pending changes, then save the batch into code. Preview appearance alone does not mean code was saved. | Separate local edits, acknowledged draft revision and live release; context selection identifies the intended element. |
| B3: [Bolt backups/history](https://support.bolt.new/building/using-bolt/rollback-backup) | Versions can be previewed, named, bookmarked and restored. Restoring a project version leaves current Bolt/Supabase databases unchanged. | Preview before restore; create a new draft revision and retain operational records. Define schema compatibility explicitly. |
| W1: [Cascade overview](https://docs.devin.ai/desktop/cascade/cascade) | Code/Chat modes, evolving task lists and named checkpoints. Its documented revert acts on code changes and is described as irreversible. | Show bounded change progress and checkpoints; use Page Studio's restore-as-new-draft contract rather than copying destructive revert semantics. |
| W2: [Desktop previews](https://docs.devin.ai/desktop/previews) | Local app preview can send selected elements and captured errors to the agent as context. | Supply scoped component/record identifiers and sanitized errors for a correction, with draft revision preconditions. |
| A1: [Antigravity artifacts](https://antigravity.google/docs/artifacts) | Reviewable plans, diffs and browser recordings support feedback at milestones. | Present the proposed schema/component changes and their verification evidence before apply/release. |
| A2: [Antigravity review policy](https://antigravity.google/docs/artifact-review) | Planning/Fast execution and configurable review behaviour are documented. | Match review requirements to action and customer permissions; ordinary included generation stays self-service. |
| A3: [Antigravity IDE browser](https://antigravity.google/docs/ide/browser) | Browser actions can produce screenshots/recordings; docs describe separate-profile and URL-access controls. | Retain browser acceptance evidence, while proving our own preview-origin, session and outbound isolation. |

Source changes found during lookup: old Bolt `/building/quickstart` and guessed
plan/history paths failed direct retrieval, so the current official documentation
index supplied B1–B3. The Windsurf URLs `/windsurf/cascade/cascade` and
`/windsurf/previews` redirected to the Devin Desktop URLs cited above. Record the
observed surface names; do not infer a product migration history from a redirect.
The older Antigravity browser URL redirected to `/docs/ide/browser`. No installed
application version or account-specific availability was verified.

## D09 proposed interaction contract

The following is our design inference from the references and existing PRD,
not a claim that all three products implement these guarantees.

| Step | Customer-visible result | Acceptance boundary / delivery task |
| --- | --- | --- |
| Enter | Client admin opens the authorised selected website; Studio returns to that same website. | Fresh scope and role; clear protected state on site change. A01/A05. |
| Describe | Customer requests a collection, component or permitted action. | Explain capability/allowance before admission; preserve current accepted draft. C01/C02/C05. |
| Review | Plain-language schema, data visibility, affected components and action changes. | Immutable candidate and expected base revisions; no secrets or raw infrastructure log dump. C02/C04. |
| Apply | Accepted changes become an acknowledged draft; unsaved local edits remain visibly distinct. | Atomic save/conflict handling; late generation cannot replace a newer draft. A02/A04/B01/C04. |
| Edit visually | Select a component, change allowed props, or use Edit content for its bound record. | One shared data API; preserve selection/overrides. Text grows and pushes following controls instead of overlapping. A05/B04. |
| Preview/test | Customer sees the selected draft and test results. | Synthetic or expressly authorised data, scoped preview authority, responsive checks. R06/C03. |
| Release | Customer with publisher permission activates the reviewed candidate. | Pin pages, definitions, schemas, content and assets; recheck current authority. D04. |
| Recover | Preview/name versions; restore compatible layout as a new draft. | Keep later records and enquiries; incompatible schema rollback is rejected with a migration explanation. D05/R08. |

Do not copy arbitrary terminal/package access into the customer CMS. The initial
slice uses trusted primitives/actions. Generated runtime execution remains behind
R06 containment and authority gates. A browser recording is evidence of observed
behaviour, not proof of tenant isolation. A successful screenshot does not prove
that a database write persisted or that a live deployment matches its draft.

## Fixture use and release evidence

Each fixture contains six labelled prompts and twelve acceptance cases. R09 can
use the twelve prompts as candidate input to its minimum twelve-prompt,
three-runs-each evaluation; that task still owns the pinned model, final corpus,
scoring, failures, costs and bounded retries. No generation result is supplied here.

For each future acceptance run, record source revision, environment, synthetic
scope, schema/component versions, case ID, expected/actual result and evidence.
Check API/store outcomes alongside the browser. Save-before/reopen and denied
writes require revision/record evidence, not only toast messages. Test fixtures
must not edit the existing Fantasy demo or seed production customer data.
Where a case lists multiple invalid inputs or failure conditions, run each as a
separate subcase and require all to pass; one denial cannot stand in for the rest.

## Verification and remaining work

R10 checks cover source attribution, local links/fences, fixture IDs and manual
consistency against R02–R04/R07. All 24 fixture acceptance cases remain **planned**;
no browser journey, generation benchmark or application regression pass is claimed
by these documents. No application source, dependency, database or deployment
changes are part of this section; full application tests are not applicable.

D09 remains provisional for R12 synthesis. Media/date/reference types and form
actions in the fixtures require implementation beyond R03's tested primitive
subset. Commercial allowances, app-user authentication and R06 release gates
remain unresolved by this research. CMS and client-admin delivery stays first.
