# Enterprise Billing and Entitlements Control Plane

## Purpose

Provide a single tenant-scoped authority for plan assignment, feature access, metered usage, paywall decisions, and audit evidence.

## Runtime authority

Entitlement precedence remains:

1. Time-bound client override.
2. Explicit client feature entitlement.
3. Active subscription plan entitlement.
4. Missing and disabled.

Only `trial`, `active`, and `grace` permit feature use. Meter capacity is enforced only when an entitlement explicitly defines a meter `hardLimit`; existing clients without limits continue unchanged.

## Operator controls

Agency owners and administrators can:

- assign an active plan;
- move a subscription through trial, active, grace, overdue, suspended, and cancelled states;
- configure or remove time-bound feature overrides through the API;
- inspect effective entitlement sources;
- inspect current-period usage and provider cost;
- review append-only subscription and entitlement audit trails.

## Client visibility

Authenticated portal users can view only their own:

- plan and subscription status;
- billing period;
- effective feature entitlements;
- current-period metered usage.

Pricing internals, other tenants, provider references, and agency audit data are not exposed to the portal.

## Meter contract

Meter limits use:

```json
{
  "meters": {
    "messages": {
      "included": 1000,
      "hardLimit": 1200,
      "period": "subscription"
    }
  }
}
```

Services must call `requireBillingUsageCapacity` before a billable operation and `recordBillingUsage` after confirmed provider acceptance. Idempotency remains mandatory.

## Follow-on work

- Connect a payment provider without making it the entitlement authority.
- Add invoice and payment-state webhooks that update subscription state idempotently.
- Add plan-version editing with immutable historical versions.
- Wire capacity checks into SMS, voice, receptionist, audience export, and MCP execution as each service is activated.
- Add finance exports and margin reporting using provider cost events.
