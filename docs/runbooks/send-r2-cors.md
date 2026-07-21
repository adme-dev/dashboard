# Send R2 browser CORS

`agency-files` uses separate read and upload rules. This configuration was explicitly approved and applied on 2026-07-21 for Dashboard Send. It does not enable Send routes or UI flags.

## Approved policy

- Existing `GET, HEAD` rules and origins remain unchanged.
- Upload rules allow only `PUT` and the `Content-Type` request header.
- Allowed origins are the established local, Xeroflow, Pages production, and Pages preview origins; no wildcard-all origin is permitted.
- Upload responses expose only `ETag`.

The live policy contains four rules:

```json
{
  "rules": [
    {
      "allowed": {
        "origins": [
          "http://localhost:3000",
          "https://xeroflow.io",
          "https://www.xeroflow.io",
          "https://app.xeroflow.io",
          "https://agency-dashboard-6cm.pages.dev"
        ],
        "methods": ["GET", "HEAD"],
        "headers": ["*"]
      },
      "exposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "maxAgeSeconds": 3600
    },
    {
      "allowed": {
        "origins": ["https://*.agency-dashboard-6cm.pages.dev"],
        "methods": ["GET", "HEAD"],
        "headers": ["*"]
      },
      "exposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "maxAgeSeconds": 3600
    },
    {
      "allowed": {
        "origins": [
          "http://localhost:3000",
          "https://xeroflow.io",
          "https://www.xeroflow.io",
          "https://app.xeroflow.io",
          "https://agency-dashboard-6cm.pages.dev"
        ],
        "methods": ["PUT"],
        "headers": ["Content-Type"]
      },
      "exposeHeaders": ["ETag"],
      "maxAgeSeconds": 3600
    },
    {
      "allowed": {
        "origins": ["https://*.agency-dashboard-6cm.pages.dev"],
        "methods": ["PUT"],
        "headers": ["Content-Type"]
      },
      "exposeHeaders": ["ETag"],
      "maxAgeSeconds": 3600
    }
  ]
}
```

## Verification

Read the policy before and immediately after any approved change:

```bash
pnpm exec wrangler r2 bucket cors list agency-files
```

A browser smoke must use a non-sensitive, uniquely named object, assert the exact allowed origin/method/header preflight, verify PUT and canonical HEAD metadata, inspect the browser console, and delete the object in `finally`. Never print presigned URLs or credentials.

## Rollback

Rollback is an explicit approval action. Remove only the two PUT rules and preserve the two original read rules. Immediately read the live policy back and verify browser uploads fail closed while existing reads still work.
