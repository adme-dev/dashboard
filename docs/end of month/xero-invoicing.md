---
name: xero-invoicing
description: End-of-month invoicing automation for ADME Advertising. Pulls completed jobs from Monday.com (jobs board 3199166934), maps to Xero Chart of Accounts, applies GST rules, and generates a Xero-import CSV. Run at end of each month. Requires MONDAY_API_TOKEN, XERO_ACCESS_TOKEN, XERO_TENANT_ID.
---

# ADME Advertising — Xero EOM Invoicing Automation

Generate the monthly Xero import CSV from Monday.com completed jobs. This replaces Kellie's manual workbook process.

## Prerequisites

- `MONDAY_API_TOKEN` — Monday.com API token
- `XERO_ACCESS_TOKEN` — Xero OAuth 2.0 bearer token (expires every 30 min; refresh if 401)
- `XERO_TENANT_ID` — Xero organisation ID
- `MONDAY_JOBS_BOARD_ID` — Jobs/proof-to-be-billed board (default: 3199166934)

---

## Xero Import CSV Format (27 columns)

The file must match this exact header — asterisk (*) columns are required:

```
*ContactName,EmailAddress,POAddressLine1,POAddressLine2,POAddressLine3,POAddressLine4,POCity,PORegion,POPostalCode,POCountry,*InvoiceNumber,Reference,*InvoiceDate,*DueDate,InventoryItemCode,*Description,*Quantity,*UnitAmount,Discount,*AccountCode,*TaxType,TrackingName1,TrackingOption1,TrackingName2,TrackingOption2,Currency,BrandingTheme
```

**Rules:**
- One row per line item (multiple rows can share the same InvoiceNumber = same invoice)
- InvoiceDate = last day of the month being invoiced (e.g. `31/10/2024`)
- DueDate = InvoiceDate + 7 days (most clients) or + 14 days (Northern Group clients — see notes)
- Currency = `AUD`
- BrandingTheme = `ADME` (or leave blank for default)
- Quantity = always `1`
- TrackingName1 = `Media`, TrackingOption1 = service category (see COA mapping)
- TrackingName2 = `Client`, TrackingOption2 = full Xero client name (legal name)

---

## Chart of Accounts & GST Rules

| COA Code | Category          | Margin | TaxType              | TrackingOption1 examples                      |
|----------|-------------------|--------|----------------------|-----------------------------------------------|
| 205      | Printing          | 100%   | GST on Income        | Print, DL Card, Brochure, Letterhead          |
| 210      | Production        | 100%   | GST on Income        | EDM, Design, Creative, Animation, Retouching  |
| 215      | Marketing         | 100%   | GST on Income        | Strategy, Consultation, Copywriting           |
| 216      | Digital Advertising | 100% | GST on Income        | Display Ads, Programmatic, Preroll            |
| 217      | Social Media      | 100%   | GST on Income        | Social Content, Community Management, Boosting|
| 219      | Video Production  | 100%   | GST on Income        | Video, TVC, Reels, Photography                |
| 220      | Media             | 10%    | GST on Income        | Radio, Print Media, OOH, Sponsorship          |
| 225      | Website           | 100%   | GST on Income        | Website, Landing Page, SEO, Hosting           |
| 330      | Other (PPC)       | 0%     | **Facebook/Meta** → GST Free Expenses | Facebook Ads, Instagram Ads, Meta Ads |
| 330      | Other (PPC)       | 0%     | **Google** → GST on Expenses | Google Ads, SEM, Search Ads, YouTube Ads |

**Critical GST rule:**
- Facebook / Meta / Instagram ads → `TaxType = GST Free Expenses` (Facebook is foreign entity, no GST collected)
- Google Ads / SEM / YouTube Ads → `TaxType = GST on Expenses` (Google AU charges GST)
- Everything else → `TaxType = GST on Income`

**Margin rule for Media (220):** Bill at cost × 1.10. If Monday shows a $10,000 radio buy, bill the client $11,000. The $10,000 cost is a separate purchase — the invoice is for $11,000.

**Passthrough (330):** Bill exact spend amount. No markup. UnitAmount = exact ad spend.

---

## Step 1 — Get Last Invoice Number from Xero

Find the highest existing invoice number so we know where to start:

```bash
LAST_INV=$(curl -s "https://api.xero.com/api.xro/2.0/Invoices?Type=ACCREC&order=InvoiceNumber+DESC&pageSize=1" \
  -H "Authorization: Bearer $XERO_ACCESS_TOKEN" \
  -H "Xero-tenant-id: $XERO_TENANT_ID" \
  -H "Accept: application/json" \
  | jq -r '.Invoices[0].InvoiceNumber // "18300"')
echo "Last invoice: $LAST_INV"
# Extract numeric part and add 1
NEXT_INV=$(echo "$LAST_INV" | grep -o '[0-9]*$' | awk '{print $1+1}')
echo "Next invoice number: $NEXT_INV"
```

---

## Step 2 — Pull Completed Jobs from Monday (EOM)

Query jobs marked as "Done" or "Proof to be Billed" for the target month. Each Monday item may have multiple subitems (each subitem = one invoice line).

```bash
MONTH_START="2024-10-01"   # Set to first day of month being invoiced
MONTH_END="2024-10-31"     # Set to last day of month being invoiced
BOARD_ID="${MONDAY_JOBS_BOARD_ID:-3199166934}"

node << 'EOFNODE'
const token = process.env.MONDAY_API_TOKEN;
const boardId = process.env.MONDAY_JOBS_BOARD_ID || '3199166934';

// Fetch all items on the jobs board with their subitems and column values
async function fetchJobs(cursor = null) {
  const query = `
    query {
      boards(ids: [${boardId}]) {
        items_page(limit: 100${cursor ? `, cursor: "${cursor}"` : ''}) {
          cursor
          items {
            id
            name
            group { title }
            column_values {
              id
              title
              text
              value
            }
            subitems {
              id
              name
              column_values {
                id
                title
                text
                value
              }
            }
          }
        }
      }
    }
  `;
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'API-Version': '2024-01'
    },
    body: JSON.stringify({ query })
  });
  return res.json();
}

const data = await fetchJobs();
const items = data?.data?.boards?.[0]?.items_page?.items || [];
console.log(JSON.stringify(items, null, 2));
EOFNODE
```

---

## Step 3 — Map Jobs to Invoice Line Items (Node.js)

Save Monday job data to `/tmp/monday-jobs.json` first (from Step 2), then run this mapper to generate the CSV:

```bash
node << 'EOFCSV'
const fs = require('fs');

// ── Configuration ────────────────────────────────────────────────
const INVOICE_DATE = '31/10/2024';   // Last day of billing month (DD/MM/YYYY)
const MONTH_YEAR   = '10/2024';      // For reference field
let   nextInvoiceNum = 18401;        // From Step 1

// 14-day terms clients (all others get 7-day)
const FOURTEEN_DAY_CLIENTS = [
  'Northern Group', 'Northside Toyota', 'Northside Mazda', 'Northside Hyundai'
  // Add more as needed
];

// ── COA Mapping (Monday job type → Xero account code + tracking) ──
// Key: keyword in job name/description (lowercase), Value: {code, tracking, taxType}
const COA_MAP = [
  // PPC passthrough (no markup)
  { keywords: ['facebook ads', 'meta ads', 'instagram ads', 'facebook campaign'], code: '330', tracking: 'Facebook Ads', taxType: 'GST Free Expenses' },
  { keywords: ['google ads', 'google adwords', 'sem', 'search ads', 'google search', 'youtube ads', 'pmax', 'performance max'], code: '330', tracking: 'Google Ads', taxType: 'GST on Expenses' },
  // Media (10% margin)
  { keywords: ['radio', 'fm ', 'am ', 'network ten', 'channel 7', 'channel 9', 'ooh', 'out of home', 'billboard', 'bus shelter', 'print media', 'newspaper', 'magazine', 'sponsorship'], code: '220', tracking: 'Media', taxType: 'GST on Income' },
  // Website (100%)
  { keywords: ['website', 'landing page', 'seo', 'hosting', 'domain', 'web update', 'web support'], code: '225', tracking: 'Website', taxType: 'GST on Income' },
  // Video (100%)
  { keywords: ['video', 'tvc', 'reels', 'reel', 'photography', 'photo shoot', 'aerial', 'drone'], code: '219', tracking: 'Video Production', taxType: 'GST on Income' },
  // Social media (100%)
  { keywords: ['social media', 'social content', 'community management', 'boosting', 'tiktok', 'organic social'], code: '217', tracking: 'Social Media', taxType: 'GST on Income' },
  // Digital advertising (100%) - display, programmatic, not PPC
  { keywords: ['display', 'programmatic', 'preroll', 'pre-roll', 'banner', 'gdn', 'retargeting'], code: '216', tracking: 'Digital Advertising', taxType: 'GST on Income' },
  // Marketing strategy (100%)
  { keywords: ['strategy', 'consultation', 'consulting', 'planning', 'market research', 'analytics report', 'copywriting', 'copy'], code: '215', tracking: 'Marketing', taxType: 'GST on Income' },
  // Print production (100%)
  { keywords: ['print', 'brochure', 'dl card', 'flyer', 'poster', 'signage', 'letterhead', 'business card', 'catalogue', 'catalog'], code: '205', tracking: 'Printing', taxType: 'GST on Income' },
  // Production / design (100%) — catch-all for creative work
  { keywords: ['edm', 'email', 'design', 'creative', 'artwork', 'animation', 'retouching', 'layout', 'production', 'development'], code: '210', tracking: 'Production', taxType: 'GST on Income' },
];

function mapToAccount(description) {
  const lower = (description || '').toLowerCase();
  for (const rule of COA_MAP) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return { code: rule.code, tracking: rule.tracking, taxType: rule.taxType };
    }
  }
  // Default: production
  return { code: '210', tracking: 'Production', taxType: 'GST on Income' };
}

function getDueDate(invoiceDate, clientName) {
  // invoiceDate: DD/MM/YYYY
  const [d, m, y] = invoiceDate.split('/').map(Number);
  const date = new Date(y, m - 1, d);
  const is14Day = FOURTEEN_DAY_CLIENTS.some(c => (clientName || '').includes(c));
  date.setDate(date.getDate() + (is14Day ? 14 : 7));
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Load Monday jobs (pipe output from Step 2 into /tmp/monday-jobs.json)
const jobs = JSON.parse(fs.readFileSync('/tmp/monday-jobs.json', 'utf8'));

// CSV header
const HEADER = '*ContactName,EmailAddress,POAddressLine1,POAddressLine2,POAddressLine3,POAddressLine4,POCity,PORegion,POPostalCode,POCountry,*InvoiceNumber,Reference,*InvoiceDate,*DueDate,InventoryItemCode,*Description,*Quantity,*UnitAmount,Discount,*AccountCode,*TaxType,TrackingName1,TrackingOption1,TrackingName2,TrackingOption2,Currency,BrandingTheme';

const rows = [HEADER];

for (const item of jobs) {
  // Get client name from Monday item (look for 'Client' or 'Contact' column)
  const clientCol = item.column_values?.find(c =>
    c.title?.toLowerCase().includes('client') || c.title?.toLowerCase().includes('contact')
  );
  const clientName = clientCol?.text || item.name;

  // Get amount from Monday (look for 'Amount', 'Budget', 'Price' columns)
  const amountCol = item.column_values?.find(c =>
    c.title?.toLowerCase().includes('amount') ||
    c.title?.toLowerCase().includes('budget') ||
    c.title?.toLowerCase().includes('price') ||
    c.title?.toLowerCase().includes('value')
  );
  const amount = parseFloat((amountCol?.text || '0').replace(/[^0-9.]/g, '')) || 0;

  if (!amount || !clientName) continue;  // Skip items with no amount

  const invNum = String(nextInvoiceNum++);
  const dueDate = getDueDate(INVOICE_DATE, clientName);
  const description = item.name;
  const { code, tracking, taxType } = mapToAccount(description);

  rows.push([
    csvEscape(clientName),    // *ContactName
    '',                        // EmailAddress
    '', '', '', '',            // POAddress lines
    '', '', '', '',            // POCity/Region/PostalCode/Country
    csvEscape(invNum),         // *InvoiceNumber
    csvEscape(MONTH_YEAR),     // Reference
    csvEscape(INVOICE_DATE),   // *InvoiceDate
    csvEscape(dueDate),        // *DueDate
    '',                        // InventoryItemCode
    csvEscape(description),    // *Description
    '1',                       // *Quantity
    csvEscape(String(amount)), // *UnitAmount
    '',                        // Discount
    code,                      // *AccountCode
    taxType,                   // *TaxType
    'Media',                   // TrackingName1
    csvEscape(tracking),       // TrackingOption1
    'Client',                  // TrackingName2
    csvEscape(clientName),     // TrackingOption2
    'AUD',                     // Currency
    'ADME'                     // BrandingTheme
  ].join(','));
}

const output = rows.join('\n');
fs.writeFileSync('/tmp/xero-import.csv', output);
console.log(`Generated ${rows.length - 1} invoice lines`);
console.log(`Invoice numbers: ${18401} – ${nextInvoiceNum - 1}`);
console.log('Saved to: /tmp/xero-import.csv');
EOFCSV
```

---

## Step 4 — Review and Verify CSV

```bash
# Count lines
wc -l /tmp/xero-import.csv

# Show first 5 invoice rows
head -6 /tmp/xero-import.csv | column -t -s,

# Check total invoiced amount (sum column 18 = UnitAmount)
awk -F',' 'NR>1 && $18+0>0 {sum+=$18} END {printf "Total ex-GST: $%.2f AUD\n", sum}' /tmp/xero-import.csv

# Check GST breakdown
awk -F',' 'NR>1 {print $21}' /tmp/xero-import.csv | sort | uniq -c
# Should show: X GST on Income, Y GST Free Expenses, Z GST on Expenses

# List all unique clients
awk -F',' 'NR>1 {print $1}' /tmp/xero-import.csv | sort -u
```

---

## Step 5 — Upload to Xero (Bulk Import via API)

Xero's CSV import is done via the web UI (Accounts → Sales → Import), **not** via API. Save the CSV and share with Agency Owner for manual upload, OR use the API batch method below.

### API Batch Upload (preferred for automation)

```bash
# Convert CSV rows to Xero Invoice API format
# Group rows by InvoiceNumber first, then POST as batch

node << 'EOFBATCH'
const fs = require('fs');
const csv = fs.readFileSync('/tmp/xero-import.csv', 'utf8');
const lines = csv.trim().split('\n');

// Parse CSV
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

const header = parseCSVLine(lines[0]);
const rows = lines.slice(1).map(parseCSVLine);

// Group by invoice number
const invoices = {};
for (const row of rows) {
  const obj = {};
  header.forEach((h, i) => obj[h.replace(/^\*/, '')] = row[i] || '');

  const invNum = obj.InvoiceNumber;
  if (!invoices[invNum]) {
    invoices[invNum] = {
      contactName: obj.ContactName,
      invoiceNumber: invNum,
      reference: obj.Reference,
      date: obj.InvoiceDate,
      dueDate: obj.DueDate,
      lineItems: []
    };
  }
  invoices[invNum].lineItems.push({
    description: obj.Description,
    quantity: parseFloat(obj.Quantity) || 1,
    unitAmount: parseFloat(obj.UnitAmount) || 0,
    accountCode: obj.AccountCode,
    taxType: obj.TaxType,
    tracking: [
      { name: obj.TrackingName1, option: obj.TrackingOption1 },
      { name: obj.TrackingName2, option: obj.TrackingOption2 }
    ].filter(t => t.name && t.option)
  });
}

// Convert date DD/MM/YYYY → YYYY-MM-DD
function xeroDate(d) {
  const [day, mon, yr] = d.split('/');
  return `${yr}-${mon}-${day}`;
}

// Build Xero API payload
const xeroInvoices = Object.values(invoices).map(inv => ({
  Type: 'ACCREC',
  Contact: { Name: inv.contactName },
  InvoiceNumber: inv.invoiceNumber,
  Reference: inv.reference,
  Date: xeroDate(inv.date),
  DueDate: xeroDate(inv.dueDate),
  Status: 'DRAFT',
  LineAmountTypes: 'Exclusive',
  CurrencyCode: 'AUD',
  LineItems: inv.lineItems.map(li => ({
    Description: li.description,
    Quantity: li.quantity,
    UnitAmount: li.unitAmount,
    AccountCode: li.accountCode,
    TaxType: li.taxType,
    Tracking: li.tracking
  }))
}));

fs.writeFileSync('/tmp/xero-batch.json', JSON.stringify({ Invoices: xeroInvoices }, null, 2));
console.log(`Ready to POST ${xeroInvoices.length} invoices to Xero`);
EOFBATCH

# POST to Xero (creates as DRAFT — Agency Owner reviews before approving)
curl -s -X POST "https://api.xero.com/api.xro/2.0/Invoices?summarizeErrors=false" \
  -H "Authorization: Bearer $XERO_ACCESS_TOKEN" \
  -H "Xero-tenant-id: $XERO_TENANT_ID" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d @/tmp/xero-batch.json \
  | jq '{
      total: (.Invoices | length),
      errors: [.Invoices[] | select(.HasErrors == true) | {inv: .InvoiceNumber, error: .ValidationErrors[0].Message}],
      created: [.Invoices[] | select(.HasErrors == false) | .InvoiceNumber] | length
    }'
```

---

## End-of-Month Checklist (run in order)

1. **Check Monday jobs board** — confirm all jobs for the month are marked Done/Proof
2. **Check Xero token** — if expired, get Agency Owner to refresh via Xero OAuth
3. **Get last invoice number** (Step 1)
4. **Export Monday jobs to JSON** (Step 2) → save to `/tmp/monday-jobs.json`
5. **Generate CSV** (Step 3) — review totals match expectation (~$250-280K typical month)
6. **Spot-check** 5-10 rows manually — client name, COA code, GST type, amount
7. **Upload to Xero as DRAFT** (Step 5)
8. **Notify Agency Owner** to review and AUTHORISE invoices in Xero before sending
9. **Archive CSV** to R2 as `invoices/YYYY-MM/xero-import-YYYY-MM.csv`

---

## Archive to R2

```bash
MONTH="2024-10"
rclone copy /tmp/xero-import.csv r2:moltbot-data/invoices/${MONTH}/ \
  --s3-provider=Cloudflare \
  --s3-access-key-id="${R2_ACCESS_KEY_ID}" \
  --s3-secret-access-key="${R2_SECRET_ACCESS_KEY}" \
  --s3-endpoint="https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  && echo "Archived to R2: invoices/${MONTH}/xero-import-${MONTH}.csv"
```

---

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` | Xero token expired (30 min) | Agency Owner refreshes OAuth token via Xero developer portal |
| Client not found in Xero | Contact name mismatch | Fetch contacts via `GET /Contacts` and find correct legal name |
| Wrong GST type on Meta spend | Keywords not matching | Check Monday job description — add "Facebook Ads" or "Meta" to description |
| Duplicate invoice numbers | Re-running script | Delete `/tmp/xero-import.csv` and re-run from Step 1 |
| Missing amount on Monday item | Job not priced yet | Follow up with Traffic Controller — jobs must have a $ value before EOM |

---

## Notes

- Always import as **DRAFT** — never AUTHORISED. Agency Owner (Rob) approves and sends.
- Xero rate limit: 60 req/min, 5000/day — batching via `/Invoices` API handles this (up to 50 per POST)
- The `xero` skill handles querying existing invoices/contacts; this skill handles bulk creation from Monday
- For Media (220) line items: UnitAmount should already be the marked-up price (cost × 1.10) — confirm with Traffic Controller that Monday has the billed amount, not the cost
- Northern Group 14-day terms: check `FOURTEEN_DAY_CLIENTS` array matches current client list
- Invoice sequence: ADME uses plain integers (e.g. 18401) with no prefix
