# Phase 3: Pagination Hardening - Research

**Researched:** 2026-04-01
**Domain:** HTTP retry logic, EU data residency enforcement, and auth error UX for Microsoft Defender for Endpoint API
**Confidence:** HIGH

## Summary

This phase hardens the existing Defender pagination loop (implemented in Phase 2) with three targeted improvements: (1) retry with exponential backoff on 429 rate limit responses, (2) hostname rewriting of `@odata.nextLink` URLs to enforce EU data residency, and (3) human-readable error messages for auth failures. All three changes are scoped to the Defender branch in `main.ts` -- no new files or dependencies are required.

The Defender for Endpoint machines API has documented rate limits of 100 calls/minute and 1,500 calls/hour. The API returns a `Retry-After` header (in seconds) with 429 responses. The current implementation throws on any non-OK response during pagination, meaning a single 429 kills an entire `fetchAll` operation. The fix is a retry loop inside the pagination `while` block that respects `Retry-After` and falls back to exponential backoff.

For EU data residency, the `@odata.nextLink` URLs returned by the Defender API use absolute URLs that may contain `api.security.microsoft.com` (global) instead of `eu.api.security.microsoft.com`. The current code follows these URLs as-is, which works but may route through non-EU datacenters. The fix is a simple URL hostname replacement before following any nextLink.

**Primary recommendation:** Add retry-with-backoff to the existing pagination loop, rewrite nextLink hostnames to EU, and wrap the error handler with Defender-specific error message translation. All changes are in `main.ts` lines 266-407.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ERRH-01 | 429 rate limit responses retried with backoff during pagination | Defender API returns `Retry-After` header on 429; add retry loop with exponential backoff (respecting header) inside fetchAll pagination while-loop |
| ERRH-02 | Clear error messages for auth failures (wrong scope, missing permissions) | Defender API returns structured JSON `{error: {code, message}}` for 401/403; parse and surface actionable guidance based on error code |
</phase_requirements>

## Standard Stack

### Core (all existing -- zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `isomorphic-fetch` | ^3.0.0 | HTTP client (already polyfilled globally) | Response object has `.status`, `.headers.get('Retry-After')` |
| `zod` | ^3.24.2 | Parameter validation (no changes needed) | Already in use |

### No New Installation Required

```bash
# Nothing to install -- all changes are to existing code in main.ts
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled retry loop | `p-retry` npm package | Overkill for a single retry site; adds a dependency for 15 lines of code |
| Manual URL rewriting | `URL` API hostname replacement | Use the built-in `URL` class -- it IS the right tool here |

## Architecture Patterns

### No New Files

All changes are in `src/mcp/src/main.ts` within the existing Defender branch (lines 266-363). Optionally, constants can be added to `constants.ts`.

```
src/mcp/src/
  main.ts       # Modify Defender pagination loop + error handler
  constants.ts  # Optionally add retry constants (MAX_RETRIES, BASE_DELAY_MS)
```

### Pattern 1: Retry with Exponential Backoff on 429

**What:** When a fetch returns 429 during pagination, wait and retry instead of throwing.
**Where:** Inside the `while (currentUrl)` loop in the Defender `fetchAll` block (lines 305-337).

```typescript
// Constants (add to constants.ts or inline)
const DEFENDER_MAX_RETRIES = 5;
const DEFENDER_BASE_DELAY_MS = 10_000; // 10 seconds
const DEFENDER_MAX_DELAY_MS = 120_000; // 2 minutes cap

// Inside the pagination while-loop, replace the current throw-on-error:
const pageResponse = await fetch(currentUrl, { /* ... */ });

if (pageResponse.status === 429) {
  const retryAfterHeader = pageResponse.headers.get('Retry-After');
  const retryAfterMs = retryAfterHeader
    ? parseInt(retryAfterHeader, 10) * 1000
    : Math.min(DEFENDER_BASE_DELAY_MS * Math.pow(2, retryCount), DEFENDER_MAX_DELAY_MS);

  if (retryCount >= DEFENDER_MAX_RETRIES) {
    throw new Error(
      `Defender API rate limit exceeded after ${DEFENDER_MAX_RETRIES} retries. ` +
      `Last Retry-After: ${retryAfterHeader || 'not provided'}s. ` +
      `Try again later or reduce the result set with $filter.`
    );
  }

  logger.info(`Defender 429 rate limited. Retry ${retryCount + 1}/${DEFENDER_MAX_RETRIES} after ${retryAfterMs}ms`);
  await new Promise(resolve => setTimeout(resolve, retryAfterMs));
  retryCount++;
  continue; // Re-enter the while loop without advancing currentUrl
}

// Reset retry count on success
retryCount = 0;
```

**Key details:**
- `Retry-After` header is in **seconds** (per Microsoft docs), multiply by 1000 for ms
- Exponential backoff as fallback: 10s, 20s, 40s, 80s, 120s (capped)
- Max 5 retries before giving up with an actionable error message
- `retryCount` resets to 0 after each successful page fetch
- The `continue` statement re-enters the while loop to retry the same `currentUrl`

### Pattern 2: EU Hostname Rewriting for @odata.nextLink

**What:** Before following an `@odata.nextLink` URL, ensure the hostname is the EU endpoint.
**Where:** After extracting `currentUrl` from `pageData['@odata.nextLink']` (line 336).

```typescript
// After: currentUrl = pageData['@odata.nextLink'] || null;
if (currentUrl) {
  const nextLinkUrl = new URL(currentUrl);
  const euHost = new URL(DEFENDER_EU_BASE_URL).hostname; // "eu.api.security.microsoft.com"
  if (nextLinkUrl.hostname !== euHost) {
    logger.info(`Rewriting nextLink hostname from ${nextLinkUrl.hostname} to ${euHost}`);
    nextLinkUrl.hostname = euHost;
    currentUrl = nextLinkUrl.toString();
  }
}
```

**Key details:**
- Uses built-in `URL` class -- safe, handles all edge cases (ports, paths, query strings)
- Only rewrites if hostname differs (no-op when already EU)
- Logs the rewrite for debugging
- The known case: `api.security.microsoft.com` -> `eu.api.security.microsoft.com`

### Pattern 3: Auth Error Message Translation

**What:** Parse Defender API error responses and surface actionable guidance for auth failures.
**Where:** Two locations: (1) the token acquisition failure (lines 280-286), and (2) the HTTP error handler in the catch block (lines 382-406).

```typescript
// Helper function (can be inline or extracted)
function formatDefenderError(status: number, errorBody: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(errorBody);
  } catch {
    return `Defender API error (${status}): ${errorBody}`;
  }

  const code = parsed?.error?.code;
  const message = parsed?.error?.message;

  if (status === 401) {
    return (
      `Defender authentication failed (401 Unauthorized). ` +
      `Likely causes: expired token, or wrong token scope. ` +
      `Ensure the token uses scope 'https://api.securitycenter.microsoft.com/.default' ` +
      `(NOT 'https://api.security.microsoft.com/.default'). ` +
      `API message: ${message || errorBody}`
    );
  }

  if (status === 403) {
    return (
      `Defender authorization failed (403 Forbidden). ` +
      `Likely causes: missing WindowsDefenderATP app permission (Machine.Read.All or Machine.ReadWrite.All), ` +
      `or admin consent not granted. ` +
      `Check: Azure Portal > App registrations > API permissions > WindowsDefenderATP. ` +
      `API message: ${message || errorBody}`
    );
  }

  return `Defender API error (${status}): ${message || errorBody}`;
}
```

**Key details:**
- Defender error responses follow JSON format: `{"error": {"code": "...", "message": "...", "target": "..."}}`
- 401 = token issue (expired, wrong scope/audience) -- guide user to check scope string
- 403 = permission issue (missing app permission, no admin consent) -- guide user to Azure Portal
- The critical scope trap (documented in PITFALLS.md): `api.securitycenter.microsoft.com` vs `api.security.microsoft.com`

### Pattern 4: Token Acquisition Error Enhancement

**What:** Improve the existing token acquisition error message to be more diagnostic.
**Where:** Lines 280-286 in the Defender branch.

```typescript
const tokenResponse = await azureCredential.getToken(DEFENDER_SCOPE);
if (!tokenResponse?.token) {
  throw new Error(
    "Failed to acquire Defender access token. " +
    "Verify: (1) App registration has WindowsDefenderATP > Machine.Read.All or Machine.ReadWrite.All permission, " +
    "(2) Admin consent is granted, " +
    "(3) Token scope is 'https://api.securitycenter.microsoft.com/.default'. " +
    "Note: The scope hostname differs from the API hostname."
  );
}
```

### Anti-Patterns to Avoid

- **Do NOT retry on all non-2xx responses:** Only 429 should trigger retry. 400, 401, 403, 404, 500 should fail immediately with descriptive messages.
- **Do NOT use `setTimeout` with a fixed delay:** Always respect `Retry-After` header first, fall back to exponential backoff.
- **Do NOT parse the URL with regex:** Use the built-in `URL` class for hostname rewriting. Regex on URLs is fragile.
- **Do NOT retry token acquisition failures:** Token failures (wrong scope, missing permissions) are configuration errors, not transient. Retrying wastes time.
- **Do NOT add retry logic to single-page fetches:** Only `fetchAll` pagination needs retry. A single 429 on a non-paginated request should surface the error immediately (the MCP client can retry).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL hostname replacement | Regex-based string replacement | `new URL()` + `.hostname` setter | Handles edge cases (ports, auth, encoded paths) correctly |
| Retry-After parsing | Custom header parser | `parseInt(headers.get('Retry-After'), 10)` | Header value is a simple integer (seconds) per HTTP spec |
| Sleep/delay | Custom timer wrapper | `await new Promise(r => setTimeout(r, ms))` | Standard Node.js pattern, no dependency needed |
| Error body parsing | Assume plain text | `try { JSON.parse(body) } catch { return body }` | Defender returns JSON but fallback to raw text is safe |

## Common Pitfalls

### Pitfall 1: Retry-After Header in Seconds, Not Milliseconds
**What goes wrong:** Code uses `Retry-After` value directly as milliseconds, resulting in waits of 10ms instead of 10s.
**Why it happens:** JavaScript `setTimeout` takes milliseconds but HTTP `Retry-After` header is in seconds.
**How to avoid:** Always multiply `Retry-After` value by 1000.
**Warning signs:** Retries happen too fast and get 429 again immediately.

### Pitfall 2: Infinite Retry Loop
**What goes wrong:** No max retry limit; a persistent 429 causes the tool to hang indefinitely.
**Why it happens:** Forgetting to add a retry counter and max retries check.
**How to avoid:** Cap retries at 5 with exponential backoff, throw after exhausting retries.
**Warning signs:** MCP tool call never returns.

### Pitfall 3: Retry Counter Not Reset Between Pages
**What goes wrong:** After a 429 on page 3, the retry counter carries over to page 4. If page 4 also gets a 429, it only has (MAX - previous_retries) attempts left.
**Why it happens:** Placing `retryCount` outside the while loop without resetting on success.
**How to avoid:** Reset `retryCount = 0` after each successful page fetch.

### Pitfall 4: URL Constructor Throws on Invalid nextLink
**What goes wrong:** `new URL(currentUrl)` throws if `@odata.nextLink` contains a malformed URL.
**Why it happens:** Defensive coding oversight -- trusting the API to always return valid URLs.
**How to avoid:** Wrap in try/catch; on failure, log warning and follow URL as-is (functional > safe in this case).

### Pitfall 5: Error Body Already Consumed
**What goes wrong:** Calling `pageResponse.text()` or `pageResponse.json()` twice throws because the body stream is already consumed.
**Why it happens:** Reading the body for error details after already reading it for JSON parsing.
**How to avoid:** Read body once into a variable, then parse. On 429, read the body text before retrying.

### Pitfall 6: Forgetting to Handle Both Pagination AND Single-Page Errors
**What goes wrong:** Auth error translation only added to the `fetchAll` path, not the single-page fetch path.
**Why it happens:** The Defender branch has two fetch paths (fetchAll and single-page).
**How to avoid:** Apply error formatting to both code paths, or extract into a shared helper function.

## Code Examples

### Complete Retry Loop (verified pattern)

```typescript
// Source: standard exponential backoff with Retry-After, adapted for Defender API
if (fetchAll) {
  let allValues: any[] = [];
  let currentUrl: string | null = url;
  let retryCount = 0;

  while (currentUrl) {
    logger.info(`Fetching Defender page: ${currentUrl}`);
    const pageCredential = authManager.getAzureCredential();
    const pageToken = await pageCredential.getToken(DEFENDER_SCOPE);
    if (!pageToken?.token) {
      throw new Error("Token acquisition failed during Defender pagination");
    }

    const pageResponse = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        ...defenderHeaders,
        'Authorization': `Bearer ${pageToken.token}`
      }
    });

    // Handle 429 rate limiting with retry
    if (pageResponse.status === 429) {
      if (retryCount >= DEFENDER_MAX_RETRIES) {
        throw new Error(
          `Defender API rate limit exceeded after ${DEFENDER_MAX_RETRIES} retries on ${currentUrl}. ` +
          `Try reducing the result set with $filter or $top.`
        );
      }
      const retryAfter = pageResponse.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(DEFENDER_BASE_DELAY_MS * Math.pow(2, retryCount), DEFENDER_MAX_DELAY_MS);
      logger.info(`Rate limited (429). Retry ${retryCount + 1}/${DEFENDER_MAX_RETRIES} after ${delayMs}ms`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      retryCount++;
      continue;
    }

    // Handle other errors with descriptive messages
    if (!pageResponse.ok) {
      const errorBody = await pageResponse.text();
      throw new Error(formatDefenderError(pageResponse.status, errorBody));
    }

    // Success -- reset retry counter
    retryCount = 0;

    const pageData = await pageResponse.json();
    if (pageData.value && Array.isArray(pageData.value)) {
      allValues = allValues.concat(pageData.value);
    }

    // EU hostname enforcement on nextLink
    currentUrl = pageData['@odata.nextLink'] || null;
    if (currentUrl) {
      try {
        const nextUrl = new URL(currentUrl);
        const euHost = new URL(DEFENDER_EU_BASE_URL).hostname;
        if (nextUrl.hostname !== euHost) {
          logger.info(`Rewriting nextLink hostname: ${nextUrl.hostname} -> ${euHost}`);
          nextUrl.hostname = euHost;
          currentUrl = nextUrl.toString();
        }
      } catch (e) {
        logger.info(`Warning: Could not parse nextLink URL, following as-is: ${currentUrl}`);
      }
    }
  }

  responseData = { value: allValues };
  logger.info(`Finished fetching all Defender pages. Total items: ${allValues.length}`);
}
```

### Error Response Format (from official docs)

```json
{
  "error": {
    "code": "Forbidden",
    "message": "The application does not have any of the required application permissions (Machine.ReadWrite.All, Machine.Read.All) to access the resource.",
    "target": "43f4cb08-8fac-4b65-9db1-745c2ae65f3a"
  }
}
```

### Defender Rate Limits (from official docs)

| Limit | Value |
|-------|-------|
| Calls per minute | 100 |
| Calls per hour | 1,500 |
| Max page size ($top) | 10,000 |

A `fetchAll` on a tenant with 50,000 devices using `$top=10000` = 5 pages = 5 API calls. Well within limits. A tenant with 100,000+ devices or repeated rapid calls could hit the per-minute limit.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Throw on any non-OK response | Retry on 429, throw on others | This phase | Large-tenant fetchAll becomes reliable |
| Follow @odata.nextLink as-is | Rewrite hostname to EU before following | This phase | Data residency guaranteed during pagination |
| Raw HTTP error codes in MCP response | Parsed error with actionable guidance | This phase | Users can self-diagnose auth issues |

## Open Questions

1. **Retry-After header presence on Defender 429 responses**
   - What we know: Microsoft docs say "A Retry-After in the response header indicating how long to wait (in seconds)." The wording is descriptive, not "always present."
   - What's unclear: Whether `Retry-After` is always present or sometimes missing on Defender-specific 429s.
   - Recommendation: Always check for the header, fall back to exponential backoff if absent. Confidence: HIGH (the fallback covers both cases).

2. **nextLink hostname behavior in practice**
   - What we know: PITFALLS.md documents this as a known issue. The `@odata.nextLink` may use `api.security.microsoft.com` (global) even when the initial request was to `eu.api.security.microsoft.com`.
   - What's unclear: Whether this is consistent behavior or edge-case. No official Microsoft documentation explicitly confirms nextLink hostname behavior for regional endpoints.
   - Recommendation: Always rewrite regardless -- it's a no-op if already EU, and the `URL` class makes it cheap. Confidence: MEDIUM on the problem occurring, HIGH on the fix being correct.

## Sources

### Primary (HIGH confidence)
- [Common Defender API errors](https://learn.microsoft.com/en-us/defender-endpoint/api/common-errors) -- 429 handling, Retry-After header, error response JSON format (updated 2026-03-22)
- [List Machines API](https://learn.microsoft.com/en-us/defender-endpoint/api/get-machines) -- rate limits (100/min, 1500/hr), $top max 10,000, pagination behavior (updated 2026-03-22)
- [Access Defender APIs](https://learn.microsoft.com/en-us/defender-endpoint/api/apis-intro) -- @odata.nextLink pagination, regional endpoints (updated 2026-03-22)
- Phase 2 source code (`src/mcp/src/main.ts`) -- direct inspection of current Defender handler implementation
- PITFALLS.md -- documented EU hostname leak in @odata.nextLink (Pitfall 4), 429 retry absence (Pitfall 5)

### Secondary (MEDIUM confidence)
- [Defender API error Q&A](https://learn.microsoft.com/en-us/answers/questions/398716/error-403-forbidden-when-connect-to-microsoft-defe) -- real-world 403 error response examples
- [Defender API 403 unauthorized](https://learn.microsoft.com/en-us/answers/questions/1335625/error-in-api-call-(403)-forbidden-code-unauthorize) -- error body format confirmation

### Tertiary (LOW confidence)
- nextLink hostname rewriting necessity -- documented in project PITFALLS.md but not confirmed in official Microsoft docs; defensive implementation regardless

## Metadata

**Confidence breakdown:**
- 429 retry logic: HIGH -- official docs explicitly describe Retry-After header and 429 behavior
- EU hostname rewriting: MEDIUM -- known risk from PITFALLS.md, fix is safe and cheap regardless
- Auth error messages: HIGH -- error response JSON format confirmed from official docs and community Q&A
- Overall implementation: HIGH -- all changes are within existing code structure, no new abstractions needed

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable API, low churn)
