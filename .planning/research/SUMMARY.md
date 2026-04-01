# Project Research Summary

**Project:** Lokka — Microsoft Defender for Endpoint API Integration
**Domain:** REST API extension to an existing MCP server (TypeScript/Node.js)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

Lokka is an MCP (Model Context Protocol) server that exposes Microsoft Graph and Azure Resource Manager APIs to AI assistants. This milestone adds Microsoft Defender for Endpoint device querying capabilities, primarily to support NetBox synchronization and security posture visibility. The research conclusion is unambiguous: this is a surgical extension of an existing, well-understood pattern. Zero new npm packages are required. The Defender API is a plain REST API with no official TypeScript SDK; it uses the same `@azure/identity` credential chain already present in Lokka, with only a different token scope and base URL.

The recommended approach is to extend the existing `Lokka-Microsoft` tool's `apiType` Zod enum from `["graph", "azure"]` to `["graph", "azure", "defender"]` and add a corresponding handler branch in `main.ts` that mirrors the Azure RM branch verbatim — except for two constants: the token scope (`https://api.securitycenter.microsoft.com/.default`) and the EU base URL (`https://eu.api.security.microsoft.com`). The feature surface is wide but uniformly low-complexity: all querying is OData `$filter` on a single `/api/machines` endpoint, and a single-machine `GET /api/machines/{id}` endpoint. The entire implementation fits in approximately 60 lines of new TypeScript.

The primary risk is an OAuth2 audience trap documented explicitly in official Microsoft docs (updated 2026-02-03): the Defender API HTTP host (`api.security.microsoft.com`) and the OAuth2 resource identifier (`api.securitycenter.microsoft.com`) are different strings. Using the wrong scope produces `403 Forbidden` indistinguishable from a permissions error. A secondary risk is a pre-implementation prerequisite: the existing Lokka app registration must have `Machine.Read.All` (or `Machine.ReadWrite.All`) added under the `WindowsDefenderATP` API in Azure Portal before any code will work. Both risks are fully documented and straightforward to address.

## Key Findings

### Recommended Stack

No new runtime dependencies are needed. The Defender integration reuses all three existing Lokka primitives: `@azure/identity` 4.3.0 for token acquisition (same credential object, different scope string), the global `fetch` polyfill already installed by `isomorphic-fetch` for HTTP calls, and `zod` for any new schema parameters. The Defender API has no official TypeScript/Node.js SDK — Microsoft provides only PowerShell, Python, and C# samples. Raw `fetch` is the correct choice and matches the Azure RM implementation exactly.

**Core technologies:**
- `@azure/identity` 4.3.0: Token acquisition — same credential object already used; scope string is the only difference
- `isomorphic-fetch` 3.0.0: HTTP client — already polyfills global `fetch` in `main.ts` line 10; no new dep
- `zod` 3.24.2: Schema validation — extends existing `apiType` enum; no new dep
- `URLSearchParams`: OData query construction — already used in Azure RM branch; no change

**Critical constant (not negotiable):**
- Token scope: `https://api.securitycenter.microsoft.com/.default` (NOT `https://api.security.microsoft.com/.default`)
- EU base URL: `https://eu.api.security.microsoft.com`
- API path prefix: `/api/` (e.g., `/api/machines`)

### Expected Features

The feature surface is wide but all low-complexity. Every filter is an OData `$filter` query parameter on the same `/api/machines` endpoint. The `$filter` parameter uses standard OData v4 operators which the existing `URLSearchParams` pattern handles without additional code.

**Must have (table stakes):**
- List machines with full OData `$filter` support (`$filter`, `$top`, `$skip`, `fetchAll`) — foundation of all device inventory workflows
- Get single machine by Defender device ID (`GET /api/machines/{id}`) — targeted lookup
- Filter by `computerDnsName` with `startswith()` — primary human-readable search
- Filter by `healthStatus` — primary triage for sensor coverage
- Filter by `riskScore` — core security posture property
- Filter by `exposureLevel` — vulnerability management triage
- Filter by `osPlatform` — inventory segmentation
- Filter by `onboardingStatus` — coverage gap analysis

**Should have (differentiators, all low-complexity):**
- Filter by `lastSeen` (date range with `gt`/`lt`) — identify stale devices
- Filter by `machineTags` (OData lambda syntax: `any()`) — tag-based segmentation
- Filter by `lastIpAddress` — reverse IP lookup
- Filter by `aadDeviceId` — Entra identity correlation
- Filter by `rbacGroupId` — multi-group scope
- Combined multi-property filters (OData `and`/`or`) — power user queries
- Dedicated tag search endpoint (`GET /api/machines/findbytag`) — simpler for tag lookups

**Defer (v2+):**
- Find machines by IP at timestamp (`GET /api/machines/findbyip`) — incident response use case, not inventory; 30-day window limitation
- Alerts querying (`/api/alerts`) — separate domain, out of scope per PROJECT.md
- Vulnerability data endpoints — separate permission scopes, different milestone
- Advanced hunting queries — Kusto query language, out of scope

**Confirmed unavailable (not deferrable — API limitations):**
- `$orderby` — not supported on `/api/machines`; sort client-side
- `$select` — not documented; full entity always returned
- `$count` — not documented server-side; count client-side
- `contains()` on DNS name — only `startswith()` is supported; document as prefix-only search

### Architecture Approach

The implementation is a branch extension inside an existing `if/else if` chain in `main.ts`, not a new file, new class, or new MCP tool. Adding `"defender"` as a third `apiType` is a one-line Zod schema change; the handler is a self-contained `else if (apiType === 'defender')` block that mirrors the Azure RM branch. Two new string constants (`DefenderEuBaseUrl`, `DefenderTokenScope`) go in `src/mcp/src/constants.ts`. Auth.ts requires zero changes.

**Major components and build order:**
1. `constants.ts` — add `DefenderEuBaseUrl` and `DefenderTokenScope` exports (no dependencies; implement first)
2. `main.ts` schema — extend `apiType` Zod enum to `["graph", "azure", "defender"]`
3. `main.ts` handler — add `defender` branch after `azure` branch; token acquisition, URL construction, OData params, pagination loop following `@odata.nextLink`
4. Pagination key difference: Azure RM uses `pageData.nextLink`; Defender uses `pageData['@odata.nextLink']` (OData convention, same as Graph)

**The enum extension and handler branch must ship atomically** — no valid intermediate state exists where the enum accepts `"defender"` but the handler has no branch for it.

### Critical Pitfalls

1. **Wrong token scope (403 Forbidden)** — Use `https://api.securitycenter.microsoft.com/.default` as the `getToken()` scope, never `https://api.security.microsoft.com/.default`. The HTTP endpoint host and the OAuth2 resource identifier are different values. Debug by decoding the JWT and verifying the `aud` claim.

2. **Missing `WindowsDefenderATP` app permission** — The Lokka app registration currently lacks Defender permissions. Must add `Machine.Read.All` (or `Machine.ReadWrite.All`) under WindowsDefenderATP in Azure Portal and grant admin consent before writing any code. This is a pre-implementation prerequisite.

3. **Pagination `@odata.nextLink` hostname drift** — Defender pagination responses may return `@odata.nextLink` URLs pointing to `api.security.microsoft.com` (global) instead of `eu.api.security.microsoft.com`. Following the global URL violates EU data residency. Replace the hostname in `@odata.nextLink` with the configured EU base URL before following.

4. **Rate limit 429 without Retry-After** — Defender API enforces 100 calls/minute, 1500/hour. Large-tenant `fetchAll` pagination can hit this. The pagination loop must handle `429` with exponential backoff (10s, 20s, 40s) since the existing Lokka pattern throws on any non-OK response.

5. **`contains()` not supported for DNS name filter** — Only `startswith()` is supported on `computerDnsName`. The tool description must say "DNS name prefix search", not "partial match". True substring search requires client-side filtering over all results, which is expensive.

## Implications for Roadmap

Based on research, the implementation is simple enough to be a single phase. However, splitting by concern (setup, core, hardening) reduces risk and creates clear checkpoints.

### Phase 1: Pre-Implementation Setup
**Rationale:** Two critical blockers — app permissions and token scope — must be resolved before writing a single line of code. Discovering them mid-implementation causes debugging time loss.
**Delivers:** Azure Portal app registration with `Machine.Read.All` / `Machine.ReadWrite.All` for `WindowsDefenderATP`; admin consent granted; verified token with correct `aud` claim; documented auth constraint for interactive auth users (Pitfall #3 / #8).
**Addresses:** Pitfalls #1 (token scope), #2 (app permissions), #3 (interactive consent), #8 (client-provided token limitation).
**Avoids:** All 403 Forbidden failures being misdiagnosed as code bugs.

### Phase 2: Core Defender Integration
**Rationale:** With auth prerequisites verified, all remaining implementation is low-complexity and follows established Lokka patterns. The entire feature surface — list machines with OData filters, get by ID — can be implemented atomically because it all touches the same two files.
**Delivers:** `defender` apiType support in `Lokka-Microsoft` tool; list machines endpoint with `$filter`, `$top`, `$skip`, `fetchAll`; get machine by ID; all table-stakes filters (healthStatus, riskScore, exposureLevel, computerDnsName, osPlatform, onboardingStatus); all differentiator filters (lastSeen, machineTags, lastIpAddress, aadDeviceId, rbacGroupId).
**Addresses:** All must-have and should-have features from FEATURES.md.
**Implements:** Constants extraction (Phase 2a), Zod enum extension + handler branch (Phase 2b) — both atomic.
**Avoids:** Pitfall #1 (use correct scope constant), Pitfall #6 (document startswith limitation in tool description), Pitfall #7 (nullable field handling in any response formatting).

### Phase 3: Pagination Hardening and Documentation
**Rationale:** Pagination edge cases (EU hostname drift, 429 rate limiting) only manifest with large tenants and are safely deferred after core functionality is verified. Documentation gaps (lastSeen semantics, version path, auth limitations) are non-blocking.
**Delivers:** EU hostname normalization in `@odata.nextLink` following; 429 retry with exponential backoff in pagination loop; updated README with setup instructions for Defender permissions; tool description clarifications (DNS prefix-only, lastSeen semantics, v1.0 path convention).
**Addresses:** Pitfalls #4 (pagination hostname), #5 (429 retry), #9 (version path), #10 (lastSeen semantics).

### Phase Ordering Rationale

- Phase 1 must precede Phase 2 because token scope and permissions errors are indistinguishable from code bugs without verified credentials.
- Phase 2 is a single atomic unit because the Zod enum and handler branch have no valid intermediate state — they must ship together.
- Phase 3 is safely deferred because Pitfalls #4 and #5 only surface at scale (large tenants, many pages) and Pitfalls #9 and #10 are documentation quality issues, not correctness issues.
- The deferred features (findbyip, alerts, vulnerabilities) have no dependency on this milestone and are explicitly out of scope per PROJECT.md.

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 1:** Standard Azure Portal app registration procedure; well-documented.
- **Phase 2:** Mirrors existing Azure RM implementation exactly; ARCHITECTURE.md provides verbatim code patterns.
- **Phase 3:** Retry/backoff is a standard pattern; EU hostname normalization is a straightforward string replacement.

No phases require `/gsd:research-phase` — all implementation patterns are fully documented in the research files and directly traceable to official Microsoft Learn documentation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Microsoft docs confirm no SDK exists; existing Lokka deps sufficient; fetch polyfill verified in source |
| Features | HIGH | All features verified against Microsoft Learn docs updated 2026-03-22; supported vs unsupported OData params exhaustively documented |
| Architecture | HIGH | Implementation pattern directly mirrors existing Azure RM branch, verified by Lokka source inspection |
| Pitfalls | HIGH | Critical pitfalls sourced from official docs (scope warning from 2026-02-03 doc) and source code inspection |

**Overall confidence:** HIGH

### Gaps to Address

- **`Machine.Read.All` availability:** Official list machines docs only mention `Machine.ReadWrite.All`; `Machine.Read.All` may not exist as a separate permission for the WindowsDefenderATP API. Verify in Azure Portal during Phase 1. If absent, use `Machine.ReadWrite.All` (least-privilege fallback). (Confidence: MEDIUM — verify before implementation.)
- **EU `@odata.nextLink` hostname behavior:** Not definitively confirmed whether EU Defender responses return EU or global hostnames in `@odata.nextLink`. Implement hostname normalization defensively in Phase 3 regardless.
- **Interactive auth Defender consent flow:** The `add-graph-permission` MCP tool is Graph-only. Extending it for Defender is out of scope for this milestone but documented as a known gap. Document the limitation clearly in Phase 3.

## Sources

### Primary (HIGH confidence)

- [Defender API Introduction](https://learn.microsoft.com/en-us/defender-endpoint/api/apis-intro) — API overview, auth patterns (updated 2026-03-22)
- [List Machines API](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machines) — endpoint spec, supported OData params, pagination (updated 2026-03-22)
- [Get Machine by ID](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machine-by-id) — single entity endpoint (updated 2026-03-22)
- [Machine Resource Type](https://learn.microsoft.com/en-us/defender-endpoint/api/machine) — entity properties, nullable fields (updated 2026-03-22)
- [OData Queries with Defender for Endpoint](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-odata-samples) — filter operators, supported parameters (updated 2026-03-22)
- [Create App without User](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-create-app-webapp) — token scope warning (updated 2026-02-03)
- [Supported APIs List](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-list) — API inventory (updated 2025-03-21)
- [Find Devices by Internal IP](https://learn.microsoft.com/en-us/defender-endpoint/api/find-machines-by-ip) — findbyip endpoint (updated 2026-03-22)
- [Find Devices by Tag](https://learn.microsoft.com/en-us/defender-endpoint/api/find-machines-by-tag) — findbytag endpoint (updated 2026-03-22)
- Lokka source code (`src/mcp/src/main.ts`, `src/mcp/src/auth.ts`, `src/mcp/src/constants.ts`) — direct inspection

### Secondary (MEDIUM confidence)

- `Machine.Read.All` vs `Machine.ReadWrite.All` availability: official machines list docs only cite `Machine.ReadWrite.All`; `Machine.Read.All` existence as a separate permission is unconfirmed and requires Azure Portal verification.

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
