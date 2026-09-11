# QR SVG export failed in the deployed Worker

The user reported HTTP 500 downloading a QR SVG on 11 September 2026 after the
current Dashboard application was restored. The QR index and code detail read
paths returned existing data, but the SVG endpoint failed.

An authenticated browser reproduced the exact download failure. A Cloudflare
tail filtered to a tagged export request on deployment
`54b15c18-73bb-4897-b201-1956ea89fd5d` reported:

```text
No such module "chunks/m/pngjs".
  imported from "chunks/m/13o.mjs"
```

`shared/qr/matrix.ts` imported the root of `qrcode`, which eagerly imports its
Node PNG and filesystem renderers even when only `create()` is used. Nitro
intentionally excludes `pngjs` from the Worker bundle. Loading the SVG route
therefore failed before it could return the generated SVG. Node-only unit tests
passed because their local dependencies supplied the missing package.

The matrix utility now imports the pure encoder at `qrcode/lib/core/qrcode.js`.
It uses the same encoder, error-correction settings and output matrix without
loading Node image/file renderers. Existing SVG styling and frame code is unchanged.

The regression test bundles the actual SVG renderer with the production PNG
exclusion, asserts that no external modules remain, and executes the standalone
bundle to render an SVG. Before the fix it failed with external dependencies
`fs`, `pngjs`, `fs`, `fs`. After the fix all 123 QR tests and focused ESLint pass.

- [x] Reproduce authenticated production download failure and capture the cause.
- [x] Apply the matrix-only import and pass the failing bundle regression.
- [x] Pass the complete QR unit suite and focused lint.
- [ ] Build and verify the production Worker artifact on the current main base.
- [ ] Release through the guarded Dashboard deployment command.
- [ ] Verify the user's exact authenticated URL returns a downloadable SVG with
  the correct attachment filename, MIME type and private/no-store headers.

The read-only diagnosis did not create, edit or scan QR codes. The user's codes
and destinations remain intact. Stop owned diagnostic tails and browser tabs
after the live verification.
