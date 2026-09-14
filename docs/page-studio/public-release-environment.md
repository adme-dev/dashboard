# Public release environment authority

Public forms and analytics select their release environment exclusively from the trusted Cloudflare binding `PAGE_STUDIO_RELEASE_ENVIRONMENT`. Supported values are `staging` and `production`; missing or unknown configuration returns 503 before database access. Payloads cannot supply or override this setting.

Both the immutable release and active release pointer must match that environment, alongside the existing tenant/client/site/digest, current release, active client/site, successful build and effective entitlement checks. Lead intake rechecks authority after reserving its immutable request receipt. Analytics rechecks authority on its transaction connection before inserting its event.

This fixes the normal staging publish→public intake path, which previously hardcoded production releases despite preview's staging delivery configuration. It does not relax entitlement statuses, consent requirements, synthetic isolation, deletion tombstones, or request payload immutability. The same reviewed code runs against isolated staging and production bindings. Fresh schema-v2 generated-form browser acceptance remains a separate release check; source tests do not claim a deployed form was published or submitted.
