# Remote ordinary Pages source release

Robert's authenticated dashboard-render fix is merged in #582, but a local production build failed before upload with ENOSPC. Ordinary release tooling already supports guarded source builds while CRM provider activation remains dormant. The existing CI workflow previously exposed only the separate signed CRM artifact workflow.

The new explicit `source-deploy` workflow-dispatch choice runs full CI, then builds and deploys on a GitHub runner through `pnpm deploy:check` and `pnpm deploy:production`. It uses the existing Cloudflare repository secrets and `production_deploy` environment. Pushes and pull requests do not trigger deployment.

The release checks out the tested dispatch SHA and requires exact freshly fetched current main. Existing source, immutable agency-dashboard target, CRM dormant-state, clean-tree and bundle checks remain enforced. Manual releases have a separate, non-cancelling concurrency group so a normal CI push cannot interrupt deployment.

Command after merge: `gh workflow run ci.yml --ref main -f release_action=source-deploy --repo adme-dev/dashboard`.

After completion, record the exact main commit and Cloudflare deployment ID, verify app.xeroflow.io's source and new assets, then check authenticated dashboard, Boards and QR Codes. Robert's original Safari flow still needs live confirmation. If a new regression requires rollback, restore the recorded previously successful Cloudflare production artifact and reconcile current main before another release.

Validation: three workflow safety tests failed before implementation. Workflow, target-guard and CRM runbook tests pass after implementation; full CI and actual release remain required before claiming the fix is live.
