# Page Studio staging organisation

Staging users could authenticate but the website list failed with 400 “No
organization selected”: the isolated environment has no Xero OAuth connection.

Page Studio now accepts an explicit `PAGE_STUDIO_STAGING_TENANT_ID` fallback from
trusted Cloudflare bindings. Both release and content environments must be
`staging`, the ID must be bounded and valid, and no organisation may already be
selected. Production behaviour and all actor/capability checks remain unchanged.
No accounting connection, cookie or session is fabricated.

The preview configuration selects the existing `page-studio-staging` synthetic
organisation. Its canary site is `a27135dc-1374-475c-a56d-7e60310425bb`. The separate
runtime-reader fixture stays in its own organisation. This setting grants no
additional role permissions and does not make that other fixture visible.

Preview also configures `https://studio-staging.xeroflow.io` as the editor URL,
so the authorised user can launch the existing staging editor. The production
editor remains `https://studio.xeroflow.io`.

Regression coverage includes the missing-organisation failure, existing selection,
absent/production environment markers, invalid IDs and denied editor permission.
Hosted acceptance must verify the site list and canary editor after deployment.
