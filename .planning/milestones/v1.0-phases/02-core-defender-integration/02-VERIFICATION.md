---
phase: 02-core-defender-integration
verified: 2026-04-01T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: "Submit apiType 'defender' with method 'post' and verify the error message contains 'read-only' and 'GET'"
    expected: "Error returned immediately, before any network call, with message mentioning read-only constraint"
    why_human: "Cannot exercise the runtime guard without a live MCP client session"
  - test: "Call path '/api/machines' with fetchAll:true against a real tenant"
    expected: "All pages retrieved; result is a single object with 'value' array containing all machines"
    why_human: "Pagination correctness across real @odata.nextLink URLs requires a live Defender tenant"
---

# Phase 2: Core Defender Integration — Verification Report

**Phase Goal:** Users can query Defender device data through the existing `Lokka-Microsoft` MCP tool using `apiType: "defender"`
**Verified:** 2026-04-01
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Passing `apiType: 'defender'` to `Lokka-Microsoft` routes to the Defender handler branch | VERIFIED | `else if (apiType === 'defender')` at line 266 of `main.ts`; Zod enum `["graph", "azure", "defender"]` at line 42; TypeScript type `"graph" \| "azure" \| "defender"` at line 67 |
| 2 | Non-GET methods on defender return a clear read-only error before any network call | VERIFIED | Guard at lines 268-274 checks `method !== 'get'` before `getAzureCredential()` or any `fetch()` call; error text explicitly says "read-only" and "Only GET requests are supported" |
| 3 | Single-page GET returns machine data from `eu.api.security.microsoft.com` | VERIFIED | `DEFENDER_EU_BASE_URL = "https://eu.api.security.microsoft.com"` in `constants.ts` line 13; single-page branch at lines 341-362 builds URL from that constant, calls `fetch()`, parses JSON |
| 4 | `fetchAll` follows `@odata.nextLink` across multiple pages and returns combined results | VERIFIED | Pagination loop at lines 300-340; `currentUrl = pageData['@odata.nextLink'] \|\| null` (bracket notation, line 336); final `responseData = { value: allValues }` (line 339) |
| 5 | Path `/api/machines/{id}` retrieves a single machine by Defender device ID | VERIFIED | URL construction at line 289: `` `${DEFENDER_EU_BASE_URL}${path}` `` — `path` is user-supplied and passes through as-is, so `/api/machines/{id}` works without special handling |
| 6 | OData query parameters (`$filter`, `$top`, `$skip`) pass through to the API correctly | VERIFIED | Lines 290-293: `new URLSearchParams(queryParams)` appended to URL; no filtering or rewriting of param names |
| 7 | Tool description documents Defender usage including filter syntax for all supported fields | VERIFIED | Lines 34-40: description lists `/api/machines`, `/api/machines/{id}`, all 9 filterable fields (`healthStatus`, `riskScore`, `exposureLevel`, `osPlatform`, `onboardingStatus`, `lastSeen`, `machineTags`, `lastIpAddress`, `computerDnsName`), OData syntax examples, `machineTags/any(tag: tag eq 'value')` lambda, `and`/`or` combination, `$top`/`$skip`, and `fetchAll` |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/mcp/src/constants.ts` | `DEFENDER_EU_BASE_URL` and `DEFENDER_SCOPE` constants | VERIFIED | Both exported at lines 13-14; correct values (`eu.api.security.microsoft.com` and `api.securitycenter.microsoft.com/.default`); build output `src/mcp/build/constants.js` mirrors them |
| `src/mcp/src/main.ts` | Defender handler branch in `Lokka-Microsoft` tool | VERIFIED | 797 lines; Defender branch at lines 265-363; enum, type, description, branch, nextLinkKey logic, and error-handler fallback all present |
| `src/mcp/build/constants.js` | Compiled JS output with Defender constants | VERIFIED | File exists; exports `DEFENDER_EU_BASE_URL` and `DEFENDER_SCOPE` with correct values |
| `src/mcp/build/main.js` | Compiled JS output with Defender handler | VERIFIED | 8 occurrences of "defender"; `@odata.nextLink` pagination, read-only guard, `DEFENDER_EU_BASE_URL`, `DEFENDER_SCOPE` all present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/mcp/src/main.ts` | `src/mcp/src/constants.ts` | `import DEFENDER_EU_BASE_URL, DEFENDER_SCOPE` | WIRED | Line 9: `import { ..., DEFENDER_EU_BASE_URL, DEFENDER_SCOPE } from "./constants.js"` |
| `main.ts` defender branch | `authManager.getAzureCredential()` | token acquisition with `DEFENDER_SCOPE` | WIRED | Line 279: `azureCredential.getToken(DEFENDER_SCOPE)`; line 309: `pageCredential.getToken(DEFENDER_SCOPE)` in pagination loop |
| `main.ts` defender branch | `eu.api.security.microsoft.com` | `fetch` with `DEFENDER_EU_BASE_URL` | WIRED | Line 289: `` `${DEFENDER_EU_BASE_URL}${path}` ``; used as both the initial URL and in the `determinedUrl` fallback |
| `main.ts` pagination | `@odata.nextLink` | bracket notation on response JSON | WIRED | Line 336: `pageData['@odata.nextLink'] \|\| null` — bracket notation required (dot notation cannot access `@`-prefixed keys) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTG-01 | 02-01-PLAN.md | Query Defender via `Lokka-Microsoft` with `apiType: "defender"` | SATISFIED | Zod enum includes `"defender"`; handler branch routes all defender calls |
| INTG-02 | (Phase 1, not claimed in Phase 2 plan) | EU endpoint hardcoded | SATISFIED | `DEFENDER_EU_BASE_URL = "https://eu.api.security.microsoft.com"` in constants.ts — Phase 2 uses it correctly |
| INTG-03 | (Phase 1, not claimed in Phase 2 plan) | Reuses existing Lokka auth credential chain | SATISFIED | `authManager.getAzureCredential()` at lines 279, 308 — same `AuthManager` instance used by Graph and Azure RM |
| INTG-04 | (Phase 1, not claimed in Phase 2 plan) | Correct token scope `https://api.securitycenter.microsoft.com/.default` | SATISFIED | `DEFENDER_SCOPE` constant uses `securitycenter` (OAuth resource), not `security` (HTTP host) |
| INTG-05 | 02-01-PLAN.md | Only GET operations; non-GET returns clear error | SATISFIED | Read-only guard at lines 268-274, before any network call |
| DEVL-01 | 02-01-PLAN.md | List machines with `$top`/`$skip` | SATISFIED | `queryParams` passed through `URLSearchParams` to URL; user sets `$top`/`$skip` as queryParams keys |
| DEVL-02 | 02-01-PLAN.md | `fetchAll: true` across multiple pages | SATISFIED | `if (fetchAll)` branch at lines 300-340 |
| DEVL-03 | 02-01-PLAN.md | Pagination follows `@odata.nextLink` (not bare `nextLink`) | SATISFIED | Line 336: `pageData['@odata.nextLink']`; Azure RM uses `pageData.nextLink` on line 244 — distinction is correct |
| DEVK-01 | 02-01-PLAN.md | Get machine by Defender ID via `/api/machines/{id}` | SATISFIED | Path passthrough; no restriction on path shape |
| DEVK-02 | 02-01-PLAN.md | Search by DNS prefix using `startswith(computerDnsName,'prefix')` | SATISFIED | OData filter passthrough; lambda syntax documented in tool description line 37 |
| FILT-01 | 02-01-PLAN.md | Filter by `healthStatus` | SATISFIED | `queryParams` passthrough; field documented in tool description |
| FILT-02 | 02-01-PLAN.md | Filter by `riskScore` | SATISFIED | `queryParams` passthrough; field documented in tool description |
| FILT-03 | 02-01-PLAN.md | Filter by `exposureLevel` | SATISFIED | `queryParams` passthrough; field documented in tool description |
| FILT-04 | 02-01-PLAN.md | Filter by `osPlatform` | SATISFIED | `queryParams` passthrough; field documented in tool description |
| FILT-05 | 02-01-PLAN.md | Filter by `onboardingStatus` | SATISFIED | `queryParams` passthrough; field documented in tool description |
| FILT-06 | 02-01-PLAN.md | Filter by `lastSeen` date range | SATISFIED | `queryParams` passthrough; field documented in tool description |
| FILT-07 | 02-01-PLAN.md | Filter by `machineTags` using OData lambda | SATISFIED | `queryParams` passthrough; `machineTags/any(tag: tag eq 'value')` lambda syntax documented at line 37 |
| FILT-08 | 02-01-PLAN.md | Filter by `lastIpAddress` exact match | SATISFIED | `queryParams` passthrough; field documented in tool description |
| FILT-09 | 02-01-PLAN.md | Combine multiple filters with `and`/`or` | SATISFIED | `queryParams` passthrough; `and`/`or` syntax documented at line 38 |

**Note on INTG-02, INTG-03, INTG-04:** These are Phase 1 requirements (traceability table in REQUIREMENTS.md maps them to Phase 1). Phase 2 plan does not claim them but the implementation satisfies them as a side effect of correctly using the constants and auth chain established in Phase 1.

**Orphaned requirements check:** REQUIREMENTS.md maps INTG-01 through FILT-09 to Phase 2. All 17 are either claimed by 02-01-PLAN.md or (for INTG-02/03/04) covered by Phase 1. No orphaned requirements.

---

### Anti-Patterns Found

No anti-patterns detected in modified files (`src/mcp/src/constants.ts`, `src/mcp/src/main.ts`):

- No TODO/FIXME/HACK/PLACEHOLDER comments
- No stub return patterns (`return null`, `return {}`, `return []`, empty arrow functions)
- No console.log-only implementations
- No hardcoded magic strings for the scope or base URL (both use named constants)

---

### Human Verification Required

#### 1. Read-Only Guard — Runtime Behavior

**Test:** Use an MCP client to call `Lokka-Microsoft` with `apiType: "defender"`, `path: "/api/machines"`, `method: "post"`.
**Expected:** Tool returns `isError: true` with a message containing "read-only" and "Only GET requests are supported" and does not make any network call to `eu.api.security.microsoft.com`.
**Why human:** The guard logic is statically correct but confirming "no network call was made" requires runtime observation.

#### 2. Multi-Page fetchAll — Real Tenant

**Test:** Call `Lokka-Microsoft` with `apiType: "defender"`, `path: "/api/machines"`, `fetchAll: true` against a tenant with more than one page of devices.
**Expected:** Response contains a single `value` array with all devices across all pages; no duplicate entries; loop terminates cleanly.
**Why human:** `@odata.nextLink` correctness across real API pages cannot be verified without a live Defender tenant.

---

### Compilation

TypeScript check (`tsc --noEmit`) passes with zero errors. Build output produced via esbuild (tsc emit OOM on this machine due to Microsoft Graph SDK type complexity — documented deviation in SUMMARY.md). Type correctness is confirmed; build output is structurally equivalent.

---

## Summary

Phase 2 goal is fully achieved. All 7 observable truths are verified. All 4 key links are wired. All 17 phase requirements (INTG-01, INTG-05, DEVL-01/02/03, DEVK-01/02, FILT-01 through FILT-09) are satisfied. The implementation correctly extends the existing `Lokka-Microsoft` tool with a defender branch that:

- Accepts `apiType: "defender"` via the updated Zod enum and TypeScript type
- Blocks non-GET methods before any network call
- Acquires tokens via the existing `AuthManager.getAzureCredential()` with the correct `securitycenter` scope
- Constructs EU-endpoint URLs with OData queryParams passthrough
- Follows `@odata.nextLink` (not bare `nextLink`) with per-page token refresh for `fetchAll`
- Documents all 9 filterable fields and OData syntax in the tool description
- Correctly updates the pagination hint (`nextLinkKey`) to use `@odata.nextLink` for both graph and defender

Two human verification items remain (read-only guard runtime behavior and real-tenant pagination), which do not block the automated assessment.

---

_Verified: 2026-04-01_
_Verifier: Claude (gsd-verifier)_
