# Banner text artwork and collaboration failures — 6 October 2026

## Evidence

The Brighton draft is `952a6cac-b4f7-473a-8751-f9637ec26688`. Production deployment `06ed1e1d-cc79-4971-9d0a-9c0e3f4ebd4a` (commit `85e1cb175ed3fd5fbed34e496fc6ab29848c39b0`) reproduced both failures in Safari.

A POST to generate-image at 02:53 UTC returned HTTP 500. AI Gateway log `c9a4ba32424890653e453c7243cecff0883884bd2c4e4645331d2ff9280408fe` shows the actual upstream HTTP 400: `Image size '1792x1024' is not supported`. The previous square request worked. Wide-text placement exposed a pre-existing adapter table with sizes incompatible with Recraft V4.1. The table's non-square mappings must use the current 1K sizes, including 1344x768 for wide and 768x1344 for tall requests. See [Recraft's supported sizes](https://www.recraft.ai/docs/api-reference/appendix) and [Cloudflare's model contract](https://developers.cloudflare.com/ai/models/recraft/recraftv4-1/).

Refreshing the saved draft also reproduced four collaboration HTTP 401 responses. The safe boundary diagnostic was `realtime.auth.denied: invalid_session_token`; normal authenticated REST calls still worked. The pre-Nitro cookie parser verified raw serialized values without URL-decoding them, whereas H3's cookie serializer escapes the base64 padding/signature. A URL-encoded, correctly signed fixture reproduced the same false rejection. No production session tokens were extracted or minted for testing.

## Repair and regression coverage

- Correct all five Recraft aspect mappings using its documented V4.1 1K table. Exercise the real adapter, including every non-square aspect; checking only the handler's aspectRatio is insufficient.
- Decode recognized session-cookie values once before HMAC verification; reject malformed encoding. Preserve the four-candidate bound, signature verification, expiry and active-user lookup. Expired and tampered encoded tokens must remain rejected.
- Catch provider-generation errors before storage and return a safe HTTP 502 message. Record a content-free failed invocation; do not expose provider payloads, silently retry a billed generation, create an asset on failure or bypass artwork quality review.

## Required live release verification

After the guarded production deployment, verify its canonical commit, a real Recraft wide-text result and persisted review, then add/refine/undo in Safari. Check the collaboration handshake returns 101 and normal established navigation including QR Codes loads. A build, mocked provider call or successful upload alone is not sufficient. Retain original banner text, timeline and draft status; save no experimental canvas edits unless authorized as the user's desired result.

The full repository lint/typecheck have existing debt. Record focused regression and changed-line lint results separately. Keep Worker size guards: the preceding artifact had only 2,930 bytes of raw headroom.
