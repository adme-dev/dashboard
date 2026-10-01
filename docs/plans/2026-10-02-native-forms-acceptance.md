# Native customer forms: integration and hosted acceptance

Status: prepared from source on 2 October 2026; execution pending. This is a runbook
and implementation plan, not evidence that the customer journey passes.
See [deployed backend receipt](2026-10-02-native-forms-staging-receipt.md).

## Correction to the previous checkpoint

Two test mailboxes are necessary but are not the only remaining prerequisite.
The private native setup/capability backend is deployed. The visible Forms dashboard
still belongs to the invited-client session path. Native self-service customer
sign-up has its own account/session and website overview; it does not yet expose
that operational Forms dashboard. A worker RPC test cannot prove this UI connection.

Verified source boundaries:

| Boundary | Current source and behavior |
| --- | --- |
| Native sign-in | `server/utils/pageStudio/customerSignupHttp.ts` reads `studio_customer_session`; exact-origin mutation guard and signup gate. |
| Native overview | `app/pages/studio/dashboard.vue` calls `/api/portal/page-studio/customer/dashboard` and opens Studio; no Forms navigation. |
| Existing CMS screen | `app/pages/studio/sites/[siteId]/index.vue` uses `studio-auth` and the portal workspace endpoint. |
| Existing form handlers | `formSettingsHttp.ts`, `formRecipientsHttp.ts`, `emailTemplatesHttp.ts` resolve the `portal` audience. |
| Portal identity | `httpActor.ts` calls `requireClientAuth`; `businessContent.ts` accepts agency/client actors and joins `agency_clients`. |
| Native setup | Private `/internal/page-studio/customer-sessions/cms-prerequisites` delegates to `coordinateCustomerSchemaUpgrade`; accepts five strict setup kinds. |
| Capability activation | Studio `ProvisioningWorker.activateFormDraftsCapability(scope)` is private RPC only. Setup completion alone does not call it. |

Do not make a native account appear to be a portal client, mint a portal cookie,
create a dummy agency client, or accept either cookie interchangeably to work around
this gap. Keep Fantasy Limo's invited-client demo working through its existing path.

## Next implementation: native CMS connection

These are planned tasks, not completed work. No new schema or route is claimed here.

1. Add a dedicated current-native-customer authority adapter. Derive identity and
   workspace from the native session and completed setup; derive site/environment
   and customer storage scope from retained ownership. Recheck current session,
   account, verified identity, workspace membership/role, site and entitlement.
   Define read/write roles explicitly, retain read-only viewers, and fail closed
   when authority is missing or revoked. Do not reuse original setup login as the
   ordinary editing authority. Never accept actor, database or runtime pins from UI.
2. Add scoped native workspace/form draft HTTP adapters. Reuse form catalogue,
   redirect/variable validation, audience-specific revisions and storage operations
   through an explicit shared authority interface. Keep invited-client admission
   intact. Perform fresh authority checks around awaited document and worker calls;
   validate returned scope/identity/revision. Bound request bodies and preserve
   exact-origin, no-store and no automatic retry behavior. No new public activation API.
3. Connect the native overview to the native CMS screen and the existing Forms,
   recipients and template editors. Make their API target explicit so components
   cannot silently call portal endpoints. Preserve shared form identity, default/
   override inheritance, unsaved-change protection and separate Enquiries navigation.
   Use Nuxt UI v4 and the required frontend design skill before editing form UI.
4. Prepare the private staging activation caller. It must bind to the deployed
   coordinator and only the exact reviewed test scopes, derive retained operation
   evidence, invoke activation after installed storage and read back uncertainty.
   No public HTTP proxy, caller-supplied receipts or direct capability-table inserts.
   Record its reviewed source and remove any temporary caller after testing.
5. Tests first: native cookie versus portal/staff cookie separation; account/session/
   membership/entitlement revocation before and during awaits; foreign site access;
   viewer write denial; all three draft kinds and both template audiences; stale
   revisions; no capability; worker returned foreign receipt; setup user logout with
   a different currently authorized editor; regression coverage for invited clients.
   Use real disposable PostgreSQL/D1 where authority/storage behavior matters.
6. Review, build and run relevant tests, then deploy matching preview code using the
   existing guarded commands. Native API, UI and worker acceptance are distinct
   checkpoints. Do not label the standalone customer journey complete after only
   the worker checkpoint.

## Hosted fixture preparation

- [ ] Operator supplies two distinct test email addresses and authorizes the sign-in
      messages. Addresses are pending; do not infer aliases or reuse an old approval.
- [ ] Confirm verified sender and existing product terms configuration. The user must
      complete any terms acceptance or email verification that requires their action.
- [ ] Use supported `/studio/signup` and onboarding flows for accounts A and B.
      Record only redacted evidence and server-derived workspace IDs; do not copy
      cookies or email-link secrets into reports.
- [ ] Select exact approval expiry and limits through the existing staged preview
      policy, retaining approver/workspace/approval identity. Updating an expired
      entitlement alone cannot renew the immutable original policy.
- [ ] Create both preview sites through the supported native overview. Retain their
      distinct site, D1, runtime and original/recovered setup identities privately.
- [ ] Configure exact staging runtime scopes and verified immutable artifact bytes.
      Existing candidate digest is in the release receipt; revalidate against the
      final reviewed source before upload. Preserve original runtime evidence.
- [ ] Complete existing CMS prerequisites, then `form-runtime`, then `form-drafts`.
      Read status after an uncertain reply, preserving request IDs. Require installed
      physical receipt/provider readback before explicit capability activation.

## Acceptance matrix

Record source, deployment, scope A/B, action, observed result and evidence location
for each case. A local test result is not a hosted result. All cases below are pending.

| Case | Action | Required result |
| --- | --- | --- |
| Native journey | Sign in, complete setup, open native CMS, return from Studio | Same owned site; Forms available through native session. |
| Capability closed | Read/write form drafts before explicit activation | Access withheld; no draft mutation. |
| Three draft types | Save/reload outcome settings, recipients, email templates | Exact values and correct revisions persist in the customer's D1. |
| Template audiences | Edit Team then Customer template | Independent values/revisions; no overwrite of the other audience. |
| Shared forms | Edit one form used on multiple pages | One definition/settings record; placements share the intended settings. |
| Defaults/overrides | Update website defaults with a form override present | Inheriting forms change; explicit override is retained. |
| Stale write | Load two versions; save first, then save stale second | Conflict; first save remains; explicit reload available. |
| Scope isolation | Account A targets B's site/form/template | Denied before disclosure/mutation; B's data unchanged. |
| Read-only role | Viewer attempts an edit | Read allowed only within own authorized scope; write denied. |
| Current authority | Expire original setup login, use another authorized login | Ordinary CRUD uses current authority, subject to explicit setup recovery where needed. |
| Revocation | Revoke current test access using supported operation | Subsequent access denied; immutable setup/storage history retained. |
| Capability disabled | Disable a disposable test capability | All six draft RPCs withheld; existing CMS physical proof retained. |
| Existing CMS | Read/edit ordinary content after managed form install | Older CMS path remains compatible with exact installed extension. |
| Uncertain save | Induce bounded disposable-test response loss | No automatic replay; readback resolves outcome before further write. |
| UI usability | Keyboard, mobile, dirty navigation, discard/reload | Usable layout and explicit handling of unsaved work. |
| Established navigation | CMS site list and agency QR Codes | Existing navigation/features remain available. |

Destructive schema-marker forgery tests stay in disposable local/adversarial fixtures;
never corrupt a retained hosted customer database just to exercise a denial case.
Recipient/template edits here are drafts; no notification or customer reply is sent.

## Closeout

Close temporary test approvals/gates and any temporary private caller, preserving
receipts and resources needed to resolve uncertainty. Record actual deployment IDs
and rollback versions, check exact current-main ancestry, and update the main CMS
checklist. Production enablement follows successful native API, browser and isolation
acceptance. Billing, email delivery activation and broader CMS modules remain separate
roadmap items.
