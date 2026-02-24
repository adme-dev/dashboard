---
name: xero
description: Query Xero accounting for invoices, revenue, outstanding payments, and financial reports. Use for billing oversight, accounts receivable, and financial health checks. Requires XERO_ACCESS_TOKEN environment variable (OAuth 2.0 token).
---

# Xero Accounting Integration

Query ADME Advertising's Xero account for financial data — invoices, payments, contacts, and reports.

## Prerequisites

- `XERO_ACCESS_TOKEN` — OAuth 2.0 bearer token (set via wrangler secret)
- `XERO_TENANT_ID` — Xero organisation/tenant ID (set via wrangler secret)

## API Endpoint

All requests go to `https://api.xero.com/api.xro/2.0/` with:
- Header: `Authorization: Bearer $XERO_ACCESS_TOKEN`
- Header: `Xero-tenant-id: $XERO_TENANT_ID`
- Header: `Accept: application/json`

## Common Operations

### List Outstanding Invoices (Accounts Receivable)
```bash
curl -s "https://api.xero.com/api.xro/2.0/Invoices?Status=AUTHORISED&Type=ACCREC" \
  -H "Authorization: Bearer $XERO_ACCESS_TOKEN" \
  -H "Xero-tenant-id: $XERO_TENANT_ID" \
  -H "Accept: application/json" \
  | jq '.Invoices[] | {
      invoice: .InvoiceNumber,
      client: .Contact.Name,
      amount: .AmountDue,
      due: .DueDateString,
      status: .Status,
      overdue: (.AmountDue > 0 and (.DueDateString < (now | strftime("%Y-%m-%d"))))
    }' 2>/dev/null || \
  curl -s "https://api.xero.com/api.xro/2.0/Invoices?Status=AUTHORISED&Type=ACCREC" \
  -H "Authorization: Bearer $XERO_ACCESS_TOKEN" \
  -H "Xero-tenant-id: $XERO_TENANT_ID" \
  -H "Accept: application/json"
```

### Revenue by Month (Profit & Loss Report)
```bash
# Current month P&L
FROM=$(date +%Y-%m-01)
TO=$(date +%Y-%m-%d)
curl -s "https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${FROM}&toDate=${TO}" \
  -H "Authorization: Bearer $XERO_ACCESS_TOKEN" \
  -H "Xero-tenant-id: $XERO_TENANT_ID" \
  -H "Accept: application/json" \
  | jq '.Reports[0].Rows[] | select(.RowType == "Section") | {section: .Title, rows: [.Rows[]? | {description: .Cells[0].Value, amount: .Cells[1].Value}]}'
```

### List All Contacts (Clients)
```bash
curl -s "https://api.xero.com/api.xro/2.0/Contacts?IsCustomer=true" \
  -H "Authorization: Bearer $XERO_ACCESS_TOKEN" \
  -H "Xero-tenant-id: $XERO_TENANT_ID" \
  -H "Accept: application/json" \
  | jq '.Contacts[] | {name: .Name, email: .EmailAddress, outstanding: .Balances.AccountsReceivable.Outstanding}'
```

### Overdue Invoices
```bash
curl -s "https://api.xero.com/api.xro/2.0/Invoices?Status=AUTHORISED&Type=ACCREC" \
  -H "Authorization: Bearer $XERO_ACCESS_TOKEN" \
  -H "Xero-tenant-id: $XERO_TENANT_ID" \
  -H "Accept: application/json" \
  | jq --arg today "$(date +%Y-%m-%d)" \
    '[.Invoices[] | select(.AmountDue > 0) | select(.DueDateString < $today)] | sort_by(.DueDateString) | .[] | {
      invoice: .InvoiceNumber,
      client: .Contact.Name,
      amount_due: .AmountDue,
      due_date: .DueDateString,
      days_overdue: (($today | strptime("%Y-%m-%d") | mktime) - (.DueDateString | strptime("%Y-%m-%d") | mktime) | . / 86400 | floor)
    }'
```

### Create Invoice
```bash
CLIENT_ID="XERO_CONTACT_ID"  # Get from Contacts list
INVOICE_JSON='{
  "Type": "ACCREC",
  "Contact": {"ContactID": "'"$CLIENT_ID"'"},
  "LineItems": [
    {"Description": "EDM Design and Production", "Quantity": 1, "UnitAmount": 850, "AccountCode": "200"}
  ],
  "Date": "'"$(date +%Y-%m-%d)"'",
  "DueDate": "'"$(date -d '+30 days' +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d)"'",
  "Status": "DRAFT"
}'
curl -s -X POST "https://api.xero.com/api.xro/2.0/Invoices" \
  -H "Authorization: Bearer $XERO_ACCESS_TOKEN" \
  -H "Xero-tenant-id: $XERO_TENANT_ID" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$INVOICE_JSON" \
  | jq '{invoice: .Invoices[0].InvoiceNumber, status: .Invoices[0].Status, id: .Invoices[0].InvoiceID}'
```

## Notes

- `XERO_ACCESS_TOKEN` expires every 30 minutes — if you get a 401, the token needs refreshing. Notify the Agency Owner.
- `XERO_TENANT_ID` is the organisation identifier — required on every request
- Invoice statuses: DRAFT → SUBMITTED → AUTHORISED → PAID / VOIDED
- Always create invoices as DRAFT first — Agency Owner approves before sending
- Xero API rate limit: 60 calls per minute, 5000 per day
