# Phase 1: Auth Prerequisites - Research

**Researched:** 2026-04-01
**Domain:** Microsoft Defender for Endpoint API authentication verification
**Confidence:** HIGH

## Summary

Phase 1 is a **verification phase, not a coding phase**. The goal is to confirm that the existing Lokka app registration in Azure Entra can acquire a valid token for the Defender for Endpoint API and successfully call the EU machines endpoint before any integration code is written.

The three requirements (INTG-02, INTG-03, INTG-04) are satisfied by verifying: (1) the correct API permission (`Machine.Read.All` or `Machine.ReadWrite.All`) exists under `WindowsDefenderATP` with admin consent granted, (2) a token acquired with scope `https://api.securitycenter.microsoft.com/.default` has the correct `aud` claim, and (3) an HTTP GET to `https://eu.api.security.microsoft.com/api/machines` returns 200. No new code, no new dependencies -- just Azure Portal checks, a token acquisition test, and an API call test.

**Primary recommendation:** Use a simple script (bash/curl or TypeScript one-off) to acquire a token via `@azure/identity` with the Defender scope, decode the JWT to verify claims, and make a test GET request to the EU machines endpoint. Document the results as proof that auth prerequisites are met.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-02 | Defender requests use the EU endpoint (`eu.api.security.microsoft.com`) hardcoded | Verified: EU endpoint is `https://eu.api.security.microsoft.com`. Test call must target this exact host. See "EU Endpoint Verification" section. |
| INTG-03 | Defender requests reuse existing Lokka authentication (same credential chain as Graph/Azure RM) | Verified: `authManager.getAzureCredential().getToken()` accepts any scope string. The same `TokenCredential` works for Defender. See "Auth Reuse Verification" section. |
| INTG-04 | Defender token uses correct scope (`https://api.securitycenter.microsoft.com/.default`) | Verified: Official docs explicitly require this scope (not the HTTP host). See "Token Scope Verification" section. |
</phase_requirements>

## Standard Stack

### Core (verification tools only -- no new dependencies)

| Tool | Purpose | Why |
|------|---------|-----|
| `@azure/identity` (existing, 4.3.0) | Acquire token with Defender scope | Already in Lokka; `getToken()` accepts any scope string |
| `jsonwebtoken` (existing in Lokka) | Decode JWT to inspect `aud` and `roles` claims | Already used in `auth.ts` for scope parsing |
| `curl` or `fetch` | Make test HTTP GET to EU machines endpoint | Verification only; no production code |
| Azure Portal | Verify app permissions in Entra | Manual check required |

### No Installation Needed

This phase produces no production code and needs no new packages. All verification can be done with existing Lokka dependencies or command-line tools.

## Architecture Patterns

### Pattern 1: Token Acquisition for Defender (same as Azure RM)

**What:** The existing `AuthManager.getAzureCredential()` returns a `TokenCredential` that works for any Azure resource. Calling `.getToken("https://api.securitycenter.microsoft.com/.default")` produces a Defender-audience token.

**Verification approach:**
```typescript
// Minimal verification script using existing Lokka auth
import { ClientSecretCredential } from "@azure/identity";
import jwt from "jsonwebtoken";

const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
const tokenResponse = await credential.getToken("https://api.securitycenter.microsoft.com/.default");

// Decode and verify JWT claims
const decoded = jwt.decode(tokenResponse.token) as any;
console.log("aud:", decoded.aud);   // MUST be "https://api.securitycenter.microsoft.com"
console.log("roles:", decoded.roles); // MUST include "Machine.Read.All" or "Machine.ReadWrite.All"
```

### Pattern 2: EU Endpoint Test Call

**What:** HTTP GET to the machines list endpoint with the acquired Bearer token.

**Verification approach:**
```bash
# Using curl for a quick test
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://eu.api.security.microsoft.com/api/machines?$top=1"
# Expected: 200
```

Or equivalently in TypeScript:
```typescript
const response = await fetch("https://eu.api.security.microsoft.com/api/machines?$top=1", {
  headers: { Authorization: `Bearer ${tokenResponse.token}` }
});
console.log("Status:", response.status); // MUST be 200
```

### Pattern 3: Azure Portal Permission Check

**What:** Manual verification that the Lokka app registration has the required Defender permission.

**Steps:**
1. Azure Portal > App registrations > [Lokka app] > API permissions
2. Click "Add permission" > "APIs my organization uses" > search "WindowsDefenderATP"
3. Select "Application permissions" > find `Machine.Read.All` (preferred) or `Machine.ReadWrite.All`
4. Add the permission and click "Grant admin consent"
5. Verify the green checkmark appears next to the permission

**Important:** `WindowsDefenderATP` does NOT appear in the default list. You must type it in the search box. If it does not appear at all, the tenant may lack a Defender for Endpoint license.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT decoding | Custom base64 parser | `jsonwebtoken` (already in Lokka) or jwt.ms website | JWT format has nuances; existing library handles them |
| Token acquisition | Raw OAuth2 HTTP calls | `@azure/identity` `ClientSecretCredential` | Token caching, retry, and refresh handled automatically |
| Permission verification | Custom Graph API calls to check permissions | Azure Portal UI | Portal is authoritative; API approach adds unnecessary complexity for a one-time check |

**Key insight:** This is a verification phase. Use the simplest tool for each check -- Azure Portal for permissions, a script for token/API testing. No production code should be written.

## Common Pitfalls

### Pitfall 1: Wrong Token Scope (CRITICAL)

**What goes wrong:** Using `https://api.security.microsoft.com/.default` as the scope (the HTTP host) instead of `https://api.securitycenter.microsoft.com/.default` (the OAuth2 resource).
**Why it happens:** The API endpoint URL (`eu.api.security.microsoft.com`) and the token resource (`api.securitycenter.microsoft.com`) use different domain strings. Developers naturally assume they match.
**How to avoid:** Always use `https://api.securitycenter.microsoft.com/.default`. This is explicitly documented with a warning in Microsoft's official docs (updated 2026-02-03).
**Warning signs:** `403 Forbidden` despite correct permissions. Decoding the JWT shows wrong `aud` claim.

### Pitfall 2: Machine.Read.All May Not Exist

**What goes wrong:** Attempting to add `Machine.Read.All` but only finding `Machine.ReadWrite.All` in the Azure Portal.
**Why it happens:** The official "list machines" docs only reference `Machine.ReadWrite.All`. The read-only variant may not exist as a separate permission for this API.
**How to avoid:** Check both options in Azure Portal. If `Machine.Read.All` is not available, use `Machine.ReadWrite.All` -- it grants read access too. This is a known concern from STATE.md.
**Warning signs:** Permission not found in the WindowsDefenderATP permission list.

### Pitfall 3: Missing Admin Consent

**What goes wrong:** Permission is added but not granted admin consent. Token acquisition succeeds but the `roles` claim is empty.
**Why it happens:** Adding a permission and granting consent are two separate steps in Azure Portal.
**How to avoid:** After adding the permission, explicitly click "Grant admin consent for [tenant]" and verify the green checkmark.
**Warning signs:** JWT `roles` array is empty or missing the expected permission.

### Pitfall 4: WindowsDefenderATP Not Found in API Search

**What goes wrong:** Searching for "WindowsDefenderATP" in the API permissions dialog returns no results.
**Why it happens:** The tenant may not have a Defender for Endpoint license, or the Defender for Endpoint service has not been activated.
**How to avoid:** Ensure the tenant has an active Defender for Endpoint P1/P2 license. The service principal is auto-provisioned when the license is active.
**Warning signs:** No results when searching "WindowsDefenderATP" under "APIs my organization uses".

### Pitfall 5: Testing with Wrong Auth Mode

**What goes wrong:** Testing with interactive/device-code auth and getting `AADSTS65001` consent errors.
**Why it happens:** Interactive auth requires separate user consent for the Defender resource. The existing `add-graph-permission` tool only handles Graph consent.
**How to avoid:** For Phase 1 verification, use client credentials mode (client ID + client secret or certificate). This mode only requires admin consent on the app registration, which is simpler to verify.
**Warning signs:** `AADSTS65001` errors mentioning Defender resource.

## Code Examples

### Complete Verification Script

```typescript
// Source: Assembled from official Microsoft docs + Lokka auth patterns
// File: scripts/verify-defender-auth.ts (one-time verification, not production code)

import { ClientSecretCredential } from "@azure/identity";
import jwt from "jsonwebtoken";

const TENANT_ID = process.env.AZURE_TENANT_ID!;
const CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

const DEFENDER_SCOPE = "https://api.securitycenter.microsoft.com/.default";
const EU_MACHINES_URL = "https://eu.api.security.microsoft.com/api/machines";

async function verify() {
  // Step 1: Acquire token
  console.log("1. Acquiring token with Defender scope...");
  const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
  const tokenResponse = await credential.getToken(DEFENDER_SCOPE);
  if (!tokenResponse) throw new Error("Failed to acquire token");
  console.log("   Token acquired successfully.");

  // Step 2: Decode and verify JWT
  console.log("2. Verifying JWT claims...");
  const decoded = jwt.decode(tokenResponse.token) as any;
  
  const aud = decoded.aud;
  console.log(`   aud: ${aud}`);
  if (aud !== "https://api.securitycenter.microsoft.com") {
    throw new Error(`FAIL: aud is "${aud}", expected "https://api.securitycenter.microsoft.com"`);
  }
  console.log("   aud claim is correct.");

  const roles: string[] = decoded.roles || [];
  console.log(`   roles: ${JSON.stringify(roles)}`);
  const hasPermission = roles.includes("Machine.Read.All") || roles.includes("Machine.ReadWrite.All");
  if (!hasPermission) {
    throw new Error(`FAIL: roles does not include Machine.Read.All or Machine.ReadWrite.All`);
  }
  console.log("   Required permission found in roles.");

  // Step 3: Test API call to EU endpoint
  console.log("3. Testing EU machines endpoint...");
  const response = await fetch(`${EU_MACHINES_URL}?$top=1`, {
    headers: { Authorization: `Bearer ${tokenResponse.token}` }
  });
  console.log(`   HTTP ${response.status}`);
  if (response.status !== 200) {
    const body = await response.text();
    throw new Error(`FAIL: Expected 200, got ${response.status}. Body: ${body}`);
  }
  console.log("   EU machines endpoint returned 200.");

  console.log("\nAll verifications passed.");
}

verify().catch((err) => {
  console.error("\nVerification FAILED:", err.message);
  process.exit(1);
});
```

### Curl-Only Verification (no TypeScript)

```bash
# Source: Microsoft official docs - token acquisition via curl
# Step 1: Get token
TOKEN=$(curl -s -X POST \
  "https://login.microsoftonline.com/$TENANT_ID/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$CLIENT_ID" \
  -d "scope=https://api.securitycenter.microsoft.com/.default" \
  -d "client_secret=$CLIENT_SECRET" \
  | jq -r '.access_token')

# Step 2: Decode JWT (middle segment)
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{aud, roles}'

# Step 3: Test EU machines endpoint
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://eu.api.security.microsoft.com/api/machines?\$top=1"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Token resource: `https://api.securitycenter.microsoft.com` (v1 OAuth) | Token scope: `https://api.securitycenter.microsoft.com/.default` (v2 OAuth) | v2.0 token endpoint | Use `/oauth2/v2.0/token` with `scope` parameter, not `/oauth2/token` with `resource` parameter |
| Global endpoint: `api.securitycenter.microsoft.com` | Geo-specific: `eu.api.security.microsoft.com` | 2024+ | Use EU endpoint for data residency compliance |
| API name: `Microsoft Defender ATP` | API name: `WindowsDefenderATP` (in Entra permission search) | Legacy naming retained | Search for `WindowsDefenderATP` in Azure Portal, not the marketing name |

## Open Questions

1. **Does `Machine.Read.All` exist as a separate permission?**
   - What we know: Official "list machines" docs only cite `Machine.ReadWrite.All`. The STACK.md research flags this as MEDIUM confidence.
   - What's unclear: Whether `Machine.Read.All` appears in the Azure Portal under WindowsDefenderATP application permissions.
   - Recommendation: Check in Azure Portal during verification. If not available, use `Machine.ReadWrite.All` and document the finding. This is the primary discovery task of Phase 1.

2. **Does the EU endpoint `@odata.nextLink` stay on the EU host?**
   - What we know: PITFALLS.md warns that nextLink may contain global endpoint hostname.
   - What's unclear: Cannot verify without actual paginated data.
   - Recommendation: Not a Phase 1 concern. Note it for Phase 2 implementation.

## Verification Checklist (Phase 1 Deliverable)

The planner should structure tasks around these three verification gates:

| Gate | Check | Pass Criteria | Fail Action |
|------|-------|---------------|-------------|
| **G1: Permissions** | Azure Portal: App registration > API permissions > WindowsDefenderATP | `Machine.Read.All` or `Machine.ReadWrite.All` visible with admin consent (green checkmark) | Add permission + grant consent; if WindowsDefenderATP not found, check Defender license |
| **G2: Token Claims** | Decode JWT from `getToken("https://api.securitycenter.microsoft.com/.default")` | `aud` = `https://api.securitycenter.microsoft.com`, `roles` includes `Machine.Read.All` or `Machine.ReadWrite.All` | Fix permissions (G1), re-acquire token, re-check |
| **G3: API Call** | HTTP GET `https://eu.api.security.microsoft.com/api/machines?$top=1` with Bearer token | HTTP 200 response with JSON body containing `value` array | Debug: wrong scope (check G2), wrong permissions (check G1), network/firewall issue |

## Sources

### Primary (HIGH confidence)
- [Hello World for Defender API](https://learn.microsoft.com/en-us/defender-endpoint/api/api-hello-world) - Token acquisition steps, PowerShell verification script, updated 2026-01-08
- [Create app without user](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-create-app-webapp) - Token scope warning, curl example, permission setup steps, updated 2026-02-03
- [Defender API introduction](https://learn.microsoft.com/en-us/defender-endpoint/api/apis-intro) - EU endpoint list, updated 2026-03-22
- Lokka source code `src/mcp/src/auth.ts` - Confirmed `getAzureCredential()` returns generic `TokenCredential`
- Lokka source code `src/mcp/src/constants.ts` - No Defender constants yet

### Secondary (MEDIUM confidence)
- [Verify first-party Microsoft applications](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/governance/verify-first-party-apps-sign-in) - Service principal verification approach

## Metadata

**Confidence breakdown:**
- Token scope (`securitycenter.microsoft.com`): HIGH - Explicit warning in official docs with curl example
- EU endpoint: HIGH - Official docs geolocation tip, multiple sources
- Auth reuse pattern: HIGH - Direct source code inspection of `auth.ts`
- Verification approach: HIGH - Based on Microsoft's own "Hello World" tutorial
- `Machine.Read.All` availability: MEDIUM - Docs only cite `Machine.ReadWrite.All`; needs Azure Portal check

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable domain -- API permissions and endpoints change rarely)
