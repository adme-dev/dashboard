# Release gate inventory reconciliation

The current-main frozen inventory reproduced exactly at 1,613 rows and digest `cef85f34a2fd968996632bfc6e7377f6e4b960c7a7bf61dd22a4d0b2bad5fbf4`. The Banner candidate adds 20 lexical rows and removes eight: 1,625 rows, digest `3d200d48926a51804066ebd3bd4753b88515ef95169b791dd83f7990a16d8cd5`.

Reviewed differences are explicit write access on editing/job/QR mutations; assignment of the existing creation user; authoritative request-bound cron/OpenAI credentials; removal of four ambient S3 reads; request-aware Dissector configuration; and a local-only dispatch fallback. There is no new God-mode bypass registration or change to identity/tenant classification. The test pins every added and removed row as well as aggregate counts and digest. This updates the source inventory after reviewed functionality; it does not weaken any runtime access check.

The first reconciled run failed on the old frozen row count (expected 1,613, actual 1,625), while the other 44 tests passed. Rerun evidence belongs to the release ledger. Main source at reconciliation: `704fb5caf`.

Final reconciliation regression: all 45 tests across gate inventory, Pages text bindings and Google Business environment passed on Node 24.18.0. Scoped ESLint and diff whitespace check passed.
