# AEGIS COMPLY — Product Analysis v2.0
## Senior Engineer / CTO Perspective

---

## TL;DR: What's broken and what we're fixing

The current product (v1) is a well-conceived compliance flow wrapped around a single AI prompt. 
It looks like a prototype because it IS a prototype. Here's what turns it into a real SaaS:

---

## Critical Gaps in v1

### 1. AI Hallucination on Core Feature
The #1 feature — "Is this entity sanctioned?" — was answered entirely by asking AI to guess.
DeepSeek has no access to live OFAC/EU/UN lists. It can hallucinate sanctions hits or miss real ones.
**This is not a compliance product, it's an essay generator.**

**Fix:** OpenSanctions API (free, open source, covers 50+ sanction lists in real time).
Screen entity FIRST against real data. Then AI analyzes context, routes, payment risk.

### 2. No Evidence = No Value for Banks/Courts
The "evidence vault" currently produces a browser print dialog.
Banks don't accept `window.print()` as audit documentation.

**Fix:** Proper PDF generation with timestamps, digital metadata, version IDs, 
applied legal norms as citations.

### 3. No Document Intelligence
Users have contracts, invoices, bills of lading. They shouldn't have to manually extract 
counterparty names, HS codes, countries. That's 80% of the data entry.

**Fix:** Upload document → AI extracts entities → pre-fills check form.

### 4. No Organization Model
Compliance is a team sport. A single-user app can't be sold to companies.
Banks, trading firms, logistics companies need: team accounts, roles, audit trails of who checked what.

**Fix:** Organizations, Members (Owner/Admin/Analyst), full audit log.

### 5. No Monitoring
Compliance is continuous, not one-time. A counterparty cleared today can be sanctioned tomorrow.

**Fix:** Watch-list monitoring with daily background re-screening.

### 6. No Real Data Layer
No counterparty history across checks. Same entity checked 10 times = 10 unconnected records.

**Fix:** Counterparty entity model — aggregate risk over time, detect pattern changes.

---

## Architecture v2

```
┌─────────────────────────────────────────────────────────┐
│                    AEGIS COMPLY v2                        │
├─────────────────────────────────────────────────────────┤
│  Frontend (React + Vite)                                  │
│  ├── Landing → Auth → App Shell                          │
│  ├── Dashboard (risk KPIs, trend chart, alerts)          │
│  ├── New Check (6-step wizard, auto-save)                │
│  ├── Check Result (sanctions hits + AI analysis + PDF)   │
│  ├── Documents (upload, extract, auto-check)             │
│  ├── Monitoring (watch-list, alert feed)                 │
│  ├── Organization (team members, roles)                  │
│  └── Settings (profile, API keys, billing)              │
├─────────────────────────────────────────────────────────┤
│  Backend (Express + TypeScript)                           │
│  ├── Auth (JWT + refresh tokens + bcrypt)                │
│  ├── Checks (create, list, delete, CSV export)           │
│  ├── Documents (upload, parse, extract entities)         │
│  ├── Monitoring (watch-list, background re-screen)       │
│  ├── Organizations (CRUD, invites, roles)                │
│  └── API Keys (for enterprise integration)              │
├─────────────────────────────────────────────────────────┤
│  External Services                                        │
│  ├── OpenSanctions API (real-time screening)            │
│  │   └── Covers: OFAC SDN/SSI, EU, UN, UK, BIS, etc.   │
│  ├── DeepSeek API (AI context analysis)                  │
│  │   └── Payment corridor, route risk, UBO inference    │
│  └── (Future) ЕГРЮЛ / OpenCorporates / MarineTraffic    │
├─────────────────────────────────────────────────────────┤
│  Data (PostgreSQL + Prisma)                              │
│  ├── Users, Organizations, Members                       │
│  ├── Checks (with sanctions hits + AI result + pdf)     │
│  ├── Documents (upload metadata + extracted entities)    │
│  ├── Monitors (watch-list entries)                       │
│  └── ApiKeys (for enterprise API access)                │
└─────────────────────────────────────────────────────────┘
```

---

## New Check Flow (v2)

```
User Input
    ↓
[1] OpenSanctions Screen    ← REAL DATA (50+ lists)
    ↓
[2] Entity enrichment       ← country, schema, datasets
    ↓  
[3] DeepSeek AI Analysis    ← context: payment, route, UBO
    │   Input: form data + sanctions hits + entity data
    │   Output: structured JSON risk analysis
    ↓
[4] Combined Result         ← sanctions hits + AI analysis
    ↓
[5] PDF Generation          ← evidence vault document
    ↓
[6] Save + Monitor option   ← add to watch-list
```

---

## OpenSanctions Integration

Free, open-source, covers 50+ datasets including:
- OFAC SDN / SSI  
- EU Consolidated (all packages)
- UK OFSI
- UN Security Council
- BIS Entity List
- EGRUL sanctions (Russia)
- Many more

API: https://api.opensanctions.org/
- No auth for free tier (rate limited)
- Returns scored matches with dataset attribution
- Entity schema: Person, Organization, Vessel

---

## Revenue Model Recommendation

| Tier | Price | Limits | Target |
|------|-------|--------|--------|
| Free | 0 | 5 checks/month | Solo traders, pilots |
| Starter | 4,900₽/mo | 25 checks | Small importers |
| Business | 14,900₽/mo | 150 checks + docs + team | Trading companies |
| Enterprise | 49,900₽/mo | Unlimited + API + white-label | Banks, logistics |

**Key insight:** Per-check pricing PLUS SaaS creates two revenue streams.
API access for enterprise is the big prize — banks need to integrate this into their KYC flows.

---

## What "Enterprise-Ready" Actually Means

1. **Audit trail** — every action logged with user ID, timestamp, IP
2. **Role-based access** — Owner, Admin, Analyst (read-only)
3. **API keys** — machine-to-machine for bank integrations
4. **Data retention** — configurable, GDPR-aware
5. **PDF evidence** — proper legal document, not browser print
6. **SLA** — uptime monitoring, graceful degradation
7. **Security** — input sanitization, rate limiting, no data leaks in logs

---

## Roadmap

### v2 (Now — this release)
- OpenSanctions real-time screening
- PDF evidence generation
- Document upload + AI extraction
- Organization model (teams)
- API key management
- Enterprise UI redesign

### v3 (Q3-Q4 2026)
- ЕГРЮЛ / Fedresurs API integration
- MarineTraffic Shadow Fleet module
- Watch-list with daily monitoring jobs
- Webhook notifications
- White-label theming

### v4 (2027)
- Dedicated ML model (fine-tuned on compliance decisions)
- OpenCorporates UBO lookup
- ISO 37301 compliance mapping
- Multi-language (EN, ZH, AR)
