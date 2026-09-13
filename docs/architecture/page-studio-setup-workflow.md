# Page Studio agency setup workflow

Agency staff open **Website builder → Client websites → Manage site → Overview → Website setup**. Supported business starters expose a retained plan with pages, modules, the original brief and unconfirmed launch details. The visual editor remains the separate signed Studio runtime.

Editing requires `PAGE_STUDIO_EDIT`; approval requires `PAGE_STUDIO_APPROVE`. Creation and decisions lock the site and compare the displayed revision. Accepted plans cannot be rewritten. Entitlement expiry, page/module limits and inactive clients block new proposals. Free-text mentions never establish confirmed rates, contact details or availability rules.

Preparation requires an accepted plan and the private `PAGE_STUDIO_PROVISIONER` binding with both `createProvisioning` and `readProvisioning`, plus explicit `PAGE_STUDIO_PROVISIONING_ENVIRONMENT` of `staging` or `production`. Missing configuration displays the service as unavailable and blocks dispatch. This release does not activate that infrastructure. Portal signup, production allocation/dispatch acceptance and operational booking integration remain separate work.

Jobs retain the original authenticated actor. Both producer preflight and the machine-authenticated `/internal/page-studio/provisioning/authorize` route reread current staff or client authority, scoped site, accepted plan and entitlements. An executor must check fresh authority before effects and retain its own lease fencing. Retries cannot change actor kind, scope, plan or accepted setup snapshot. Management receives bounded phase information, not provider resource names or raw executor errors.

Migration `415_page_studio_setup_proposals.sql` is additive and was applied successfully to the configured application database on 13 September 2026. Its review history uses a unique tenant/client/site/revision key and scoped foreign key. The isolated PostgreSQL 17 tests exercise concurrent creation, approval/revision races, revoked/custom/read-only roles and entitlement changes; all 39 pass. CI now runs these tests explicitly instead of silently skipping them without a database URL.

Current-main reconciliation restores only these setup files from the historical implementation. Newer saved-page, checkpoint, publishing, submission and QR changes remain intact. Both permission inventories account for four added API files (three mutations) and two fresh staff-role checks. No God-mode mutation bypass was added.

Local validation: 111 focused tests pass; new and changed application code passes lint; production build is 25,438,109 raw bytes, 30,819 below the unchanged limit. Full CI and guarded current-main production deployment are required before claiming this workflow is live.

## Customer plan review

The customer website portfolio links to a scoped setup page. Current client authentication and an exact site membership govern reads; only an admin/manager with editor membership and current portal-creation entitlement can submit a plan. Site and entitlement locks serialize first creation, revisions and agency decisions. Accepted plans remain immutable. Customer details do not establish confirmed facts automatically or approve/publish a site.

Progress uses the explicitly configured provisioning environment and reports only phase/time. The page retains failed draft text, blocks stale revisions after refresh and permits vertical scrolling. No new provisioner binding, account signup, payment, mail or public release is activated by this increment. Customer plan reads/revisions are being verified on current main before production rollout.

## Customer-requested preparation

An authenticated admin/manager with editor membership can explicitly start the current agency-accepted revision when the provisioner service and environment are configured. The request accepts only `expectedRevision`; customer, site scope, actor and environment are derived server-side. Fresh SQL preflight checks active client/user, membership, site, accepted snapshot and current entitlement before contacting the coordinator. Retries keep the initial customer owner and fixed revision key. The portal receives phase/time only.

The action is hidden for unapproved plans, viewers, unavailable infrastructure or existing jobs. Failed acknowledgements refresh the persisted status before another attempt. No new binding or automatic execution is enabled in this increment. The portal sidebar now constrains long client names to its width. Production enablement still requires positive two-customer provisioning and dispatch acceptance.
