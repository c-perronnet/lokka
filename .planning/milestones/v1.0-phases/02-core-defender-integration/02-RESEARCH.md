# Phase 2: Core Defender Integration - Research

**Researched:** 2026-04-01
**Domain:** Microsoft Defender for Endpoint REST API integration into existing Lokka MCP server
**Confidence:** HIGH

## Summary

This phase extends the existing `Lokka-Microsoft` MCP tool with a new `apiType: "defender"` option. The implementation follows the exact same pattern as the existing Azure RM integration in `main.ts` (lines 153-256): acquire a token with a different scope, build URLs with query parameters, execute `fetch()`, and handle pagination via `@odata.nextLink`. No new dependencies are required.

The Defender for Endpoint machines API is a standard OData v4 REST endpoint at `https://eu.api.security.microsoft.com/api/machines`. It supports `$filter`, `$top`, `$skip`, and pagination via `@odata.nextLink`. The critical implementation detail is using the correct token scope (`https://api.securitycenter.microsoft.com/.default`) -- verified in Phase 1.

**Primary recommendation:** Extend the Zod schema to add `"defender"` to the `apiType` enum and add a new `else if (apiType === 'defender')` branch in the tool handler, mirroring the Azure RM pattern with Defender-specific constants.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-01 | Query Defender API via `Lokka-Microsoft` with `apiType: "defender"` | Add `"defender"` to Zod enum, new handler branch using fetch + Bearer token |
| INTG-05 | Only GET operations; non-GET returns clear error | Guard at top of defender branch: `if (method !== 'get') throw new Error(...)` |
| DEVL-01 | List machines with `$top`/`$skip` pagination | Pass as URLSearchParams; API supports `$top` max 10,000 and `$skip` natively |
| DEVL-02 | `fetchAll: true` across multiple pages | Follow `@odata.nextLink` in while loop (same pattern as Azure RM `nextLink`) |
| DEVL-03 | Pagination follows `@odata.nextLink` (not bare `nextLink`) | Defender uses `@odata.nextLink` key (not Azure RM's `nextLink`); must use correct key |
| DEVK-01 | Get machine by Defender ID via `/api/machines/{id}` | Append ID to path; standard REST pattern confirmed in docs |
| DEVK-02 | Search by DNS name prefix using `startswith(computerDnsName,'prefix')` | Confirmed in OData samples; only `startswith` is supported, not `contains` |
| FILT-01 | Filter by `healthStatus` | `$filter=healthStatus eq 'Active'` -- enum: Active, Inactive, ImpairedCommunication, NoSensorData, NoSensorDataImpairedCommunication, Unknown |
| FILT-02 | Filter by `riskScore` | `$filter=riskScore eq 'High'` -- nullable enum: None, Informational, Low, Medium, High |
| FILT-03 | Filter by `exposureLevel` | `$filter=exposureLevel eq 'Medium'` -- nullable enum: None, Low, Medium, High |
| FILT-04 | Filter by `osPlatform` | `$filter=osPlatform eq 'Windows10'` -- string, values like Windows10, Windows11, Linux, etc. |
| FILT-05 | Filter by `onboardingStatus` | `$filter=onboardingStatus eq 'onboarded'` -- enum: onboarded, CanBeOnboarded, Unsupported, InsufficientInfo |
| FILT-06 | Filter by `lastSeen` date range | `$filter=lastSeen gt 2024-01-01T00:00:00Z` -- supports gt, ge, lt, le operators |
| FILT-07 | Filter by `machineTags` using OData lambda | `$filter=machineTags/any(tag: tag eq 'TagValue')` -- standard OData v4 lambda syntax for collection properties |
| FILT-08 | Filter by `lastIpAddress` exact match | `$filter=lastIpAddress eq '10.0.0.1'` -- string equality |
| FILT-09 | Combine multiple filters with `and`/`or` | User passes complete `$filter` string; Lokka passes it through as-is to the API |
</phase_requirements>

## Standard Stack

### Core (all existing -- zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@azure/identity` | ^4.3.0 | Token acquisition with Defender scope | Already in Lokka; `getToken()` accepts any scope string |
| `isomorphic-fetch` | ^3.0.0 | HTTP client via global `fetch` polyfill | Already polyfilled globally in `main.ts` line 6/11 |
| `zod` | ^3.24.2 | Parameter validation for extended tool schema | Already used for tool parameter definitions |
| `@modelcontextprotocol/sdk` | existing | MCP tool registration | Already the server framework |

### No New Installation Required

```bash
# Nothing to install -- all dependencies already exist
```

## Architecture Patterns

### Recommended Code Structure

The implementation lives entirely in `main.ts` with supporting constants. No new files needed.

```
src/mcp/src/
  main.ts       # Add "defender" to apiType enum + new handler branch
  constants.ts  # Add DEFENDER_BASE_URL and DEFENDER_SCOPE constants
  auth.ts       # No changes needed
  logger.ts     # No changes needed
```

### Pattern 1: Extend Zod Enum (apiType)

**What:** Add `"defender"` to the existing `z.enum(["graph", "azure"])` in the tool schema.
**When to use:** This is the single point where the new API type becomes available to MCP clients.

```typescript
// Current (line 36):
apiType: z.enum(["graph", "azure"]).describe("...")

// New:
apiType: z.enum(["graph", "azure", "defender"]).describe(
  "Type of Microsoft API to query. Options: 'graph' for Microsoft Graph (Entra), " +
  "'azure' for Azure Resource Management, or 'defender' for Microsoft Defender for Endpoint."
)
```

**Critical:** The type annotation on lines 58-59 must also be updated:
```typescript
apiType: "graph" | "azure" | "defender";
```

### Pattern 2: Defender Handler Branch (mirrors Azure RM)

**What:** New `else if (apiType === 'defender')` block after the Azure RM block.
**When to use:** Every Defender API call flows through this branch.

```typescript
else if (apiType === 'defender') {
  // 1. Read-only guard
  if (method !== 'get') {
    throw new Error(
      "Defender for Endpoint integration is read-only. " +
      "Only GET requests are supported. " +
      `Received method: ${method.toUpperCase()}`
    );
  }

  // 2. Acquire token with Defender scope
  if (!authManager) throw new Error("Auth manager not initialized");
  const azureCredential = authManager.getAzureCredential();
  const tokenResponse = await azureCredential.getToken(DEFENDER_SCOPE);
  if (!tokenResponse?.token) {
    throw new Error("Failed to acquire Defender access token");
  }

  // 3. Build URL
  let url = `${DEFENDER_BASE_URL}${path}`;
  if (queryParams && Object.keys(queryParams).length > 0) {
    const urlParams = new URLSearchParams(queryParams);
    url += `?${urlParams.toString()}`;
  }

  // 4. Execute fetch (single page or fetchAll)
  // ... (see pagination pattern below)
}
```

### Pattern 3: Pagination via @odata.nextLink

**What:** Follow `@odata.nextLink` URLs for multi-page results.
**Critical difference from Azure RM:** Azure RM uses `nextLink` (no `@odata.` prefix). Defender uses `@odata.nextLink`.

```typescript
if (fetchAll) {
  let allValues: any[] = [];
  let currentUrl: string | null = url;

  while (currentUrl) {
    const credential = authManager.getAzureCredential();
    const pageToken = await credential.getToken(DEFENDER_SCOPE);
    if (!pageToken?.token) throw new Error("Token acquisition failed during pagination");

    const pageResponse = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${pageToken.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!pageResponse.ok) {
      const errorBody = await pageResponse.text();
      throw new Error(`Defender API error (${pageResponse.status}): ${errorBody}`);
    }

    const pageData = await pageResponse.json();

    if (pageData.value && Array.isArray(pageData.value)) {
      allValues = allValues.concat(pageData.value);
    }

    // CRITICAL: Use @odata.nextLink, NOT nextLink
    currentUrl = pageData['@odata.nextLink'] || null;
  }

  responseData = { value: allValues };
} else {
  // Single page fetch
  const apiResponse = await fetch(url, { method: 'GET', headers });
  // ... parse response
}
```

### Pattern 4: Constants

```typescript
// constants.ts additions:
export const DEFENDER_EU_BASE_URL = "https://eu.api.security.microsoft.com";
export const DEFENDER_SCOPE = "https://api.securitycenter.microsoft.com/.default";
```

### Pattern 5: Pagination Hint in Response

**What:** When `fetchAll` is false and response contains `@odata.nextLink`, append a note.
**Existing pattern:** Already done in `main.ts` lines 264-268 for both Graph and Azure RM.

```typescript
// Extend the existing nextLink detection (line 265):
const nextLinkKey = apiType === 'graph' ? '@odata.nextLink'
  : apiType === 'defender' ? '@odata.nextLink'
  : 'nextLink';
```

### Anti-Patterns to Avoid

- **Do NOT create a new MCP tool:** The requirement is to extend the existing `Lokka-Microsoft` tool, not create `Lokka-Defender`. This is a locked project decision.
- **Do NOT use Graph SDK for Defender calls:** The Microsoft Graph client (`@microsoft/microsoft-graph-client`) only wraps `graph.microsoft.com`. Defender lives at a different host and requires raw `fetch()`.
- **Do NOT build an OData query builder:** The user (LLM agent) constructs the `$filter` string directly. Lokka passes `queryParams` through to `URLSearchParams` as-is. Building a filter abstraction adds complexity without value -- the LLM generates correct OData natively.
- **Do NOT add 429 retry logic:** That is Phase 3 (ERRH-01). Phase 2 should throw on non-OK responses like the existing Azure RM pattern.
- **Do NOT rewrite EU hostnames in nextLink URLs:** That is Phase 3 scope. Phase 2 follows `@odata.nextLink` as-is.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OData filter construction | Custom filter builder | User passes `$filter` via `queryParams` | LLM agents generate valid OData; a builder adds no value and limits expressiveness |
| URL query string encoding | Manual string concatenation | `URLSearchParams` (built-in) | Handles encoding correctly; already used in Azure RM block |
| Token acquisition | Custom HTTP token flow | `authManager.getAzureCredential().getToken(scope)` | Already handles all auth modes (client creds, interactive, cert, client token) |
| Pagination | Custom page tracking | Simple while loop on `@odata.nextLink` | Defender returns absolute URLs; no page math needed |

## Common Pitfalls

### Pitfall 1: Wrong nextLink Key Name
**What goes wrong:** Using `nextLink` (Azure RM convention) instead of `@odata.nextLink` (Defender/OData convention) causes pagination to stop after the first page.
**Why it happens:** Copy-paste from Azure RM block (line 236) which uses bare `nextLink`.
**How to avoid:** Use `pageData['@odata.nextLink']` with bracket notation (dot notation fails on `@`-prefixed keys).
**Warning signs:** `fetchAll` always returns exactly one page of results.

### Pitfall 2: Token Scope String
**What goes wrong:** Using `https://api.security.microsoft.com/.default` (matches the HTTP hostname) instead of `https://api.securitycenter.microsoft.com/.default` (the OAuth resource).
**Why it happens:** The HTTP endpoint host and the OAuth resource identifier are different strings.
**How to avoid:** Use the constant `DEFENDER_SCOPE` defined in `constants.ts`. Never derive scope from the base URL.
**Warning signs:** 403 Forbidden despite correct permissions.

### Pitfall 3: Forgetting to Update Type Annotations
**What goes wrong:** TypeScript compilation fails or `"defender"` is rejected at runtime.
**Why it happens:** The Zod enum on line 36 and the TypeScript type annotation on line 59 must both be updated. Updating only one causes a mismatch.
**How to avoid:** Update both the Zod schema AND the TypeScript type in the handler parameter block.

### Pitfall 4: machineTags Filter Syntax
**What goes wrong:** Using `$filter=machineTags eq 'Tag1'` fails because `machineTags` is a collection, not a scalar.
**Why it happens:** Unlike `healthStatus` or `riskScore`, `machineTags` is a `String collection` requiring OData lambda syntax.
**How to avoid:** Document in tool description that tag filtering requires lambda syntax: `machineTags/any(tag: tag eq 'Tag1')`.
**Warning signs:** OData parse error from the API.

### Pitfall 5: Missing Read-Only Guard
**What goes wrong:** A POST/PATCH/DELETE request reaches the Defender API and either fails with 405 or worse, succeeds (some Defender endpoints accept POST for actions like machine isolation).
**Why it happens:** The existing Azure RM branch allows all HTTP methods.
**How to avoid:** Add an explicit method check at the top of the defender branch before any network call.
**Warning signs:** No warning signs -- this is a silent correctness issue.

### Pitfall 6: Nullable Enum Fields
**What goes wrong:** Code that processes `riskScore`, `exposureLevel`, or `deviceValue` crashes on `null`.
**Why it happens:** New/unscanned devices return `null` for these fields per the Machine entity docs.
**How to avoid:** Since Lokka returns raw JSON, this is only a concern if post-processing is added. The raw `JSON.stringify` approach handles null correctly.

## Code Examples

### Complete Defender Constants (to add to constants.ts)

```typescript
// Source: Phase 1 verification + official docs
export const DEFENDER_EU_BASE_URL = "https://eu.api.security.microsoft.com";
export const DEFENDER_SCOPE = "https://api.securitycenter.microsoft.com/.default";
```

### OData Filter Examples (for tool description documentation)

```
# List all active machines
queryParams: { "$filter": "healthStatus eq 'Active'" }

# High risk machines
queryParams: { "$filter": "riskScore eq 'High'" }

# Machines last seen after a date
queryParams: { "$filter": "lastSeen gt 2024-01-01T00:00:00Z" }

# DNS name prefix search
queryParams: { "$filter": "startswith(computerDnsName,'srv-prod')" }

# Filter by tag (lambda syntax for collection)
queryParams: { "$filter": "machineTags/any(tag: tag eq 'CriticalAsset')" }

# Combined filters
queryParams: { "$filter": "healthStatus eq 'Active' and riskScore eq 'High'" }

# Pagination
queryParams: { "$top": "100", "$skip": "200" }

# Filter by lastIpAddress
queryParams: { "$filter": "lastIpAddress eq '10.0.0.1'" }

# Filter by osPlatform and onboardingStatus
queryParams: { "$filter": "osPlatform eq 'Windows10' and onboardingStatus eq 'onboarded'" }

# Filter by exposureLevel
queryParams: { "$filter": "exposureLevel eq 'High'" }
```

### Updated Tool Description Text

The tool description should be updated to mention the Defender API type and its read-only nature:

```typescript
"A versatile tool to interact with Microsoft APIs including Microsoft Graph (Entra), " +
"Azure Resource Management, and Microsoft Defender for Endpoint (read-only device queries). " +
"For Defender: use apiType 'defender', path '/api/machines' to list devices. " +
"Supports OData $filter on healthStatus, riskScore, exposureLevel, osPlatform, onboardingStatus, " +
"lastSeen, machineTags, lastIpAddress, computerDnsName. " +
"Use startswith(computerDnsName,'prefix') for DNS search. " +
"For tags: machineTags/any(tag: tag eq 'value'). " +
"Defender only supports GET requests."
```

### Response Format for fetchAll

When using `fetchAll: true`, Defender returns `@odata.nextLink` with absolute URLs. The pagination loop follows these URLs directly. Final response structure:

```json
{
  "value": [
    { "id": "...", "computerDnsName": "...", ... },
    { "id": "...", "computerDnsName": "...", ... }
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `api.securitycenter.microsoft.com` base URL | `api.security.microsoft.com` (+ geo prefix) | 2024 | Must still use old scope string for auth; new URL for HTTP calls |
| No geo-specific endpoints | `eu.api.security.microsoft.com` etc. | 2024 | Use EU prefix for data residency |

**Deprecated/outdated:**
- Token scope `https://api.security.microsoft.com/.default`: Does NOT work for machines API. Must use `https://api.securitycenter.microsoft.com/.default` (legacy resource URI). Official docs explicitly warn about this as of Feb 2026.

## Open Questions

1. **machineTags lambda filter support**
   - What we know: `machineTags` is listed as a filterable property. Standard OData v4 lambda syntax for collections is `machineTags/any(tag: tag eq 'value')`.
   - What's unclear: No official Defender doc example shows lambda syntax on machineTags. The dedicated `/api/machines/findbytag` endpoint exists but is a v2 feature (EXT-02).
   - Recommendation: Implement using standard OData lambda syntax. If the API rejects it, fall back to documenting the limitation and noting the findbytag endpoint as an alternative. Confidence: MEDIUM.

2. **$skip behavior with large offsets**
   - What we know: `$skip` is supported. `$top` max is 10,000.
   - What's unclear: Whether `$skip` has a maximum value or performance cliff on very large datasets.
   - Recommendation: Not a Phase 2 concern. The `fetchAll` loop uses `@odata.nextLink` (which includes offset internally), not manual `$skip` arithmetic.

## Sources

### Primary (HIGH confidence)
- [List machines API](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machines) -- filterable properties, $top limit, rate limits, permissions (updated 2026-03-22)
- [Machine resource type](https://learn.microsoft.com/en-us/defender-endpoint/api/machine) -- complete entity schema with types and nullability (updated 2026-03-22)
- [OData query samples](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-odata-samples) -- filter syntax examples for riskScore, healthStatus, lastSeen, startswith, combined filters (updated 2026-03-22)
- [Create app without user](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-create-app-webapp) -- critical token scope warning (updated 2026-02-03)
- Phase 1 verification results -- EU endpoint confirmed working, token scope confirmed
- Lokka source code direct inspection -- `main.ts`, `auth.ts`, `constants.ts`

### Secondary (MEDIUM confidence)
- [Find devices by tag API](https://learn.microsoft.com/en-us/defender-endpoint/api/find-machines-by-tag) -- dedicated tag search endpoint (v2 scope)

### Tertiary (LOW confidence)
- machineTags OData lambda syntax -- standard OData v4 pattern, no Defender-specific example found in docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies; identical pattern to existing Azure RM integration
- Architecture: HIGH -- extends existing tool with one new enum value and one new handler branch
- Pitfalls: HIGH -- all sourced from official docs and Phase 1 verification
- OData filtering: HIGH -- official examples for most filter types
- machineTags lambda: MEDIUM -- standard OData pattern but no Defender-specific example

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable API, low churn)
