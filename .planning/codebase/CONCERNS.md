# Codebase Concerns

**Analysis Date:** 2026-04-01

## Tech Debt

**Global Mutable State:**
- Issue: `authManager` and `graphClient` are module-level globals initialized to null and mutated throughout the application. The `add-graph-permission` tool clears these globals and reinitializes them (lines 467-468 in `src/mcp/src/main.ts`), creating race condition risks if called concurrently.
- Files: `src/mcp/src/main.ts` (lines 23-24, 467-468, 533)
- Impact: Concurrent requests during credential refresh could cause requests to fail or use stale credentials. No mutex or state guard prevents simultaneous auth operations.
- Fix approach: Implement a locking mechanism (e.g., async mutex) around auth state transitions. Consider using object composition instead of module-level state to support future multi-instance scenarios.

**Type Safety Issues with `any` Types:**
- Issue: Multiple use of `any` types bypasses TypeScript's type system (15+ instances): `(global as any).fetch`, `as any` cast on line 533, response objects typed as `any`, error handlers catching `error: any`.
- Files: `src/mcp/src/main.ts` (lines 12, 65, 77, 108, 111, 201, 216, 275, 337, 372, 533, 560)
- Impact: Reduces type safety, makes refactoring risky, hides potential null/undefined access patterns.
- Fix approach: Create proper type definitions for Graph API responses (e.g., `PageCollection`, `PageIterator` types), define error type discriminators, and replace `(global as any).fetch` with proper typing in a shim file.

**Debug Disabled Code:**
- Issue: Commented-out debug logging function in logger (lines 40-47 in `src/mcp/src/logger.ts`). Debug capability is intentionally disabled, making runtime debugging difficult.
- Files: `src/mcp/src/logger.ts` (lines 40-47)
- Impact: Developers cannot enable debug logs at runtime without code modification and rebuild. Complicates troubleshooting in production.
- Fix approach: Implement environment-driven log levels (e.g., `LOG_LEVEL=debug`) instead of compile-time removal. Add logger initialization that respects `DEBUG` or `LOG_LEVEL` environment variables.

## Known Bugs

**Version Mismatch Between Package and Server:**
- Issue: `package.json` declares version `0.3.0` (line 3) but server hardcodes `0.2.0` (line 17 in `src/mcp/src/main.ts`). Log message also references `0.2.0` (line 20).
- Files: `src/mcp/package.json` (line 3), `src/mcp/src/main.ts` (lines 17, 20)
- Impact: Version mismatches create confusion in logs, support requests, and release tracking. Users see incorrect version in server logs.
- Workaround: Manually align versions during builds. Deploy with correct version number.

**Unhandled Empty Response Parsing:**
- Issue: Azure RM response parsing catches JSON parse errors but falls back to `{ rawResponse: responseText }` (lines 218-222, 245-250). No validation that `pageData` structure is usable; subsequent code assumes it has `nextLink` or `value` properties.
- Files: `src/mcp/src/main.ts` (lines 214-222, 243-250)
- Impact: Malformed or non-JSON responses (e.g., HTML error pages) silently become response data, propagating garbage through pagination logic.
- Workaround: Check HTTP status code before attempting JSON parsing. For 4xx/5xx, throw immediately.

**Scope Validation Too Lenient:**
- Issue: Scope validation on line 443 checks `scope.includes('.')` and `scope.trim() !== scope`, but accepts any value with a dot (e.g., `"a.b"` passes). No validation against actual Microsoft Graph scope patterns.
- Files: `src/mcp/src/main.ts` (line 443)
- Impact: Invalid scopes are silently accepted, passed to Azure, and may fail during permission request with unclear error messages.
- Fix approach: Maintain a whitelist of valid scope patterns or use a regex that matches Graph scope format (`Entity.Action` like `User.Read.All`).

## Security Considerations

**Hardcoded Redirect URI:**
- Risk: Default redirect URI is `http://localhost:3000` (hardcoded in `src/mcp/src/constants.ts`, line 5). HTTP (not HTTPS) is acceptable for localhost but could be misused if deployment encourages use with external networks.
- Files: `src/mcp/src/constants.ts` (line 5), referenced in `src/mcp/src/auth.ts` (line 174)
- Current mitigation: README documents proper setup. Environment variable override available.
- Recommendations: Add explicit validation that non-localhost redirect URIs must be HTTPS. Warn if HTTP is used for non-localhost addresses.

**Console Output of Sensitive Information:**
- Risk: Multiple `console.log()` calls output verification URIs and user codes (lines 474-476, 499-502 in main.ts, 183-185 in auth.ts). In MCP context, these outputs may be captured in logs or monitoring systems.
- Files: `src/mcp/src/main.ts` (lines 474-476, 499-502), `src/mcp/src/auth.ts` (lines 183-185)
- Current mitigation: These are temporary authentication codes, but still security-relevant.
- Recommendations: Route interactive prompts through MCP's structured response system instead of console.log. Avoid printing verification codes in default logging.

**No Token Expiration Refresh for Long-Running Operations:**
- Risk: Azure RM pagination re-acquires tokens per page (lines 205-210), but Graph API pagination with `fetchAll` does not. A long pagination operation could exceed token expiration, causing silent failures partway through.
- Files: `src/mcp/src/main.ts` (lines 103-127)
- Current mitigation: Default Graph token expiration is ~1 hour, pagination is fast in most cases.
- Recommendations: For Graph API pagination, refresh token if approaching expiration. Add a check before each page iteration.

**No Validation of Azure Subscription ID Input:**
- Risk: `subscriptionId` parameter is directly interpolated into Azure RM URL (line 170) without validation. Injection of special characters could create malformed URLs or bypass intended scope restrictions.
- Files: `src/mcp/src/main.ts` (line 170)
- Current mitigation: Azure API likely rejects invalid UUIDs.
- Recommendations: Validate `subscriptionId` matches UUID format before use. Use URL encoding or parameterized URL builders.

## Performance Bottlenecks

**Pagination Memory Growth:**
- Problem: Pagination collects all results in memory (`allItems` array for Graph, `allValues` for Azure RM). For endpoints returning millions of records, memory usage becomes unbounded.
- Files: `src/mcp/src/main.ts` (lines 108, 201)
- Cause: No streaming option; all pages are loaded before returning.
- Improvement path: For large datasets, either (a) implement pagination streaming to client, (b) add a result limit to prevent runaway queries, or (c) document the limitation clearly in tool descriptions.

**Token Re-Acquisition Per Page in Azure Pagination:**
- Problem: Azure RM pagination re-acquires Azure credential and token for each page (lines 205-210). With 100+ pages, this means 100+ Azure credential calls.
- Files: `src/mcp/src/main.ts` (lines 205-210)
- Cause: Token expiration concerns, but overly conservative.
- Improvement path: Cache token for the duration of pagination, only re-acquire if header indicates expired. Or pre-validate token and only refresh on 401 response.

**JSON Stringify on Every Response:**
- Problem: All responses are JSON-stringified with `JSON.stringify(responseData, null, 2)` (line 261). Large API responses (100k+ items) incur serialization overhead for formatting.
- Files: `src/mcp/src/main.ts` (line 261)
- Cause: Pretty-printing for human readability; not optimized for size or speed.
- Improvement path: Offer a `compact: true` option to return minified JSON. Default to minified for large responses.

## Fragile Areas

**Authentication State Initialization:**
- Files: `src/mcp/src/main.ts` (lines 574-677)
- Why fragile: Complex initialization logic with multiple conditional branches based on 8+ environment variables. Order matters (client token mode can start without token, others cannot). Logic for determining auth mode has potential ambiguity: if only `TENANT_ID` and `CLIENT_ID` are set (no `CLIENT_SECRET` or `USE_CERTIFICATE`), it defaults to interactive, but this may not be obvious to users.
- Safe modification: Add explicit validation that states which environment variables are required for each mode. Extract auth mode detection to a separate, testable function. Add debug logging of which branch is being taken.
- Test coverage: No visible test files for auth initialization logic.

**Error Reporting in Tools:**
- Files: `src/mcp/src/main.ts` (lines 275-297, 337-346, 372-381, 560-569)
- Why fragile: Error handlers catch `error: any` and rely on properties that may or may not exist (`error.statusCode`, `error.body`). Different errors have different structures (Graph SDK errors vs. fetch errors vs. auth errors). Errors are always returned as text-stringified JSON, which may double-encode if the error itself is an object.
- Safe modification: Create error type guards for different error sources. Normalize error responses to a consistent shape. Test with real error scenarios from Graph API and Azure RM.
- Test coverage: No error scenario tests visible.

**Graph vs. Azure Request Path Construction:**
- Files: `src/mcp/src/main.ts` (lines 80-152 for Graph, 154-256 for Azure)
- Why fragile: Two separate code paths with different error handling, different pagination logic, different header handling. Changes to one path don't propagate to the other. URL construction differs (Graph uses SDK, Azure uses manual URL building with URLSearchParams).
- Safe modification: Extract request execution to strategy objects (one for Graph, one for Azure). Share pagination logic through composition. Test both paths with identical test cases.
- Test coverage: No integration tests with real API calls visible.

## Scaling Limits

**Single-Threaded Event Loop Blocking:**
- Current capacity: As many concurrent MCP client requests as can be queued; actual processing is single-threaded Node.js.
- Limit: Long-running paginated queries (thousands of pages) or slow API responses block other pending requests.
- Scaling path: Implement pagination as streams/iterators that yield results incrementally instead of collecting all pages before returning. Use worker threads for CPU-heavy operations (e.g., JSON parsing of very large responses).

**Memory Consumption for Large Result Sets:**
- Current capacity: Results fit in Node.js heap (~2GB default).
- Limit: Querying endpoints that return millions of items (e.g., `/auditLogs` over a year) will exhaust memory.
- Scaling path: Implement streaming responses or add automatic pagination limits. Provide a `--max-items` parameter to cap results.

## Dependencies at Risk

**@microsoft/microsoft-graph-client (^3.0.7):**
- Risk: Caret version allows minor/patch updates. Breaking changes in 3.x could affect middleware or auth provider interface.
- Impact: Major version bump could require code changes to maintain compatibility.
- Migration plan: Pin to exact version (`3.0.7`) or test thoroughly on minor updates. Create a wrapper abstraction around Graph client to insulate business logic from SDK changes.

**@azure/identity (^4.3.0):**
- Risk: Interactive and certificate authentication fallbacks depend on specific error handling from Azure Identity. Updates could change error types or behavior.
- Impact: Authentication flow breaks if error handling assumptions change.
- Migration plan: Pin or test on updates. Add explicit error type checks instead of relying on implicit error structure.

**jsonwebtoken (^9.0.2):**
- Risk: Used for JWT decoding without signature verification (line 14 in auth.ts). Security patch could deprecate unsigned decoding.
- Impact: Token scope parsing would break if library disables unsigned decode.
- Migration plan: Replace with `jwtDecode` (lightweight, no signature verification) or add documented justification for trusting the token source.

## Missing Critical Features

**No Request Rate Limiting:**
- Problem: Rapid successive calls to Lokka-Microsoft tool or add-graph-permission will immediately hit Microsoft Graph/Azure RM rate limits. No client-side throttling or backoff.
- Blocks: Batch operations, automated migrations, high-frequency monitoring integrations.

**No Result Caching:**
- Problem: Identical sequential requests re-query the API. No cache layer for frequently requested data (e.g., list of users, groups).
- Blocks: Interactive scenarios where user refines a query repeatedly; efficiency in agent workflows.

**No Request Timeout Configuration:**
- Problem: Long-running paginated queries or slow API responses have no timeout. Requests can hang indefinitely.
- Blocks: Reliable deployment in environments with unstable network.

**No Pagination Cursor or Offset Support:**
- Problem: `fetchAll` fetches all pages. No way to resume pagination or fetch a specific page range.
- Blocks: Incremental data syncing, resumable operations.

## Test Coverage Gaps

**No Unit Tests for Auth Modes:**
- Untested: ClientProvidedTokenCredential initialization, token update, expiration handling, scope parsing from JWT. All auth mode initialization branches.
- Files: `src/mcp/src/auth.ts`
- Risk: Auth failures in production affect all functionality. Regressions in token refresh logic go undetected.
- Priority: High

**No Integration Tests for API Calls:**
- Untested: Actual Graph API queries (get, post, patch, delete), Azure RM queries, pagination logic, error handling for API errors (4xx, 5xx).
- Files: `src/mcp/src/main.ts` (tool implementation)
- Risk: Silent failures in response parsing, incorrect data passed to users, pagination corrupting data.
- Priority: High

**No Edge Case Tests:**
- Untested: Empty result sets, single-item results, very large result sets (pagination), malformed API responses, network failures, token expiration mid-request.
- Files: `src/mcp/src/main.ts`, `src/mcp/src/auth.ts`
- Risk: Tool fails unpredictably on real-world edge cases.
- Priority: Medium

**No Tests for Tool Parameter Validation:**
- Untested: Scope format validation, subscription ID validation, API path injection, query parameter escaping.
- Files: `src/mcp/src/main.ts`
- Risk: Security issues or malformed requests silently accepted.
- Priority: Medium

---

*Concerns audit: 2026-04-01*
