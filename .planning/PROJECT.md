# Lokka — Microsoft Defender for Endpoint Integration

## What This Is

An extension to the existing Lokka MCP server that adds read-only access to the Microsoft Defender for Endpoint API via `apiType: "defender"`. Users query machine/device inventory, health status, risk scores, and exposure levels through the same `Lokka-Microsoft` MCP tool that handles Microsoft Graph and Azure RM.

## Core Value

Users can query Defender device data (list, search, get by ID, filter by 9 fields) through the same MCP interface that already handles Microsoft Graph and Azure RM, reusing the existing authentication.

## Requirements

### Validated

- ✓ Microsoft Graph API querying — existing
- ✓ Azure Resource Management API querying — existing
- ✓ Multi-mode authentication (interactive, client credentials, certificate, client-provided token) — existing
- ✓ Pagination support — existing
- ✓ MCP tool registration and stdio transport — existing
- ✓ Query Defender for Endpoint machines/devices list with filtering — v1.0
- ✓ Get a specific machine by Defender ID — v1.0
- ✓ Search machines by DNS name prefix — v1.0
- ✓ Health status, risk score, and exposure level visibility per device — v1.0
- ✓ EU endpoint hardcoded (eu.api.security.microsoft.com) — v1.0
- ✓ Reuse existing Lokka authentication (no new app registration) — v1.0
- ✓ Read-only GET operations only — v1.0
- ✓ fetchAll pagination via @odata.nextLink — v1.0
- ✓ 429 retry with exponential backoff — v1.0
- ✓ Actionable auth error messages — v1.0

### Active

(None — next milestone not yet defined)

### Out of Scope

- Alerts querying — not needed for device inventory/posture use case
- Vulnerability data — can be added later if needed
- Write operations (isolate, scan, tag) — read-only by design
- Other regions (US, UK, AU) — EU only for now; configurable region deferred to v2
- Advanced hunting queries — Kusto language complexity, not inventory use case
- New authentication modes — reuse existing

## Context

Shipped v1.0 with 1,039 LOC TypeScript across 3 source files.
Tech stack: TypeScript, @azure/identity, @modelcontextprotocol/sdk, jsonwebtoken.
Build: esbuild for JS emit (tsc OOMs on Microsoft Graph SDK types), tsc --noEmit for type checking.
The Defender handler mirrors the existing Azure RM pattern: token acquisition with a different scope, URL construction, fetch with pagination.

## Constraints

- **Auth**: Must reuse existing Lokka auth — no new app registration or auth flow
- **Read-only**: GET operations only — no POST/PUT/DELETE
- **Region**: Hardcoded to EU endpoint (eu.api.security.microsoft.com)
- **Pattern**: Follow existing Lokka code patterns (same tool structure, pagination, error handling)
- **Build**: esbuild required for JS emit; tsc --noEmit for type safety

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Reuse existing auth | Simplicity, already working, same Azure AD | ✓ Good — same ClientSecretCredential, just different scope |
| EU endpoint only | User's infrastructure is in EU | ✓ Good — hardcoded with hostname rewriting on nextLink |
| GET-only operations | Security constraint, read-only posture | ✓ Good — guard rejects non-GET before network call |
| Extend existing tool (apiType) | No valid intermediate state for enum + handler | ✓ Good — single tool, clean branching |
| OData filter passthrough | All 9 filter types supported natively by API | ✓ Good — no abstraction layer needed |
| esbuild for JS emit | tsc OOMs at 6GB on Graph SDK types | ⚠️ Revisit — works but non-standard, consider machine with more RAM |
| @odata.nextLink (not bare nextLink) | Defender uses OData convention, differs from Azure RM | ✓ Good — caught during research, prevented silent pagination break |

---
*Last updated: 2026-04-02 after v1.0 milestone*
