# Storyboard pilot activation

Storyboard authoring now defaults on in the shared feature policy. No new Pages text binding is required; the production environment is already at the150-binding ceiling. This is user-authorized visibility/authoring, not R1/R2/R3/provider acceptance.

`shared/video/storyboardFeaturePolicy.ts` governs both the public build default and server writes: absent or string `true` enables; string `false`, empty and malformed values disable. Deployed Cloudflare env is authoritative, including an absent flag; local process flags apply only outside Cloudflare. Existing project ownership, write access, transaction, approvals, provider and budget controls remain unchanged.

A runtime-only `VIDEO_STORYBOARD_ENABLED=false` disables server writes but does not change a previously built UI flag. Rebuild with false for a matching public disabled state. Adding a runtime binding still requires binding capacity: do not delete unrelated service settings. A verified prior disabled production artifact is an emergency rollback option; otherwise reconcile a policy revert on current main and use normal source/CI/deployment guards. Saved authorized reads remain available while writes are disabled.

Production release must use freshly fetched current main, Node24.18.0,10GiB heap, `pnpm deploy:check` then `pnpm deploy:production`, immutable agency-dashboard target and bundle budget checks. Retain search/other existing flags; verify provider deployment source, public flag and server validation behavior. No raw Wrangler upload.

Read-only smoke: existing authorized AV project → Inspector → Produce → Storyboard. Do not create/approve/apply/render or submit provider generation solely for activation proof. Record browser/device/provider acceptance separately. Other video-generation, render, asset-harness and tenant-policy flags are independent; enabling storyboard does not enable those services.
