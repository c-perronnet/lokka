# Technology Stack: Defender for Endpoint Integration

**Project:** Lokka — Microsoft Defender for Endpoint API Integration
**Researched:** 2026-04-01
**Scope:** Stack dimension only — what libraries, auth patterns, and HTTP tooling are needed to add Defender API calls to the existing Lokka MCP server.

---

## Executive Verdict

No new runtime dependencies are required. The existing `@azure/identity` 4.3.0 handles token acquisition for the Defender API using the same credential objects already in use. The Defender for Endpoint API is a plain REST API with no official TypeScript/Node.js SDK; the existing `isomorphic-fetch` (already a Lokka dependency) is the correct HTTP client. The only addition needed is knowledge of the correct auth scope and EU base URL — both are simple string constants.

---

## Recommended Stack

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@azure/identity` | 4.3.0 (current) | Token acquisition for Defender API | Already in Lokka. The `TokenCredential.getToken()` method accepts any scope string. Defender requires a different scope than Graph/Azure RM, but the same credential object works. Zero new code needed in `auth.ts`. |

**Auth scope to use:**
```
https://api.securitycenter.microsoft.com/.default
```

**Why this scope, not `https://api.security.microsoft.com/.default`:**
Microsoft's official docs (updated 2026-02-03) include an explicit warning:

> "Some Microsoft Defender for Endpoint APIs continue to require access tokens issued for the legacy resource `https://api.securitycenter.microsoft.com`. If the token audience doesn't match the resource expected by the API, requests fail with `403 Forbidden`, even if the API endpoint uses `https://api.security.microsoft.com`."

Use `https://api.securitycenter.microsoft.com/.default` as the scope when calling `credential.getToken()` for all Defender machine API calls. This is the correct value regardless of which base URL you call. (Confidence: HIGH — sourced from official docs updated February 2026.)

**How to call it in Lokka's existing pattern:**
```typescript
const azureCredential = authManager.getAzureCredential();
const tokenResponse = await azureCredential.getToken(
  "https://api.securitycenter.microsoft.com/.default"
);
```
This is identical to how Azure RM tokens are obtained in `main.ts` line 162, just with a different scope string.

### HTTP Client

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `isomorphic-fetch` | 3.0.0 (current) | HTTP calls to Defender REST API | Already a Lokka dependency (required by the Graph client). The Azure RM integration already uses it via `fetch()`. No new dependency needed. |

**Why NOT `@microsoft/microsoft-graph-client` for Defender:**
The Graph SDK wraps `https://graph.microsoft.com` only. The Defender API lives at `https://eu.api.security.microsoft.com` and uses a different auth scope. Using raw `fetch()` (already available globally in Lokka via the `isomorphic-fetch` polyfill setup in `main.ts` line 10) is correct — exactly as Azure RM calls are implemented today.

**Why NOT axios or node-fetch:**
Lokka already polyfills global `fetch` on line 10 of `main.ts`. Adding another HTTP client creates inconsistency with no benefit.

### API Versioning & Base URL

| Constant | Value | Source |
|----------|-------|--------|
| EU base URL | `https://eu.api.security.microsoft.com` | Official docs (tip: use geolocation-nearest server) |
| API path prefix | `/api/` | Official: queries are prefixed `/api/` |
| Version | `v1.0` (explicit) | Official docs state current version is V1.0 |
| Machines list path | `/api/machines` | Official get-machines documentation |
| Single machine path | `/api/machines/{id}` | Standard REST pattern confirmed in docs |

Full URL for machines list: `https://eu.api.security.microsoft.com/api/machines`

**Note on versioning:** The API supports explicit versioning as `/api/v1.0/machines`, but calling without version also returns V1.0. Use explicit versioning to match the PROJECT.md constraint.

### Required App Registration Permissions

The existing app registration needs the following API permission added in Azure Portal (under **WindowsDefenderATP** API):

| Permission type | Permission name | Display name | Use |
|----------------|----------------|--------------|-----|
| Application | `Machine.Read.All` | Read all machine information | Preferred — least privilege |
| Application | `Machine.ReadWrite.All` | Read and write all machine information | Fallback if Read.All is absent |

**Note:** The official list machines docs only mention `Machine.ReadWrite.All`. `Machine.Read.All` may not exist as a separate permission for this API. Verify in Azure Portal under WindowsDefenderATP > Application permissions. (Confidence: MEDIUM.)

**Delegated permission (interactive auth):** `Machine.ReadWrite` — requires the signed-in user to have at least the `View Data` role in Microsoft Defender Security Center.

### OData Filtering

No new library needed. Defender API supports OData v4 `$filter`, `$top`, and `$skip` natively via query string. The existing `URLSearchParams` pattern used in Azure RM calls handles this.

Filterable machine properties:
- `computerDnsName` — supports `startswith(computerDnsName,'prefix')`
- `id`
- `healthStatus` — enum: `Active`, `Inactive`, `ImpairedCommunication`, `NoSensorData`, `NoSensorDataImpairedCommunication`, `Unknown`
- `riskScore` — enum: `None`, `Informational`, `Low`, `Medium`, `High`
- `exposureLevel` — enum: `None`, `Low`, `Medium`, `High`
- `lastSeen`, `osPlatform`, `onboardingStatus`, `rbacGroupId`

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP client | `isomorphic-fetch` (existing) | `axios` | Already available globally; no new dependency justified |
| HTTP client | `isomorphic-fetch` (existing) | `node-fetch` v3 | Redundant with existing polyfill setup |
| Auth SDK | `@azure/identity` (existing) | `@azure/msal-node` | MSAL is lower-level; Azure Identity wraps it. Already in Lokka. |
| Defender SDK | None (raw REST) | any npm package | No official TypeScript/Node.js SDK exists. Microsoft only provides PowerShell, Python, and C# examples. |
| Auth scope | `https://api.securitycenter.microsoft.com/.default` | `https://api.security.microsoft.com/.default` | Official docs explicitly warn the newer domain may return 403 on machine APIs. Use the legacy resource URI. |

---

## No New Installation Required

The Defender integration requires **zero new npm packages**. Everything needed already exists:

```
Existing: @azure/identity ^4.3.0      → token acquisition with Defender scope
Existing: isomorphic-fetch ^3.0.0     → HTTP client (via global fetch polyfill)
Existing: zod ^3.24.2                 → parameter validation for new MCP tool
Existing: @modelcontextprotocol/sdk   → tool registration
```

The only deliverable is new TypeScript code inside `main.ts` following the Azure RM pattern.

---

## Integration Pattern (Exact)

The implementation mirrors the Azure RM block in `main.ts` lines 153-256. The Defender block:

1. Calls `authManager.getAzureCredential().getToken("https://api.securitycenter.microsoft.com/.default")`
2. Builds URL: `https://eu.api.security.microsoft.com/api/machines` + OData query params via `URLSearchParams`
3. Executes `fetch(url, { headers: { Authorization: 'Bearer ...' } })`
4. Handles `@odata.nextLink` pagination (same pattern as Azure RM `nextLink`)
5. Returns JSON

**Critical difference from Azure RM:** The scope string is `https://api.securitycenter.microsoft.com/.default`, not `https://management.azure.com/.default`. Everything else is structurally identical.

---

## Sources

| Source | URL | Confidence | Date |
|--------|-----|------------|------|
| Defender API intro | https://learn.microsoft.com/en-us/defender-endpoint/api/apis-intro | HIGH | Updated 2026-03-22 |
| Get machines API | https://learn.microsoft.com/en-us/defender-endpoint/api/get-machines | HIGH | Updated 2026-03-22 |
| Create app without user | https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-create-app-webapp | HIGH | Updated 2026-02-03 — source of critical scope warning |
| Machine entity | https://learn.microsoft.com/en-us/defender-endpoint/api/machine | HIGH | Updated 2026-03-22 |
| OData query samples | https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-odata-samples | HIGH | Updated 2026-03-22 |
| Supported APIs list | https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-list | HIGH | Updated 2025-03-21 |

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Auth scope (`securitycenter.microsoft.com`) | HIGH | Explicit warning in official docs, updated Feb 2026 |
| EU base URL | HIGH | Official docs tip, multiple sources confirm |
| No SDK exists | HIGH | Docs only show PowerShell/Python/C# samples; no npm package found |
| `fetch` reuse | HIGH | Existing Lokka pattern for Azure RM is structurally identical |
| `Machine.Read.All` vs `Machine.ReadWrite.All` | MEDIUM | Docs list ReadWrite for machines list; Read.All may not exist separately — verify in Azure Portal |
| OData filter operators | HIGH | Official OData samples page, updated March 2026 |
