# Common Pitfalls

**Domain:** Microsoft Defender for Endpoint API Integration
**Researched:** 2026-04-01
**Overall Confidence:** HIGH (sourced from official Microsoft documentation and Lokka source code inspection)

---

## Critical Pitfalls

### Pitfall 1: Wrong Token Audience (403 Forbidden)

**Severity:** Critical — blocks all API calls
**Warning Signs:** `403 Forbidden` response despite correct app permissions and valid token
**Root Cause:** The Defender API HTTP endpoint host (`api.security.microsoft.com`) and the OAuth2 resource identifier (`api.securitycenter.microsoft.com`) are different values. Using the HTTP host as the token scope produces a token with the wrong audience.

**Prevention:**
- Always use `https://api.securitycenter.microsoft.com/.default` as the scope for `getToken()`
- NEVER use `https://api.security.microsoft.com/.default`
- If debugging: decode the JWT and check the `aud` claim — it must be `https://api.securitycenter.microsoft.com`

**Detection:** Decode the Bearer token (jwt.io or `jsonwebtoken` already in Lokka deps) and verify `aud` matches `https://api.securitycenter.microsoft.com`.

**Phase:** Implementation — must be correct from the first line of code.

---

### Pitfall 2: Missing WindowsDefenderATP App Permission

**Severity:** Critical — blocks all API calls
**Warning Signs:** Token acquisition succeeds but API returns `403 Forbidden` with a message about insufficient permissions
**Root Cause:** The existing Lokka app registration has Graph and Azure RM permissions, but NOT `Machine.Read.All` or `Machine.ReadWrite.All` for the `WindowsDefenderATP` API.

**Prevention:**
- Before writing any code, verify in Azure Portal: App registrations > [Lokka app] > API permissions > Add permission > APIs my organization uses > search "WindowsDefenderATP"
- Add `Machine.Read.All` (application permission) if available, otherwise `Machine.ReadWrite.All`
- Grant admin consent

**Detection:** Check the token's `roles` claim — it must include `Machine.Read.All` or `Machine.ReadWrite.All`.

**Phase:** Pre-implementation prerequisite. Document in README/setup instructions.

---

### Pitfall 3: Interactive Auth Consent Gap

**Severity:** Critical for interactive auth mode
**Warning Signs:** `AADSTS65001` error during interactive browser or device code flow — "The user or administrator has not consented to use the application"
**Root Cause:** `InteractiveBrowserCredential` / `DeviceCodeCredential` do not automatically gain Defender scopes. The existing `add-graph-permission` MCP tool is Graph-only and cannot request Defender consent.

**Prevention:**
- Document that interactive auth users must consent to Defender scopes separately
- The `add-graph-permission` tool could be extended to handle Defender permissions, but that's a separate enhancement
- For client credentials mode (most common for this use case), this is not an issue — admin consent covers it

**Detection:** Error message contains `AADSTS65001` and references the Defender resource.

**Phase:** Documentation — note the limitation clearly. Not a code blocker for client credentials mode.

---

## Moderate Pitfalls

### Pitfall 4: EU Endpoint Pagination nextLink Hostname Leak

**Severity:** Moderate — causes data loss in pagination
**Warning Signs:** First page returns EU data, subsequent pages fail or return data from global endpoint
**Root Cause:** `@odata.nextLink` absolute URLs in Defender responses may contain `api.security.microsoft.com` (global) instead of `eu.api.security.microsoft.com`. Following the global URL works but routes through a different datacenter, potentially violating data residency.

**Prevention:**
- When following `@odata.nextLink`, check if the hostname matches the configured base URL
- Option A: Follow the URL as-is (functional but may violate data residency)
- Option B: Replace the hostname in `@odata.nextLink` with the configured EU base URL before following

**Detection:** Log the `@odata.nextLink` URL during pagination and compare hostnames.

**Phase:** Implementation — handle in the pagination loop.

---

### Pitfall 5: Rate Limit 429 Without Retry-After

**Severity:** Moderate — causes pagination failures on large tenants
**Warning Signs:** `429 Too Many Requests` during `fetchAll` pagination; existing Lokka code throws on non-OK responses
**Root Cause:** Defender API limit is 100 calls/minute, 1500/hour. `fetchAll` on a large tenant (10,000+ devices) with `$top=10000` may hit this on subsequent pages.

**Prevention:**
- Add retry logic for 429 responses in the pagination loop
- Use exponential backoff: wait 10s, 20s, 40s
- Check for `Retry-After` header (may or may not be present)
- Alternatively, use reasonable `$top` values (e.g., 10000 max) to minimize page count

**Detection:** Monitor for 429 status codes in pagination responses.

**Phase:** Implementation — add to pagination loop error handling.

---

### Pitfall 6: `contains()` OData Filter Not Supported

**Severity:** Moderate — affects search UX
**Warning Signs:** OData filter error when using `contains(computerDnsName,'partial')`
**Root Cause:** The Defender machines endpoint only supports `startswith()` for `computerDnsName`, not `contains()` or `endswith()`. The PROJECT.md requirement says "search by DNS name or partial match" — true substring search is not available server-side.

**Prevention:**
- Document that DNS name search is prefix-only (`startswith`)
- The MCP tool description should say "search by DNS name prefix" not "partial match"
- For true substring search, fetch all machines and filter client-side (expensive)

**Detection:** API returns OData error mentioning unsupported function.

**Phase:** Requirements refinement — clarify the limitation before implementation.

---

### Pitfall 7: Nullable Enum Fields in TypeScript

**Severity:** Moderate — causes runtime errors if not handled
**Warning Signs:** `Cannot read property of null` when accessing `riskScore`, `exposureLevel`, or `deviceValue`
**Root Cause:** `riskScore`, `exposureLevel`, `osBuild`, `aadDeviceId`, and `deviceValue` are all nullable per the Machine entity docs. New/unscanned devices return `null` for these fields.

**Prevention:**
- Don't assume these fields are always present in filter result formatting
- The raw JSON response handles this naturally (null is valid JSON)
- Only matters if adding any post-processing or formatting logic

**Detection:** Query newly onboarded devices — they typically have null risk/exposure scores.

**Phase:** Implementation — handle in any response formatting code.

---

## Minor Pitfalls

### Pitfall 8: ClientProvidedTokenCredential Ignores Scope

**Severity:** Minor — affects only client-provided token auth mode
**Warning Signs:** Defender API returns 403 when using `set-access-token` mode, even though Graph calls work
**Root Cause:** `ClientProvidedTokenCredential` in `auth.ts` always returns the stored token regardless of what scope is requested. If the user provides a Graph-audience token, Defender calls will receive that same token and fail because the audience is wrong.

**Prevention:**
- Document that client-provided token mode requires a Defender-audience token for Defender calls
- The user would need to provide separate tokens for Graph and Defender, which the current single-token model doesn't support
- This is a known limitation of the client-provided token mode, not a bug to fix now

**Detection:** Decode the client-provided token and check if `aud` matches `https://api.securitycenter.microsoft.com`.

**Phase:** Documentation — note the limitation.

---

### Pitfall 9: Omitting API Version Path

**Severity:** Minor — could cause breaking changes later
**Warning Signs:** API behavior changes unexpectedly after Microsoft updates the default version
**Root Cause:** Calling `/api/machines` without a version path implicitly uses the latest version. If Microsoft introduces v2.0 with breaking changes, the integration breaks without any code change.

**Prevention:**
- Use explicit version path: `/api/v1.0/machines`
- Or document that the tool consumer should include the version in the `path` parameter
- PROJECT.md already specifies "Use v1.0 explicitly"

**Phase:** Implementation — use versioned paths in documentation and examples.

---

### Pitfall 10: `lastSeen` Semantics Mismatch

**Severity:** Minor — causes confusion, not failures
**Warning Signs:** Users report "last seen" dates that don't match the Defender portal
**Root Cause:** The API `lastSeen` field is the timestamp of the last full 24-hour device report, not the last heartbeat or last activity. The Defender portal "Last seen" display may show a different, more recent value.

**Prevention:**
- Document the `lastSeen` field semantics in the tool description or output
- Don't label it as "last active" or "last heartbeat"

**Phase:** Documentation — note in tool description.

---

## Summary by Phase

| Phase | Pitfalls to Address |
|-------|-------------------|
| Pre-implementation | #2 (app permissions), #3 (interactive consent docs) |
| Implementation | #1 (token scope), #4 (pagination hostname), #5 (429 retry), #6 (startswith only), #7 (nullable fields) |
| Documentation | #8 (client token limitation), #9 (version path), #10 (lastSeen semantics) |

---

## Sources

- [Create App without User — token scope warning](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-create-app-webapp) — HIGH confidence (updated 2026-02-03)
- [List Machines API](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machines) — HIGH confidence (updated 2026-03-22)
- [Machine resource type](https://learn.microsoft.com/en-us/defender-endpoint/api/machine) — HIGH confidence (updated 2026-03-22)
- [OData queries with Defender for Endpoint](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-odata-samples) — HIGH confidence (updated 2026-03-22)
- Lokka source code `src/mcp/src/auth.ts`, `src/mcp/src/main.ts` — direct inspection
