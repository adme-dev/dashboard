# Template copy recovery

The template action records its immutable request ID, version, name and route in browser storage before sending Use. Its storage key and required request header are derived by the server from the authenticated account and identity; no session token is stored. A fresh recovery read is required before sending or resuming. Account changes refuse the old request.

Authenticated recovery endpoints return only the caller's requests in the current account, including preparing and ready states. The customer copies list also exposes preparing requests owned by the current identity. Resume reuses the original body; a recovered ready receipt opens the existing destination. Browser storage failure prevents the first POST. Server recovery remains available if storage is lost after reservation. An unsent request lost through browser storage deletion cannot be recovered server-side.

The new header is mandatory: an older open UI must refresh before Use succeeds. This fails safely rather than silently moving a request between accounts. Separate requests from simultaneous tabs are not globally deduplicated; each explicit request retains its own idempotency identity.

Source verification: two Vue components compiled with Vue's SFC compiler; four TypeScript modules transpiled; whitespace check passed. No tests were run, as instructed. Full application build and hosted interaction verification remain release work.
