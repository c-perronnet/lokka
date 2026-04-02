# Milestones

## v1.0 Defender for Endpoint Integration (Shipped: 2026-04-02)

**Phases completed:** 3 phases, 3 plans, 7 tasks
**Timeline:** 2 days (2026-04-01 → 2026-04-02)
**Commits:** 27 | **Files changed:** 34 | **LOC:** 1,039 TypeScript

**Key accomplishments:**
- Verified Defender app registration auth chain (token scope, JWT claims, EU endpoint reachability)
- Extended Lokka-Microsoft MCP tool with `apiType: "defender"` for Defender device queries
- Implemented fetchAll pagination via `@odata.nextLink` with per-page token refresh
- Added OData filter passthrough for 9 device fields (healthStatus, riskScore, osPlatform, etc.)
- Hardened pagination with 429 retry/backoff, EU hostname rewriting, and actionable auth error messages
- Patched 5 npm vulnerabilities and secured credential handling

**Requirements:** 21/21 v1 requirements complete

---

