# Lokka — Microsoft Defender for Endpoint Integration

## What This Is

An extension to the existing Lokka MCP server that adds read-only access to the Microsoft Defender for Endpoint API (eu.api.security.microsoft.com). It exposes MCP tools for querying machine/device inventory, health status, risk scores, and exposure levels — enabling both inventory sync with NetBox and security posture visibility.

## Core Value

Users can query Defender device data (list, search, get by ID) through the same MCP interface that already handles Microsoft Graph and Azure RM, reusing the existing authentication.

## Requirements

### Validated

- ✓ Microsoft Graph API querying — existing
- ✓ Azure Resource Management API querying — existing
- ✓ Multi-mode authentication (interactive, client credentials, certificate, client-provided token) — existing
- ✓ Pagination support — existing
- ✓ MCP tool registration and stdio transport — existing

### Active

- [ ] Query Defender for Endpoint machines/devices list with filtering
- [ ] Get a specific machine by Defender ID
- [ ] Search machines by DNS name or partial match
- [ ] Health status, risk score, and exposure level visibility per device
- [ ] EU endpoint hardcoded (eu.api.security.microsoft.com)
- [ ] Reuse existing Lokka authentication (no new app registration)
- [ ] Read-only GET operations only

### Out of Scope

- Alerts querying — not needed for device inventory/posture use case
- Vulnerability data — can be added later if needed
- Write operations (isolate, scan, tag) — read-only by design
- Other regions (US, UK, AU) — EU only for now
- Advanced hunting queries — out of scope for v1
- New authentication modes — reuse existing

## Context

- Lokka is a TypeScript MCP server at `src/mcp/src/main.ts` that currently integrates Microsoft Graph and Azure RM APIs
- Auth is handled by `src/mcp/src/auth.ts` with 4 modes via Azure Identity SDK
- The Defender API uses the same Azure AD tokens but with different scopes (likely `https://api.security.microsoft.com/.default` or `https://securitycenter.microsoft.com/.default`)
- The EU endpoint is `https://eu.api.security.microsoft.com`
- API versioning: `/api/v1.0/machines` is the target path
- Machine entity has properties: id, computerDnsName, osPlatform, healthStatus, riskScore, exposureLevel, lastSeen, ipAddresses, machineTags, etc.

## Constraints

- **Auth**: Must reuse existing Lokka auth — no new app registration or auth flow
- **Read-only**: GET operations only — no POST/PUT/DELETE
- **Region**: Hardcoded to EU endpoint (eu.api.security.microsoft.com)
- **API version**: Use v1.0 explicitly
- **Pattern**: Follow existing Lokka code patterns (same tool structure, pagination, error handling)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Reuse existing auth | Simplicity, already working, same Azure AD | — Pending |
| EU endpoint only | User's infrastructure is in EU | — Pending |
| GET-only operations | Security constraint, read-only posture | — Pending |
| Expose as new MCP tool(s) | Keep separation from existing Graph/Azure RM tools | — Pending |

---
*Last updated: 2026-04-01 after initialization*
