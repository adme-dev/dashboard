# XeroFlow model expansion — production controls

Verified against the provider documentation on 2026-08-19.

## Enabled catalogue

| XeroFlow ID | Provider model | Governance |
| --- | --- | --- |
| `aigateway/seedance-2-i2v` | `bytedance/seedance-2.0` | Vehicle/non-vehicle, approved source required, native audio, 4–12 seconds |
| `aigateway/vidu-i2v` | `vidu/q3-pro` | Vehicle/non-vehicle, approved start required, optional approved end frame |
| `aigateway/recraft-offer-card` | `recraft/recraftv4-1` | Non-vehicle only; vehicle terms are rejected even when the caller mislabels the subject |
| `aigateway/pruna-upscale` | `pruna/p-image-upscale` | Vehicle/non-vehicle transform, approved source required, safety checker cannot be disabled; generative enhancement flags are blocked for vehicles |
| inspection | `qwen/qwen3.6-27b` via Groq | Read-only JSON vision verdict, 1–5 images, Gateway required, no direct fallback |

Cloudflare currently publishes Seedance 2.0 with a 4–12 second duration schema. XeroFlow must not advertise or submit 30-second requests until that live schema changes.

## Compliance evidence

`verify_creative_compliance` compares one owned Banner Studio asset with up to four approved source assets. Every input is checked as an image no larger than Groq's 20 MB limit before dispatch. It persists an append-only `creative_compliance_checks` row containing the expected claims, model, references, structured verdict, confidence and pass/fail result.

Generated Recraft images and Pruna transforms run the same check automatically. A failed check returns `review_blocked`; it is not approval to publish. Human sign-off remains required.

## AI Gateway spend control

Before treating direct generation as production-ready:

1. Cloudflare dashboard → AI → AI Gateway → `default` → Spend limits.
2. Add a fixed monthly cost rule for the generation workload. Cloudflare evaluates the real provider cost and blocks over-budget requests with HTTP 429.
3. Add balance alerts/auto-top-up policy appropriate to the account.
4. Set the Pages production variables only after the Cloudflare rule exists:
   - `AI_GATEWAY_SPEND_LIMIT_CONFIRMED=true`
   - `AI_GATEWAY_GENERATION_MONTHLY_LIMIT_USD=<the exact configured dollar limit>`
5. Call MCP `list_creative_models` and confirm it returns `spendLimitConfirmed: true` and the same amount.

The application variables are an operator attestation and visibility control; Cloudflare's Gateway rule is the actual enforcement boundary.

## Retention constraint

Cloudflare Unified Billing ZDR currently covers OpenAI and Anthropic. Qwen vision runs through Groq, so client pricing, unreleased offers, artwork and reference images are not represented as ZDR-guaranteed by XeroFlow. Confirm client/OEM data terms before portfolio-scale checking.

## Primary references

- https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0/
- https://developers.cloudflare.com/ai/models/vidu/q3-pro/
- https://developers.cloudflare.com/ai/models/recraft/recraftv4-1/
- https://developers.cloudflare.com/ai/models/pruna/p-image-upscale/
- https://developers.cloudflare.com/ai-gateway/features/spend-limits/
- https://developers.cloudflare.com/ai-gateway/features/unified-billing/
- https://console.groq.com/docs/vision
