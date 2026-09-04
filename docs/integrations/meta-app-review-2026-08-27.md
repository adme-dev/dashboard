# Meta App Review rollout — 27 August 2026

## Review decision

- Keep `ads_read` out of routine OAuth consent and do not resubmit it unless a production Insights request fails with an explicit Meta permission error that identifies `ads_read` as required.
- Request `catalog_management` only from the Dealer Feeds catalog workflow.
- Persist the permissions returned by `GET /me/permissions`; never persist the requested scope list as if it were granted.

## Implemented production workflow

Dealer Feeds now contains a Meta Business catalog manager with this visible sequence:

1. Choose an active Meta connection.
2. Grant optional catalog access through the complete Meta Login flow.
3. Choose an accessible Meta Business.
4. List its owned catalogs.
5. Create a `vehicles` or `commerce` catalog.
6. Rename the catalog.
7. Delete a disposable catalog after entering its exact name.

Deletion never sends Meta's force-delete flag. If Meta reports dependencies, the operator is instructed to remove active feeds, product sets, shops, or ads in Meta before retrying.

## Automated verification

- Targeted Vitest suite: 7 files, 29 tests passed.
- Meta-owned Nuxt type diagnostics: clean.
- Repository-wide typecheck: still fails on the existing project backlog; no failures are attributable to this change.
- Production Nuxt/Cloudflare build: passed.
- Deployment target guard: `agency-dashboard / main` passed.
- `git diff --check`: passed.

The sandbox could not reach `cdn.jsdelivr.net` during prerender, so optional remote Lucide icon lookups produced warnings. Nuxt completed the client, server, prerender, Nitro, and worker wrapping stages successfully.

## Production verification record

Complete after deployment and reconnection:

- Deployment URL / ID: pending
- Meta account reconnected: pending
- Actual granted scopes: pending
- Existing lead permissions and webhook health: pending
- Ads Insights without `ads_read`: pending
- Disposable catalog ID used for create/rename/delete evidence: pending
- Final `ads_read` decision: pending

## Catalog screencast checklist

Record one continuous English-language screencast that shows:

1. Start in XeroFlow Dealer Feeds with the catalog activation rail visible.
2. Select **Grant catalog access**.
3. Show the complete Facebook Login flow and the user granting the requested permission.
4. Return to XeroFlow and show the verified connection and accessible Business selector.
5. Create a clearly disposable vehicle catalog.
6. Show the new catalog in the owned-catalog table.
7. Rename the catalog and show the updated row.
8. Open deletion, explain the dependency-safe behavior, enter the exact catalog name, and delete it.
9. Show the empty or updated table after deletion.

Use English UI, captions/tooltips, and narration that explains each control. Do not edit out the login-to-return transition; Meta specifically requested the complete end-to-end experience.

## Suggested App Review notes

`catalog_management` is used by authorised XeroFlow agency operators to manage Meta Business-owned product catalog containers for dealer inventory. The attached screencast shows the complete Facebook Login and permission grant, followed by the real production workflow to select an accessible Business, create a vehicle catalog, rename it, and delete the disposable catalog using an exact-name confirmation. XeroFlow does not force-delete catalogs with live dependencies.

Do not include `ads_read` in the next submission unless the production verification section records an explicit provider failure requiring it.
