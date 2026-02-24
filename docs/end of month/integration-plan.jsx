import { useState } from "react";

const COLORS = {
  bg: "#0a0e17",
  surface: "#111827",
  surfaceLight: "#1a2332",
  border: "#1e3a5f",
  borderLight: "#2d4a6f",
  accent: "#00d4aa",
  accentDim: "#00d4aa33",
  warning: "#f59e0b",
  warningDim: "#f59e0b22",
  danger: "#ef4444",
  dangerDim: "#ef444422",
  blue: "#3b82f6",
  blueDim: "#3b82f622",
  purple: "#8b5cf6",
  purpleDim: "#8b5cf622",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  textMuted: "#64748b",
};

const tabs = [
  { id: "current", label: "Current State", icon: "📊" },
  { id: "architecture", label: "Target Architecture", icon: "🏗️" },
  { id: "xero", label: "Xero Integration", icon: "🔗" },
  { id: "monday", label: "Monday.com Flow", icon: "📋" },
  { id: "dashboard", label: "Where to Display", icon: "🖥️" },
  { id: "roadmap", label: "Build Roadmap", icon: "🗺️" },
];

function Badge({ color, children }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.5,
        background: color === "green" ? COLORS.accentDim : color === "yellow" ? COLORS.warningDim : color === "red" ? COLORS.dangerDim : color === "blue" ? COLORS.blueDim : COLORS.purpleDim,
        color: color === "green" ? COLORS.accent : color === "yellow" ? COLORS.warning : color === "red" ? COLORS.danger : color === "blue" ? COLORS.blue : COLORS.purple,
        border: `1px solid ${color === "green" ? COLORS.accent + "44" : color === "yellow" ? COLORS.warning + "44" : color === "red" ? COLORS.danger + "44" : color === "blue" ? COLORS.blue + "44" : COLORS.purple + "44"}`,
      }}
    >
      {children}
    </span>
  );
}

function Card({ title, children, accent, style }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "20px 24px",
        borderTop: accent ? `3px solid ${accent}` : undefined,
        ...style,
      }}
    >
      {title && (
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: COLORS.text, letterSpacing: 0.3 }}>{title}</h3>
      )}
      {children}
    </div>
  );
}

function FlowArrow({ label, vertical }) {
  if (vertical) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0" }}>
        <div style={{ width: 2, height: 20, background: COLORS.accent }}></div>
        {label && <span style={{ fontSize: 10, color: COLORS.accent, padding: "2px 8px", background: COLORS.accentDim, borderRadius: 10, margin: "4px 0" }}>{label}</span>}
        <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${COLORS.accent}` }}></div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0 8px", flexShrink: 0 }}>
      <div style={{ height: 2, width: 24, background: COLORS.accent }}></div>
      <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: `7px solid ${COLORS.accent}` }}></div>
    </div>
  );
}

function CurrentState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <Card accent={COLORS.danger}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>📓</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Excel Workbook</div>
              <div style={{ fontSize: 11, color: COLORS.textDim }}>MS OneDrive — live document</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.7 }}>
            <div><strong style={{ color: COLORS.danger }}>132 sheets</strong> — one per client/brand</div>
            <div><strong>67 columns</strong> per sheet</div>
            <div>Orange highlights = recurring monthly</div>
            <div>4 batch export tabs (Mar 2024)</div>
            <div>Manual TOTALS sheet rollup</div>
            <div>Dropdown menu tab for tracking categories</div>
          </div>
        </Card>

        <Card accent={COLORS.warning}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>👥</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Manual Process</div>
              <div style={{ fontSize: 11, color: COLORS.textDim }}>4+ people involved</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.7 }}>
            <div><strong>Hannah</strong> — enters from meeting agendas/summaries</div>
            <div><strong>Kellie</strong> — reviews, adds billboards/cinema/VMS</div>
            <div><strong>Clara</strong> — reviews during & at EOM</div>
            <div><strong>Marketing Partners</strong> — EOM review</div>
            <div>Final checks: PPC budgets vs spends, SMS, EDM</div>
          </div>
        </Card>

        <Card accent={COLORS.blue}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>📤</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Xero Import</div>
              <div style={{ fontSize: 11, color: COLORS.textDim }}>27-column CSV template</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.7 }}>
            <div>Manual CSV export from workbook</div>
            <div>Batch uploads (4 batches in March)</div>
            <div>Invoice #s: <strong>18235–18364</strong> (Oct range)</div>
            <div><strong>161 Xero contacts</strong> to match</div>
            <div>Must match legal entity names exactly</div>
          </div>
        </Card>
      </div>

      <Card title="Current Data Flow — Pain Points">
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {["Client Meeting", "Hannah enters Monday + Excel", "Kellie reviews / adds entries", "Clara + Partners EOM review", "PPC budget vs spend check", "Manual CSV build", "Batch upload to Xero"].map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ padding: "6px 12px", borderRadius: 8, background: COLORS.surfaceLight, border: `1px solid ${COLORS.border}`, fontSize: 11, color: COLORS.text, whiteSpace: "nowrap" }}>
                {step}
              </div>
              {i < 6 && <span style={{ color: COLORS.accent }}>→</span>}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { issue: "Dual entry", desc: "Data entered in both Monday.com AND Excel workbook", severity: "red" },
            { issue: "GST classification risk", desc: "Facebook (GST-free) vs Google (GST on Expenses) manually selected per line — BAS audit risk", severity: "red" },
            { issue: "130+ client sheets", desc: "Each brand has its own tab with 67 columns — impossible to scale", severity: "yellow" },
            { issue: "Invoice # management", desc: "Kellie manually assigns sequential numbers at EOM across all clients", severity: "yellow" },
            { issue: "No mid-month visibility", desc: "Totals only available after full EOM process", severity: "yellow" },
            { issue: "Contact name matching", desc: "Excel client names must exactly match 161 Xero legal entity names", severity: "yellow" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 8, background: item.severity === "red" ? COLORS.dangerDim : COLORS.warningDim, border: `1px solid ${item.severity === "red" ? COLORS.danger + "33" : COLORS.warning + "33"}` }}>
              <span style={{ fontSize: 14 }}>{item.severity === "red" ? "🔴" : "🟡"}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>{item.issue}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Workbook Column Structure (per client sheet)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            { label: "Col A: Media Tracking", color: COLORS.accent },
            { label: "Col B: Date", color: COLORS.textMuted },
            { label: "Col C: Description", color: COLORS.blue },
            { label: "Col D: QTY", color: COLORS.textMuted },
            { label: "Col E: Media Charge $", color: COLORS.warning },
            { label: "Col F-G: SMS/MMS", color: COLORS.purple },
            { label: "Col H-I: Special Media $", color: COLORS.warning },
            { label: "Col J-K: Production $", color: COLORS.accent },
            { label: "... → Col BN: Various charge categories", color: COLORS.textMuted },
          ].map((col, i) => (
            <span key={i} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, background: col.color + "22", color: col.color, border: `1px solid ${col.color}33` }}>{col.label}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Architecture() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Target Architecture — Eliminate the Excel Workbook">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, padding: "10px 0" }}>
          {/* Monday.com layer */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", width: "100%" }}>
            <div style={{ padding: "14px 20px", borderRadius: 10, background: "#6c2bd9" + "33", border: "1px solid #6c2bd9", textAlign: "center", minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>Monday.com</div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>Jobs Board #3199166934</div>
              <div style={{ fontSize: 10, color: COLORS.textDim }}>Single source of truth</div>
            </div>
            <div style={{ padding: "14px 20px", borderRadius: 10, background: COLORS.blueDim, border: `1px solid ${COLORS.blue}`, textAlign: "center", minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.blue }}>Meta Budget Hawk</div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>Facebook/Google ad spend</div>
              <div style={{ fontSize: 10, color: COLORS.textDim }}>Actual PPC costs</div>
            </div>
          </div>

          <FlowArrow vertical label="GraphQL API + REST" />

          {/* Processing Engine */}
          <div style={{ padding: "16px 28px", borderRadius: 12, background: COLORS.accentDim, border: `2px solid ${COLORS.accent}`, textAlign: "center", minWidth: 340 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.accent }}>ADME Invoice Engine</div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 6, lineHeight: 1.6 }}>
              COA mapping (205–330) · GST auto-classification<br/>
              Invoice # sequencing · Contact name matching<br/>
              Media 10% margin calc · PPC passthrough validation
            </div>
          </div>

          <FlowArrow vertical label="Xero API v2.0 — OAuth 2.0" />

          {/* Xero layer */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", width: "100%" }}>
            <div style={{ padding: "14px 20px", borderRadius: 10, background: "#0078C8" + "33", border: "1px solid #0078C8", textAlign: "center", minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#60bfff" }}>Xero — DRAFT Invoices</div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>Batch POST /Invoices</div>
              <div style={{ fontSize: 10, color: COLORS.textDim }}>Rob reviews & authorises</div>
            </div>
            <div style={{ padding: "14px 20px", borderRadius: 10, background: COLORS.warningDim, border: `1px solid ${COLORS.warning}`, textAlign: "center", minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.warning }}>Dashboard</div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>Mid-month totals view</div>
              <div style={{ fontSize: 10, color: COLORS.textDim }}>Revenue / GST / Receivables</div>
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="What the Engine Replaces" accent={COLORS.accent}>
          <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.8 }}>
            {[
              "132 Excel client sheets → Monday.com items + subitems",
              "Manual dropdown selection → Auto COA mapping from job description keywords",
              "Manual GST assignment → Rule: Facebook/Meta = GST Free, Google = GST on Expenses, all else = GST on Income",
              "Manual invoice numbering → Auto-increment from Xero's last invoice #",
              "Manual CSV build → API-generated Xero batch payload",
              "EOM-only visibility → Real-time dashboard from Monday.com data",
              "Dual entry (Monday + Excel) → Monday.com is the single source",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <span style={{ color: COLORS.accent, flexShrink: 0 }}>✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="What Stays Manual (by design)" accent={COLORS.warning}>
          <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.8 }}>
            {[
              "Rob reviews & authorises invoices in Xero — never auto-send",
              "Kellie's EOM checks for PPC budget vs actual spend",
              "Clara + Marketing Partners review during month",
              "Special entries (digital billboards, cinema, VMS) flagged for manual review",
              "Northern Group 14-day payment terms — configurable rule",
              "New client onboarding — must create Xero contact first",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <span style={{ color: COLORS.warning, flexShrink: 0 }}>⚡</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function XeroIntegration() {
  const gstRules = [
    { type: "Facebook / Meta / Instagram Ads", coa: "330", gst: "GST Free Expenses", tax: "BASEXCLUDED", color: COLORS.accent },
    { type: "Google Ads / SEM / YouTube / PMax", coa: "330", gst: "GST on Expenses", tax: "INPUT", color: COLORS.blue },
    { type: "Microsoft Ads / LinkedIn Ads", coa: "330", gst: "GST on Expenses", tax: "INPUT", color: COLORS.blue },
    { type: "Campaign Monitor (eDM sends)", coa: "330", gst: "GST on Expenses", tax: "INPUT", color: COLORS.blue },
    { type: "All ADME service invoices", coa: "205–225", gst: "GST on Income", tax: "OUTPUT", color: COLORS.warning },
    { type: "Media bookings (radio, print, OOH)", coa: "220", gst: "GST on Income", tax: "OUTPUT", color: COLORS.warning },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Critical GST Classification — Automated Rules" accent={COLORS.danger}>
        <p style={{ fontSize: 12, color: COLORS.textDim, margin: "0 0 14px", lineHeight: 1.6 }}>
          The #1 source of BAS errors in agency accounting. The engine auto-classifies based on description keywords — no manual selection needed.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                {["Line Item Type", "COA", "Xero TaxType", "BAS Code"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: COLORS.textMuted, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gstRules.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                  <td style={{ padding: "8px 12px", color: COLORS.text }}>{r.type}</td>
                  <td style={{ padding: "8px 12px" }}><code style={{ color: r.color, background: r.color + "22", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{r.coa}</code></td>
                  <td style={{ padding: "8px 12px", color: r.color, fontWeight: 600 }}>{r.gst}</td>
                  <td style={{ padding: "8px 12px", color: COLORS.textDim }}>{r.tax}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Chart of Accounts Mapping" accent={COLORS.blue}>
          <div style={{ fontSize: 12, lineHeight: 2 }}>
            {[
              { code: "205", name: "Printing", margin: "100%", examples: "Print, DL Card, Brochure" },
              { code: "210", name: "Production", margin: "100%", examples: "EDM, Design, Creative" },
              { code: "215", name: "Marketing", margin: "100%", examples: "Strategy, Consultation" },
              { code: "216", name: "Digital Advertising", margin: "100%", examples: "Display, Programmatic, Mgmt fees" },
              { code: "217", name: "Social Media", margin: "100%", examples: "Social Content, Community Mgmt" },
              { code: "219", name: "Video Production", margin: "100%", examples: "TVC, Reels, Photography" },
              { code: "220", name: "Media", margin: "10%", examples: "Radio, Print, OOH — cost × 1.10" },
              { code: "225", name: "Website", margin: "100%", examples: "Website, SEO, Hosting" },
              { code: "330", name: "Other (PPC)", margin: "0%", examples: "Facebook/Google passthrough" },
            ].map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ color: COLORS.accent, background: COLORS.accentDim, padding: "1px 6px", borderRadius: 4, fontSize: 11, width: 32, textAlign: "center", flexShrink: 0 }}>{a.code}</code>
                <span style={{ color: COLORS.text, fontWeight: 600, width: 110, flexShrink: 0 }}>{a.name}</span>
                <Badge color={a.margin === "0%" ? "red" : a.margin === "10%" ? "yellow" : "green"}>{a.margin}</Badge>
                <span style={{ color: COLORS.textMuted, fontSize: 10 }}>{a.examples}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Xero API Integration Points" accent={COLORS.accent}>
          <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.8 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4 }}>1. Get Last Invoice # (pre-EOM)</div>
              <code style={{ fontSize: 10, color: COLORS.accent, background: COLORS.accentDim, padding: "2px 8px", borderRadius: 4 }}>GET /Invoices?Type=ACCREC&order=InvoiceNumber+DESC&pageSize=1</code>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4 }}>2. Validate Contact Names</div>
              <code style={{ fontSize: 10, color: COLORS.accent, background: COLORS.accentDim, padding: "2px 8px", borderRadius: 4 }}>GET /Contacts?IsCustomer=true</code>
              <div style={{ fontSize: 11, marginTop: 4 }}>Match 161 Xero contacts against Monday.com client names</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4 }}>3. Batch Create Invoices</div>
              <code style={{ fontSize: 10, color: COLORS.accent, background: COLORS.accentDim, padding: "2px 8px", borderRadius: 4 }}>POST /Invoices — Status: DRAFT, up to 50/batch</code>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4 }}>4. Tracking Categories</div>
              <code style={{ fontSize: 10, color: COLORS.accent, background: COLORS.accentDim, padding: "2px 8px", borderRadius: 4 }}>TrackingName1=Media, TrackingName2=Client</code>
              <div style={{ fontSize: 11, marginTop: 4 }}>62 media tracking options from dropdown menu</div>
            </div>
            <div>
              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4 }}>5. Token Management</div>
              <div style={{ fontSize: 11 }}>OAuth 2.0 — token expires every 30 min. Refresh automatically or alert Rob.</div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Xero CSV → API Migration" accent={COLORS.purple}>
        <p style={{ fontSize: 12, color: COLORS.textDim, margin: "0 0 12px" }}>
          The existing workbook produces CSV files matching Xero's 27-column SalesInvoiceTemplate. The engine replaces CSV generation with direct API calls, but the data mapping is identical:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["*ContactName → Contact.Name", "*InvoiceNumber → auto from Xero", "*InvoiceDate → last day of month", "*DueDate → +7 days (or +14 Northern)", "*Description → from Monday item/subitem", "*Quantity → always 1", "*UnitAmount → from Monday price column", "*AccountCode → auto from COA map", "*TaxType → auto from GST rules", "TrackingName1=Media", "TrackingOption1 → from 62 dropdown categories", "TrackingName2=Client", "Currency=AUD", "BrandingTheme=ADME"].map((f, i) => (
            <span key={i} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, background: COLORS.surfaceLight, border: `1px solid ${COLORS.border}`, color: f.startsWith("*") ? COLORS.accent : COLORS.textDim }}>{f}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MondayFlow() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Monday.com as Single Source of Truth" accent="#6c2bd9">
        <p style={{ fontSize: 12, color: COLORS.textDim, margin: "0 0 14px", lineHeight: 1.6 }}>
          The goal: eliminate dual entry. Monday.com's Jobs board (#3199166934) becomes the only place data is entered. The engine reads from Monday at EOM and generates everything else.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { step: "1", title: "Client Meeting → Meeting Agenda", desc: "Marketing-only items (Facebook & Google PPC budgets). Hannah enters into Monday.", who: "Hannah", color: COLORS.accent },
            { step: "2", title: "Meeting Summary → Production charges", desc: "Emailed to client. Production and additional services. Hannah enters into Monday.", who: "Hannah", color: COLORS.accent },
            { step: "3", title: "Digital Team sets PPC budgets", desc: "Enters budgets from Monday into Facebook/Google platforms. Budget Hawk tracks actual spend.", who: "Digital Team", color: COLORS.blue },
            { step: "4", title: "Mid-month: Kellie adds special items", desc: "Digital billboards, cinema, VMS boards — items that don't flow through Monday. These need a Monday entry path.", who: "Kellie", color: COLORS.warning },
            { step: "5", title: "EOM: Clara + Partners review", desc: "Review all entries in Monday (not Excel). Approve or flag for correction.", who: "Clara", color: COLORS.purple },
            { step: "6", title: "EOM: PPC reconciliation", desc: "Budget Hawk provides actual Facebook/Google spend. Compare to Monday budgets. Adjust line items.", who: "Hannah + Kellie", color: COLORS.danger },
            { step: "7", title: "Engine generates Xero invoices", desc: "Reads Monday, applies COA + GST rules, creates DRAFT invoices via Xero API.", who: "Automated", color: COLORS.accent },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "12px 16px", borderRadius: 10, background: COLORS.surfaceLight, border: `1px solid ${COLORS.border}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: s.color + "33", border: `2px solid ${s.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: s.color, flexShrink: 0 }}>{s.step}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{s.title}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{s.desc}</div>
                <Badge color={s.who === "Automated" ? "green" : "blue"}>{s.who}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Monday Board Structure Needed" accent="#6c2bd9">
          <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>Required columns on Jobs Board:</div>
            {[
              "Client (dropdown → Xero contact name)",
              "Brand / Entity (for sub-brands)",
              "Description (free text → drives COA mapping)",
              "Media Tracking Category (dropdown — 62 options)",
              "Amount ex GST ($)",
              "COA Code (auto-populated or dropdown: 205–330)",
              "Status (Done / Proof to be Billed / Draft)",
              "Month (date column for EOM filtering)",
              "Account Manager (person column)",
              "Billing Notes (text — special instructions)",
            ].map((item, i) => (
              <div key={i}>• {item}</div>
            ))}
          </div>
        </Card>

        <Card title="Budget Hawk Integration" accent={COLORS.blue}>
          <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>auto-meta-budget-hawk feeds:</div>
            <div style={{ marginBottom: 8 }}>
              {[
                "Actual Facebook/Instagram ad spend per client",
                "Actual Google Ads spend per client",
                "Budget vs actual variance",
                "Campaign-level breakdowns",
              ].map((item, i) => (
                <div key={i}>• {item}</div>
              ))}
            </div>
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>Used at EOM for:</div>
            {[
              "COA 330 line items — exact spend amounts",
              "GST classification (Meta = Free, Google = GST)",
              "Variance alerts when budget ≠ actual",
              "Auto-populating UnitAmount on PPC lines",
            ].map((item, i) => (
              <div key={i}>• {item}</div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Where to Display — Integration into Existing Dashboard" accent={COLORS.accent}>
        <p style={{ fontSize: 12, color: COLORS.textDim, margin: "0 0 14px", lineHeight: 1.6 }}>
          The existing application at <code style={{ color: COLORS.accent }}>/dashboard</code> already manages social media, Google and Meta ads costings. The invoicing module slots in as a new section alongside the existing ad management views.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { title: "Existing: Ad Management", desc: "Meta/Google campaign performance, budgets, spend tracking — Budget Hawk", icon: "📈", status: "Live" },
            { title: "New: EOM Invoicing", desc: "Generate invoices from Monday data, preview before Xero push, GST validation", icon: "🧾", status: "Build" },
            { title: "New: Mid-Month Totals", desc: "Kellie's request — see billing totals during the month, not just at EOM", icon: "📊", status: "Build" },
            { title: "New: Client Billing Summary", desc: "Per-client breakdown: services, PPC spend, media, totals — replaces TOTALS sheet", icon: "👤", status: "Build" },
            { title: "New: GST Audit View", desc: "All line items with GST classification, flagging anything that needs manual review", icon: "🔍", status: "Build" },
            { title: "New: Invoice Queue", desc: "DRAFT invoices pending Rob's approval, with one-click Xero authorise", icon: "✅", status: "Build" },
          ].map((item, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 10, background: COLORS.surfaceLight, border: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <Badge color={item.status === "Live" ? "green" : "purple"}>{item.status}</Badge>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{item.title}</div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Dashboard Layout Concept" accent={COLORS.blue}>
        <div style={{ background: COLORS.bg, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.border}` }}>
          {/* Mock nav */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10 }}>
            {["Ad Performance", "Budget Hawk", "Invoicing", "Clients", "BAS / GST"].map((tab, i) => (
              <span key={i} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: i === 2 ? COLORS.accentDim : "transparent", color: i === 2 ? COLORS.accent : COLORS.textMuted, border: i === 2 ? `1px solid ${COLORS.accent}44` : "1px solid transparent", cursor: "pointer" }}>{tab}</span>
            ))}
          </div>
          {/* Mock content */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { label: "MTD Revenue (ex GST)", value: "$247,320", delta: "+12%" },
              { label: "PPC Passthrough", value: "$89,450", delta: "0% margin" },
              { label: "Invoices Drafted", value: "127", delta: "3 flagged" },
              { label: "GST Collected", value: "$24,732", delta: "BAS Q2" },
            ].map((m, i) => (
              <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: COLORS.surfaceLight, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>{m.value}</div>
                <div style={{ fontSize: 10, color: COLORS.accent, marginTop: 2 }}>{m.delta}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div style={{ padding: "12px", borderRadius: 8, background: COLORS.surfaceLight, border: `1px solid ${COLORS.border}`, minHeight: 80 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, marginBottom: 8 }}>Client Billing — October 2024</div>
              {["Alan Mance Motors", "Bay City Auto Group", "Blood Auto Group", "Ferntree Gully Auto"].map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}22` }}>
                  <span>{c}</span>
                  <span style={{ color: COLORS.accent }}>${(Math.random() * 15000 + 2000).toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px", borderRadius: 8, background: COLORS.surfaceLight, border: `1px solid ${COLORS.border}`, minHeight: 80 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, marginBottom: 8 }}>GST Classification</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: COLORS.warning }}>GST on Income</span><span>312 lines</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: COLORS.accent }}>GST Free (Meta)</span><span>48 lines</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: COLORS.blue }}>GST on Exp (Google)</span><span>63 lines</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.danger }}><span>⚠ Needs Review</span><span>3 lines</span></div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Roadmap() {
  const phases = [
    {
      phase: "Phase 1",
      title: "Data Layer & COA Engine",
      weeks: "Weeks 1–2",
      color: COLORS.accent,
      items: [
        "Build COA keyword mapper (description → account code + GST type)",
        "Build contact name matcher (Monday client → Xero legal entity)",
        "Parse actual October workbook to validate mapping accuracy",
        "Build invoice number sequencer (query Xero for last #)",
        "Unit test all 62 media tracking categories",
      ],
    },
    {
      phase: "Phase 2",
      title: "Monday.com API Integration",
      weeks: "Weeks 2–3",
      color: COLORS.blue,
      items: [
        "Connect to Jobs Board via GraphQL API",
        "Map Monday columns to Xero invoice fields",
        "Handle subitems (each subitem = one invoice line)",
        "Build EOM filter: status = Done/Proof, date = current month",
        "Integrate Budget Hawk for actual PPC spend values",
      ],
    },
    {
      phase: "Phase 3",
      title: "Xero API & Invoice Generation",
      weeks: "Weeks 3–4",
      color: COLORS.purple,
      items: [
        "OAuth 2.0 token management with auto-refresh",
        "Batch invoice creation (DRAFT status, up to 50/batch)",
        "Tracking categories (Media + Client) on every line",
        "Media (220) margin calculation: cost × 1.10",
        "14-day terms for Northern Group clients",
        "CSV export fallback for manual Xero upload",
      ],
    },
    {
      phase: "Phase 4",
      title: "Dashboard Integration",
      weeks: "Weeks 4–5",
      color: COLORS.warning,
      items: [
        "Add 'Invoicing' tab to existing /dashboard app",
        "Mid-month totals view (Kellie's requirement)",
        "Client billing summary replacing TOTALS sheet",
        "GST audit view with auto-flagging",
        "Invoice queue with Rob's approval workflow",
        "PPC budget vs actual variance alerts",
      ],
    },
    {
      phase: "Phase 5",
      title: "Validation & Parallel Run",
      weeks: "Weeks 5–6",
      color: COLORS.danger,
      items: [
        "Run engine on October data — compare output to actual March CSV batches",
        "Kellie validates line items, GST codes, amounts",
        "Clara validates client names and tracking categories",
        "Run one month in parallel (old process + new engine)",
        "Address any discrepancies before full cutover",
      ],
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {phases.map((p, i) => (
        <Card key={i} accent={p.color}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: p.color }}>{p.phase}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{p.title}</span>
            </div>
            <Badge color={i === 0 ? "green" : i === 1 ? "blue" : i === 2 ? "purple" : i === 3 ? "yellow" : "red"}>{p.weeks}</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {p.items.map((item, j) => (
              <div key={j} style={{ display: "flex", gap: 6, fontSize: 12, color: COLORS.textDim }}>
                <span style={{ color: p.color, flexShrink: 0 }}>○</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function IntegrationPlan() {
  const [activeTab, setActiveTab] = useState("current");

  const renderContent = () => {
    switch (activeTab) {
      case "current": return <CurrentState />;
      case "architecture": return <Architecture />;
      case "xero": return <XeroIntegration />;
      case "monday": return <MondayFlow />;
      case "dashboard": return <Dashboard />;
      case "roadmap": return <Roadmap />;
      default: return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', 'SF Pro Display', -apple-system, sans-serif", padding: "24px 28px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, letterSpacing: 2, textTransform: "uppercase" }}>R&D Integration Plan</span>
            <Badge color="green">ADME Advertising</Badge>
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: COLORS.text, letterSpacing: -0.5 }}>
            Invoicing System → Xero + Monday.com
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.textDim }}>
            Replace 132-sheet Excel workbook with automated Monday → Xero pipeline. Eliminate dual entry. Auto-classify GST. Mid-month visibility.
          </p>
        </div>

        {/* Tab nav */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 0, overflowX: "auto" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                color: activeTab === tab.id ? COLORS.accent : COLORS.textMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {renderContent()}
      </div>
    </div>
  );
}
