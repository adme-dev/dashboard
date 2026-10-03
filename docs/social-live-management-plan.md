# Live Facebook management and delivery handoff

Approved scope: user requested live Wall editing/removal with actor history and continued account-manager-to-publication workflow.

1. Release capacity: render interaction-only history and Composer preview in the browser. Preserve existing component names and behavior; build under unchanged Worker budgets.
2. Facebook feed-post controls: read the current provider caption, approve an explicit text revision or removal, retain the original publication and durable operation history. Resolve target only from the stored successful receipt and same-client connected account. Management role plus client access required. Customer-approval-gated posts remain blocked until a versioned client revision flow exists. Videos/media replacement are excluded with an explicit explanation.
3. Reserve operation before sending to Meta; one unresolved operation per target, request idempotency, no automatic mutation retries. Re-read caption to detect external changes. Keep ambiguous outcomes visible and prevent duplicate mutations. Confirm deletion explicitly in the application. Never use local row deletion to remove a live post.
4. UI: Wall opens a compact client-only slideover. Existing Nuxt UI semantic dark/light tokens, inherited sans typography, left-aligned captions, clear account/network identity. Separate edit and destructive removal decisions. History retains actor/date/outcome and before/after captions.
5. Delivery handoff: reconcile only provider-confirmed success to linked tasks; do not close an entire job or bypass customer review. Confirm existing task/status authority before implementation.

Verification: provider contract and failure tests; client/account isolation; role/customer gate; concurrent/idempotent operation tests; unchanged archive retention; full build/source guards; live UI read-only probe. No real post will be deleted solely to test the control.

Primary provider reference: Meta official facebook-python-business-sdk facebook_business/adobjects/post.py (api_get, api_update message, api_delete). Official developer documentation returned 429 during research.
