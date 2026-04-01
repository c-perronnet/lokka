# Architecture Patterns

**Domain:** Defender for Endpoint API integration into existing MCP server
**Researched:** 2026-04-01
**Overall Confidence:** HIGH (primary sources: official Microsoft Defender for Endpoint API documentation, updated March 2026)

---

## Recommended Architecture

Extend the existing `Lokka-Microsoft` tool by adding `"defender"` as a third `apiType` enum value. The Defender branch follows the same direct-fetch pattern already used for Azure RM — no new MCP tool needed, no new auth system, no SDK.

```
MCP Client
    |
    v
[Lokka-Microsoft tool]  <-- extend apiType to include "defender"
    |
    +-- apiType="graph"    --> Graph SDK client (existing)
    +-- apiType="azure"    --> fetch + management.azure.com token (existing)
    +-- apiType="defender" --> fetch + securitycenter token (NEW)
                                  |
                                  v
                          eu.api.security.microsoft.com
                          /api/machines
                          /api/machines/{id}
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `Lokka-Microsoft` tool (main.ts) | Route request to correct API branch; validate apiType; return formatted JSON | Auth layer, Graph SDK, fetch polyfill |
| Azure RM branch (existing) | Acquire `management.azure.com` token, construct URL, paginate via `nextLink` | AuthManager, fetch |
| Defender branch (new) | Acquire `securitycenter.microsoft.com` token, construct EU base URL, paginate via `@odata.nextLink` | AuthManager, fetch |
| `AuthManager` (auth.ts) | Provide `TokenCredential` regardless of API target; no change needed | Azure Identity SDK |
| `constants.ts` | House `DefenderEuBaseUrl` and `DefenderTokenScope` constants | All layers that need the base URL |

No new MCP tools, no new auth classes, no new files required. The Defender branch is a self-contained `else if (apiType === 'defender')` block within the existing tool handler.

---

## Data Flow

### Defender API Request Flow

1. MCP client calls `Lokka-Microsoft` with `apiType: "defender"`, `path: "/api/machines"`, `method: "get"`, optional `queryParams`.
2. Tool handler enters the new `defender` branch.
3. Acquire token from `authManager.getAzureCredential().getToken("https://api.securitycenter.microsoft.com/.default")`.
   - Reuses the existing `TokenCredential` already stored in `AuthManager` — zero new auth logic.
4. Construct URL: `https://eu.api.security.microsoft.com` + `path`.
5. Append query parameters (OData: `$filter`, `$top`, `$skip`) via `URLSearchParams`.
6. Execute `fetch(url, { Authorization: Bearer ... })`.
7. If `fetchAll: true`, loop following `@odata.nextLink` in responses (same accumulation pattern as Azure RM, but pagination key is `@odata.nextLink` not `nextLink`).
8. Return formatted JSON text to MCP client.

### Token Acquisition — Defender vs Graph vs Azure RM

| Target | Token Scope | Method |
|--------|-------------|--------|
| Microsoft Graph | `https://graph.microsoft.com/.default` | Graph SDK (via `TokenCredentialAuthProvider`) |
| Azure RM | `https://management.azure.com/.default` | Direct call to `azureCredential.getToken(scope)` |
| Defender for Endpoint | `https://api.securitycenter.microsoft.com/.default` | Direct call to `azureCredential.getToken(scope)` — same pattern as Azure RM |

**Critical note (confirmed in official docs, updated 2026-02-03):** The Defender API HTTP endpoint host is `api.security.microsoft.com` (unified security portal), but the OAuth2 token audience must be `https://api.securitycenter.microsoft.com`. Using `https://api.security.microsoft.com/.default` as the scope causes `403 Forbidden` even though the HTTP endpoint URL is correct. These are two different identifiers for two different purposes.

### Pagination Pattern — Defender vs Azure RM vs Graph

| API | Pagination Key | Example |
|-----|---------------|---------|
| Azure RM | `nextLink` (top-level) | `{ "value": [...], "nextLink": "https://..." }` |
| Defender (OData) | `@odata.nextLink` (top-level) | `{ "@odata.context": "...", "value": [...], "@odata.nextLink": "https://..." }` |
| Microsoft Graph | `@odata.nextLink` (handled by SDK PageIterator) | automatic |

The Defender pagination key matches Graph's OData convention (`@odata.nextLink`), not Azure RM's bare `nextLink`. The existing Azure RM pagination loop reads `pageData.nextLink` — the Defender loop must read `pageData['@odata.nextLink']`.

### Response Structure

List responses:
```json
{
  "@odata.context": "https://eu.api.security.microsoft.com/api/$metadata#Machines",
  "value": [
    {
      "id": "1e5bc9d7e413ddd7902c2932e418702b84d0cc07",
      "computerDnsName": "host.contoso.com",
      "osPlatform": "Windows10",
      "healthStatus": "Active",
      "riskScore": "Low",
      "exposureLevel": "Medium",
      "lastSeen": "2024-01-25T07:27:36.052313Z",
      "lastIpAddress": "10.0.0.1",
      "machineTags": ["Tag1"],
      "ipAddresses": [
        { "ipAddress": "10.0.0.1", "macAddress": "AABBCC112233", "operationalStatus": "Up" }
      ]
    }
  ]
}
```

Single-entity responses (GET `/api/machines/{id}`) return the object directly, no `value` wrapper.

---

## Patterns to Follow

### Pattern 1: Extending `apiType` Enum in Zod Schema

```typescript
// Before
apiType: z.enum(["graph", "azure"]).describe("...")

// After
apiType: z.enum(["graph", "azure", "defender"]).describe(
  "Type of Microsoft API to query. Options: 'graph' for Microsoft Graph (Entra), 'azure' for Azure Resource Management, or 'defender' for Microsoft Defender for Endpoint (EU region)."
)
```

### Pattern 2: Defender Branch in Tool Handler (mirrors Azure RM)

```typescript
else if (apiType === 'defender') {
  if (!authManager) throw new Error("Auth manager not initialized");
  determinedUrl = DefenderEuBaseUrl;

  const azureCredential = authManager.getAzureCredential();
  const tokenResponse = await azureCredential.getToken(DefenderTokenScope);
  if (!tokenResponse?.token) {
    throw new Error("Failed to acquire Defender access token");
  }

  let url = DefenderEuBaseUrl + path;
  if (queryParams && Object.keys(queryParams).length > 0) {
    const urlParams = new URLSearchParams(queryParams);
    url += `?${urlParams.toString()}`;
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${tokenResponse.token}`,
    'Content-Type': 'application/json'
  };

  if (fetchAll && method === 'get') {
    let allValues: any[] = [];
    let currentUrl: string | null = url;
    while (currentUrl) {
      const pageToken = await authManager.getAzureCredential().getToken(DefenderTokenScope);
      if (!pageToken?.token) throw new Error("Failed to re-acquire Defender token during pagination");
      const pageResponse = await fetch(currentUrl, {
        method: 'GET',
        headers: { ...headers, 'Authorization': `Bearer ${pageToken.token}` }
      });
      const pageText = await pageResponse.text();
      const pageData = pageText ? JSON.parse(pageText) : {};
      if (!pageResponse.ok) throw new Error(`Defender API error (${pageResponse.status}): ${JSON.stringify(pageData)}`);
      if (pageData.value && Array.isArray(pageData.value)) {
        allValues = allValues.concat(pageData.value);
      }
      currentUrl = pageData['@odata.nextLink'] || null;
    }
    responseData = { value: allValues };
  } else {
    const response = await fetch(url, { method: method.toUpperCase(), headers });
    const responseText = await response.text();
    responseData = responseText ? JSON.parse(responseText) : {};
    if (!response.ok) throw new Error(`Defender API error (${response.status}): ${JSON.stringify(responseData)}`);
  }
}
```

### Pattern 3: Constants Isolation

Add to `src/mcp/src/constants.ts`:

```typescript
export const DefenderEuBaseUrl = "https://eu.api.security.microsoft.com";
export const DefenderTokenScope = "https://api.securitycenter.microsoft.com/.default";
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: New Separate MCP Tool for Defender

**What:** Creating a `Lokka-Defender` tool as a separate `server.tool()` registration.

**Why bad:** Fragments the tool surface the AI model sees. Adding a third `apiType` value is a one-line schema change. A separate tool duplicates error handling, response formatting, and pagination logic.

**Instead:** Extend `apiType` enum to `["graph", "azure", "defender"]`.

### Anti-Pattern 2: Wrong Token Scope

**What:** Using `https://api.security.microsoft.com/.default` as the `getToken()` scope.

**Why bad:** The Defender API HTTP host and the OAuth2 resource identifier are different. The HTTP endpoint is `api.security.microsoft.com`; the token audience is `api.securitycenter.microsoft.com`. Using the HTTP host as the scope produces `403 Forbidden`.

**Instead:** Always use `https://api.securitycenter.microsoft.com/.default` as the token scope.

### Anti-Pattern 3: Using Graph SDK for Defender Requests

**What:** Routing Defender requests through `graphClient.api(...)`.

**Why bad:** `TokenCredentialAuthProvider` hardcodes `https://graph.microsoft.com/.default` as the scope. The Graph SDK has no concept of the Defender API base URL.

**Instead:** Use direct `fetch` with a manually acquired token — identical to the Azure RM branch.

---

## Build Order Implications

**Step 1 — `constants.ts`** (no dependencies)
- Add `DefenderEuBaseUrl` and `DefenderTokenScope` exports

**Step 2 — `main.ts`** (depends on Step 1; all sub-changes are atomically coupled)
- a. Import new constants from `constants.ts`
- b. Extend `apiType` Zod enum to `["graph", "azure", "defender"]`
- c. Add `defender` branch in the request handler (after `azure` branch)
- d. Update `determinedUrl` fallback in catch block
- e. Update `nextLinkKey` logic in pagination hint

**Step 3 — `auth.ts`**: No changes required.

The enum extension and handler branch must ship in the same commit — no valid intermediate state.

---

## Sources

- [Microsoft Defender for Endpoint API Introduction](https://learn.microsoft.com/en-us/defender-endpoint/api/apis-intro) — HIGH confidence
- [List Machines API](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machines) — HIGH confidence
- [Get Machine by ID API](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machine-by-id) — HIGH confidence
- [Create App without User — token scope gotcha](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-create-app-webapp) — HIGH confidence
- [OData Queries with Defender for Endpoint](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-odata-samples) — HIGH confidence
- Lokka source code `src/mcp/src/main.ts` and `src/mcp/src/auth.ts` — direct inspection
