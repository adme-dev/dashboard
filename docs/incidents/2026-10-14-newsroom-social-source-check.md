# Newsroom scheduled post blocked before Facebook delivery

The Toyota DPF settlement post scheduled for 14 October 2026 at 17:30 Australia/Melbourne was claimed at 06:30:38 UTC, then marked failed before any provider attempt. The hold reported “Newsroom article or approved copy changed; delivery held”. The live article ID, slug, status and updatedAt still matched the approval; its hero version also remained unchanged.

`verifyNewsroomSource` used `redirect: 'error'`. Native Cloudflare Workers fetch rejects that mode, so the catch returned `blocked` before reading the source. The Node fetch mock accepted the option and concealed this runtime incompatibility. Changing to `manual` permits the request while the existing `response.ok` guard rejects redirects. No redirect is followed; signatures, account ownership and article revision checks are unchanged.

The regression bundles the actual source verifier into workerd via Miniflare, signs a fixture approval, and uses native fetch against a controlled outbound service. It failed before the fix and passes afterwards. It also verifies that 301/302/303/307/308, 403 and 500 remain blocked with exactly one request to the fixed news origin.

## Bounded recovery

Post `941b6e00-4c6e-4e4b-bf52-f47763c2d7c1` / newsroom `auto-facebook:33f177091237fb9e706aaed056de9e7c` has no published timestamp, provider results or provider attempts. A retry must first check for other live/claimed copies and confirm the article revision. Restore only the failed status to scheduled and remove the exact `newsroomHold` diagnostic, preserving every signed input (including scheduled_at and original signature). Record the previous row in the publishing audit. This restores the signed metadata; it does not re-sign or approve changed content. The normal dispatcher must verify the signature and live source again before publishing. Do not retry uncertain or provider-attempted delivery through this procedure.

## Verification before release

- Native Workers regression: failed before fix, passed after.
- Social-publishing suite: 820 tests passed.
- Existing focused approval/ownership/dispatcher tests passed.
- Final production deployment and Facebook receipt are recorded separately in the operational release ledger.
