# AutoGate lead delivery

The dashboard can deliver canonical leads to the carsales Lead Service used by
AutoGate. The integration defaults to the working V2 contract and has a single
environment switch for V3 after carsales provisions access.

## Runtime configuration

Set these as secrets in both the `agency-dashboard` Pages project and the
`leads-delivery-worker` Worker:

```text
AUTOGATE_LEAD_API_USERNAME=<monitored integration email>
AUTOGATE_LEAD_API_PASSWORD=<carsales-issued password>
```

Set the version as a non-secret variable:

```text
AUTOGATE_LEAD_API_VERSION=v2
```

The adapter fails closed when credentials are missing. Credentials must not be
stored in a destination's JSON config, a migration, `.env.example`, or source
code.

The username and password identify the shared ADME integration account. They
are global runtime secrets. Each client and dealership keeps its own
`sellerIdentifier`, lead type, origin, and tags in that tenant's destination
record. Never promote a client-specific SellerIdentifier into global runtime
configuration or reuse one tenant's destination config for another tenant.

## Version switch

| Setting | Endpoint | Identifier property |
|---|---|---|
| `v2` or unset | `POST https://lead-api.carsalesnetwork.com.au/v2/leads` | `UniqueIdentifier` |
| `v3` | `POST https://lead-api.carsalesnetwork.com.au/v3/leads` | `Identifier` |

V2 remains the default until carsales confirms V3 test and production access.
Changing the environment variable is the only application-side switch.

## Destination configuration

An `autogate` row in `lead_rule_destinations` requires:

```json
{
  "sellerIdentifier": "00000000-0000-0000-0000-000000000000",
  "service": "ADME",
  "leadType": "Used",
  "siteOrigin": "northernmotorgroup.com.au",
  "pageSource": "details",
  "ipAddress": "203.0.113.10",
  "tags": ["Meta", "Northern EV Centre"]
}
```

`sellerIdentifier`, `siteOrigin`, and `ipAddress` are validated before a
request is sent. The endpoint is fixed in code, so destination config cannot
redirect credentials or lead data to an arbitrary host.

## Delivery and retry behavior

- HTTP 2xx marks the delivery complete and stores the returned carsales GUID.
- HTTP 4xx, except 429, is a permanent payload/authentication failure and is
  not retried.
- HTTP 429 honors `Retry-After`.
- Network and HTTP 5xx failures use the lead engine's bounded retry schedule.
- The canonical lead UUID is reused across retries to prevent duplicate leads.

## Northern Motor Group EV Centre rollout

- Client ID: `efd1e1c6-f227-4b2f-b36d-19880bdba0e0`
- Meta campaign ID: `120244032522920320`
- Meta form ID: `1399083985579377`
- Meta Page ID: `377100258985904`
- Working V2 used-vehicle SellerIdentifier: retain the value from the existing
  production PHP adapter; do not copy it into documentation.

The form is readable with the connected Meta token and includes
`retailer_item_id` for AIA stock attribution. Future webhook delivery still
requires a Page access token and a `leadgen` Page subscription. Until that is
available, backfill the form through the authenticated lead-ingestion path and
preserve each Meta lead ID for deduplication.

Before enabling the destination:

1. Rotate the password embedded in the legacy PHP file.
2. Set the new credentials in Pages and the delivery Worker.
3. Deploy Pages and the delivery Worker with V2 selected.
4. Create the Meta form rule and disabled AutoGate destination.
5. Test with a carsales-approved test dealer or test lead.
6. Enable delivery, then backfill existing Meta leads once.
7. Confirm the returned GUID and lead appearance in AutoGate before subscribing
   the Page for ongoing live traffic.

## References

- [carsales Lead Service API](https://lead-api.carsalesnetwork.com.au/docs)
- [AutoGate integration portal](https://integrations.autogate.co/products/sending-inventory-to-autogate/Documentation)
